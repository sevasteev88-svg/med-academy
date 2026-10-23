export type LsiTestType =
  | "single_leg_hop" // Одиночний стрибок на дальність (см)
  | "triple_hop" // Потрійний стрибок на дальність (см)
  | "crossover_hop" // Перехресний потрійний стрибок (см)
  | "timed_hop_6m" // Стрибок на 6 метрів на швидкість (сек)
  | "y_balance_composite" // Y-Balance тест (композитний бал %)
  | "quadriceps_dynamometry" // Сила квадріцепса розгинання (HHD, кг)
  | "hamstring_dynamometry" // Сила задньої поверхні стегна (HHD, кг)
  | "adductor_squeeze"; // Сила зведення аддукторів (сфігмоманометр / HHD, мм рт. ст.)

export type LsiAssessmentStatus = "cleared" | "conditional" | "high_risk";

/**
 * Константи індивідуальних порогів LSI (%) для кожного тесту:
 * - Hop-тести та динамометрія: >= 90%
 * - Y-Balance: за критерієм із підпису >= 95%
 */
export const LSI_THRESHOLDS: Record<LsiTestType, number> = {
  single_leg_hop: 90,
  triple_hop: 90,
  crossover_hop: 90,
  timed_hop_6m: 90,
  y_balance_composite: 95, // Y-balance по критерію з підпису (симетрія ≥ 95%)
  quadriceps_dynamometry: 90,
  hamstring_dynamometry: 90,
  adductor_squeeze: 90,
};

/** Поріг співвідношення Hamstring / Quadriceps (H/Q) */
export const HQ_RATIO_THRESHOLD = 0.6;

export const DEFAULT_PROTOCOL_SOURCE = "Клінічний консенсус клубу";

export const PROTOCOL_SOURCE_OPTIONS = [
  "Клінічний консенсус клубу",
  "FIFA Medical Consensus / F-MARC",
  "Aspetar Return to Play Guidelines",
  "UEFA Medical Protocol",
  "Індивідуальний протокол реабілітації",
];

export interface LsiTestItemResult {
  test_type: LsiTestType;
  test_name: string;
  injured_limb_value: number; // Показник травмованої/оперованої кінцівки
  uninjured_limb_value: number; // Показник здорової кінцівки
  unit: string; // "см", "кг", "Н", "%", "с", "мм рт.ст."
  lsi_percent: number; // (Injured / Uninjured) * 100%
  deficit_percent: number; // 100 - LSI %
  threshold_percent: number; // Поріг для цього тесту (90% або 95%)
  passed: boolean;
  injured_relative_strength?: number | null; // Сила нормована на масу тіла (кг/кг)
  uninjured_relative_strength?: number | null; // Сила нормована на масу тіла (кг/кг)
}

export interface LsiAssessmentRecord {
  id: string;
  player_id: string;
  injury_id?: string | null;
  injury_type: string; // Обов'язковий тип травми: muscular, ligament, etc.
  date: string;
  tested_limb: "left" | "right"; // Обов'язкова кінцівка
  evaluator_name: string;
  doctor_signature: string; // Поле підпису / ПІБ лікаря
  protocol_source: string; // Джерело протоколу з налаштувань / вибору
  phase_clearance: string; // Напр., "Фаза 4 -> Фаза 5 (Match Fitness)"
  tests: LsiTestItemResult[];
  overall_lsi_percent: number; // Середній LSI індекс по батареї тестів (довідковий)
  criteria_met: boolean; // Чи виконані критерії LSI по кожному окремому тесту та H/Q
  failed_tests: string[]; // Перелік незданих тестів
  hq_ratio_injured?: number | null; // Співвідношення H/Q травмованої ноги
  hq_ratio_uninjured?: number | null; // Співвідношення H/Q здорової ноги
  hq_ratio_passed?: boolean | null; // Чи відповідає H/Q >= 0.60
  body_weight_kg?: number | null; // Маса тіла на момент тесту (кг)
  status: LsiAssessmentStatus;
  doctor_verdict: string;
  notes?: string;
  created_at: string;
}

export const LSI_TEST_DEFINITIONS: Record<
  LsiTestType,
  { name: string; unit: string; description: string; benchmark: string }
> = {
  single_leg_hop: {
    name: "Одиночний стрибок на дальність (Single Leg Hop)",
    unit: "см",
    description: "Стрибок вперед з однієї ноги з приземленням та стабілізацією на тій самій нозі 2+ сек.",
    benchmark: "LSI ≥ 90% (Дефіцит < 10%)",
  },
  triple_hop: {
    name: "Потрійний стрибок на дальність (Triple Hop)",
    unit: "см",
    description: "Три послідовні стрибки на одній нозі вперед без пауз, фіксація фінального приземлення.",
    benchmark: "LSI ≥ 90% (Дефіцит < 10%)",
  },
  crossover_hop: {
    name: "Перехресний стрибок (Crossover Triple Hop)",
    unit: "см",
    description: "Стрибки через 15-сантиметрову смугу зигзагом вперед 3 рази.",
    benchmark: "LSI ≥ 90% (Оцінка динамічної ротаційної стабільності коліна)",
  },
  timed_hop_6m: {
    name: "Стрибок 6 метрів на швидкість (6m Timed Hop)",
    unit: "с",
    description: "Час подолання 6-метрової дистанції серією стрибків на одній нозі.",
    benchmark: "LSI ≥ 90% (Швидкість / пружна потужність, менше часу = краще)",
  },
  y_balance_composite: {
    name: "Y-Balance тест (Динамічний баланс)",
    unit: "%",
    description: "Дотягування вільною ногою в Anterior, Posteromedial, Posterolateral напрямках.",
    benchmark: "Композитна симетрія ≥ 95%, Anterior дефіцит < 4 см",
  },
  quadriceps_dynamometry: {
    name: "Динамометрія: Квадріцепс (Quad HHD)",
    unit: "кг",
    description: "Ізометрична пікова сила розгинання коліна під кутом 60°/90°.",
    benchmark: "LSI ≥ 90% (Критичний фактор профілактики ре-розриву ПКС)",
  },
  hamstring_dynamometry: {
    name: "Динамометрія: Задня поверхня (Hamstring HHD)",
    unit: "кг",
    description: "Ізометрична пікова сила згинання коліна під кутом 30° або 90°.",
    benchmark: "LSI ≥ 90% та співвідношення H/Q ≥ 0.60",
  },
  adductor_squeeze: {
    name: "Тест стискання аддукторів (Adductor Squeeze)",
    unit: "мм рт.ст.",
    description: "Стискання сфігмоманометра або динамометра між колінами (0° / 45° згинання стегна).",
    benchmark: "LSI ≥ 90% та відсутність пахового болю (0/10)",
  },
};

/**
 * Розраховує LSI для конкретного тесту з урахуванням його індивідуального порогу:
 * - Hop-тести та динамометрія: >= 90%
 * - Y-Balance: >= 95%
 */
export function calculateLsiScore(
  testType: LsiTestType,
  injured: number,
  uninjured: number,
  isTimed: boolean = testType === "timed_hop_6m"
): {
  lsi: number;
  deficit: number;
  threshold: number;
  passed: boolean;
} {
  const threshold = LSI_THRESHOLDS[testType] ?? 90;

  if (uninjured <= 0 || injured <= 0) {
    return { lsi: 0, deficit: 100, threshold, passed: false };
  }

  // Якщо тест на час (менше = краще, наприклад timed_hop_6m)
  if (isTimed) {
    const lsi = Math.round((uninjured / injured) * 100 * 10) / 10;
    const deficit = Math.round((100 - lsi) * 10) / 10;
    return { lsi, deficit, threshold, passed: lsi >= threshold };
  }

  // Для сили та дальності (більше = краще)
  const lsi = Math.round((injured / uninjured) * 100 * 10) / 10;
  const deficit = Math.round((100 - lsi) * 10) / 10;
  return { lsi, deficit, threshold, passed: lsi >= threshold };
}

/**
 * Розрахунок співвідношення H/Q (hamstring / quadriceps)
 * Поріг: >= 0.60
 */
export function calculateHqRatio(hamstring: number, quadriceps: number): {
  ratio: number;
  passed: boolean;
} {
  if (quadriceps <= 0 || hamstring <= 0) {
    return { ratio: 0, passed: false };
  }
  const ratio = Math.round((hamstring / quadriceps) * 100) / 100;
  return { ratio, passed: ratio >= HQ_RATIO_THRESHOLD };
}

/**
 * Нормування сили на масу тіла (кг / кг або % маси тіла)
 */
export function calculateRelativeStrength(
  strengthKg: number,
  bodyWeightKg?: number | null
): number | null {
  if (!bodyWeightKg || bodyWeightKg <= 0 || strengthKg <= 0) return null;
  return Math.round((strengthKg / bodyWeightKg) * 100) / 100;
}

/**
 * Валідація обов'язкових полів протоколу LSI перед збереженням
 */
export function validateLsiRecord(data: Partial<LsiAssessmentRecord>): {
  valid: boolean;
  error?: string;
} {
  if (!data.tested_limb || (data.tested_limb !== "left" && data.tested_limb !== "right")) {
    return {
      valid: false,
      error: "Неможливо зберегти протокол: обов'язково оберіть травмовану кінцівку (ліва або права).",
    };
  }
  if (!data.injury_type || !data.injury_type.trim()) {
    return {
      valid: false,
      error: "Неможливо зберегти протокол: обов'язково оберіть тип травми.",
    };
  }
  return { valid: true };
}
