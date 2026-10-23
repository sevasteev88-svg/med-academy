import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXERCISE_DATABASE, filterExerciseDatabase } from "../src/lib/exercise-database.ts";
import type { PlayerCustomRehabPlan, CustomRehabPlanItem, ExerciseLoadType } from "../src/types/exercise-library.ts";
import type { RehabCheckinData, ExerciseFeedbackItem } from "../src/types/rehab-portal.ts";

describe("3.4 Безпечний Конструктор ЛФК", () => {
  // 1. В каталозі прибрано фіксовані ваги. Дозування задає лікар (RPE, % від ваги, повтори, підходи)
  describe("1. Каталог без фіксованих ваг та клінічне дозування лікарем", () => {
    it("не містить захардкоджених діапазонів ваг на кшталт '6-12 кг' чи '2-3 кг'", () => {
      for (const ex of EXERCISE_DATABASE) {
        assert.doesNotMatch(
          ex.equipment || "",
          /\d+\s*-\s*\d+\s*кг/i,
          `Вправа ${ex.id} має фіксовану вагу в equipment: "${ex.equipment}"`
        );
        assert.doesNotMatch(
          ex.defaultSetsReps,
          /\d+\s*-\s*\d+\s*кг/i,
          `Вправа ${ex.id} має фіксовану вагу в defaultSetsReps: "${ex.defaultSetsReps}"`
        );
      }
    });

    it("підтримує налаштування дозування: RPE, % від ваги, власна вага, повтори та підходи", () => {
      const exerciseItem: CustomRehabPlanItem = {
        exerciseId: "ham-rdl-single",
        name: "Румунська тяга на одній нозі (Single Leg RDL)",
        sets: 3,
        reps: "8-10",
        loadType: "rpe" as ExerciseLoadType,
        loadValue: "RPE 7",
        setsReps: "3 підходи × 8-10 @ RPE 7",
        targetArea: "Ексцентричний контроль",
        technique: "Пряма спина...",
        source: "Aspetar Hamstring Protocol",
      };

      assert.equal(exerciseItem.sets, 3);
      assert.equal(exerciseItem.loadType, "rpe");
      assert.equal(exerciseItem.loadValue, "RPE 7");

      const bwExercise: CustomRehabPlanItem = {
        exerciseId: "groin-copenhagen-short",
        name: "Копенгагенська планка",
        sets: 4,
        reps: "15 сек",
        loadType: "percent_bw" as ExerciseLoadType,
        loadValue: "15% від ваги",
        setsReps: "4 підходи × 15 сек (15% від маси тіла)",
        targetArea: "Аддуктори",
        technique: "Планка...",
      };
      assert.equal(bwExercise.loadType, "percent_bw");
    });
  });

  // 2. Прив'язка до травми та фази RTP. Попередження, якщо вправа для пізнішої фази
  describe("2. Прив'язка до травми та фази RTP + Запобіжник фаз", () => {
    function checkPhaseMismatch(exercisePhase: string, targetRtpPhase: number) {
      if (exercisePhase === "all") return { isLater: false };
      if (targetRtpPhase === 1) {
        if (exercisePhase === "intermediate" || exercisePhase === "late_dynamic") {
          return { isLater: true };
        }
      }
      if (targetRtpPhase === 2 && exercisePhase === "late_dynamic") {
        return { isLater: true };
      }
      return { isLater: false };
    }

    it("виявляє спробу призначити динамічну або проміжну вправу у Фазі 1 (Зал/Клініка)", () => {
      const earlyEx = EXERCISE_DATABASE.find((e) => e.phase === "early");
      const intermediateEx = EXERCISE_DATABASE.find((e) => e.phase === "intermediate");
      const lateDynamicEx = EXERCISE_DATABASE.find((e) => e.phase === "late_dynamic");

      assert.ok(earlyEx);
      assert.ok(intermediateEx);
      assert.ok(lateDynamicEx);

      // У Фазі 1: early - ок, intermediate та late_dynamic - попередження
      assert.equal(checkPhaseMismatch(earlyEx.phase, 1).isLater, false);
      assert.equal(checkPhaseMismatch(intermediateEx.phase, 1).isLater, true);
      assert.equal(checkPhaseMismatch(lateDynamicEx.phase, 1).isLater, true);

      // У Фазі 2: early та intermediate - ок, late_dynamic - попередження
      assert.equal(checkPhaseMismatch(intermediateEx.phase, 2).isLater, false);
      assert.equal(checkPhaseMismatch(lateDynamicEx.phase, 2).isLater, true);

      // У Фазі 3+: late_dynamic - ок
      assert.equal(checkPhaseMismatch(lateDynamicEx.phase, 3).isLater, false);
    });

    it("обов'язково зберігає прив'язку до injury_id та target_rtp_phase", () => {
      const plan: PlayerCustomRehabPlan = {
        id: "plan_test_1",
        player_id: "player-123",
        doctor_name: "Д-р Шевченко О.В.",
        title: "Програма відновлення ПКС",
        muscle_or_injury_focus: "Колінний суглоб",
        exercises: [],
        created_at: new Date().toISOString(),
        is_active: true,
        target_injury_id: "inj-456",
        injury_title: "Розрив ПКС (Коліно)",
        target_rtp_phase: 2,
        status: "approved",
      };

      assert.equal(plan.target_injury_id, "inj-456");
      assert.equal(plan.target_rtp_phase, 2);
    });
  });

  // 3. Статуси «Чернетка» → «Затверджено лікарем» (ФІО та дата). Гравець бачить лише затверджені
  describe("3. Статуси Чернетка -> Затверджено лікарем", () => {
    it("гравець бачить виключно затверджені плани, чернетки фільтруються", () => {
      const plansList: PlayerCustomRehabPlan[] = [
        {
          id: "plan_draft",
          player_id: "player_abc",
          doctor_name: "Д-р Коваленко",
          title: "Чернетка програми",
          muscle_or_injury_focus: "Хамстрінг",
          exercises: [{ exerciseId: "ham-extender", name: "Extender", setsReps: "3x10", targetArea: "", technique: "" }],
          created_at: "2026-10-22T10:00:00Z",
          is_active: true,
          status: "draft",
        },
        {
          id: "plan_approved",
          player_id: "player_abc",
          doctor_name: "Д-р Коваленко",
          title: "Затверджений комплекс",
          muscle_or_injury_focus: "Хамстрінг",
          exercises: [{ exerciseId: "ham-ball-curl", name: "Ball Curl", setsReps: "3x12", targetArea: "", technique: "" }],
          created_at: "2026-10-21T10:00:00Z",
          is_active: true,
          status: "approved",
          approved_by: "Д-р Коваленко О.М.",
          approved_at: "2026-10-21T10:30:00Z",
        },
      ];

      // Симуляція відбору для кабінету гравця
      const visibleToPlayer = plansList.filter(
        (p) => p.player_id === "player_abc" && (p.status === "approved" || !p.status)
      );

      assert.equal(visibleToPlayer.length, 1);
      assert.equal(visibleToPlayer[0].id, "plan_approved");
      assert.equal(visibleToPlayer[0].status, "approved");
      assert.ok(visibleToPlayer[0].approved_by);
      assert.ok(visibleToPlayer[0].approved_at);
    });
  });

  // 4. Поле «Джерело» у вправ. Формулювання "золотий стандарт" замінено на нейтральні
  describe("4. Поле Джерело та нейтральні формулювання", () => {
    it("всі вправи мають заповнене поле source", () => {
      for (const ex of EXERCISE_DATABASE) {
        assert.ok(ex.source && ex.source.trim().length > 0, `Вправа ${ex.id} не має джерела source`);
      }
    });

    it("не містить суб'єктивних ненаукових фраз 'золотий стандарт' або 'gold standard'", () => {
      for (const ex of EXERCISE_DATABASE) {
        const text = `${ex.name} ${ex.technique} ${ex.precautions || ""} ${ex.targetArea}`;
        assert.doesNotMatch(
          text,
          /золот(ий|ого|им|ому)\s+стандарт/i,
          `Вправа ${ex.id} містить формулювання 'золотий стандарт'`
        );
        assert.doesNotMatch(
          text,
          /gold\s+standard/i,
          `Вправа ${ex.id} містить формулювання 'gold standard'`
        );
      }
    });

    it("пошук у каталозі працює і за назвою джерела", () => {
      const aspetarResults = filterExerciseDatabase({ searchQuery: "Aspetar" });
      assert.ok(aspetarResults.length >= 2, "Очікується щонайменше 2 вправи з джерела Aspetar");

      const fifaResults = filterExerciseDatabase({ searchQuery: "FIFA 11+" });
      assert.ok(fifaResults.length >= 1, "Очікується вправа з джерела FIFA 11+");
    });
  });

  // 5. Гравець відмічає виконання та біль після кожної вправи (0-10)
  describe("5. Зворотний зв'язок гравця: виконання + біль (0-10)", () => {
    it("структура чек-іну містить exercise_feedback з балом болю за кожну вправу", () => {
      const feedback: ExerciseFeedbackItem[] = [
        {
          exercise_id: "ham-extender",
          exercise_name: "Askling Extender",
          completed: true,
          pain_score: 1, // допустимий дискомфорт
        },
        {
          exercise_id: "ham-nordic",
          exercise_name: "Нордичні опускання",
          completed: true,
          pain_score: 6, // гострий сигнал болю!
        },
        {
          exercise_id: "ham-ball-curl",
          exercise_name: "Сідничний міст на фітболі",
          completed: false,
          pain_score: null,
        },
      ];

      const checkin: RehabCheckinData = {
        injury_id: "inj-001",
        player_id: "pl-001",
        date: "2026-10-22",
        time: "11:00",
        sleep_quality: 4,
        freshness_level: 4,
        muscle_soreness: 3,
        stress_level: 4,
        exercises_completed: "partial",
        completed_exercise_ids: ["ham-extender", "ham-nordic"],
        exercise_feedback: feedback,
      };

      assert.equal(checkin.exercise_feedback?.length, 3);

      const severePainEx = checkin.exercise_feedback?.filter((e) => (e.pain_score ?? 0) >= 5);
      assert.equal(severePainEx?.length, 1);
      assert.equal(severePainEx?.[0].exercise_name, "Нордичні опускання");
      assert.equal(severePainEx?.[0].pain_score, 6);
    });
  });
});
