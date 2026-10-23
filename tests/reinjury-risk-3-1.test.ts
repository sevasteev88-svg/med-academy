import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateReinjuryRisk,
  REINJURY_RISK_DISCLAIMER,
} from "../src/lib/reinjury-risk-calculator.ts";
import { calculateAcwr, ACWR_THRESHOLDS } from "../src/types/workload.ts";

describe("Этап 3. Медична логіка · 3.1 ІІ-ризик та ACWR (чесні індикатори)", () => {
  describe("1. AI-аналітик ризику: мінімум даних та правила відсутності псевдопрогнозів", () => {
    it("повертає 'Недостатньо даних', якщо немає жодних даних", () => {
      const res = calculateReinjuryRisk({});
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskCategory, "insufficient_data");
      assert.strictEqual(res.categoryLabelUa, "Недостатньо даних");
      assert.strictEqual(res.disclaimer, REINJURY_RISK_DISCLAIMER);
      // Має містити перелік з 3 компонентів, яких бракує
      assert.strictEqual(res.missingDataReasons.length, 3);
      assert.match(res.missingDataReasons[0], /зросту/i);
      assert.match(res.missingDataReasons[1], /навантаження/i);
      assert.match(res.missingDataReasons[2], /Велнес/i);
    });

    it("повертає 'Недостатньо даних', якщо є 28 днів навантаження та 7 днів велнесу, але немає 2 замірів зросту чи PHV", () => {
      const res = calculateReinjuryRisk({
        heightMeasurementsCount12m: 1, // лише 1 вимір за 12 міс.
        workloadDaysMonitored: 30,
        wellnessDaysRecorded: 10,
        acwr: 1.1,
        wellnessScore: 16,
      });
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskCategory, "insufficient_data");
      assert.strictEqual(res.missingDataReasons.length, 1);
      assert.match(res.missingDataReasons[0], /зросту.*потрібно ≥2/i);
    });

    it("дозволяє розрахунок, якщо замість 2 замірів зросту явно зафіксована фаза PHV", () => {
      const res = calculateReinjuryRisk({
        growthPhase: "phv", // зафіксовано PHV
        workloadDaysMonitored: 28,
        wellnessDaysRecorded: 7,
        acwr: 1.0,
        wellnessScore: 16,
      });
      assert.strictEqual(res.isInsufficientData, false);
      // Зафіксований PHV є тригером уваги -> Помірний
      assert.strictEqual(res.riskCategory, "moderate");
      assert.strictEqual(res.categoryLabelUa, "Помірний");
      assert.strictEqual(res.disclaimer, "Орієнтовна оцінка, не прогноз");
      assert.ok(res.factors.some((f) => f.title.includes("PHV")));
    });

    it("повертає 'Недостатньо даних', якщо історія навантаження < 28 днів", () => {
      const res = calculateReinjuryRisk({
        heightMeasurementsCount12m: 2,
        workloadDaysMonitored: 20, // < 28 днів
        wellnessDaysRecorded: 7,
      });
      assert.strictEqual(res.isInsufficientData, true);
      assert.match(res.missingDataReasons[0], /навантаження.*потрібно ≥28 днів/i);
    });

    it("повертає 'Недостатньо даних', якщо велнес заповнено менше ніж за 7 днів", () => {
      const res = calculateReinjuryRisk({
        heightMeasurementsCount12m: 3,
        workloadDaysMonitored: 35,
        wellnessDaysRecorded: 5, // < 7 днів
      });
      assert.strictEqual(res.isInsufficientData, true);
      assert.match(res.missingDataReasons[0], /Велнес.*щонайменше 7 днів/i);
    });

    it("повертає якісну категорію 'Низький' без відсотків і з обов'язковою позначкою 'орієнтовна оцінка, не прогноз'", () => {
      const res = calculateReinjuryRisk({
        heightMeasurementsCount12m: 2,
        workloadDaysMonitored: 35,
        wellnessDaysRecorded: 14,
        acwr: 1.05,
        wellnessScore: 18,
      });
      assert.strictEqual(res.isInsufficientData, false);
      assert.strictEqual(res.riskCategory, "low");
      assert.strictEqual(res.categoryLabelUa, "Низький");
      assert.strictEqual(res.disclaimer, "Орієнтовна оцінка, не прогноз");
      assert.strictEqual((res as any).score, undefined); // Жодних "15% ймовірність"
    });

    it("визначає категорію 'Підвищений' при наявності серйозних тригерів (стрибок ACWR + поганий велнес)", () => {
      const res = calculateReinjuryRisk({
        heightMeasurementsCount12m: 2,
        workloadDaysMonitored: 30,
        wellnessDaysRecorded: 10,
        acwr: 1.65, // спайк навантаження
        wellnessScore: 10, // низький велнес
      });
      assert.strictEqual(res.isInsufficientData, false);
      assert.strictEqual(res.riskCategory, "high");
      assert.strictEqual(res.categoryLabelUa, "Підвищений");
      assert.strictEqual(res.disclaimer, "Орієнтовна оцінка, не прогноз");
      assert.ok(res.factors.some((f) => f.severity === "danger"));
    });
  });

  describe("2. ACWR: острая нагрузка 7 дней, хронічна за 28 днів та окремий підрахунок без даних", () => {
    it("не включає гравців без 28 днів даних у Sweet Spot і повертає 'insufficient_data'", () => {
      const res = calculateAcwr(350, 1400, { daysMonitored: 15 });
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskZone, "insufficient_data");
      assert.strictEqual(res.acwr, null);
      assert.notStrictEqual(res.riskZone, "sweet_spot");
    });

    it("коректно розраховує Sweet Spot (0.8 - 1.3), коли даних достатньо (>= 28 днів)", () => {
      const res = calculateAcwr(400, 1600, { daysMonitored: 30, chronicSessionsCount: 12 });
      assert.strictEqual(res.isInsufficientData, false);
      assert.strictEqual(res.riskZone, "sweet_spot");
      assert.strictEqual(res.acwr, 1.0);
    });

    it("використовує константи порогів ACWR та наукові формулювання без обіцянок 'запобігання травмам'", () => {
      assert.strictEqual(ACWR_THRESHOLDS.UNDERLOAD_MAX, 0.8);
      assert.strictEqual(ACWR_THRESHOLDS.SWEET_SPOT_MAX, 1.3);
      assert.strictEqual(ACWR_THRESHOLDS.CAUTION_MAX, 1.5);
      assert.doesNotMatch(ACWR_THRESHOLDS.NOTE, /запобігання травмам/i);
    });
  });
});
