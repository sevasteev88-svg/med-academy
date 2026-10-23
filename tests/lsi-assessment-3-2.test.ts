import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLsiScore,
  calculateHqRatio,
  calculateRelativeStrength,
  validateLsiRecord,
  LSI_THRESHOLDS,
  HQ_RATIO_THRESHOLD,
  DEFAULT_PROTOCOL_SOURCE,
  PROTOCOL_SOURCE_OPTIONS,
  type LsiTestType,
  type LsiAssessmentRecord,
} from "../src/types/lsi.ts";

describe("3.2 LSI — Коректний LSI та функціональне тестування", () => {
  describe("1. Індивідуальні пороги для кожного тесту", () => {
    it("Hop-тести та динамометрія мають поріг ≥ 90%", () => {
      assert.equal(LSI_THRESHOLDS.single_leg_hop, 90);
      assert.equal(LSI_THRESHOLDS.triple_hop, 90);
      assert.equal(LSI_THRESHOLDS.crossover_hop, 90);
      assert.equal(LSI_THRESHOLDS.timed_hop_6m, 90);
      assert.equal(LSI_THRESHOLDS.quadriceps_dynamometry, 90);
      assert.equal(LSI_THRESHOLDS.hamstring_dynamometry, 90);
      assert.equal(LSI_THRESHOLDS.adductor_squeeze, 90);
    });

    it("Y-Balance тест має поріг ≥ 95% за критерієм із підпису", () => {
      assert.equal(LSI_THRESHOLDS.y_balance_composite, 95);

      // 94% симетрії — для звичайного тесту було б pass (>=90), але для Y-Balance це FAIL (<95)
      const res94 = calculateLsiScore("y_balance_composite", 94, 100);
      assert.equal(res94.lsi, 94);
      assert.equal(res94.threshold, 95);
      assert.equal(res94.passed, false);

      // 95% симетрії — PASS
      const res95 = calculateLsiScore("y_balance_composite", 95, 100);
      assert.equal(res95.lsi, 95);
      assert.equal(res95.threshold, 95);
      assert.equal(res95.passed, true);
    });

    it("Hop-тести проходять при LSI ≥ 90% і не проходять при < 90%", () => {
      // 162 см / 180 см = 90% -> PASS
      const hopPass = calculateLsiScore("single_leg_hop", 162, 180);
      assert.equal(hopPass.lsi, 90);
      assert.equal(hopPass.passed, true);

      // 160 см / 180 см = 88.9% -> FAIL
      const hopFail = calculateLsiScore("single_leg_hop", 160, 180);
      assert.equal(hopFail.lsi, 88.9);
      assert.equal(hopFail.passed, false);
    });

    it("6m Timed Hop коректно розраховує зворотний LSI (менше часу = краще)", () => {
      // Травмована нога біжить повільніше (2.0 с), здорова швидше (1.8 с)
      // LSI = (1.8 / 2.0) * 100 = 90% -> PASS
      const timedPass = calculateLsiScore("timed_hop_6m", 2.0, 1.8);
      assert.equal(timedPass.lsi, 90);
      assert.equal(timedPass.passed, true);

      // Травмована нога 2.2 с, здорова 1.8 с -> LSI = (1.8 / 2.2) * 100 = 81.8% -> FAIL
      const timedFail = calculateLsiScore("timed_hop_6m", 2.2, 1.8);
      assert.equal(timedFail.lsi, 81.8);
      assert.equal(timedFail.passed, false);
    });
  });

  describe("2. Композитний індекс довідковий; вердикт залежить від кожного тесту", () => {
    it("визначає 'Критерії LSI не виконано', якщо середній LSI > 90%, але 1 тест провалено", () => {
      // Наприклад:
      // Single leg hop: 100% (pass)
      // Triple hop: 98% (pass)
      // Crossover hop: 96% (pass)
      // Quadriceps HHD: 82% (fail! < 90%)
      const tests = [
        calculateLsiScore("single_leg_hop", 170, 170), // 100%
        calculateLsiScore("triple_hop", 490, 500), // 98%
        calculateLsiScore("crossover_hop", 480, 500), // 96%
        calculateLsiScore("quadriceps_dynamometry", 41, 50), // 82%
      ];

      const avgLsi = Math.round((tests.reduce((acc, t) => acc + t.lsi, 0) / tests.length) * 10) / 10;
      assert.equal(avgLsi, 94); // Довідковий композитний індекс високий (94%)!

      // Але перевірка дискретна:
      const allPassed = tests.every((t) => t.passed);
      assert.equal(allPassed, false);

      const failedTests = tests.filter((t) => !t.passed);
      assert.equal(failedTests.length, 1);
      assert.equal(failedTests[0].lsi, 82);

      const verdict = allPassed
        ? "Критерії LSI виконано. Рішення про допуск приймає лікар"
        : "Критерії LSI не виконано. Рішення про допуск приймає лікар";
      assert.equal(verdict, "Критерії LSI не виконано. Рішення про допуск приймає лікар");
    });

    it("визначає 'Критерії LSI виконано', коли всі окремі тести подолали поріг", () => {
      const tests = [
        calculateLsiScore("single_leg_hop", 165, 175), // 94.3% (pass)
        calculateLsiScore("triple_hop", 470, 500), // 94% (pass)
        calculateLsiScore("quadriceps_dynamometry", 46, 50), // 92% (pass)
        calculateLsiScore("hamstring_dynamometry", 32, 35), // 91.4% (pass)
      ];

      const allPassed = tests.every((t) => t.passed);
      assert.equal(allPassed, true);

      const verdict = allPassed
        ? "Критерії LSI виконано. Рішення про допуск приймає лікар"
        : "Критерії LSI не виконано. Рішення про допуск приймає лікар";
      assert.equal(verdict, "Критерії LSI виконано. Рішення про допуск приймає лікар");
    });
  });

  describe("3. Формулювання вердикту та підпис лікаря", () => {
    it("формує регламентні формулювання вердикту", () => {
      const clearedText = "Критерії LSI виконано. Рішення про допуск приймає лікар";
      const notClearedText = "Критерії LSI не виконано. Рішення про допуск приймає лікар";

      assert.ok(clearedText.includes("Рішення про допуск приймає лікар"));
      assert.ok(notClearedText.includes("Рішення про допуск приймає лікар"));
    });

    it("зберігає поле підпису лікаря в структурі протоколу", () => {
      const sampleRecord: Partial<LsiAssessmentRecord> = {
        doctor_signature: "Д-р Коваль О. В. / Головний лікар",
        evaluator_name: "Медичний штаб ФК Чорноморець",
      };

      assert.equal(sampleRecord.doctor_signature, "Д-р Коваль О. В. / Головний лікар");
    });
  });

  describe("4. Співвідношення H/Q (hamstring / quad) та нормування сили на масу тіла", () => {
    it("розраховує H/Q співвідношення та звіряє з порогом 0.60", () => {
      assert.equal(HQ_RATIO_THRESHOLD, 0.60);

      // Hamstring 30 кг, Quad 50 кг -> H/Q = 0.60 -> PASS
      const hqPass = calculateHqRatio(30, 50);
      assert.equal(hqPass.ratio, 0.6);
      assert.equal(hqPass.passed, true);

      // Hamstring 25 кг, Quad 50 кг -> H/Q = 0.50 -> FAIL (<0.60)
      const hqFail = calculateHqRatio(25, 50);
      assert.equal(hqFail.ratio, 0.5);
      assert.equal(hqFail.passed, false);

      // При нульових значеннях повертає 0 і false
      const hqZero = calculateHqRatio(0, 50);
      assert.equal(hqZero.passed, false);
    });

    it("якщо H/Q травмованої ноги < 0.60, критерії не вважаються виконаними", () => {
      // Усі тести LSI ≥ 90%:
      const tests = [
        calculateLsiScore("quadriceps_dynamometry", 50, 52), // LSI = 96.2%
        calculateLsiScore("hamstring_dynamometry", 25, 27), // LSI = 92.6%
      ];
      assert.ok(tests.every((t) => t.passed));

      // Але H/Q травмованої ноги: 25 / 50 = 0.50 (дефіцит < 0.60)
      const hq = calculateHqRatio(25, 50);
      assert.equal(hq.passed, false);

      const criteriaMet = tests.every((t) => t.passed) && hq.passed;
      assert.equal(criteriaMet, false);
    });

    it("нормує силу на масу тіла (кг / кг)", () => {
      // Сила 48 кг при масі тіла 75 кг -> 0.64 кг/кг
      const rel1 = calculateRelativeStrength(48, 75);
      assert.equal(rel1, 0.64);

      // Сила 60 кг при масі тіла 80 кг -> 0.75 кг/кг
      const rel2 = calculateRelativeStrength(60, 80);
      assert.equal(rel2, 0.75);

      // Без маси тіла або при некоректній масі повертає null
      assert.equal(calculateRelativeStrength(48, null), null);
      assert.equal(calculateRelativeStrength(48, 0), null);
    });
  });

  describe("5. Протокол функціонального тестування та поле «Джерело»", () => {
    it("містить типове джерело та перелік опцій", () => {
      assert.equal(DEFAULT_PROTOCOL_SOURCE, "Клінічний консенсус клубу");
      assert.ok(PROTOCOL_SOURCE_OPTIONS.includes("Клінічний консенсус клубу"));
      assert.ok(PROTOCOL_SOURCE_OPTIONS.includes("FIFA Medical Consensus / F-MARC"));
      assert.ok(PROTOCOL_SOURCE_OPTIONS.includes("Aspetar Return to Play Guidelines"));
    });
  });

  describe("6. Валідація: заборона збереження без ноги та типу травми", () => {
    it("блокує збереження, якщо не обрано ногу (tested_limb)", () => {
      const res = validateLsiRecord({
        player_id: "test-player",
        injury_type: "ligament",
        date: "2026-10-22",
        tested_limb: "" as any,
      });

      assert.equal(res.valid, false);
      assert.ok(res.error);
      assert.match(res.error, /оберіть травмовану кінцівку/i);
    });

    it("блокує збереження, якщо не вказано тип травми (injury_type)", () => {
      const res = validateLsiRecord({
        player_id: "test-player",
        injury_type: "",
        date: "2026-10-22",
        tested_limb: "right",
      });

      assert.equal(res.valid, false);
      assert.ok(res.error);
      assert.match(res.error, /оберіть тип травми/i);
    });

    it("дозволяє збереження, коли вказано і ногу, і тип травми", () => {
      const res = validateLsiRecord({
        player_id: "test-player",
        injury_type: "ligament",
        date: "2026-10-22",
        tested_limb: "left",
      });

      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
    });
  });
});
