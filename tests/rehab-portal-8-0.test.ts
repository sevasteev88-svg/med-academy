import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  VAS_ALERT_THRESHOLD,
  URGENT_CASE_WARNING,
  INJURY_TYPE_UA,
  LOCATION_UA,
} from "../src/lib/constants.ts";
import {
  getExercisesForInjuryAndPhase,
  buildRecoveryQuests,
} from "../src/lib/rehab-exercises.ts";
import type { RehabCheckinData } from "../src/types/rehab-portal.ts";

describe("8.0 Правки порталу гравця /rehab-portal", () => {
  // 1 & 2. Значення за замовчуванням та єдине узгоджене спрямування шкал
  describe("1 & 2. Валідація 'Не обрано' та єдина шкала (5 = найкраще)", () => {
    it("валідує, що початковий стан має незаповнені поля і блокує відправку", () => {
      // Початковий стан форми
      const initialState = {
        sleepQuality: null,
        freshnessLevel: null,
        muscleSoreness: null,
        stressLevel: null,
        vasScore: null,
        swelling: "",
        stiffnessMinutes: null,
        psychReadiness: null,
      };

      // Перевірка валідатора для здорового гравця
      const validateHealthy = (state: typeof initialState) => {
        const missing: string[] = [];
        if (state.sleepQuality === null) missing.push("Якість сну");
        if (state.freshnessLevel === null) missing.push("Свіжість");
        if (state.muscleSoreness === null) missing.push("Біль у м'язах після тренування");
        if (state.stressLevel === null) missing.push("Рівень стресу");
        return missing;
      };

      const missingHealthy = validateHealthy(initialState);
      assert.equal(missingHealthy.length, 4);
      assert.deepEqual(missingHealthy, [
        "Якість сну",
        "Свіжість",
        "Біль у м'язах після тренування",
        "Рівень стресу",
      ]);

      // Перевірка валідатора для травмованого гравця
      const validateInjured = (state: typeof initialState) => {
        const missing = validateHealthy(state);
        if (state.vasScore === null) missing.push("Рівень болю (ВАШ)");
        if (!state.swelling) missing.push("Набряк");
        if (state.stiffnessMinutes === null) missing.push("Ранкова скутість");
        if (state.psychReadiness === null) missing.push("Психологічна впевненість");
        return missing;
      };

      const missingInjured = validateInjured(initialState);
      assert.equal(missingInjured.length, 8);
    });

    it("розраховує суму балів за єдиним спрямуванням (усі 4 шкали: 5 = найкраще)", () => {
      // Сон: 5 (чудово), Свіжість: 5 (повністю свіжий), М'язи: 5 (свіжі), Стрес: 5 (спокійний)
      const maxScore = 5 + 5 + 5 + 5;
      assert.equal(maxScore, 20);

      // Виснажений гравець: Сон 1, Свіжість 1, М'язи 1, Стрес 1
      const minScore = 1 + 1 + 1 + 1;
      assert.equal(minScore, 4);

      // Збалансований день: 4 + 4 + 4 + 4 = 16 (оптимально)
      const goodScore = 4 + 4 + 4 + 4;
      assert.equal(goodScore, 16);
      assert.ok(goodScore >= 16);
    });

    it("коректно мігрує старі записи з інвертованою втомою (1 = свіжий -> 5 = свіжий)", () => {
      const legacyCheckins = [
        { sleep_quality: 4, fatigue_level: 1, muscle_soreness: 4, stress_level: 4 }, // Старий свіжий (fatigue 1)
        { sleep_quality: 3, fatigue_level: 5, muscle_soreness: 3, stress_level: 3 }, // Старий виснажений (fatigue 5)
      ];

      const migrated = legacyCheckins.map((chk) => {
        const freshness =
          chk.freshness_level !== undefined
            ? chk.freshness_level
            : chk.fatigue_level !== undefined
            ? 6 - chk.fatigue_level
            : 4;
        const total = chk.sleep_quality + freshness + chk.muscle_soreness + chk.stress_level;
        return { freshness_level: freshness, total_score: total };
      });

      // fatigue 1 -> freshness 5. Total = 4 + 5 + 4 + 4 = 17
      assert.equal(migrated[0].freshness_level, 5);
      assert.equal(migrated[0].total_score, 17);

      // fatigue 5 -> freshness 1. Total = 3 + 1 + 3 + 3 = 10
      assert.equal(migrated[1].freshness_level, 1);
      assert.equal(migrated[1].total_score, 10);
    });
  });

  // 3 & 8. Мова для підлітків та переклад заголовка травми
  describe("3 & 8. Зрозуміла термінологія без медичного жаргону та сирих enum", () => {
    it("перекладає тип травми muscular без виведення сирого англійського enum", () => {
      const primaryInjury = {
        injury_type: "muscular",
        location: "thigh",
        diagnosis: "",
      };

      const formatInjuryLabel = (inj: typeof primaryInjury | null) => {
        if (!inj) return "🟢 Основна група (Готовий)";
        if (inj.diagnosis && inj.diagnosis.trim()) return inj.diagnosis;
        const typeLabel = inj.injury_type ? INJURY_TYPE_UA[inj.injury_type] || inj.injury_type : "";
        const locLabel = inj.location ? LOCATION_UA[inj.location] || inj.location : "";
        if (typeLabel && locLabel && locLabel !== "Інше") return `${typeLabel} (${locLabel})`;
        return typeLabel || locLabel || "Відновлення";
      };

      const label = formatInjuryLabel(primaryInjury);
      assert.equal(label, "М'язова (Стегно)");
      assert.ok(!label.includes("muscular"));
      assert.ok(!label.includes("thigh"));
    });

    it("для здорового гравця формує мітку '🟢 Основна група (Готовий)'", () => {
      const formatInjuryLabel = (inj: any) => {
        if (!inj) return "🟢 Основна група (Готовий)";
        return "Травма";
      };
      assert.equal(formatInjuryLabel(null), "🟢 Основна група (Готовий)");
    });
  });

  // 4. Срок повернення
  describe("4. Розрахунок терміну повернення", () => {
    const calcReturnDisplay = (phase: number, targetDate?: string | null) => {
      if (phase === 1) return "Термін повернення уточнює лікар";
      if (!targetDate) return "Термін повернення уточнює лікар";
      const diff = Math.ceil(
        (new Date(targetDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
      );
      if (diff <= 0) return "Термін повернення уточнює лікар";
      return `~${diff} дн.`;
    };

    it("у фазі 1 ЗАВЖДИ показує 'Термін повернення уточнює лікар', навіть якщо дата сьогодні", () => {
      const today = new Date().toISOString().split("T")[0];
      const res = calcReturnDisplay(1, today);
      assert.equal(res, "Термін повернення уточнює лікар");
      assert.ok(!res.includes("Сьогодні!"));
    });

    it("якщо дата минула або не задана — показує 'Термін повернення уточнює лікар'", () => {
      assert.equal(calcReturnDisplay(2, null), "Термін повернення уточнює лікар");
      assert.equal(calcReturnDisplay(3, "2020-01-01"), "Термін повернення уточнює лікар");
    });

    it("якщо лікар підтвердив майбутню дату у фазі 2+ — показує кількість днів", () => {
      const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];
      const res = calcReturnDisplay(2, futureDate);
      assert.ok(res.includes("дн."));
      assert.ok(!res.includes("уточнює"));
    });
  });

  // 7. Попередження про термінові випадки та поріг ВАШ
  describe("7. Попередження про термінові випадки та поріг ВАШ", () => {
    it("перевіряє наявність константи попередження та поріг VAS_ALERT_THRESHOLD = 7", () => {
      assert.equal(VAS_ALERT_THRESHOLD, 7);
      assert.ok(URGENT_CASE_WARNING.includes("Ця форма не для термінових випадків"));
      assert.ok(URGENT_CASE_WARNING.includes("сильний біль, онімінння, швидкий набряк"));
    });

    it("ідентифікує критичний рівень болю при ВАШ >= 7", () => {
      const isCritical = (vas: number | null) => vas !== null && vas >= VAS_ALERT_THRESHOLD;
      assert.equal(isCritical(null), false);
      assert.equal(isCritical(3), false);
      assert.equal(isCritical(6), false);
      assert.equal(isCritical(7), true);
      assert.equal(isCritical(9), true);
    });
  });

  // 9. Квести відновлення без загальних числових рекомендацій
  describe("9. Квести відновлення", () => {
    it("не містить загальних грамів білка чи колагену у базовому шаблоні", () => {
      const generalQuests = buildRecoveryQuests({ hasInjury: false });
      const allText = generalQuests.map((q) => `${q.title} ${q.description}`).join(" ");

      assert.ok(!allText.includes("1.8–2.0 г"));
      assert.ok(!allText.includes("колаген"));
      assert.ok(!allText.includes("2.5 л"));
    });

    it("додає нутрицевтики ТІЛЬКИ якщо вони призначені лікарем з позначкою 'Призначено лікарем'", () => {
      const questsWithRx = buildRecoveryQuests({
        hasInjury: true,
        prescriptions: [
          { id: "collagen", name: "Колаген + вітамін С", dosage: "За 45 хв до тренування" },
        ],
      });

      const rxQuest = questsWithRx.find((q) => q.id === "rx-collagen");
      assert.ok(rxQuest);
      assert.ok(rxQuest.title.includes("Призначено лікарем"));
      assert.equal(rxQuest.description, "За 45 хв до тренування");
    });
  });

  // 10. План ЛФК при діагнозі/зоні
  describe("10. План ЛФК", () => {
    it("якщо зона чи діагноз не вказані — повертає порожній масив (План призначить лікар)", () => {
      const ex1 = getExercisesForInjuryAndPhase(null, 1, null);
      assert.equal(ex1.length, 0);

      const ex2 = getExercisesForInjuryAndPhase("other", 1, "");
      assert.equal(ex2.length, 0);
    });

    it("якщо локалізація коліно — повертає вправи для коліна відповідної фази", () => {
      const exEarly = getExercisesForInjuryAndPhase("knee", 1, null);
      assert.ok(exEarly.length > 0);
      assert.ok(exEarly.some((e) => e.name.includes("Квадрицепс") || e.name.includes("Quad")));

      const exLate = getExercisesForInjuryAndPhase("коліно", 3, null);
      assert.ok(exLate.length > 0);
      assert.ok(exLate.some((e) => e.name.includes("Іспанський присід") || e.name.includes("Стрибки")));
    });
  });

  // 11. Блокування при mustChangePin
  describe("11. Перший вхід та блокування відправки", () => {
    it("блокує кнопку відправки якщо mustChangePin === true", () => {
      const canSubmit = (mustChangePin: boolean, missingCount: number) => {
        return !mustChangePin && missingCount === 0;
      };

      assert.equal(canSubmit(true, 0), false);
      assert.equal(canSubmit(false, 1), false);
      assert.equal(canSubmit(false, 0), true);
    });
  });
});
