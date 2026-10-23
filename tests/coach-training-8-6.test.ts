import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAcwr,
  ACWR_THRESHOLDS,
  BORG_CR10_SCALE,
  ABSENCE_REASONS,
  type RpeScore,
  type TeamTrainingPlayerItem,
} from "../src/types/workload.ts";

describe("8.6 Навантаження тренера (session-RPE за 10 секунд)", () => {
  describe("1. Розрахунок ACWR та правило «недостатньо даних» (задача 3.1)", () => {
    it("повертає 'insufficient_data', якщо хронічне навантаження дорівнює 0", () => {
      const res = calculateAcwr(400, 0);
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskZone, "insufficient_data");
      assert.strictEqual(res.acwr, null);
      assert.match(res.titleUa, /Недостатньо даних/);
    });

    it("повертає 'insufficient_data', якщо кількість сесій за 28 днів менше мінімального порогу (< 3)", () => {
      const res = calculateAcwr(400, 600, { chronicSessionsCount: 2 });
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskZone, "insufficient_data");
      assert.strictEqual(res.acwr, null);
    });

    it("повертає 'insufficient_data', якщо період спостережень менше 28 днів (правило задачі 3.1)", () => {
      // Навіть якщо є високі значення, але дні спостереження < 28, не можна ставити Оптимум
      const res = calculateAcwr(500, 2000, { daysMonitored: 14, chronicSessionsCount: 10 });
      assert.strictEqual(res.isInsufficientData, true);
      assert.strictEqual(res.riskZone, "insufficient_data");
      assert.strictEqual(res.acwr, null);
      assert.match(res.titleUa, /Недостатньо даних/);
    });

    it("експортує константи порогових значень ACWR_THRESHOLDS", () => {
      assert.strictEqual(ACWR_THRESHOLDS.UNDERLOAD_MAX, 0.8);
      assert.strictEqual(ACWR_THRESHOLDS.SWEET_SPOT_MAX, 1.3);
      assert.strictEqual(ACWR_THRESHOLDS.CAUTION_MAX, 1.5);
      assert.match(ACWR_THRESHOLDS.NOTE, /орієнтир/i);
    });

    it("розраховує Sweet Spot (0.8 - 1.3) при достатніх даних", () => {
      // chronicLoad = 2000 (weeklyChronic = 500). acuteLoad = 500 -> ratio = 1.0
      const res = calculateAcwr(500, 2000, { chronicSessionsCount: 12 });
      assert.strictEqual(res.isInsufficientData, false);
      assert.strictEqual(res.riskZone, "sweet_spot");
      assert.strictEqual(res.acwr, 1.0);
      assert.match(res.titleUa, /Sweet Spot/);
    });

    it("ідентифікує недонавантаження (underload) при ratio < 0.8", () => {
      // acuteLoad = 300, weeklyChronic = 500 (chronic = 2000) -> ratio = 0.6
      const res = calculateAcwr(300, 2000, { chronicSessionsCount: 10 });
      assert.strictEqual(res.riskZone, "underload");
      assert.strictEqual(res.acwr, 0.6);
    });

    it("ідентифікує підвищене навантаження (caution) при ratio 1.3 - 1.5", () => {
      // acuteLoad = 700, weeklyChronic = 500 -> ratio = 1.4
      const res = calculateAcwr(700, 2000, { chronicSessionsCount: 15 });
      assert.strictEqual(res.riskZone, "caution");
      assert.strictEqual(res.acwr, 1.4);
    });

    it("ідентифікує зону небезпеки (danger) при ratio >= 1.5", () => {
      // acuteLoad = 850, weeklyChronic = 500 -> ratio = 1.7
      const res = calculateAcwr(850, 2000, { chronicSessionsCount: 16 });
      assert.strictEqual(res.riskZone, "danger");
      assert.strictEqual(res.acwr, 1.7);
    });
  });

  describe("2. Шкала Borg CR10 та причини відсутності", () => {
    it("підтримує оцінки від 0 до 10 включно", () => {
      for (let i = 0; i <= 10; i++) {
        assert.ok(BORG_CR10_SCALE[i as RpeScore]);
        assert.ok(BORG_CR10_SCALE[i as RpeScore].label);
        assert.ok(BORG_CR10_SCALE[i as RpeScore].color);
      }
    });

    it("оцінка 0 відповідає спокою / відпочинку", () => {
      assert.match(BORG_CR10_SCALE[0].label, /Спокій|Відпочинок/);
    });

    it("містить довідник причин відсутності гравця", () => {
      const ids = ABSENCE_REASONS.map((r) => r.id);
      assert.ok(ids.includes("injury"));
      assert.ok(ids.includes("illness"));
      assert.ok(ids.includes("recovery"));
      assert.ok(ids.includes("unspecified"));
    });
  });

  describe("3. Логіка групового введення тренування та розбіжностей RPE", () => {
    it("коректно обчислює навантаження для присутніх і відсутніх гравців", () => {
      const teamPlayers: TeamTrainingPlayerItem[] = [
        {
          playerId: "p1",
          playerName: "Іван Іванов",
          position: "CB",
          isPresent: true,
          minutes: 75,
          rpeScore: 6,
        },
        {
          playerId: "p2",
          playerName: "Петро Петренко",
          position: "ST",
          isPresent: false,
          absenceReason: "illness",
          minutes: 0,
          rpeScore: 0,
        },
      ];

      const p1Au = teamPlayers[0].isPresent
        ? teamPlayers[0].minutes * teamPlayers[0].rpeScore
        : 0;
      const p2Au = teamPlayers[1].isPresent
        ? teamPlayers[1].minutes * teamPlayers[1].rpeScore
        : 0;

      assert.strictEqual(p1Au, 450); // 75 * 6
      assert.strictEqual(p2Au, 0); // 0 для відсутнього
    });

    it("виявляє значну розбіжність в оцінках тренера та гравця (Δ >= 2)", () => {
      const coachRpe = 5;
      const playerRpe = 8;
      const diff = Math.abs(playerRpe - coachRpe);

      const isDiscrepant = diff >= 2;
      assert.strictEqual(isDiscrepant, true);
      assert.strictEqual(diff, 3);
    });

    it("не сигналізує про розбіжність, якщо різниця менше 2 балів", () => {
      const coachRpe = 6;
      const playerRpe = 7;
      const diff = Math.abs(playerRpe - coachRpe);

      const isDiscrepant = diff >= 2;
      assert.strictEqual(isDiscrepant, false);
      assert.strictEqual(diff, 1);
    });
  });
});
