import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  WADA_CLASS_INFO,
  type WadaClass,
} from "../src/types/wada.ts";
import {
  TUE_STATUSES,
  TUE_STATUS_DETAILS,
  evaluateTueExpiry,
} from "../src/types/tue.ts";
import {
  verifySubstanceOrBrand,
  WADA_PROHIBITED_CATALOG,
  WADA_PERMITTED_SAFE_MEDS,
} from "../src/lib/wada-prohibited-list.ts";

describe("Етап 5.3 — TUE як процес та Антидопінговий чекер WADA (НАДЦ)", () => {
  describe("1. База заборонених речовин WADA та довідники", () => {
    it("містить усі 5 обов'язкових статусів TUE за специфікацією", () => {
      const expected = ["підготовка", "подано", "схвалено", "відхилено", "закінчився"];
      assert.deepEqual(TUE_STATUSES, expected);
      expected.forEach((st) => {
        assert.ok(TUE_STATUS_DETAILS[st as keyof typeof TUE_STATUS_DETAILS]);
        assert.ok(TUE_STATUS_DETAILS[st as keyof typeof TUE_STATUS_DETAILS].label.length > 0);
      });
    });

    it("класифікатор WADA містить описи для S1–S9, P1 та методів M1–M3", () => {
      const classes: WadaClass[] = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "P1", "M1_M3"];
      classes.forEach((cls) => {
        assert.ok(WADA_CLASS_INFO[cls]);
        assert.ok(WADA_CLASS_INFO[cls].name_uk.length > 0);
        assert.ok(WADA_CLASS_INFO[cls].description.length > 0);
      });
    });

    it("каталог містить ключові спортивні заборонені препарати", () => {
      assert.ok(WADA_PROHIBITED_CATALOG.length >= 10);
      const substances = WADA_PROHIBITED_CATALOG.map((r) => r.name_uk);
      assert.ok(substances.includes("Сальбутамол"));
      assert.ok(substances.includes("Псевдоефедрин"));
      assert.ok(substances.includes("Мельдоній"));
      assert.ok(substances.includes("Дексаметазон"));
      assert.ok(substances.includes("Трамадол"));
    });
  });

  describe("2. Інтелектуальний WADA Drug Checker (verifySubstanceOrBrand)", () => {
    it("розпізнає Вентолін як Сальбутамол (клас S3) з пороговим винятком", () => {
      const res = verifySubstanceOrBrand("Вентолін");
      assert.equal(res.found, true);
      assert.equal(res.record?.name_uk, "Сальбутамол");
      assert.equal(res.record?.wada_class, "S3");
      assert.equal(res.status, "conditional_permitted");
      assert.match(res.recommendation, /1600 мкг/);
      assert.equal(res.suggested_action, "check_threshold");
    });

    it("розпізнає Колдфлю як Псевдоефедрин (клас S6) заборонений у змагання", () => {
      const res = verifySubstanceOrBrand("Колдфлю");
      assert.equal(res.found, true);
      assert.equal(res.record?.name_uk, "Псевдоефедрин");
      assert.equal(res.record?.wada_class, "S6");
      assert.equal(res.status, "prohibited_in_competition");
      assert.match(res.recommendation, /змагальний період/);
      assert.equal(res.record?.washout_period_hours, 72);
      assert.equal(res.suggested_action, "specify_washout");
    });

    it("розпізнає Грипекс та Актифед як заборонені стимулятори за торговою назвою", () => {
      const gRes = verifySubstanceOrBrand("Грипекс");
      const aRes = verifySubstanceOrBrand("Актифед");
      assert.equal(gRes.status, "prohibited_in_competition");
      assert.equal(aRes.status, "prohibited_in_competition");
      assert.equal(gRes.record?.name_uk, "Псевдоефедрин");
    });

    it("розпізнає Мілдронат / Мельдоній як постійно заборонений метаболічний модулятор (S4)", () => {
      const resBrand = verifySubstanceOrBrand("Мілдронат");
      const resInn = verifySubstanceOrBrand("Мельдоній");

      assert.equal(resBrand.status, "prohibited_always");
      assert.equal(resInn.status, "prohibited_always");
      assert.equal(resBrand.record?.wada_class, "S4");
      assert.equal(resBrand.requires_tue, true);
      assert.equal(resBrand.suggested_action, "create_tue");
    });

    it("розпізнає Дипроспан / Бетаметазон як депо-кортикостероїд з тривалим кліренсом", () => {
      const res = verifySubstanceOrBrand("Дипроспан");
      assert.equal(res.status, "prohibited_in_competition");
      assert.equal(res.record?.wada_class, "S9");
      assert.equal(res.record?.name_uk, "Бетаметазон");
      assert.ok((res.record?.washout_period_hours || 0) >= 720); // 30 діб
      assert.equal(res.requires_tue, true);
    });

    it("розпізнає Трамадол (заборона з 2024 року WADA)", () => {
      const res = verifySubstanceOrBrand("Трамадол");
      assert.equal(res.status, "prohibited_in_competition");
      assert.equal(res.record?.wada_class, "S7");
      assert.equal(res.requires_tue, true);
    });

    it("підтверджує безпеку дозволених препаратів (Парацетамол, Ібупрофен, Німесил)", () => {
      const paracetamol = verifySubstanceOrBrand("Парацетамол");
      const nurofen = verifySubstanceOrBrand("Нурофен");
      const nimesil = verifySubstanceOrBrand("Німесил");

      assert.equal(paracetamol.status, "permitted");
      assert.equal(nurofen.status, "permitted");
      assert.equal(nimesil.status, "permitted");
      assert.equal(paracetamol.requires_tue, false);
      assert.equal(nurofen.suggested_action, "safe");
    });

    it("нечутливий до регістру та пробілів у запиті", () => {
      const upper = verifySubstanceOrBrand("  ВЕНТОЛІН  ");
      const mixed = verifySubstanceOrBrand("мІлДрОнАт");
      assert.equal(upper.record?.name_uk, "Сальбутамол");
      assert.equal(mixed.record?.name_uk, "Мельдоній");
    });
  });

  describe("3. Контроль термінів дії TUE та тригер 30 днів (evaluateTueExpiry)", () => {
    const fixedNow = new Date("2026-10-23T12:00:00Z");

    it("не видає попередження, якщо до закінчення дії більше 30 днів", () => {
      const evaluation = evaluateTueExpiry(
        {
          status: "схвалено",
          valid_until: "2026-12-31", // понад 60 днів
        },
        fixedNow
      );

      assert.equal(evaluation.effectiveStatus, "схвалено");
      assert.equal(evaluation.isExpiringSoon, false);
      assert.equal(evaluation.isExpired, false);
      assert.equal(evaluation.alertText, null);
      assert.ok(evaluation.daysRemaining! > 30);
    });

    it("видає тривожне попередження за 30 днів або менше до закінчення дії TUE", () => {
      const evaluation = evaluateTueExpiry(
        {
          status: "схвалено",
          valid_until: "2026-11-10", // 18 днів до закінчення
        },
        fixedNow
      );

      assert.equal(evaluation.effectiveStatus, "схвалено");
      assert.equal(evaluation.isExpiringSoon, true);
      assert.equal(evaluation.isExpired, false);
      assert.equal(evaluation.daysRemaining, 18);
      assert.match(evaluation.alertText || "", /18 дн/);
      assert.match(evaluation.alertText || "", /продовження до НАДЦ/);
    });

    it("автоматично переводить у статус 'закінчився', якщо дата в минулому", () => {
      const evaluation = evaluateTueExpiry(
        {
          status: "схвалено",
          valid_until: "2026-10-20", // 3 дні тому
        },
        fixedNow
      );

      assert.equal(evaluation.effectiveStatus, "закінчився");
      assert.equal(evaluation.isExpiringSoon, false);
      assert.equal(evaluation.isExpired, true);
      assert.match(evaluation.alertText || "", /закінчився/);
    });

    it("не генерує 30-денне попередження для кейсів у статусі 'підготовка' або 'подано'", () => {
      const prep = evaluateTueExpiry(
        {
          status: "підготовка",
          valid_until: "2026-11-01",
        },
        fixedNow
      );
      const subm = evaluateTueExpiry(
        {
          status: "подано",
          valid_until: "2026-11-01",
        },
        fixedNow
      );

      assert.equal(prep.isExpiringSoon, false);
      assert.equal(subm.isExpiringSoon, false);
      assert.equal(prep.alertText, null);
    });
  });

  describe("4. Перевірка SQL-міграції 20261023150000_tue_cases.sql", () => {
    it("файл міграції існує і містить коректні обмеження CHECK та RLS", () => {
      const migrationPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261023150000_tue_cases.sql"
      );
      assert.ok(fs.existsSync(migrationPath), "Файл міграції tue_cases повинен існувати");

      const sql = fs.readFileSync(migrationPath, "utf-8");
      assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.tue_cases"));
      assert.ok(sql.includes("'підготовка'"));
      assert.ok(sql.includes("'подано'"));
      assert.ok(sql.includes("'схвалено'"));
      assert.ok(sql.includes("'відхилено'"));
      assert.ok(sql.includes("'закінчився'"));
      assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
      assert.ok(sql.includes("has_club_role(club_id, ARRAY['doctor', 'admin'])"));
    });
  });
});
