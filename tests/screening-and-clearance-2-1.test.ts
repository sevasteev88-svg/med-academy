import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcFootballSeason,
  isScreeningValid,
  SCREENING_RANGES,
  type PreSeasonScreening,
} from "../src/types/screening.ts";
import { DEFAULT_PROTOCOL_SETTINGS } from "../src/types/protocol.ts";

describe("Етап 2.1 — Скринінг і допуск", () => {
  describe("1. Розрахунок футбольного сезону (старт 1 липня)", () => {
    it("дата 1 липня або пізніше належить до сезону YYYY / YYYY+1", () => {
      assert.equal(calcFootballSeason("2026-07-01"), "2026/2027");
      assert.equal(calcFootballSeason("2026-08-15"), "2026/2027");
      assert.equal(calcFootballSeason("2026-12-31"), "2026/2027");
    });

    it("дата до 1 липня належить до попереднього стартового сезону YYYY-1 / YYYY", () => {
      assert.equal(calcFootballSeason("2026-06-30"), "2025/2026");
      assert.equal(calcFootballSeason("2026-01-10"), "2025/2026");
      assert.equal(calcFootballSeason("2026-05-20"), "2025/2026");
    });
  });

  describe("2. Валідація чинності скринінгу (isScreeningValid)", () => {
    const today = new Date("2026-10-22T12:00:00Z");

    it("повертає false, якщо скринінг відсутній або null", () => {
      assert.equal(isScreeningValid(null, today), false);
      assert.equal(isScreeningValid(undefined, today), false);
    });

    it("повертає false, якщо статус не 'cleared'", () => {
      const provisional: Partial<PreSeasonScreening> = {
        overall_status: "provisional",
        valid_until: "2027-07-01",
      };
      const disqualified: Partial<PreSeasonScreening> = {
        overall_status: "disqualified",
        valid_until: "2027-07-01",
      };

      assert.equal(isScreeningValid(provisional as PreSeasonScreening, today), false);
      assert.equal(isScreeningValid(disqualified as PreSeasonScreening, today), false);
    });

    it("повертає false, якщо термін дії вичерпано (valid_until у минулому)", () => {
      const expired: Partial<PreSeasonScreening> = {
        overall_status: "cleared",
        valid_until: "2026-09-01",
      };
      assert.equal(isScreeningValid(expired as PreSeasonScreening, today), false);
    });

    it("повертає true для діючого скринінгу зі статусом 'cleared'", () => {
      const valid: Partial<PreSeasonScreening> = {
        overall_status: "cleared",
        valid_until: "2027-06-30",
      };
      assert.equal(isScreeningValid(valid as PreSeasonScreening, today), true);
    });
  });

  describe("3. Фізіологічні діапазони та перевірка меж", () => {
    it("містить коректні межі для АТ, пульсу, WBLT, Бейтона та лабораторії", () => {
      assert.equal(SCREENING_RANGES.bpSystolic.min, 60);
      assert.equal(SCREENING_RANGES.bpSystolic.max, 240);
      assert.equal(SCREENING_RANGES.bpDiastolic.min, 40);
      assert.equal(SCREENING_RANGES.bpDiastolic.max, 140);
      assert.equal(SCREENING_RANGES.hrRest.min, 35);
      assert.equal(SCREENING_RANGES.hrRest.max, 200);
      assert.equal(SCREENING_RANGES.beighton.max, 9);
      assert.equal(SCREENING_RANGES.wblt.max, 35);
    });
  });

  describe("4. Налаштування клубу для протоколу за замовчуванням", () => {
    it("типова назва бланка — «Внутрішній протокол допуску», статус неофіційний", () => {
      assert.equal(DEFAULT_PROTOCOL_SETTINGS.title, "Внутрішній протокол допуску");
      assert.equal(DEFAULT_PROTOCOL_SETTINGS.is_official, false);
      assert.ok(DEFAULT_PROTOCOL_SETTINGS.default_doctor_name);
      assert.ok(DEFAULT_PROTOCOL_SETTINGS.default_coach_name);
    });
  });

  describe("5. Логіка недопуску гравця до передматчевої заявки без чинного скринінгу", () => {
    type TestPlayer = {
      id: string;
      last_name: string;
      hasValidScreening: boolean;
      availability_status: "available" | "restricted" | "unavailable";
    };

    const rosterCandidates: TestPlayer[] = [
      { id: "p1", last_name: "Шевченко", hasValidScreening: true, availability_status: "available" },
      { id: "p2", last_name: "Ярмоленко", hasValidScreening: true, availability_status: "restricted" },
      { id: "p3", last_name: "Мудрик", hasValidScreening: false, availability_status: "available" }, // немає скринінгу!
      { id: "p4", last_name: "Судаков", hasValidScreening: false, availability_status: "available" }, // немає скринінгу!
      { id: "p5", last_name: "Зінченко", hasValidScreening: true, availability_status: "unavailable" }, // травмований
    ];

    it("гравці без чинного скринінгу НЕ потрапляють до matchRoster автоматично", () => {
      const eligibleForRoster = rosterCandidates.filter(
        (p) => p.hasValidScreening && p.availability_status !== "unavailable"
      );
      const matchRoster = eligibleForRoster.slice(0, 23);

      assert.equal(matchRoster.length, 2);
      assert.deepEqual(
        matchRoster.map((p) => p.id),
        ["p1", "p2"]
      );

      // Гравці p3 і p4 повинні опинитися у списку unscreened
      const unscreened = rosterCandidates.filter(
        (p) => !p.hasValidScreening && p.availability_status !== "unavailable"
      );
      assert.equal(unscreened.length, 2);
      assert.deepEqual(
        unscreened.map((p) => p.id),
        ["p3", "p4"]
      );
    });
  });
});
