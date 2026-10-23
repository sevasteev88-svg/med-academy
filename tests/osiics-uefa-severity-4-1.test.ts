import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTimeLossDays,
  calculateUefaSeverity,
  getInjuryUefaSeverityInfo,
  UEFA_SEVERITY_THRESHOLDS,
  UEFA_SEVERITY_UA,
  ONSET_UA,
  OCCURRENCE_UA,
} from "../src/lib/uefa-severity.ts";
import fs from "node:fs";
import path from "node:path";

describe("Етап 4.1 — Стандарти обліку травм (OSIICS / UEFA) — Поля та тяжкість", () => {
  const refDate = new Date("2026-10-22T12:00:00Z");

  // ─── 1. Розрахунок time_loss_days ──────────────────────────────────────────
  describe("1. Розрахунок time_loss_days (дні втрати працездатності)", () => {
    it("для закритих травм: різниця між actual_return_date та date_of_injury", () => {
      const days = calculateTimeLossDays("2026-10-01", "2026-10-15", refDate);
      assert.equal(days, 14);
    });

    it("для закритих травм: повернення в той самий день дає 0 днів", () => {
      const days = calculateTimeLossDays("2026-10-10", "2026-10-10", refDate);
      assert.equal(days, 0);
    });

    it("для відкритих травм (без actual_return_date): рахує дні до поточної дати (сьогодні)", () => {
      // Травма від 2026-10-12, референсна дата 2026-10-22 -> 10 днів
      const days = calculateTimeLossDays("2026-10-12", null, refDate);
      assert.equal(days, 10);
    });

    it("захист від від'ємних значень (якщо помилкова дата)", () => {
      const days = calculateTimeLossDays("2026-10-25", "2026-10-20", refDate);
      assert.equal(days, 0);
    });
  });

  // ─── 2. Пороги тяжкості UEFA ─────────────────────────────────────────────
  describe("2. Пороги тяжкості UEFA (Fuller et al., 2006)", () => {
    it("1–3 дні: мінімальна тяжкість (minimal)", () => {
      assert.equal(calculateUefaSeverity(1), "minimal");
      assert.equal(calculateUefaSeverity(2), "minimal");
      assert.equal(calculateUefaSeverity(3), "minimal");
    });

    it("4–7 днів: легка тяжкість (mild)", () => {
      assert.equal(calculateUefaSeverity(4), "mild");
      assert.equal(calculateUefaSeverity(6), "mild");
      assert.equal(calculateUefaSeverity(7), "mild");
    });

    it("8–28 днів: середня тяжкість (moderate)", () => {
      assert.equal(calculateUefaSeverity(8), "moderate");
      assert.equal(calculateUefaSeverity(14), "moderate");
      assert.equal(calculateUefaSeverity(21), "moderate");
      assert.equal(calculateUefaSeverity(28), "moderate");
    });

    it(">28 днів (29+): тяжка (severe)", () => {
      assert.equal(calculateUefaSeverity(29), "severe");
      assert.equal(calculateUefaSeverity(45), "severe");
      assert.equal(calculateUefaSeverity(180), "severe");
    });
  });

  // ─── 3. Логіка getInjuryUefaSeverityInfo: попередня vs фактична ────────────
  describe("3. Попередня оцінка для відкритих травм та фактична для закритих", () => {
    it("для закритої травми повертає isProvisional = false та точний розрахунок за фактом", () => {
      const info = getInjuryUefaSeverityInfo({
        dateOfInjury: "2026-09-01",
        actualReturnDate: "2026-09-22", // 21 день
        status: "closed",
        referenceDate: refDate,
      });

      assert.equal(info.isProvisional, false);
      assert.equal(info.timeLossDays, 21);
      assert.equal(info.displaySeverity, "moderate");
      assert.match(info.label, /Середня/);
      assert.match(info.badgeText, /Тяжкість \(UEFA\): Середня/);
    });

    it("для відкритої травми з expected_return_date повертає isProvisional = true та попередню оцінку", () => {
      // Травма сьогодні, повернення через 5 днів -> очікувано легка (4-7 дн)
      const info = getInjuryUefaSeverityInfo({
        dateOfInjury: "2026-10-22",
        expectedReturnDate: "2026-10-27", // 5 днів
        status: "active",
        referenceDate: refDate,
      });

      assert.equal(info.isProvisional, true);
      assert.equal(info.expectedDays, 5);
      assert.equal(info.displaySeverity, "mild");
      assert.match(info.badgeText, /Попередня \(UEFA\): Легка/);
    });

    it("якщо відкрита травма прострочила очікувану дату, тяжкість адаптується під фактичні дні відсутності", () => {
      // Травма була 20 днів тому (2026-10-02), очікували 3 дні (2026-10-05)
      const info = getInjuryUefaSeverityInfo({
        dateOfInjury: "2026-10-02",
        expectedReturnDate: "2026-10-05", // очікували 3 дні -> minimal
        status: "active",
        referenceDate: refDate, // пройшло 20 днів -> moderate
      });

      assert.equal(info.isProvisional, true);
      assert.equal(info.timeLossDays, 20);
      assert.equal(info.expectedDays, 3);
      // Має підвищитися до поточної помірної тяжкості
      assert.equal(info.displaySeverity, "moderate");
      assert.match(info.badgeText, /Попередня \(UEFA\): Середня/);
    });

    it("для відкритої травми без expected_return_date розраховує попередню тяжкість за днями до сьогодні", () => {
      // Травма була 30 днів тому (2026-09-22) без вказаного повернення
      const info = getInjuryUefaSeverityInfo({
        dateOfInjury: "2026-09-22",
        status: "active",
        referenceDate: refDate, // 30 днів
      });

      assert.equal(info.isProvisional, true);
      assert.equal(info.timeLossDays, 30);
      assert.equal(info.displaySeverity, "severe");
      assert.match(info.badgeText, /Попередня \(UEFA\): Тяжка/);
    });
  });

  // ─── 4. Словники та переклади (українська мова, безпечні дефолти) ────────────
  describe("4. Стандартизація довідників: Onset, Occurrence, UEFA Severity", () => {
    it("ONSET_UA містить acute, gradual та безпечне unknown", () => {
      assert.equal(ONSET_UA.acute, "Гострий початок (Acute)");
      assert.equal(ONSET_UA.gradual, "Поступовий розвиток (Overuse/Gradual)");
      assert.equal(ONSET_UA.unknown, "Невідомо");
    });

    it("OCCURRENCE_UA містить new, recurrence, exacerbation та безпечне unknown", () => {
      assert.equal(OCCURRENCE_UA.new, "Нова травма (New injury)");
      assert.equal(OCCURRENCE_UA.recurrence, "Рецидив (Recurrence)");
      assert.equal(OCCURRENCE_UA.exacerbation, "Загострення (Exacerbation)");
      assert.equal(OCCURRENCE_UA.unknown, "Невідомо");
    });

    it("UEFA_SEVERITY_UA містить правильні числові діапазони", () => {
      assert.equal(UEFA_SEVERITY_UA.minimal, "Мінімальна (1–3 дні)");
      assert.equal(UEFA_SEVERITY_UA.mild, "Легка (4–7 днів)");
      assert.equal(UEFA_SEVERITY_UA.moderate, "Середня (8–28 днів)");
      assert.equal(UEFA_SEVERITY_UA.severe, "Тяжка (>28 днів)");
    });
  });

  // ─── 5. Перевірка SQL-міграції (таблиця osiics_codes та нові колонки) ───────
  describe("5. Перевірка SQL-міграції 20261022170000_osiics_and_uefa_severity.sql", () => {
    it("файл міграції існує і містить усі обов'язкові інструкції", () => {
      const migrationPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261022170000_osiics_and_uefa_severity.sql"
      );
      assert.ok(fs.existsSync(migrationPath), "Файл міграції має існувати");

      const sql = fs.readFileSync(migrationPath, "utf-8");

      // Створення таблиці osiics_codes
      assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.osiics_codes"), "Має створювати таблицю osiics_codes");
      assert.ok(sql.includes("code text NOT NULL"), "Таблиця osiics_codes має містити колонку code");
      assert.ok(sql.includes("title text NOT NULL"), "Таблиця osiics_codes має містити колонку title");

      // Додавання колонок у таблицю injuries
      assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS osiics_code text"), "Має додавати osiics_code");
      assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS onset text"), "Має додавати onset");
      assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS occurrence text"), "Має додавати occurrence");
      assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS previous_injury_id uuid"), "Має додавати previous_injury_id");
      assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS time_loss_days integer"), "Має додавати time_loss_days");

      // Безпечна міграція існуючих даних
      assert.ok(sql.includes("SET onset = 'unknown'"), "Має встановлювати onset = 'unknown' для старих даних");
      assert.ok(sql.includes("SET occurrence = 'unknown'"), "Має встановлювати occurrence = 'unknown' для старих даних");
      assert.ok(sql.includes("SET time_loss_days = GREATEST(0"), "Має рахувати time_loss_days для закритих травм");
    });
  });
});
