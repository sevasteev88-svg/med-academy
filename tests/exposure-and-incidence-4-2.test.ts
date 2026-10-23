import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateExposureHours,
  calculateIncidenceRate,
  calculateExposureMetrics,
  calculateTeamExposureBreakdown,
  formatIncidenceRate,
  INSUFFICIENT_EXPOSURE_DATA_MSG,
  type RawExposureItem,
  type RawInjuryItem,
} from "../src/lib/exposure-calculator.ts";

describe("4.2 Експозиція та захворюваність (травми на 1000 годин)", () => {
  describe("1. Розрахунок людино-годин експозиції", () => {
    it("правильно вираховує години: (хвилини * гравці) / 60", () => {
      // 90 хв * 20 гравців = 1800 чол-хв = 30 людино-годин
      const hours = calculateExposureHours(90, 20);
      assert.strictEqual(hours, 30);
    });

    it("повертає 0 при нульових хвилинах або гравцях", () => {
      assert.strictEqual(calculateExposureHours(0, 20), 0);
      assert.strictEqual(calculateExposureHours(90, 0), 0);
      assert.strictEqual(calculateExposureHours(-10, 15), 0);
    });

    it("використовує значення 1 за замовчуванням для кількості гравців", () => {
      assert.strictEqual(calculateExposureHours(60), 1);
    });
  });

  describe("2. Формула захворюваності (Incidence Rate на 1000 год)", () => {
    it("розраховує травми / години * 1000", () => {
      // 3 травми на 1000 годин = 3.0
      assert.strictEqual(calculateIncidenceRate(3, 1000), 3.0);

      // 2 травми на 250 годин = (2 / 250) * 1000 = 8.0
      assert.strictEqual(calculateIncidenceRate(2, 250), 8.0);

      // 0 травм на 500 годин = 0.0
      assert.strictEqual(calculateIncidenceRate(0, 500), 0.0);
    });

    it("повертає null, якщо експозиція дорівнює 0 (запобігання діленню на нуль)", () => {
      assert.strictEqual(calculateIncidenceRate(2, 0), null);
      assert.strictEqual(calculateIncidenceRate(0, 0), null);
      assert.strictEqual(calculateIncidenceRate(1, -50), null);
    });

    it("форматує текст або повертає 'Недостатньо даних про експозицію'", () => {
      assert.strictEqual(formatIncidenceRate(null), INSUFFICIENT_EXPOSURE_DATA_MSG);
      assert.strictEqual(formatIncidenceRate(4.24), "4.2");
      assert.strictEqual(formatIncidenceRate(15.0), "15.0");
    });
  });

  describe("3. Роздільний розрахунок для тренувань та матчів", () => {
    const mockExposures: RawExposureItem[] = [
      // Тренування: 4 сесії по 90 хв x 20 гравців = 4 * 30 = 120 год
      { date: "2026-10-01", team_id: "team-1", type: "training", minutes: 90, players_count: 20 },
      { date: "2026-10-02", team_id: "team-1", type: "training", minutes: 90, players_count: 20 },
      { date: "2026-10-03", team_id: "team-1", type: "training", minutes: 90, players_count: 20 },
      { date: "2026-10-04", team_id: "team-1", type: "training", minutes: 90, players_count: 20 },
      // Матч: 1 матч 90 хв x 16 гравців = 24 год
      { date: "2026-10-05", team_id: "team-1", type: "match", minutes: 90, players_count: 16 },
    ];

    const mockInjuries: RawInjuryItem[] = [
      { date_of_injury: "2026-10-02", team_id: "team-1", activity_type: "training" },
      { date_of_injury: "2026-10-05", team_id: "team-1", activity_type: "match" },
      { date_of_injury: "2026-10-05", team_id: "team-1", activity_type: "match" },
    ];

    it("окремо підсумовує експозицію та травми для training і match", () => {
      const res = calculateExposureMetrics(mockExposures, mockInjuries);

      assert.strictEqual(res.trainingExposureHours, 120);
      assert.strictEqual(res.matchExposureHours, 24);
      assert.strictEqual(res.totalExposureHours, 144);

      assert.strictEqual(res.trainingInjuries, 1);
      assert.strictEqual(res.matchInjuries, 2);
      assert.strictEqual(res.totalInjuries, 3);

      // Тренування: (1 / 120) * 1000 = 8.3
      assert.strictEqual(res.trainingIncidence, 8.3);

      // Матчі: (2 / 24) * 1000 = 83.3
      assert.strictEqual(res.matchIncidence, 83.3);

      // Загальний: (3 / 144) * 1000 = 20.8
      assert.strictEqual(res.overallIncidence, 20.8);
      assert.strictEqual(res.hasSufficientData, true);
      assert.strictEqual(res.displayLabel, "20.8 / 1000 год");
    });

    it("показує 'Недостатньо даних про експозицію' при відсутності записів", () => {
      const res = calculateExposureMetrics([], [{ date_of_injury: "2026-10-01", team_id: "team-1" }]);

      assert.strictEqual(res.hasSufficientData, false);
      assert.strictEqual(res.totalExposureHours, 0);
      assert.strictEqual(res.overallIncidence, null);
      assert.strictEqual(res.displayLabel, INSUFFICIENT_EXPOSURE_DATA_MSG);
      assert.strictEqual(res.trainingDisplayLabel, INSUFFICIENT_EXPOSURE_DATA_MSG);
      assert.strictEqual(res.matchDisplayLabel, INSUFFICIENT_EXPOSURE_DATA_MSG);
    });
  });

  describe("4. Фільтрація за командою та періодом", () => {
    const exposures: RawExposureItem[] = [
      { date: "2026-09-15", team_id: "team-1", type: "training", minutes: 60, players_count: 10 }, // 10 год
      { date: "2026-10-10", team_id: "team-1", type: "training", minutes: 60, players_count: 10 }, // 10 год
      { date: "2026-10-15", team_id: "team-2", type: "training", minutes: 60, players_count: 20 }, // 20 год
    ];

    const injuries: RawInjuryItem[] = [
      { date_of_injury: "2026-09-15", team_id: "team-1", activity_type: "training" },
      { date_of_injury: "2026-10-10", team_id: "team-1", activity_type: "training" },
      { date_of_injury: "2026-10-15", team_id: "team-2", activity_type: "training" },
    ];

    it("фільтрує за командою team-1", () => {
      const res = calculateExposureMetrics(exposures, injuries, { teamId: "team-1" });
      assert.strictEqual(res.totalExposureHours, 20);
      assert.strictEqual(res.totalInjuries, 2);
      assert.strictEqual(res.overallIncidence, 100);
    });

    it("фільтрує за датами (жовтень 2026)", () => {
      const res = calculateExposureMetrics(exposures, injuries, {
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      });
      // Має включити 10-10 (10 год) та 10-15 (20 год) = 30 год
      assert.strictEqual(res.totalExposureHours, 30);
      assert.strictEqual(res.totalInjuries, 2);
    });
  });

  describe("5. Зведений розрахунок по кількох командах", () => {
    it("формує розбивку для списку команд", () => {
      const teams = [
        { id: "t1", name: "U-19" },
        { id: "t2", name: "U-17" },
      ];
      const exposures: RawExposureItem[] = [
        { date: "2026-10-01", team_id: "t1", type: "training", minutes: 60, players_count: 20 }, // 20 год
      ];
      const injuries: RawInjuryItem[] = [
        { date_of_injury: "2026-10-01", team_id: "t1", activity_type: "training" },
      ];

      const breakdown = calculateTeamExposureBreakdown(teams, exposures, injuries);
      assert.strictEqual(breakdown.length, 2);

      // t1 має дані
      assert.strictEqual(breakdown[0].teamName, "U-19");
      assert.strictEqual(breakdown[0].hasSufficientData, true);
      assert.strictEqual(breakdown[0].overallIncidence, 50.0);

      // t2 не має даних
      assert.strictEqual(breakdown[1].teamName, "U-17");
      assert.strictEqual(breakdown[1].hasSufficientData, false);
      assert.strictEqual(breakdown[1].displayLabel, INSUFFICIENT_EXPOSURE_DATA_MSG);
    });
  });
});
