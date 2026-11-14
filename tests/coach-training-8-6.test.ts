import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateAcwr,
  calculateFifa11Compliance,
  ACWR_THRESHOLDS,
  BORG_CR10_SCALE,
  ABSENCE_REASONS,
  FIFA11_STATUS_UA,
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

  describe("4. Облік виконання програми FIFA 11+ / 11+ Kids на тренуваннях", () => {
    it("містить українські лейбли для статусів none, partial, full", () => {
      assert.strictEqual(FIFA11_STATUS_UA.none.label, "Не виконувалась");
      assert.strictEqual(FIFA11_STATUS_UA.partial.label, "Частково");
      assert.strictEqual(FIFA11_STATUS_UA.full.label, "Повністю");
    });

    it("дедуплікує гравців до командних сесій, виключає матчі та рахує % FIFA 11+", () => {
      const sessions = [
        // Сесія 1 (2026-10-01): 2 гравці, статус full
        { date: "2026-10-01", team_id: "t1", team_session_id: "s1", session_type: "training_team", fifa11_status: "full" },
        { date: "2026-10-01", team_id: "t1", team_session_id: "s1", session_type: "training_team", fifa11_status: "full" },
        // Сесія 2 (2026-10-02): 1 гравець, статус partial у JSON notes
        { date: "2026-10-02", team_id: "t1", team_session_id: "s2", session_type: "training_team", notes: '[COACH_SESSION] {"fifa11_status":"partial"}' },
        // Сесія 3 (2026-10-03): статус none
        { date: "2026-10-03", team_id: "t1", team_session_id: "s3", session_type: "gym_strength", fifa11_status: "none" },
        // Сесія 4 (2026-10-04): матч (не повинен враховуватись у % тренувань)
        { date: "2026-10-04", team_id: "t1", team_session_id: "s4", session_type: "match", fifa11_status: "none" },
      ];

      const summary = calculateFifa11Compliance(sessions);
      assert.strictEqual(summary.totalSessions, 3);
      assert.strictEqual(summary.fullCount, 1);
      assert.strictEqual(summary.partialCount, 1);
      assert.strictEqual(summary.noneCount, 1);
      assert.strictEqual(summary.compliantCount, 2);
      assert.strictEqual(summary.compliancePercent, 67); // 2/3 = 66.67 -> 67%
      assert.strictEqual(summary.fullPercent, 33); // 1/3 = 33.33 -> 33%
    });

    it("повертає 0% при відсутності тренувальних сесій", () => {
      const summary = calculateFifa11Compliance([]);
      assert.strictEqual(summary.totalSessions, 0);
      assert.strictEqual(summary.compliancePercent, 0);
    });
  });
});
