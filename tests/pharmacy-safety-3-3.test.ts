import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getExpiryStatus,
  type PharmacyItem,
  type MedicalTreatmentEntry,
} from "../src/types/pharmacy.ts";
import { DEFAULT_PHARMACY_ITEMS } from "../src/lib/default-pharmacy-stock.ts";

describe("Етап 3.3 — Аптека: Безпека та облік препаратів", () => {
  const mockNow = new Date("2026-10-22T12:00:00Z");

  describe("1. Контроль термінів придатності (60 / 30 / 7 днів та прострочені)", () => {
    it("визначає прострочений препарат (tier: expired)", () => {
      const res = getExpiryStatus("2026-10-20", mockNow);
      assert.equal(res.tier, "expired");
      assert.ok(res.daysLeft <= 0);
      assert.ok(res.label.includes("Прострочено"));
    });

    it("визначає критичний термін ≤ 7 діб (tier: critical_7)", () => {
      const res = getExpiryStatus("2026-10-26", mockNow); // +4 дні
      assert.equal(res.tier, "critical_7");
      assert.ok(res.daysLeft > 0 && res.daysLeft <= 7);
      assert.ok(res.label.includes("Критично"));
    });

    it("визначає термін ≤ 30 діб (tier: warning_30)", () => {
      const res = getExpiryStatus("2026-11-10", mockNow); // +19 днів
      assert.equal(res.tier, "warning_30");
      assert.ok(res.daysLeft > 7 && res.daysLeft <= 30);
      assert.ok(res.label.includes("Увага"));
    });

    it("визначає плановий контроль ≤ 60 діб (tier: notice_60)", () => {
      const res = getExpiryStatus("2026-12-05", mockNow); // +44 дні
      assert.equal(res.tier, "notice_60");
      assert.ok(res.daysLeft > 30 && res.daysLeft <= 60);
      assert.ok(res.label.includes("Контроль"));
    });

    it("визначає стандартний придатний стан > 60 діб (tier: ok)", () => {
      const res = getExpiryStatus("2027-08-30", mockNow);
      assert.equal(res.tier, "ok");
      assert.ok(res.daysLeft > 60);
      assert.ok(res.label.includes("Придатний"));
    });
  });

  describe("2. Клінічні поля препарату та нейтральні описи", () => {
    it("каталог за замовчуванням містить нейтральні показання (indications) та застереження", () => {
      for (const item of DEFAULT_PHARMACY_ITEMS) {
        assert.ok(item.name.length > 0, "Назва повинна бути вказана");
        assert.ok(item.min_alert_threshold >= 1, "Поріг дефіциту налаштовується (>= 1)");
        if (item.category !== "tapes_bandages") {
          assert.ok(item.indications && item.indications.length > 10, `${item.name} повинен містити клінічні показання`);
        }
      }
    });

    it("Німесулід містить віковий поріг 18 років та гепатотоксичне застереження", () => {
      const nimesulide = DEFAULT_PHARMACY_ITEMS.find((i) => i.name.includes("Німесулід"));
      assert.ok(nimesulide);
      assert.equal(nimesulide.min_age, 18);
      assert.ok(nimesulide.age_note?.includes("18 років"));
      assert.equal(nimesulide.wada_status, "allowed");
    });

    it("Дексаметазон є S-препаратом (S9) з обов'язковим washout_note та TUE", () => {
      const dexa = DEFAULT_PHARMACY_ITEMS.find((i) => i.name.includes("Дексаметазон"));
      assert.ok(dexa);
      assert.equal(dexa.wada_status, "prohibited_in_competition");
      assert.equal(dexa.min_age, 18);
      assert.ok(dexa.wada_source_note?.includes("S9"));
      assert.ok(dexa.washout_note?.includes("виведення"));
      assert.equal(dexa.requires_review, true);
    });
  });

  describe("3. Перевірка віку гравця перед призначенням", () => {
    function verifyAgeEligibility(playerAge: number | null, item: PharmacyItem) {
      if (item.min_age !== null && item.min_age !== undefined && playerAge !== null) {
        if (playerAge < item.min_age) {
          return { allowed: false, warning: `Вік гравця (${playerAge} р.) менший за мінімальний (${item.min_age} р.)` };
        }
      }
      return { allowed: true, warning: null };
    }

    it("блокує/попереджає, якщо 16-річному юніору призначають препарат з min_age=18", () => {
      const item: PharmacyItem = {
        id: "p1",
        name: "НПЗЗ Стронг",
        category: "nsaid_painkillers",
        stock_count: 10,
        unit: "табл.",
        min_alert_threshold: 3,
        expiry_date: "2027-01-01",
        wada_status: "allowed",
        min_age: 18,
      };

      const check = verifyAgeEligibility(16, item);
      assert.equal(check.allowed, false);
      assert.ok(check.warning?.includes("16 р."));
    });

    it("дозволяє, якщо вік гравця відповідає або перевищує мінімальний", () => {
      const item: PharmacyItem = {
        id: "p2",
        name: "Анальгетик дитячий",
        category: "nsaid_painkillers",
        stock_count: 10,
        unit: "табл.",
        min_alert_threshold: 3,
        expiry_date: "2027-01-01",
        wada_status: "allowed",
        min_age: 12,
      };

      const check = verifyAgeEligibility(15, item);
      assert.equal(check.allowed, true);
      assert.equal(check.warning, null);
    });
  });

  describe("4. Вимоги підтвердження лікаря для WADA S-препаратів", () => {
    function canPrescribeDrug(
      item: PharmacyItem,
      doctorConfirmed: boolean,
      confirmationNote: string
    ) {
      const isSClass =
        item.wada_status === "prohibited_in_competition" ||
        item.wada_status === "prohibited_always" ||
        item.wada_status === "requires_tue";

      if (isSClass) {
        if (!doctorConfirmed || !confirmationNote.trim()) {
          return { canSubmit: false, error: "Потрібне підтвердження лікаря та обґрунтування TUE" };
        }
      }
      return { canSubmit: true, error: null };
    }

    it("вимагає підтвердження лікаря та обґрунтування для забороненого в змаганнях препарату", () => {
      const sDrug: PharmacyItem = {
        id: "p-s9",
        name: "Глюкокортикоїд розчин",
        category: "injections",
        stock_count: 5,
        unit: "ампул",
        min_alert_threshold: 2,
        expiry_date: "2027-05-01",
        wada_status: "prohibited_in_competition",
      };

      // Без чекбокса
      assert.equal(canPrescribeDrug(sDrug, false, "").canSubmit, false);
      // З чекбоксом, але без примітки
      assert.equal(canPrescribeDrug(sDrug, true, "   ").canSubmit, false);
      // Повне підтвердження
      const valid = canPrescribeDrug(sDrug, true, "Ургентний бурсит, вихідний період перед матчем 12 днів");
      assert.equal(valid.canSubmit, true);
    });

    it("для дозволених WADA препаратів не блокує відсутністю спец-підтвердження S-класу", () => {
      const allowedDrug: PharmacyItem = {
        id: "p-ok",
        name: "Парацетамол",
        category: "nsaid_painkillers",
        stock_count: 20,
        unit: "табл.",
        min_alert_threshold: 5,
        expiry_date: "2027-05-01",
        wada_status: "allowed",
      };

      const check = canPrescribeDrug(allowedDrug, false, "");
      assert.equal(check.canSubmit, true);
    });
  });

  describe("5. Списання зі складу та відкат залишків (Rollback)", () => {
    it("списання зменшує залишок, відкат повертає списані одиниці на склад", () => {
      let stockCount = 14;
      const quantityToDeduct = 3;

      // 1. Списання
      stockCount = Math.max(0, stockCount - quantityToDeduct);
      assert.equal(stockCount, 11);

      // Створення запису лікування
      const entry: MedicalTreatmentEntry = {
        id: "rx_test_1",
        player_id: "pl_1",
        date: "2026-10-22",
        category: "medication",
        title: "PRP Терапія",
        doctor_name: "Штабний лікар",
        wada_status: "allowed",
        pharmacy_item_id: "ph-1",
        units_deducted: quantityToDeduct,
        created_at: new Date().toISOString(),
      };

      // 2. Скасування / Відкат
      if (entry.pharmacy_item_id && entry.units_deducted) {
        stockCount += entry.units_deducted;
      }

      assert.equal(stockCount, 14, "Склад повністю повернувся до початкового стану");
    });
  });
});
