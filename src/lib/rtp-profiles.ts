/**
 * rtp-profiles.ts
 *
 * Профілі критеріїв повернення в гру (RTP Clearance) залежно від типу та локалізації травми.
 * Забезпечує зворотну сумісність зі старими чек-листами (9 базових критеріїв).
 */

export type RtpProfileId = "hamstring" | "ankle" | "knee_acl" | "base";

export type RtpCriterionCategory = "clinical" | "strength" | "field" | "psych";

export interface RtpCriterionDef {
  key: string;
  label: string;
  category: RtpCriterionCategory;
}

export interface RtpProfileDef {
  id: RtpProfileId;
  titleUa: string;
  subtitleUa: string;
  criteria: RtpCriterionDef[];
}

export type RtpCriteriaState = Record<string, boolean | string | undefined> & {
  profileId?: RtpProfileId;
  doctorNote?: string;
};

export const RTP_CATEGORY_META: Record<
  RtpCriterionCategory,
  { title: string; icon: string }
> = {
  clinical: { title: "1. Клінічні критерії (кабінет лікаря)", icon: "🩺" },
  strength: { title: "2. Функціонально-симетричні тести", icon: "💪" },
  field: { title: "3. Польові функціональні тести (на газоні)", icon: "⚽" },
  psych: { title: "4. Психологічна готовність", icon: "🧠" },
};

export const RTP_PROFILES: Record<RtpProfileId, RtpProfileDef> = {
  hamstring: {
    id: "hamstring",
    titleUa: "Хамстринг / задня поверхня стегна",
    subtitleUa: "Спеціалізований протокол для м'язових травм стегна (Askling / NordBord)",
    criteria: [
      {
        key: "noPalpationPain",
        label: "Безболісна глибока пальпація зони ушкодження",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "Повна безболісна амплітуда рухів (MHSA / Askling H-test)",
        category: "clinical",
      },
      {
        key: "strengthDeficitLessThan10Pct",
        label: "Сила ексцентрична / NordBord (дефіцит < 10%)",
        category: "strength",
      },
      {
        key: "maximalSprint30mPassed",
        label: "Максимальний спринт > 95% від дотравматичної швидкості",
        category: "field",
      },
      {
        key: "fullTrainingSessionCompleted",
        label: "Повне командне тренування з контактною боротьбою",
        category: "field",
      },
      {
        key: "psychologicalReadinessPassed",
        label: "Психологічна готовність (відсутність страху рецидиву)",
        category: "psych",
      },
    ],
  },
  ankle: {
    id: "ankle",
    titleUa: "Гомілковостопний суглоб",
    subtitleUa: "Протокол для зв'язок та сухожиль гомілкостопа (WBLT / Y-Balance)",
    criteria: [
      {
        key: "noEffusionOrSwelling",
        label: "Відсутність набряку та випоту гомілковостопного суглоба",
        category: "clinical",
      },
      {
        key: "wbltPassed",
        label: "WBLT (тильне згинання — різниця < 2 см зі здоровою ногою)",
        category: "clinical",
      },
      {
        key: "yBalancePassed",
        label: "Y-Balance тест (асиметрія досягнення < 4 см)",
        category: "strength",
      },
      {
        key: "hopAndCodPassed",
        label: "Hop-тести та зміна напрямку руху (5-0-5 / T-Test) без болю",
        category: "field",
      },
      {
        key: "fullTrainingSessionCompleted",
        label: "Повне командне тренування з контактною боротьбою",
        category: "field",
      },
      {
        key: "psychologicalReadinessPassed",
        label: "Психологічна готовність",
        category: "psych",
      },
    ],
  },
  knee_acl: {
    id: "knee_acl",
    titleUa: "Коліно / ПКС",
    subtitleUa: "Розширений протокол для зв'язок та менісків коліна (LSI / ACL-RSI)",
    criteria: [
      {
        key: "noEffusionOrSwelling",
        label: "Без випоту (негативний тест балотування надколінка)",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "Повний ROM (0° розгинання та повне безболісне згинання)",
        category: "clinical",
      },
      {
        key: "lsi90Passed",
        label: "LSI ≥ 90% (квадріцепс / хамстринг на динамометрі)",
        category: "strength",
      },
      {
        key: "hopSeries90Passed",
        label: "Серія hop-тестів (Single, Triple, Crossover) LSI ≥ 90%",
        category: "field",
      },
      {
        key: "changeOfDirectionPassed",
        label: "Зміна напрямку руху та гальмування без нестабільності",
        category: "field",
      },
      {
        key: "aclRsiPassed",
        label: "Шкала психологічної готовності (ACL-RSI ≥ 65%)",
        category: "psych",
      },
      {
        key: "fullTrainingSessionCompleted",
        label: "Повне командне тренування з контактною боротьбою",
        category: "field",
      },
    ],
  },
  base: {
    id: "base",
    titleUa: "Базовий профіль (Aspetar & FCB)",
    subtitleUa: "Універсальний чек-лист повернення в гру для інших типів травм",
    criteria: [
      {
        key: "noPalpationPain",
        label: "Повна відсутність локальної болісності при глибокій пальпації",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "100% безболісна амплітуда рухів (ROM) порівняно зі здоровою кінцівкою",
        category: "clinical",
      },
      {
        key: "noEffusionOrSwelling",
        label: "Повна відсутність набряку, випоту або постізометричної реакції",
        category: "clinical",
      },
      {
        key: "strengthDeficitLessThan10Pct",
        label: "Дефіцит пікової сили м'яза < 10% (за даними ручного динамометра)",
        category: "strength",
      },
      {
        key: "eccentricControlPassed",
        label: "Безболісний ексцентричний контроль на довгих важелях",
        category: "strength",
      },
      {
        key: "maximalSprint30mPassed",
        label: "Спринт на 30м з максимальною інтенсивністю (≥ 95% від дотравматичної швидкості)",
        category: "field",
      },
      {
        key: "changeOfDirectionPassed",
        label: "Тест на зміну напрямку руху (5-0-5 або T-Test) на 100% зусилля без дискомфорту",
        category: "field",
      },
      {
        key: "fullTrainingSessionCompleted",
        label: "Успішне завершення мінімум 1 повного командного тренування з контактною боротьбою",
        category: "field",
      },
      {
        key: "psychologicalReadinessPassed",
        label: "Відсутність кинезіофобії (страху рецидиву при стиках, підкатах та ударах)",
        category: "psych",
      },
    ],
  },
};

export function resolveRtpProfileId(
  injuryType?: string | null,
  location?: string | null
): RtpProfileId {
  if (injuryType === "muscular" && location === "thigh") {
    return "hamstring";
  }
  if ((injuryType === "ligament" || injuryType === "tendon") && location === "ankle") {
    return "ankle";
  }
  if ((injuryType === "ligament" || injuryType === "cartilage") && location === "knee") {
    return "knee_acl";
  }
  return "base";
}

export function calculateRtpClearanceStats(
  profileId: RtpProfileId,
  criteria: RtpCriteriaState
): {
  passedCriteria: number;
  totalCriteria: number;
  clearancePercentage: number;
  isFullyCleared: boolean;
} {
  const profile = RTP_PROFILES[profileId] ?? RTP_PROFILES.base;
  const totalCriteria = profile.criteria.length;
  const passedCriteria = profile.criteria.filter((c) => Boolean(criteria[c.key])).length;
  const clearancePercentage =
    totalCriteria > 0 ? Math.round((passedCriteria / totalCriteria) * 100) : 0;
  return {
    passedCriteria,
    totalCriteria,
    clearancePercentage,
    isFullyCleared: totalCriteria > 0 && passedCriteria === totalCriteria,
  };
}
