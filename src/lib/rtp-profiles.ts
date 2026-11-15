/**
 * rtp-profiles.ts
 *
 * Профілі критеріїв повернення в гру (RTP Clearance) залежно від типу та локалізації травми.
 * Забезпечує зворотну сумісність зі старими чек-листами (9 базових критеріїв).
 */

export type RtpProfileId =
  | "hamstring"
  | "adductor_groin"
  | "quadriceps"
  | "calf"
  | "ankle"
  | "knee_acl"
  | "knee_collateral"
  | "knee_meniscus"
  | "base";

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
  adductor_groin: {
    id: "adductor_groin",
    titleUa: "Привідні м'язи / пах",
    subtitleUa: "Протокол для аддукторів та пахової зони (Doha / Adductor Squeeze)",
    criteria: [
      {
        key: "noPalpationPain",
        label: "Безболісна пальпація привідних м'язів та зони лонного зчленування",
        category: "clinical",
      },
      {
        key: "adductorSqueezePassed",
        label: "Adductor Squeeze Test на 0° та 45° без болю (VAS 0–1)",
        category: "clinical",
      },
      {
        key: "adductorStrengthSymmetry",
        label: "Сила привідних м'язів (ForceFrame / динамометр) LSI ≥ 90% та Copenhagen Adduction без болю",
        category: "strength",
      },
      {
        key: "changeOfDirectionPassed",
        label: "Зміна напрямку руху (cutting) та прискорення без дискомфорту в паху",
        category: "field",
      },
      {
        key: "kickingPassingPainfree",
        label: "Удари по м'ячу внутрішньою стороною стопи та довгі передачі без болю",
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
  quadriceps: {
    id: "quadriceps",
    titleUa: "Квадрицепс",
    subtitleUa: "Протокол для передньої поверхні стегна (тест Елі / удар по м'ячу)",
    criteria: [
      {
        key: "noPalpationPain",
        label: "Безболісна глибока пальпація передньої поверхні стегна",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "Повний безболісний тест розтягнення (тест Елі / згинання коліна 100%)",
        category: "clinical",
      },
      {
        key: "lsi90Passed",
        label: "Сила квадрицепса (концентрична та ексцентрична) LSI ≥ 90%",
        category: "strength",
      },
      {
        key: "kickingMaxPowerPassed",
        label: "Максимальний удар по м'ячу підйомом та різке гальмування без болю",
        category: "field",
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
        label: "Психологічна готовність",
        category: "psych",
      },
    ],
  },
  calf: {
    id: "calf",
    titleUa: "Литка / м'язи гомілки",
    subtitleUa: "Протокол для литкового та камбалоподібного м'язів (Heel Raise / пліометрика)",
    criteria: [
      {
        key: "noPalpationPain",
        label: "Безболісна пальпація литкового та камбалоподібного м'язів (gastrocnemius / soleus)",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "Повне безболісне тильне згинання та розтягнення гомілки",
        category: "clinical",
      },
      {
        key: "singleLegHeelRaisePassed",
        label: "Single-Leg Heel Raise (≥ 25–30 разів, симетрія ≥ 90% з прямою і зігнутою ногою)",
        category: "strength",
      },
      {
        key: "reactiveHopPassed",
        label: "Реактивні стрибки (plyometric hop-тести) та бігові прискорення без болю",
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
    subtitleUa: "Протокол для передньої хрестоподібної зв'язки (LSI / Hop / ACL-RSI)",
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
  knee_collateral: {
    id: "knee_collateral",
    titleUa: "Коліно / БЗК (MCL/LCL)",
    subtitleUa: "Протокол для медіальної та латеральної бокових зв'язок коліна",
    criteria: [
      {
        key: "noEffusionOrSwelling",
        label: "Без випоту та набряку в зоні бокової зв'язки",
        category: "clinical",
      },
      {
        key: "valgusVarusStressNegative",
        label: "Негативний вальгус/варус-стрес тест на 0° та 30° без болю та люфту",
        category: "clinical",
      },
      {
        key: "fullPainfreeRom",
        label: "Повний безболісний ROM (0° розгинання та повне згинання)",
        category: "clinical",
      },
      {
        key: "lsi90Passed",
        label: "LSI ≥ 90% (квадрицепс / хамстринг на динамометрі)",
        category: "strength",
      },
      {
        key: "kickingPassingPainfree",
        label: "Удар по м'ячу внутрішньою стороною стопи та бокові зміщення без болю",
        category: "field",
      },
      {
        key: "changeOfDirectionPassed",
        label: "Зміна напрямку руху (cutting) та гальмування без нестабільності",
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
  knee_meniscus: {
    id: "knee_meniscus",
    titleUa: "Коліно / Меніск",
    subtitleUa: "Протокол для ушкоджень меніска (McMurray / Thessaly / глибокий присід)",
    criteria: [
      {
        key: "noEffusionOrSwelling",
        label: "Без випоту та внутрішньосуглобового набряку",
        category: "clinical",
      },
      {
        key: "meniscusTestsNegative",
        label: "Негативні тести McMurray та Thessaly, відсутність блокад/клацання",
        category: "clinical",
      },
      {
        key: "deepSquatPainfree",
        label: "Повний ROM та глибоке безболісне присідання без дискомфорту",
        category: "clinical",
      },
      {
        key: "lsi90Passed",
        label: "LSI ≥ 90% (квадрицепс / хамстринг)",
        category: "strength",
      },
      {
        key: "hopSeries90Passed",
        label: "Серія hop-тестів (Single, Triple, Crossover) LSI ≥ 90%",
        category: "field",
      },
      {
        key: "changeOfDirectionPassed",
        label: "Ротаційні рухи та зміна напрямку без болю в суглобовій щілині",
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
  if (location === "hamstring" || (injuryType === "muscular" && location === "thigh")) {
    return "hamstring";
  }
  if (location === "adductor" || location === "groin") {
    return "adductor_groin";
  }
  if (location === "quadriceps") {
    return "quadriceps";
  }
  if (location === "calf") {
    return "calf";
  }
  if ((injuryType === "ligament" || injuryType === "tendon") && location === "ankle") {
    return "ankle";
  }
  if (injuryType === "cartilage" && location === "knee") {
    return "knee_meniscus";
  }
  if (injuryType === "ligament" && location === "knee") {
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
