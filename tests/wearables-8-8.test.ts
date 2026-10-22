import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESTING_HR_PLAUSIBLE_RANGE,
  HRV_PLAUSIBLE_RANGE,
  SLEEP_DURATION_MIN_PLAUSIBLE_RANGE,
  WEARABLES_BASELINE_REQUIRED_DAYS,
  WEARABLES_BASELINE_WINDOW_DAYS,
  WEARABLES_DISCLAIMER_TEXT,
  SUPPORTED_DEVICE_PROFILES,
  validatePlausibleRange,
} from "../src/lib/wearables-constants.ts";
import {
  calculateWearableBaseline,
  calculateStats,
} from "../src/lib/wearables-baseline.ts";
import {
  evaluatePlayerReadiness,
  sanitizeReadinessForCoach,
} from "../src/lib/readiness.ts";
import type { WearableEntry } from "../src/types/wearables.ts";
import type { WellnessEntry } from "../src/types/wellness.ts";

function createMockWearableEntry(
  date: string,
  overrides?: Partial<WearableEntry>
): WearableEntry {
  return {
    id: `wear_${date}`,
    club_id: "club_01",
    player_id: "player_01",
    date,
    device_type: "whoop",
    resting_hr_bpm: 48,
    hrv_ms: 75,
    hrv_metric: "rmssd",
    sleep_duration_min: 480, // 8 годин
    device_score: 85,
    device_score_name: "Recovery",
    source: "manual",
    created_at: `${date}T08:00:00Z`,
    ...overrides,
  };
}

function createMockWellnessEntry(
  date: string,
  overrides?: Partial<WellnessEntry>
): WellnessEntry {
  return {
    id: `well_${date}`,
    club_id: "club_01",
    player_id: "player_01",
    date,
    sleep_quality: 4,
    fatigue: 4,
    soreness: 4,
    stress: 4,
    sleep_hours: 8,
    pain: false,
    pain_vas: null,
    pain_locations: [],
    illness: false,
    comment: null,
    submitted_at: `${date}T08:00:00Z`,
    source: "player",
    ...overrides,
  };
}

describe("8.8 Ручний ввід даних з носимих пристроїв", () => {
  describe("1. Валідація правдоподібних діапазонів (не блокує введення)", () => {
    it("визначає валідні значення пульсу спокою (35–105 уд/хв)", () => {
      const valid = validatePlausibleRange(52, RESTING_HR_PLAUSIBLE_RANGE);
      assert.equal(valid.isPlausible, true);
      assert.equal(valid.warning, undefined);

      const tooLow = validatePlausibleRange(28, RESTING_HR_PLAUSIBLE_RANGE);
      assert.equal(tooLow.isPlausible, false);
      assert.match(tooLow.warning || "", /Перевірте значення/);

      const tooHigh = validatePlausibleRange(125, RESTING_HR_PLAUSIBLE_RANGE);
      assert.equal(tooHigh.isPlausible, false);
      assert.match(tooHigh.warning || "", /Перевірте значення/);
    });

    it("визначає валідні значення HRV (15–220 мс)", () => {
      const valid = validatePlausibleRange(85, HRV_PLAUSIBLE_RANGE);
      assert.equal(valid.isPlausible, true);

      const tooLow = validatePlausibleRange(8, HRV_PLAUSIBLE_RANGE);
      assert.equal(tooLow.isPlausible, false);
      assert.match(tooLow.warning || "", /Перевірте значення/);

      const tooHigh = validatePlausibleRange(260, HRV_PLAUSIBLE_RANGE);
      assert.equal(tooHigh.isPlausible, false);
      assert.match(tooHigh.warning || "", /Перевірте значення/);
    });

    it("визначає тривалість сну в хвилинах (240–720 хв = 4–12 год)", () => {
      const valid = validatePlausibleRange(480, SLEEP_DURATION_MIN_PLAUSIBLE_RANGE);
      assert.equal(valid.isPlausible, true);

      const tooShort = validatePlausibleRange(120, SLEEP_DURATION_MIN_PLAUSIBLE_RANGE); // 2 год
      assert.equal(tooShort.isPlausible, false);
      assert.match(tooShort.warning || "", /Перевірте значення/);

      const tooLong = validatePlausibleRange(800, SLEEP_DURATION_MIN_PLAUSIBLE_RANGE); // > 13 год
      assert.equal(tooLong.isPlausible, false);
      assert.match(tooLong.warning || "", /Перевірте значення/);
    });

    it("пропускає порожні (null/undefined) значення без помилки, оскільки всі поля необов'язкові", () => {
      assert.equal(validatePlausibleRange(null, RESTING_HR_PLAUSIBLE_RANGE).isPlausible, true);
      assert.equal(validatePlausibleRange(undefined, HRV_PLAUSIBLE_RANGE).isPlausible, true);
    });
  });

  describe("2. Розрахунок особистої норми гравця за пристроєм та метрикою (28 днів)", () => {
    it("показує 'Збір базових даних' при менше ніж 14 записах", () => {
      const entries: WearableEntry[] = [];
      const today = "2026-10-21";

      // Створюємо 13 записів за останні 13 днів
      for (let i = 12; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        entries.push(createMockWearableEntry(dateStr));
      }

      const report = calculateWearableBaseline({
        entries,
        targetDeviceType: "whoop",
        targetHrvMetric: "rmssd",
        todayDate: today,
        playerId: "player_01",
      });

      assert.equal(report.status, "collecting_baseline");
      assert.equal(report.entriesCount, 13);
      assert.equal(report.requiredEntries, 14);
      assert.match(report.statusLabel, /Збір базових даних \(13\/14/);
      assert.equal(report.hrvBaseline, null);
      assert.equal(report.todayHrvZScore, null);
    });

    it("розраховує особисту норму та Z-score при 14+ записах", () => {
      const entries: WearableEntry[] = [];
      const today = "2026-10-21";

      // 14 записів з HRV 70-80
      for (let i = 13; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        entries.push(
          createMockWearableEntry(dateStr, {
            resting_hr_bpm: 50,
            hrv_ms: 75,
          })
        );
      }

      // Сьогоднішній запис із відчутним падінням HRV (45 мс)
      entries.push(
        createMockWearableEntry(today, {
          resting_hr_bpm: 60,
          hrv_ms: 45,
        })
      );

      const report = calculateWearableBaseline({
        entries,
        targetDeviceType: "whoop",
        targetHrvMetric: "rmssd",
        todayDate: today,
        playerId: "player_01",
      });

      assert.equal(report.status, "ready");
      assert.equal(report.entriesCount, 14);
      assert.ok(report.hrvBaseline !== null);
      assert.ok(report.restingHrBaseline !== null);

      // Z-score повинен бути суттєво від'ємним для HRV
      assert.ok(report.todayHrvZScore !== null && report.todayHrvZScore < -1.0);
      assert.equal(report.disclaimer, WEARABLES_DISCLAIMER_TEXT);
    });

    it("СУВОРО НЕ порівнює між собою різні пристрої та метрики (WHOOP rMSSD vs Apple Watch SDNN)", () => {
      const entries: WearableEntry[] = [];
      const today = "2026-10-21";

      // 10 записів з WHOOP (rMSSD)
      for (let i = 19; i >= 10; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        entries.push(
          createMockWearableEntry(dateStr, {
            device_type: "whoop",
            hrv_metric: "rmssd",
            hrv_ms: 70,
          })
        );
      }

      // 10 записів з Apple Watch (SDNN)
      for (let i = 9; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        entries.push(
          createMockWearableEntry(dateStr, {
            device_type: "apple_watch",
            hrv_metric: "sdnn",
            hrv_ms: 45,
          })
        );
      }

      // Запитуємо норму для Apple Watch (sdnn)
      const reportApple = calculateWearableBaseline({
        entries,
        targetDeviceType: "apple_watch",
        targetHrvMetric: "sdnn",
        todayDate: today,
        playerId: "player_01",
      });

      // Записів Apple Watch лише 10, тому норма не повинна змішуватися з WHOOP (10 < 14)
      assert.equal(reportApple.entriesCount, 10);
      assert.equal(reportApple.status, "collecting_baseline");

      // Запитуємо для WHOOP (rmssd)
      const reportWhoop = calculateWearableBaseline({
        entries,
        targetDeviceType: "whoop",
        targetHrvMetric: "rmssd",
        todayDate: today,
        playerId: "player_01",
      });

      assert.equal(reportWhoop.entriesCount, 10);
      assert.equal(reportWhoop.status, "collecting_baseline");
    });
  });

  describe("3. Права ролей та видимість даних (Тренер vs Лікар)", () => {
    it("sanitizeReadinessForCoach повністю приховує медичні та біометричні деталі лікаря", () => {
      const today = "2026-10-21";
      const wellness = createMockWellnessEntry(today);

      const doctorResult = evaluatePlayerReadiness({
        todayDate: today,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: Array(14).fill(wellness),
        forRole: "doctor",
        playerInfo: { id: "p1", name: "Іван Петренко" },
        wearablesReport: {
          playerId: "p1",
          deviceType: "whoop",
          hrvMetric: "rmssd",
          status: "ready",
          statusLabel: "Норма",
          entriesCount: 14,
          requiredEntries: 14,
          todayEntry: createMockWearableEntry(today, { resting_hr_bpm: 48, hrv_ms: 80 }),
          restingHrBaseline: null,
          hrvBaseline: null,
          sleepBaseline: null,
          todayRestingHrZScore: 0.1,
          todayHrvZScore: 0.2,
          trendDays: [],
          disclaimer: WEARABLES_DISCLAIMER_TEXT,
        },
      });

      // Лікар бачить деталі
      assert.ok(doctorResult.doctorDetails !== null);
      assert.ok(doctorResult.doctorDetails?.wearables !== null);
      assert.equal(doctorResult.doctorDetails?.wearables?.deviceType, "whoop");
      assert.equal(doctorResult.doctorDetails?.wearables?.hrvMs, 80);

      // Маскування для тренера
      const coachResult = sanitizeReadinessForCoach(doctorResult);
      assert.equal(coachResult.doctorDetails, null);
      assert.equal(coachResult.hasMonotony, false);
      assert.equal((coachResult as any).wearables, undefined);
    });
  });

  describe("4. Вплив на ранковий світлофор готовності (8.4)", () => {
    it("wearable-дані ніколи не замінюють анкету (без анкети статус сірий 'no_entry_today')", () => {
      const today = "2026-10-21";

      const readiness = evaluatePlayerReadiness({
        todayDate: today,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [], // Сьогодні анкету не заповнено
        forRole: "doctor",
        wearablesReport: {
          playerId: "p1",
          deviceType: "whoop",
          hrvMetric: "rmssd",
          status: "ready",
          statusLabel: "Норма",
          entriesCount: 14,
          requiredEntries: 14,
          todayEntry: createMockWearableEntry(today),
          restingHrBaseline: null,
          hrvBaseline: null,
          sleepBaseline: null,
          todayRestingHrZScore: 0,
          todayHrvZScore: 0,
          trendDays: [],
          disclaimer: WEARABLES_DISCLAIMER_TEXT,
        },
      });

      assert.equal(readiness.status, "gray");
      assert.equal(readiness.grayReason, "no_entry_today");
    });

    it("критичне падіння HRV (Z <= -2.0) виступає фізіологічним сигналом і викликає жовтий статус", () => {
      const today = "2026-10-21";
      // Анкета зі стабільними оцінками 4
      const entries = Array(14)
        .fill(null)
        .map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (13 - i));
          return createMockWellnessEntry(d.toISOString().split("T")[0]);
        });

      const readinessWithHrvDrop = evaluatePlayerReadiness({
        todayDate: today,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: entries,
        forRole: "coach",
        wearablesReport: {
          playerId: "p1",
          deviceType: "whoop",
          hrvMetric: "rmssd",
          status: "ready",
          statusLabel: "Норма",
          entriesCount: 14,
          requiredEntries: 14,
          todayEntry: createMockWearableEntry(today),
          restingHrBaseline: null,
          hrvBaseline: null,
          sleepBaseline: null,
          todayRestingHrZScore: 0,
          todayHrvZScore: -2.3, // Сильне фізіологічне падіння
          trendDays: [],
          disclaimer: WEARABLES_DISCLAIMER_TEXT,
        },
      });

      // Світлофор звернув увагу на фізіологічний стрес
      assert.equal(readinessWithHrvDrop.status, "yellow");
      assert.ok(readinessWithHrvDrop.flagCategories.includes("втома"));
    });
  });
});
