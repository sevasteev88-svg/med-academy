import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONCUSSION_GRTP_STAGES,
  RED_FLAG_LABELS,
  CONCUSSION_MECHANISM_LABELS,
  validateStageTransition,
  type ConcussionCase,
} from "../src/types/concussion.ts";
import { calculatePlayerAvailability, type RawPlayerInput } from "../src/lib/availability-rules.ts";

describe("5.4 Модуль струсу мозку (SCAT6 / FIFA Concussion Protocol)", () => {
  describe("1. Структура 6 ступенів поступового повернення (GRTP) та підказки симптомів", () => {
    it("містить усі 6 регламентованих ступенів протоколу CISG Amsterdam", () => {
      const stages = Object.keys(CONCUSSION_GRTP_STAGES).map(Number);
      assert.deepEqual(stages, [1, 2, 3, 4, 5, 6]);
    });

    it("кожен ступінь містить специфічні симптоми-підказки (типові тригери)", () => {
      for (let s = 1; s <= 6; s++) {
        const stage = CONCUSSION_GRTP_STAGES[s as 1 | 2 | 3 | 4 | 5 | 6];
        assert.ok(stage);
        assert.ok(stage.typicalSymptoms.length > 0);
        assert.equal(typeof stage.title, "string");
        assert.equal(typeof stage.activities, "string");
      }
    });

    it("Ступінь 1 містить симптоми чутливості до екранів та світлобоязні", () => {
      const stage1 = CONCUSSION_GRTP_STAGES[1];
      assert.ok(stage1.typicalSymptoms.some((sym) => sym.includes("екрани") || sym.includes("screen time")));
      assert.equal(stage1.minDurationHours, 24);
    });

    it("Ступінь 3 (футбольно-специфічний) забороняє удари головою та відстежує вестибулярні симптоми", () => {
      const stage3 = CONCUSSION_GRTP_STAGES[3];
      assert.ok(stage3.activities.includes("ЖОДНОГО удару головою"));
      assert.ok(stage3.typicalSymptoms.some((sym) => sym.includes("Запаморочення") || sym.includes("VOR")));
    });

    it("Ступені 5 і 6 вимагають обов'язкового допуску лікаря (requiresDoctorClearance)", () => {
      assert.equal(CONCUSSION_GRTP_STAGES[5].requiresDoctorClearance, true);
      assert.equal(CONCUSSION_GRTP_STAGES[6].requiresDoctorClearance, true);
      assert.equal(CONCUSSION_GRTP_STAGES[2].requiresDoctorClearance, false);
    });
  });

  describe("2. Клінічна валідація переходів між ступенями (validateStageTransition)", () => {
    it("відхиляє перехід, якщо відсутній електронний підпис лікаря", () => {
      const result = validateStageTransition({
        currentStage: 1,
        targetStage: 2,
        isSymptomFree24h: true,
        symptomsNoted: [],
        doctorSignatureName: "",
      });

      assert.equal(result.allowed, false);
      assert.ok(result.error?.includes("ПІБ лікаря"));
    });

    it("відхиляє перехід і здійснює ВІДКАТ на ступінь назад, якщо зафіксовано симптоми", () => {
      const result = validateStageTransition({
        currentStage: 3,
        targetStage: 4,
        isSymptomFree24h: false,
        symptomsNoted: ["Пульсуючий головний біль при зростанні пульсу"],
        doctorSignatureName: "Д-р Коваль О.М.",
      });

      assert.equal(result.allowed, false);
      assert.equal(result.nextStage, 2); // Відкат з 3 на 2!
      assert.ok(result.actionReason.includes("повернення на Ступінь 2"));
    });

    it("відкат на Ступені 1 не падає нижче 1", () => {
      const result = validateStageTransition({
        currentStage: 1,
        targetStage: 2,
        isSymptomFree24h: false,
        symptomsNoted: ["Світлобоязнь"],
        doctorSignatureName: "Д-р Коваль О.М.",
      });

      assert.equal(result.allowed, false);
      assert.equal(result.nextStage, 1);
    });

    it("блокує перехід до Ступеня 5 (повноконтактне тренування) без явного Medical Clearance", () => {
      const result = validateStageTransition({
        currentStage: 4,
        targetStage: 5,
        isSymptomFree24h: true,
        symptomsNoted: [],
        doctorSignatureName: "Д-р Шевченко В.І.",
        medicalClearanceGranted: false,
      });

      assert.equal(result.allowed, false);
      assert.ok(result.error?.includes("Medical Clearance"));
    });

    it("дозволяє перехід до Ступеня 5 за наявності 24 год без симптомів та допуску лікаря", () => {
      const result = validateStageTransition({
        currentStage: 4,
        targetStage: 5,
        isSymptomFree24h: true,
        symptomsNoted: [],
        doctorSignatureName: "Д-р Шевченко В.І.",
        medicalClearanceGranted: true,
      });

      assert.equal(result.allowed, true);
      assert.equal(result.nextStage, 5);
    });
  });

  describe("3. Жорстке блокування готовності гравця (Правило 0 в getPlayerAvailability)", () => {
    const baseMockPlayer: RawPlayerInput = {
      id: "player-concussion-test",
      first_name: "Тарас",
      last_name: "Степаненко",
      position: "ПЗ",
      injuries: [],
    };

    it("гравець з активним струсом мозку (status: active) отримує статус 'unavailable' і 0 хвилин", () => {
      const mockCase: ConcussionCase = {
        id: "case-1",
        club_id: "club-1",
        player_id: "player-concussion-test",
        incident_date: "2026-10-23",
        mechanism: "head_to_head",
        has_red_flags: false,
        red_flags: [],
        symptom_count: 5,
        symptom_severity: 12,
        current_stage: 1,
        stage_history: [],
        status: "active",
        created_at: "2026-10-23T10:00:00Z",
        updated_at: "2026-10-23T10:00:00Z",
      };

      const availability = calculatePlayerAvailability({
        ...baseMockPlayer,
        concussionCase: mockCase,
      });

      assert.equal(availability.status, "unavailable");
      assert.equal(availability.max_minutes, 0);
      assert.ok(availability.restriction_notes.includes("Сотрус мозку"));
      assert.ok(availability.restriction_notes.includes("Ступінь 1/6"));
    });

    it("гравець на етапі відновлення (status: recovering, current_stage: 3) залишається 'unavailable' і 0 хв", () => {
      const mockCase: ConcussionCase = {
        id: "case-2",
        club_id: "club-1",
        player_id: "player-concussion-test",
        incident_date: "2026-10-20",
        mechanism: "head_to_ground",
        has_red_flags: false,
        red_flags: [],
        symptom_count: 1,
        symptom_severity: 2,
        current_stage: 3,
        stage_history: [],
        status: "recovering",
        created_at: "2026-10-20T10:00:00Z",
        updated_at: "2026-10-22T10:00:00Z",
      };

      const availability = calculatePlayerAvailability({
        ...baseMockPlayer,
        concussionCase: mockCase,
      });

      assert.equal(availability.status, "unavailable");
      assert.equal(availability.max_minutes, 0);
      assert.ok(availability.restriction_notes.includes("Ступінь 3/6"));
    });

    it("після закриття кейсу струсу (status: closed) гравець повертається до звичайного розрахунку доступності", () => {
      const mockCase: ConcussionCase = {
        id: "case-3",
        club_id: "club-1",
        player_id: "player-concussion-test",
        incident_date: "2026-10-10",
        mechanism: "head_to_ball",
        has_red_flags: false,
        red_flags: [],
        symptom_count: 0,
        symptom_severity: 0,
        current_stage: 6,
        stage_history: [],
        status: "closed",
        created_at: "2026-10-10T10:00:00Z",
        updated_at: "2026-10-18T10:00:00Z",
      };

      const availability = calculatePlayerAvailability({
        ...baseMockPlayer,
        concussionCase: mockCase,
      });

      // Оскільки травми відсутні, статус має бути available і 90 хвилин
      assert.equal(availability.status, "available");
      assert.equal(availability.max_minutes, 90);
    });
  });

  describe("4. Захист авторського права та довідники", () => {
    it("перелік червоних прапорців містить 8 критичних симптомів невідкладного стану", () => {
      assert.equal(Object.keys(RED_FLAG_LABELS).length, 8);
      assert.ok(RED_FLAG_LABELS.neck_pain.includes("шийно"));
      assert.ok(RED_FLAG_LABELS.loss_of_consciousness.includes("свідомості"));
    });

    it("механізми травми відповідають специфіці футболу", () => {
      assert.ok(CONCUSSION_MECHANISM_LABELS.head_to_head.includes("Зіткнення головами"));
      assert.ok(CONCUSSION_MECHANISM_LABELS.body_impact.includes("Whiplash"));
    });
  });
});
