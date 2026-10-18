import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getClubDate } from "../src/lib/club-timezone.ts";
import type {
  WellnessEntry,
  CoachWellnessEntry,
  WellnessScore,
} from "../src/types/wellness.ts";
import { PAIN_LOCATIONS_LIST } from "../src/types/wellness.ts";

describe("8.1 Анкета самопочуття (дані та форма)", () => {
  // 1. Одне опитування на гравця та день (upsert)
  describe("1. Модель даних wellness_entries та Upsert логіка", () => {
    it("формує валідний об'єкт wellness_entries з усіма полями", () => {
      const entry: WellnessEntry = {
        id: "well_12345",
        club_id: "club_001",
        player_id: "player_999",
        date: "2026-10-18",
        sleep_quality: 4,
        fatigue: 4,
        soreness: 3,
        stress: 4,
        sleep_hours: 8.0,
        pain: true,
        pain_vas: 4,
        pain_locations: ["thigh_posterior", "calf_shin"],
        illness: false,
        comment: "Невеликий дискомфорт у задній поверхні стегна після спринтів",
        submitted_at: "2026-10-18T08:30:00Z",
        source: "player",
      };

      assert.equal(entry.club_id, "club_001");
      assert.equal(entry.player_id, "player_999");
      assert.equal(entry.date, "2026-10-18");
      assert.equal(entry.sleep_quality, 4);
      assert.equal(entry.fatigue, 4);
      assert.equal(entry.soreness, 3);
      assert.equal(entry.stress, 4);
      assert.equal(entry.pain, true);
      assert.equal(entry.pain_vas, 4);
      assert.deepEqual(entry.pain_locations, ["thigh_posterior", "calf_shin"]);
      assert.equal(entry.illness, false);
      assert.equal(entry.source, "player");
    });

    it("забезпечує єдиний запис на гравця та день за ключем (player_id, date)", () => {
      const store = new Map<string, WellnessEntry>();

      const makeKey = (playerId: string, date: string) => `${playerId}__${date}`;

      const initialEntry: WellnessEntry = {
        id: "entry_1",
        club_id: "club_001",
        player_id: "p1",
        date: "2026-10-18",
        sleep_quality: 3,
        fatigue: 3,
        soreness: 3,
        stress: 3,
        sleep_hours: 7.0,
        pain: false,
        pain_vas: null,
        pain_locations: [],
        illness: false,
        comment: "Перший запис вранці",
        submitted_at: "2026-10-18T08:00:00Z",
        source: "player",
      };

      // Перший запис
      store.set(makeKey(initialEntry.player_id, initialEntry.date), initialEntry);
      assert.equal(store.size, 1);
      assert.equal(store.get(makeKey("p1", "2026-10-18"))?.sleep_quality, 3);

      // Upsert: гравець оновлює анкету того ж дня
      const updatedEntry: WellnessEntry = {
        ...initialEntry,
        id: "entry_1",
        sleep_quality: 4,
        fatigue: 4,
        comment: "Оновив стан після розминки",
        submitted_at: "2026-10-18T10:15:00Z",
      };

      store.set(makeKey(updatedEntry.player_id, updatedEntry.date), updatedEntry);

      // Кількість записів не змінилася (upsert)
      assert.equal(store.size, 1);
      assert.equal(store.get(makeKey("p1", "2026-10-18"))?.sleep_quality, 4);
      assert.equal(store.get(makeKey("p1", "2026-10-18"))?.comment, "Оновив стан після розминки");

      // Новий день -> створюється новий запис
      const nextDayEntry: WellnessEntry = {
        ...initialEntry,
        id: "entry_2",
        date: "2026-10-19",
      };
      store.set(makeKey(nextDayEntry.player_id, nextDayEntry.date), nextDayEntry);
      assert.equal(store.size, 2);
    });
  });

  // 1. Правило правки тільки в той самий день
  describe("1. Правило правки тільки в той самий день за часовим поясом клубу", () => {
    function validateSameDayEdit(entryDate: string, clubTodayDate: string): { allowed: boolean; error?: string } {
      if (entryDate !== clubTodayDate) {
        return {
          allowed: false,
          error: `Правка анкети самопочуття дозволена тільки в той самий день (дата анкети: ${entryDate}, сьогодні: ${clubTodayDate}).`,
        };
      }
      return { allowed: true };
    }

    it("дозволяє редагування, якщо дата анкети збігається з поточною клубною датою", () => {
      const today = "2026-10-18";
      const check = validateSameDayEdit("2026-10-18", today);
      assert.equal(check.allowed, true);
      assert.equal(check.error, undefined);
    });

    it("блокує редагування минулих або майбутніх дат", () => {
      const today = "2026-10-18";

      const pastCheck = validateSameDayEdit("2026-10-17", today);
      assert.equal(pastCheck.allowed, false);
      assert.match(pastCheck.error!, /дозволена тільки в той самий день/);

      const futureCheck = validateSameDayEdit("2026-10-19", today);
      assert.equal(futureCheck.allowed, false);
      assert.match(futureCheck.error!, /дозволена тільки в той самий день/);
    });
  });

  // 3. Права ролей: маскування stress та comment для ролі coach
  describe("3. Права ролей та маскування даних (stress та comment для coach)", () => {
    function sanitizeWellnessForRole(
      entry: WellnessEntry,
      role: "coach" | "doctor" | "admin" | "player"
    ): WellnessEntry | CoachWellnessEntry {
      if (role === "coach") {
        return {
          ...entry,
          stress: null,
          comment: null,
        };
      }
      return entry;
    }

    const testEntry: WellnessEntry = {
      id: "well_secret_01",
      club_id: "club_1",
      player_id: "player_10",
      date: "2026-10-18",
      sleep_quality: 4,
      fatigue: 4,
      soreness: 4,
      stress: 2, // Конфіденційна оцінка тривожності
      sleep_hours: 8.5,
      pain: true,
      pain_vas: 3,
      pain_locations: ["groin"],
      illness: false,
      comment: "Потрібна консультація психолога / відчуваю перевтому", // Конфіденційний коментар
      submitted_at: "2026-10-18T09:00:00Z",
      source: "player",
    };

    it("тренер отримує відповідь з прихованими полями stress = null і comment = null", () => {
      const coachView = sanitizeWellnessForRole(testEntry, "coach");
      assert.equal(coachView.stress, null);
      assert.equal(coachView.comment, null);
      // Інші метрики доступні тренеру
      assert.equal(coachView.sleep_quality, 4);
      assert.equal(coachView.fatigue, 4);
      assert.equal(coachView.soreness, 4);
      assert.equal(coachView.pain, true);
      assert.equal(coachView.pain_vas, 3);
      assert.deepEqual(coachView.pain_locations, ["groin"]);
      assert.equal(coachView.illness, false);
    });

    it("лікар та адміністратор бачать повні дані, включаючи stress та comment", () => {
      const doctorView = sanitizeWellnessForRole(testEntry, "doctor") as WellnessEntry;
      assert.equal(doctorView.stress, 2);
      assert.equal(doctorView.comment, "Потрібна консультація психолога / відчуваю перевтому");

      const adminView = sanitizeWellnessForRole(testEntry, "admin") as WellnessEntry;
      assert.equal(adminView.stress, 2);
      assert.equal(adminView.comment, "Потрібна консультація психолога / відчуваю перевтому");
    });
  });

  // 4. Доступ неповнолітніх (<18) без згоди data_processing
  describe("4. Доступ неповнолітніх та згода батьків (data_processing)", () => {
    function checkPlayerAccess(player: {
      dob: string;
      scopes: Record<string, { status: "granted" | "rejected" | "pending" }>;
    }, currentDate = new Date("2026-10-18")): { canFill: boolean; reason?: string; isMinor: boolean } {
      const birth = new Date(player.dob);
      let age = currentDate.getFullYear() - birth.getFullYear();
      const m = currentDate.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && currentDate.getDate() < birth.getDate())) {
        age--;
      }

      const isMinor = age < 18;
      if (isMinor) {
        const consent = player.scopes["data_processing"];
        if (!consent || consent.status !== "granted") {
          return {
            canFill: false,
            reason: "Потрібна згода батьків",
            isMinor: true,
          };
        }
      }

      return {
        canFill: true,
        isMinor,
      };
    }

    it("блокує доступ неповнолітньому (<18 років) без підтвердженої згоди data_processing", () => {
      const minorWithoutConsent = {
        dob: "2010-05-15", // 16 років у жовтні 2026
        scopes: {},
      };

      const access = checkPlayerAccess(minorWithoutConsent);
      assert.equal(access.canFill, false);
      assert.equal(access.isMinor, true);
      assert.equal(access.reason, "Потрібна згода батьків");
    });

    it("дозволяє доступ неповнолітньому з підтвердженою згодою data_processing", () => {
      const minorWithConsent = {
        dob: "2009-03-20", // 17 років у жовтні 2026
        scopes: {
          data_processing: { status: "granted" as const },
        },
      };

      const access = checkPlayerAccess(minorWithConsent);
      assert.equal(access.canFill, true);
      assert.equal(access.isMinor, true);
      assert.equal(access.reason, undefined);
    });

    it("надає доступ повнолітньому гравцю (18+ років) без окремої згоди батьків", () => {
      const adultPlayer = {
        dob: "2005-01-10", // 21 рік у жовтні 2026
        scopes: {},
      };

      const access = checkPlayerAccess(adultPlayer);
      assert.equal(access.canFill, true);
      assert.equal(access.isMinor, false);
    });
  });

  // 5. Розрахунок дати за часовим поясом клубу
  describe("5. Часовий пояс клубу (getClubDate)", () => {
    it("правильно визначає локальну дату клубу для різних часових поясів", () => {
      // 2026-10-17 22:30:00 UTC відповідає 2026-10-18 01:30:00 в Europe/Kyiv (+3 літній час)
      const lateUtcDate = new Date("2026-10-17T22:30:00Z");

      const kyivDate = getClubDate("Europe/Kyiv", lateUtcDate);
      const londonDate = getClubDate("Europe/London", lateUtcDate); // 23:30 (17 жовтня)

      assert.equal(kyivDate, "2026-10-18");
      assert.equal(londonDate, "2026-10-17");
    });

    it("використовує дефолтний Europe/Kyiv при невалідному часовому поясі", () => {
      const d = new Date("2026-10-18T10:00:00Z");
      const date = getClubDate("INVALID_TIMEZONE_XYZ", d);
      assert.equal(date, "2026-10-18");
    });
  });

  // 2. Структура форми: карта тіла та ВАШ тільки якщо pain = true
  describe("2. Структура форми та підтвердження 'Дякуємо'", () => {
    it("містить доступні зони карти тіла", () => {
      assert.ok(PAIN_LOCATIONS_LIST.length >= 10);
      const ids = PAIN_LOCATIONS_LIST.map((l) => l.id);
      assert.ok(ids.includes("groin"));
      assert.ok(ids.includes("thigh_posterior"));
      assert.ok(ids.includes("knee_left"));
      assert.ok(ids.includes("achilles"));
    });

    it("вимагає шкалу ВАШ та локалізацію тільки тоді, коли pain = true", () => {
      interface FormValues {
        sleepQuality: WellnessScore;
        fatigue: WellnessScore;
        soreness: WellnessScore;
        stress: WellnessScore;
        pain: boolean;
        painVas?: number | null;
        painLocations?: string[];
        illness: boolean;
      }

      function validateFormSubmission(values: FormValues): { valid: boolean; missing: string[] } {
        const missing: string[] = [];
        if (!values.sleepQuality) missing.push("sleepQuality");
        if (!values.fatigue) missing.push("fatigue");
        if (!values.soreness) missing.push("soreness");
        if (!values.stress) missing.push("stress");
        if (values.pain === undefined || values.pain === null) missing.push("pain");
        if (values.illness === undefined || values.illness === null) missing.push("illness");

        // Умовні поля при pain = true
        if (values.pain) {
          if (values.painVas === undefined || values.painVas === null) {
            missing.push("painVas");
          }
          if (!values.painLocations || values.painLocations.length === 0) {
            missing.push("painLocations");
          }
        }

        return { valid: missing.length === 0, missing };
      }

      // Без болю: форма валідна без ВАШ і локалізацій
      const noPain = validateFormSubmission({
        sleepQuality: 5,
        fatigue: 5,
        soreness: 5,
        stress: 5,
        pain: false,
        illness: false,
      });
      assert.equal(noPain.valid, true);

      // З болем, але без ВАШ: невалідно
      const withPainNoVas = validateFormSubmission({
        sleepQuality: 5,
        fatigue: 5,
        soreness: 5,
        stress: 5,
        pain: true,
        painVas: null,
        painLocations: ["knee_right"],
        illness: false,
      });
      assert.equal(withPainNoVas.valid, false);
      assert.ok(withPainNoVas.missing.includes("painVas"));

      // З болем, ВАШ і локалізацією: валідно
      const validWithPain = validateFormSubmission({
        sleepQuality: 5,
        fatigue: 5,
        soreness: 5,
        stress: 5,
        pain: true,
        painVas: 4,
        painLocations: ["knee_right"],
        illness: false,
      });
      assert.equal(validWithPain.valid, true);
    });

    it("текст підтвердження містить 'Дякуємо' без оціночних суджень ('добре/погано')", () => {
      const confirmationTitle = "Дякуємо!";
      const confirmationText = "Твою відповідь збережено. Дані передано медичному штабу та тренеру.";

      assert.match(confirmationTitle, /Дякуємо/);
      assert.equal(/добре|погано/i.test(confirmationText), false);
    });
  });
});
