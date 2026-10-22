import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlayerAvailability,
  AVAILABILITY_RULES,
  AVAILABILITY_STATUS,
  type RawPlayerInput,
  type PlayerAvailabilityItem,
} from "../src/lib/availability-rules.ts";
import type { PreSeasonScreening } from "../src/types/screening.ts";

describe("Етап 2.2 — Єдине джерело доступності (availability.ts)", () => {
  const targetDate = new Date("2026-10-22T12:00:00Z");

  const validScreening: PreSeasonScreening = {
    id: "sc-1",
    player_id: "p-1",
    season: "2026/2027",
    date: "2026-07-15",
    examiner_doctor: "Д-р Мельник",
    cardio_ecg_rest: "normal",
    cardio_echo: "normal",
    cardio_bp_systolic: 120,
    cardio_bp_diastolic: 80,
    cardio_hr_rest: 58,
    cardio_clearance: true,
    ortho_thomas_test_left: "normal",
    ortho_thomas_test_right: "normal",
    ortho_hamstrings_90_90_left: 10,
    ortho_hamstrings_90_90_right: 10,
    ortho_ankle_lunge_wblt_left: 12,
    ortho_ankle_lunge_wblt_right: 12,
    ortho_beighton_hypermobility_score: 1,
    ortho_previous_surgeries: null,
    lab_hemoglobin: 150,
    lab_ferritin: 80,
    lab_vitamin_d: 45,
    overall_status: "cleared",
    restrictions_notes: "Допущений без обмежень",
    valid_until: "2027-06-30",
    created_at: "2026-07-15T10:00:00Z",
  };

  const expiredScreening: PreSeasonScreening = {
    ...validScreening,
    valid_until: "2026-09-01", // у минулому
  };

  const disqualifiedScreening: PreSeasonScreening = {
    ...validScreening,
    overall_status: "disqualified",
    restrictions_notes: "Кардіологічна патологія: відсторонений",
    valid_until: "2027-06-30",
  };

  const provisionalScreening: PreSeasonScreening = {
    ...validScreening,
    overall_status: "provisional",
    restrictions_notes: "Умовний допуск: контроль АТ щотижня",
    valid_until: "2027-06-30",
  };

  // ─── Правило 1: Гостра фаза травми → «недоступний» ────────────────────────
  describe("Правило 1: Гостра фаза травми (active)", () => {
    it("гостра травма призначає статус 'unavailable' та 0 хвилин", () => {
      const player: RawPlayerInput = {
        id: "p-acute",
        first_name: "Іван",
        last_name: "Петренко",
        position: "ПЗ",
        injuries: [
          {
            id: "inj-1",
            status: "active",
            injury_type: "muscle",
            location: "hamstring",
            vas_score: 7,
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "unavailable");
      assert.equal(result.legacyStatus, "danger");
      assert.equal(result.max_minutes, 0);
      assert.match(result.restriction_notes, /Гостра фаза травми/);
    });
  });

  // ─── Правило 2: RTP фази 1–3 → «недоступний / індивідуально» ───────────────
  describe("Правило 2: RTP фази 1–3 (індивідуальна реабілітація)", () => {
    it("RTP Фаза 1 (клінічна/зал) → 'unavailable' та 0 хв", () => {
      const player: RawPlayerInput = {
        id: "p-rtp1",
        first_name: "Олег",
        last_name: "Сидоренко",
        position: "ЗХ",
        injuries: [
          {
            id: "inj-rtp-1",
            status: "rehabilitation",
            injury_type: "ligament",
            location: "knee",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-1": { phase: 1 },
        },
      });

      assert.equal(result.status, "unavailable");
      assert.equal(result.legacyStatus, "danger");
      assert.equal(result.max_minutes, 0);
      assert.match(result.restriction_notes, /RTP Фаза 1/);
    });

    it("RTP Фаза 2 (лінійний біг) → 'unavailable' та 0 хв", () => {
      const player: RawPlayerInput = {
        id: "p-rtp2",
        first_name: "Максим",
        last_name: "Коваль",
        position: "НП",
        injuries: [
          {
            id: "inj-rtp-2",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-2": { phase: 2 },
        },
      });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.match(result.restriction_notes, /RTP Фаза 2/);
    });

    it("RTP Фаза 3 (індивідуальна робота з м'ячем) → 'unavailable' та 0 хв", () => {
      const player: RawPlayerInput = {
        id: "p-rtp3",
        first_name: "Данило",
        last_name: "Шевченко",
        position: "ПЗ",
        injuries: [
          {
            id: "inj-rtp-3",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-3": { phase: 3 },
        },
      });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.match(result.restriction_notes, /RTP Фаза 3/);
    });

    it("травма на реабілітації без RTP-логу за замовчуванням має Фазу 1 ('unavailable')", () => {
      const player: RawPlayerInput = {
        id: "p-rehab-nolog",
        first_name: "Богдан",
        last_name: "Ткачук",
        position: "ВР",
        injuries: [
          {
            id: "inj-nolog",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
    });
  });

  // ─── Правило 3: Фаза 4 → «обмежений» з лімітом хвилин ──────────────────────
  describe("Правило 3: Фаза 4 (Група з обмеженнями / жовтий жилет)", () => {
    it("RTP Фаза 4 призначає статус 'restricted' з лімітом хвилин (за замовчуванням 45 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-rtp4",
        first_name: "Андрій",
        last_name: "Ярмоленко",
        position: "НП",
        injuries: [
          {
            id: "inj-rtp-4",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-4": { phase: 4 },
        },
      });

      assert.equal(result.status, "restricted");
      assert.equal(result.legacyStatus, "warn");
      assert.equal(result.max_minutes, 45);
      assert.match(result.restriction_notes, /RTP Фаза 4/);
    });

    it("RTP Фаза 4 враховує персональний ліміт хвилин із запису лікаря (наприклад 30 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-rtp4-custom",
        first_name: "Віктор",
        last_name: "Циганков",
        position: "ПЗ",
        injuries: [
          {
            id: "inj-rtp-4-custom",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-4-custom": { phase: 4, max_minutes: 30 },
        },
      });

      assert.equal(result.status, "restricted");
      assert.equal(result.max_minutes, 30);
    });
  });

  // ─── Правило 4: Фаза 5 / без травм та діючий скринінг ──────────────────────
  describe("Правило 4: Фаза 5 та діючий скринінг", () => {
    it("RTP Фаза 5 без інших відкритих травм + діючий скринінг → 'available' (90 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-rtp5",
        first_name: "Михайло",
        last_name: "Мудрик",
        position: "НП",
        injuries: [
          {
            id: "inj-rtp-5",
            status: "rehabilitation",
          },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-rtp-5": { phase: 5 },
        },
      });

      assert.equal(result.status, "available");
      assert.equal(result.legacyStatus, "ok");
      assert.equal(result.max_minutes, 90);
      assert.equal(result.hasValidScreening, true);
    });

    it("гравець без травм + діючий скринінг → 'available' (90 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-healthy",
        first_name: "Ілля",
        last_name: "Забарний",
        position: "ЗХ",
        injuries: [],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "available");
      assert.equal(result.max_minutes, 90);
    });

    it("RTP Фаза 5 або здоровий гравець БЕЗ діючого скринінгу (прострочений) → 'unavailable'", () => {
      const player: RawPlayerInput = {
        id: "p-expired",
        first_name: "Георгій",
        last_name: "Судаков",
        position: "ПЗ",
        injuries: [],
        screening: expiredScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.equal(result.hasValidScreening, false);
      assert.match(result.restriction_notes, /Відсутній або прострочений/);
    });

    it("гравець без скринінгу взагалі (null) → 'unavailable'", () => {
      const player: RawPlayerInput = {
        id: "p-noscreening",
        first_name: "Анатолій",
        last_name: "Трубін",
        position: "ВР",
        injuries: [],
        screening: null,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.equal(result.hasValidScreening, false);
    });

    it("гравець з дискваліфікацією за скринінгом → 'unavailable' (0 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-disq",
        first_name: "Тарас",
        last_name: "Степаненко",
        position: "ПЗ",
        injuries: [],
        screening: disqualifiedScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.match(result.restriction_notes, /Медичне відсторонення/);
    });

    it("гравець з умовним допуском (provisional) → 'restricted' (45 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-prov",
        first_name: "Олександр",
        last_name: "Зінченко",
        position: "ЗХ",
        injuries: [],
        screening: provisionalScreening,
      };

      const result = calculatePlayerAvailability(player, { date: targetDate });

      assert.equal(result.status, "restricted");
      assert.equal(result.max_minutes, 45);
      assert.match(result.restriction_notes, /Умовний допуск/);
    });
  });

  // ─── Правило 5: Кілька травм у гравця → по найгіршому статусу ──────────────
  describe("Правило 5: Кілька травм у гравця (worst status)", () => {
    it("гостра травма (active) + травма на Фазі 4 → 'unavailable' (0 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-multi-1",
        first_name: "Денис",
        last_name: "Попов",
        position: "ЗХ",
        injuries: [
          { id: "inj-a", status: "active", location: "ankle" },
          { id: "inj-b", status: "rehabilitation", location: "knee" },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-b": { phase: 4 },
        },
      });

      // Худший статус серед unavailable (гостра) та restricted (фаза 4) = unavailable
      assert.equal(result.status, "unavailable");
      assert.equal(result.max_minutes, 0);
      assert.equal(result.openInjuriesCount, 2);
    });

    it("травма на Фазі 4 + травма на Фазі 5 → 'restricted' (45 хв)", () => {
      const player: RawPlayerInput = {
        id: "p-multi-2",
        first_name: "Микола",
        last_name: "Шапаренко",
        position: "ПЗ",
        injuries: [
          { id: "inj-c", status: "rehabilitation", location: "knee" },
          { id: "inj-d", status: "rehabilitation", location: "groin" },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-c": { phase: 4, max_minutes: 40 },
          "inj-d": { phase: 5 },
        },
      });

      // Худший статус серед restricted (фаза 4) та available (фаза 5) = restricted
      assert.equal(result.status, "restricted");
      assert.equal(result.max_minutes, 40);
    });

    it("закрита травма (closed) не впливає на активний розрахунок", () => {
      const player: RawPlayerInput = {
        id: "p-multi-3",
        first_name: "Сергій",
        last_name: "Сидорчук",
        position: "ПЗ",
        injuries: [
          { id: "inj-old", status: "closed", location: "thigh" },
          { id: "inj-new", status: "rehabilitation", location: "calf" },
        ],
        screening: validScreening,
      };

      const result = calculatePlayerAvailability(player, {
        date: targetDate,
        rtpLogsByInjury: {
          "inj-new": { phase: 4 },
        },
      });

      assert.equal(result.status, "restricted");
      assert.equal(result.openInjuriesCount, 1);
    });
  });

  // ─── Тест «Всі екрани дають однакові числа» ────────────────────────────────
  describe("Інваріант: всі екрани дають однакові числа (консистентність)", () => {
    it("агрегати дашборду, доступності, брифінгу та звіту ідентичні до одиниці", () => {
      // Створюємо репрезентативний загін гравців
      const mockSquad: RawPlayerInput[] = [
        // 5 готових (здорових зі скринінгом)
        { id: "p1", first_name: "П1", last_name: "Л1", position: "ВР", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [] },
        { id: "p2", first_name: "П2", last_name: "Л2", position: "ЗХ", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [] },
        { id: "p3", first_name: "П3", last_name: "Л3", position: "ПЗ", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [] },
        { id: "p4", first_name: "П4", last_name: "Л4", position: "НП", teams: { id: "t2", name: "U17" }, screening: validScreening, injuries: [] },
        { id: "p5", first_name: "П5", last_name: "Л5", position: "НП", teams: { id: "t2", name: "U17" }, screening: validScreening, injuries: [] },

        // 1 гравець на Фазі 5 зі скринінгом → готовий
        { id: "p6", first_name: "П6", last_name: "Л6", position: "ЗХ", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [{ id: "i6", status: "rehabilitation" }] },

        // 2 обмежених (Фаза 4)
        { id: "p7", first_name: "П7", last_name: "Л7", position: "ПЗ", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [{ id: "i7", status: "rehabilitation" }] },
        { id: "p8", first_name: "П8", last_name: "Л8", position: "ЗХ", teams: { id: "t2", name: "U17" }, screening: validScreening, injuries: [{ id: "i8", status: "rehabilitation" }] },

        // 2 гострі травми (active) → лазарет
        { id: "p9", first_name: "П9", last_name: "Л9", position: "НП", teams: { id: "t1", name: "U19" }, screening: validScreening, injuries: [{ id: "i9", status: "active" }] },
        { id: "p10", first_name: "П10", last_name: "Л10", position: "ВР", teams: { id: "t2", name: "U17" }, screening: validScreening, injuries: [{ id: "i10", status: "active" }] },

        // 1 гравець на Фазі 2 (RTP) → лазарет/індивідуально
        { id: "p11", first_name: "П11", last_name: "Л11", position: "ПЗ", teams: { id: "t2", name: "U17" }, screening: validScreening, injuries: [{ id: "i11", status: "rehabilitation" }] },

        // 1 гравець без травм, але скринінг прострочений → лазарет/недопущений
        { id: "p12", first_name: "П12", last_name: "Л12", position: "ЗХ", teams: { id: "t2", name: "U17" }, screening: expiredScreening, injuries: [] },

        // 1 гравець з мульти-травмою (одна активна, одна Фаза 4) → лазарет (по найгіршому)
        {
          id: "p13",
          first_name: "П13",
          last_name: "Л13",
          position: "НП",
          teams: { id: "t1", name: "U19" },
          screening: validScreening,
          injuries: [
            { id: "i13a", status: "active" },
            { id: "i13b", status: "rehabilitation" },
          ],
        },
      ];

      const rtpLogs = {
        i6: { phase: 5 },
        i7: { phase: 4 },
        i8: { phase: 4 },
        i11: { phase: 2 },
        i13b: { phase: 4 },
      };

      // Розрахунок через єдину функцію
      const evaluatedPlayers: PlayerAvailabilityItem[] = mockSquad.map((p) =>
        calculatePlayerAvailability(p, { date: targetDate, rtpLogsByInjury: rtpLogs })
      );

      // Агрегація
      const total = evaluatedPlayers.length;
      const readyCount = evaluatedPlayers.filter((p) => p.status === "available").length;
      const restrictedCount = evaluatedPlayers.filter((p) => p.status === "restricted").length;
      const unavailableCount = evaluatedPlayers.filter((p) => p.status === "unavailable").length;

      // 1. Математична цілісність
      assert.equal(total, 13);
      assert.equal(readyCount, 6, "Повинно бути рівно 6 готових (5 чистих + 1 на фазі 5)");
      assert.equal(restrictedCount, 2, "Повинно бути рівно 2 обмежених (2 на фазі 4)");
      assert.equal(unavailableCount, 5, "Повинно бути рівно 5 недоступних (2 активні + 1 фаза 2 + 1 без скринінгу + 1 мульти-травма)");
      assert.equal(total, readyCount + restrictedCount + unavailableCount);

      // 2. Імітація екрана Дашборд
      const dashboardStats = {
        readyCard: readyCount,
        restrictedCard: restrictedCount,
        unavailableCard: unavailableCount,
      };

      // 3. Імітація екрана Доступність (AvailabilityClient)
      const availabilityClientStats = {
        totalOk: evaluatedPlayers.filter((p) => p.legacyStatus === "ok").length,
        totalWarn: evaluatedPlayers.filter((p) => p.legacyStatus === "warn").length,
        totalDanger: evaluatedPlayers.filter((p) => p.legacyStatus === "danger").length,
      };

      // 4. Імітація екрана Брифінг тренера (CoachBriefing)
      const coachBriefingStats = {
        available: evaluatedPlayers.filter((p) => p.status === "available").length,
        restricted: evaluatedPlayers.filter((p) => p.status === "restricted").length,
        unavailable: evaluatedPlayers.filter((p) => p.status === "unavailable").length,
      };

      // 5. Імітація екрана Тижневий звіт (WeeklyReport)
      const weeklyReportStats = {
        totalPlayers: total,
        availablePlayers: readyCount,
        unavailablePlayers: unavailableCount + restrictedCount,
      };

      // 6. Імітація екрана Передматчевий протокол (MatchdayProtocol)
      const matchdayProtocolStats = {
        totalInSquad: evaluatedPlayers.length,
        clearedWithoutRestrictions: evaluatedPlayers.filter((p) => p.status === "available").length,
        restrictedMinutes: evaluatedPlayers.filter((p) => p.status === "restricted").length,
        unfitToPlay: evaluatedPlayers.filter((p) => p.status === "unavailable").length,
      };

      // Перевірка абсолютного збігу між УСІМА екранами
      assert.equal(dashboardStats.readyCard, availabilityClientStats.totalOk);
      assert.equal(dashboardStats.readyCard, coachBriefingStats.available);
      assert.equal(dashboardStats.readyCard, weeklyReportStats.availablePlayers);
      assert.equal(dashboardStats.readyCard, matchdayProtocolStats.clearedWithoutRestrictions);

      assert.equal(dashboardStats.restrictedCard, availabilityClientStats.totalWarn);
      assert.equal(dashboardStats.restrictedCard, coachBriefingStats.restricted);
      assert.equal(dashboardStats.restrictedCard, matchdayProtocolStats.restrictedMinutes);

      assert.equal(dashboardStats.unavailableCard, availabilityClientStats.totalDanger);
      assert.equal(dashboardStats.unavailableCard, coachBriefingStats.unavailable);
      assert.equal(dashboardStats.unavailableCard, matchdayProtocolStats.unfitToPlay);

      // Перевірка дедуплікації: кожен гравець присутній рівно 1 раз
      const uniqueIds = new Set(evaluatedPlayers.map((p) => p.id));
      assert.equal(uniqueIds.size, evaluatedPlayers.length, "Жоден гравець не продубльований");
    });
  });
});
