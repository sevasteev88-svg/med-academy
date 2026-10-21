import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePlayerReadiness,
  calculatePhysicalComposite,
  calculateMean,
  calculateStdDev,
  calculateZScore,
  sanitizeReadinessForCoach,
  type PlayerReadinessResult,
} from "../src/lib/readiness.ts";
import {
  DEFAULT_READINESS_THRESHOLDS,
  DEFAULT_COACH_CATEGORY_VISIBILITY,
  DEFAULT_CLUB_READINESS_CONFIG,
  DRAFT_STATUS_LABEL,
  APPROVED_STATUS_LABEL,
  READINESS_DISCLAIMER_TEXT,
  type ReadinessThresholds,
  type ClubReadinessConfig,
} from "../src/lib/readiness-constants.ts";
import type { WellnessEntry } from "../src/types/wellness.ts";

function createMockEntry(
  date: string,
  overrides?: Partial<WellnessEntry>
): WellnessEntry {
  return {
    id: `well_${date}`,
    club_id: "club_01",
    player_id: "player_01",
    date,
    sleep_quality: 4,
    fatigue: 4,
    soreness: 4,
    stress: 4,
    sleep_hours: 8,
    pain: false,
    pain_vas: null,
    pain_locations: [],
    illness: false,
    comment: "Нормальне самопочуття",
    submitted_at: `${date}T08:00:00Z`,
    source: "player",
    ...overrides,
  };
}

/**
 * Генерує N записів за попередні дні до вказаної дати
 */
function generateHistoricalEntries(
  endDate: string,
  count: number,
  scoreGenerator?: (index: number) => Partial<WellnessEntry>
): WellnessEntry[] {
  const list: WellnessEntry[] = [];
  const base = new Date(endDate);

  for (let i = count; i >= 1; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const overrides = scoreGenerator ? scoreGenerator(i) : {};
    list.push(createMockEntry(dateStr, overrides));
  }

  return list;
}

describe("8.4 Світлофор готовності для тренера (Readiness Traffic Light)", () => {
  const TODAY = "2026-10-20";

  // 1. Пороги та константи за замовчуванням
  describe("1. Пороги за замовчуванням та статус чернетки", () => {
    it("містить коректні дефолтні значення порогових правил", () => {
      assert.equal(DEFAULT_READINESS_THRESHOLDS.baselineRequiredDays, 14);
      assert.equal(DEFAULT_READINESS_THRESHOLDS.baselineWindowDays, 28);
      assert.equal(DEFAULT_READINESS_THRESHOLDS.painVasRedThreshold, 5);
      assert.equal(DEFAULT_READINESS_THRESHOLDS.painVasYellowThreshold, 3);
      assert.equal(DEFAULT_READINESS_THRESHOLDS.zScoreRedThreshold, -1.5);
      assert.equal(DEFAULT_READINESS_THRESHOLDS.zScoreYellowThreshold, -1.0);
    });

    it("за замовчуванням конфігурація клубу має статус ЧЕРНЕТКА з поміткою про затвердження лікарем", () => {
      assert.equal(DEFAULT_CLUB_READINESS_CONFIG.status, "draft");
      assert.equal(
        DEFAULT_CLUB_READINESS_CONFIG.statusLabel,
        DRAFT_STATUS_LABEL
      );
      assert.equal(
        DEFAULT_CLUB_READINESS_CONFIG.statusLabel,
        "ЧЕРНЕТКА, потребує затвердження лікарем"
      );
      assert.equal(DEFAULT_CLUB_READINESS_CONFIG.approvedByDoctorId, null);
    });

    it("містить обов'язковий дисклеймер для тренера без автоматичних відсторонень", () => {
      assert.equal(
        READINESS_DISCLAIMER_TEXT,
        "Підказка для рішення. Рішення про навантаження приймає тренер разом з лікарем"
      );
    });
  });

  // 2. Режим 1: «Збір базових даних» (< 14 відповідей за останні 28 днів)
  describe("2. Режим «Збір базових даних» (< 14 відповідей за 28 днів)", () => {
    it("встановлює сірий статус при менше ніж 14 заповнених анкетах і не рахує норму", () => {
      // 10 попередніх днів + 1 сьогоднішній = 11 відповідей (< 14)
      const history = generateHistoricalEntries(TODAY, 10);
      const todayEntry = createMockEntry(TODAY, { sleep_quality: 4, fatigue: 4, soreness: 4 });
      const entries = [...history, todayEntry];

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: entries,
        forRole: "coach",
      });

      assert.equal(res.status, "gray");
      assert.equal(res.grayReason, "collecting_baseline");
      assert.equal(res.baselineDaysCount, 11);
      assert.equal(res.isBaselineReady, false);
      assert.equal(res.personalMean, null); // Норма не рахується!
      assert.equal(res.personalStdDev, null);
      assert.equal(res.zScore, null);
      assert.equal(res.statusLabel, "Збір даних (11/14)");
    });
  });

  // 3. Режим 2: Достатньо даних (>= 14 відповідей) та розрахунок особистої норми
  describe("3. Розрахунок особистої норми гравця за 28 днів (не команди)", () => {
    it("коректно розраховує середнє, відхилення та Z-score для 14+ днів", () => {
      // 15 днів з різними оцінками
      const history = generateHistoricalEntries(TODAY, 15, (i) => ({
        sleep_quality: (i % 2 === 0 ? 4 : 5) as any,
        fatigue: 4,
        soreness: (i % 3 === 0 ? 3 : 4) as any,
      }));
      const todayEntry = createMockEntry(TODAY, { sleep_quality: 4, fatigue: 4, soreness: 4 });
      const entries = [...history, todayEntry];

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: entries,
        forRole: "coach",
      });

      assert.equal(res.isBaselineReady, true);
      assert.equal(res.baselineDaysCount, 16);
      assert(typeof res.personalMean === "number" && res.personalMean > 0);
      assert(typeof res.personalStdDev === "number" && res.personalStdDev >= 0);
      assert(typeof res.zScore === "number");
    });

    it("показує зелений статус («Оптимально»), коли показники в межах особистої норми без болю та хвороб", () => {
      // 20 стабільних днів (композит 12: 4+4+4)
      const history = generateHistoricalEntries(TODAY, 20);
      const todayEntry = createMockEntry(TODAY, { sleep_quality: 4, fatigue: 4, soreness: 4 });
      const entries = [...history, todayEntry];

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: entries,
        forRole: "coach",
      });

      assert.equal(res.status, "green");
      assert.equal(res.statusLabel, "Оптимально");
      assert.equal(res.flagCategories.length, 0);
    });
  });

  // 4. Правила червоних та жовтих прапорців
  describe("4. Правила червоних та жовтих прапорців", () => {
    it("спрацьовує червоний статус при відмітці 'хворію' (illness = true)", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        illness: true,
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.status, "red");
      assert.equal(res.statusLabel, "Поговорити з гравцем / повідомити лікаря");
      assert(res.flagCategories.includes("нездужання"));
    });

    it("спрацьовує червоний статус при болю з ВАШ >= 5", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        pain: true,
        pain_vas: 6,
        pain_locations: ["thigh_posterior"],
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.status, "red");
      assert(res.flagCategories.includes("біль"));
    });

    it("спрацьовує жовтий статус при помірному болю (ВАШ = 3 або 4)", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        pain: true,
        pain_vas: 3,
        pain_locations: ["achilles"],
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.status, "yellow");
      assert.equal(res.statusLabel, "Потребує уваги");
      assert(res.flagCategories.includes("біль"));
    });

    it("спрацьовує червоний статус при різкому погіршенні відносно особистої норми (Z-score <= -1.5)", () => {
      // Зазвичай у гравця високий бал (сон=5, втома=5, крепатура=5, сума=15)
      const history = generateHistoricalEntries(TODAY, 20, (i) => ({
        sleep_quality: 5,
        fatigue: 5,
        soreness: i % 2 === 0 ? 5 : 4,
      }));
      // Сьогодні раптовий спад (сон=2, втома=2, крепатура=2, сума=6)
      const todayEntry = createMockEntry(TODAY, {
        sleep_quality: 2,
        fatigue: 2,
        soreness: 2,
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.status, "red");
      assert(res.zScore !== null && res.zScore <= -1.5);
      assert(res.flagCategories.includes("сон"));
      assert(res.flagCategories.includes("втома"));
      assert(res.flagCategories.includes("біль"));
    });

    it("спрацьовує червоний статус при критичній одиничній оцінці = 1 (наприклад, втома = 1)", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        sleep_quality: 4,
        fatigue: 1, // Сильне виснаження
        soreness: 4,
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.status, "red");
      assert(res.flagCategories.includes("втома"));
    });
  });

  // 5. Граничні випадки: згода, пристрій, пропуск
  describe("5. Граничні випадки (без згоди, без пристрою, пропуск)", () => {
    it("гравець без підтвердженої згоди має статус сірий ('немає даних' / 'Немає згоди'), а не зелений", () => {
      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: false, // Відсутня згода батьків
        hasActiveDevice: true,
        entriesLast28Days: [],
        forRole: "coach",
      });

      assert.equal(res.status, "gray");
      assert.equal(res.grayReason, "no_consent");
      assert.equal(res.statusLabel, "Немає згоди");
      assert.notEqual(res.status, "green");
    });

    it("гравець без активованого пристрою має статус сірий, а не зелений", () => {
      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: false, // Не активував QR-код
        entriesLast28Days: [],
        forRole: "coach",
      });

      assert.equal(res.status, "gray");
      assert.equal(res.grayReason, "no_device");
      assert.equal(res.statusLabel, "Не активовано");
      assert.notEqual(res.status, "green");
    });

    it("гравець, який не заповнив анкету сьогодні, має сірий статус 'Не заповнив'", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      // Сьогоднішнього запису немає в масиві!

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: history,
        forRole: "coach",
      });

      assert.equal(res.status, "gray");
      assert.equal(res.grayReason, "no_entry_today");
      assert.equal(res.statusLabel, "Не заповнив");
    });
  });

  // 6. Захист чутливих даних (Маскування для тренера)
  describe("6. Захист чутливих даних та ролі (Coach vs Doctor)", () => {
    it("тренер НЕ отримує стрес, коментарі, локалізацію та ВАШ болю", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        pain: true,
        pain_vas: 7,
        pain_locations: ["knee_left", "groin"],
        stress: 1, // Сильний стрес
        comment: "Конфлікт у школі та сімейні негаразди",
        fatigue: 2,
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach", // Роль тренера
      });

      // Для тренера doctorDetails повинен бути null
      assert.equal(res.doctorDetails, null);

      // Видимі лише узагальнені категорії
      assert(res.flagCategories.includes("біль"));
      assert(res.flagCategories.includes("втома"));
      // Стрес не є категорією фізичного прапорця
      assert.equal(res.flagCategories.includes("stress" as any), false);
    });

    it("лікар отримує повну клінічну деталізацію (doctorDetails)", () => {
      const history = generateHistoricalEntries(TODAY, 16);
      const todayEntry = createMockEntry(TODAY, {
        pain: true,
        pain_vas: 7,
        pain_locations: ["knee_left"],
        stress: 2,
        comment: "Турбує коліно при присіданнях",
      });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "doctor", // Роль лікаря
      });

      assert.notEqual(res.doctorDetails, null);
      assert.equal(res.doctorDetails?.painVas, 7);
      assert.deepEqual(res.doctorDetails?.painLocations, ["knee_left"]);
      assert.equal(res.doctorDetails?.stress, 2);
      assert.equal(res.doctorDetails?.comment, "Турбує коліно при присіданнях");
    });

    it("sanitizeReadinessForCoach надійно обнуляє doctorDetails перед передачею клієнту", () => {
      const rawResult: PlayerReadinessResult = {
        playerId: "p1",
        date: TODAY,
        status: "red",
        statusLabel: "Поговорити з гравцем",
        actionPrompt: "Консультація",
        disclaimer: READINESS_DISCLAIMER_TEXT,
        baselineDaysCount: 15,
        isBaselineReady: true,
        personalMean: 12,
        personalStdDev: 1,
        todayComposite: 8,
        zScore: -2,
        flagCategories: ["біль"],
        trendLast7Days: [],
        doctorDetails: {
          pain: true,
          painVas: 8,
          painLocations: ["ankle"],
          illness: false,
          stress: 1,
          comment: "Секретний коментар",
          sleepHours: 5,
          sleepQuality: 2,
          fatigue: 2,
          soreness: 2,
        },
      };

      const sanitized = sanitizeReadinessForCoach(rawResult);
      assert.equal(sanitized.doctorDetails, null);
    });
  });

  // 7. 7-денний тренд (міні-графік)
  describe("7. 7-денний тренд для міні-графіка", () => {
    it("формує масив із рівно 7 точок з датами, значеннями та кольоровими статусами", () => {
      const history = generateHistoricalEntries(TODAY, 20);
      const todayEntry = createMockEntry(TODAY, { sleep_quality: 4, fatigue: 4, soreness: 4 });

      const res = evaluatePlayerReadiness({
        todayDate: TODAY,
        hasConsent: true,
        hasActiveDevice: true,
        entriesLast28Days: [...history, todayEntry],
        forRole: "coach",
      });

      assert.equal(res.trendLast7Days.length, 7);
      // Остання точка відповідає сьогоднішньому дню
      assert.equal(res.trendLast7Days[6].date, TODAY);
      assert.equal(res.trendLast7Days[6].status, "green");
      assert(typeof res.trendLast7Days[6].compositeScore === "number");
    });
  });
});
