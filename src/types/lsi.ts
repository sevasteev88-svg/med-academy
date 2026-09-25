export type LsiTestType =
  | "single_leg_hop" // Одиночний стрибок на дальність (см)
  | "triple_hop" // Потрійний стрибок на дальність (см)
  | "crossover_hop" // Перехресний потрійний стрибок (см)
  | "timed_hop_6m" // Стрибок на 6 метрів на швидкість (сек)
  | "y_balance_composite" // Y-Balance тест (композитний бал %)
  | "quadriceps_dynamometry" // Сила квадріцепса розгинання (HHD, Н або кг)
  | "hamstring_dynamometry" // Сила задньої поверхні стегна (HHD, Н або кг)
  | "adductor_squeeze"; // Сила зведення аддукторів (сфігмоманометр / HHD, мм рт. ст.)

export type LsiAssessmentStatus = "cleared" | "conditional" | "high_risk";

export interface LsiTestItemResult {
  test_type: LsiTestType;
  test_name: string;
  injured_limb_value: number; // Показник травмованої/оперованої кінцівки
  uninjured_limb_value: number; // Показник здорової кінцівки
  unit: string; // "см", "кг", "Н", "%", "с"
  lsi_percent: number; // (Injured / Uninjured) * 100%
  deficit_percent: number; // 100 - LSI %
  passed: boolean; // >= 90% для стрибків та сили (FIFA Medical consensus)
}

export interface LsiAssessmentRecord {
  id: string;
  player_id: string;
  injury_id?: string | null;
  date: string;
  tested_limb: "left" | "right";
  evaluator_name: string;
  phase_clearance: string; // Напр., "Фаза 4 -> Фаза 5 (Match Fitness)"
  tests: LsiTestItemResult[];
  overall_lsi_percent: number; // Середній LSI індекс по батареї тестів
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
    benchmark: "LSI ≥ 90% (Швидкість / пружна потужність)",
  },
  y_balance_composite: {
    name: "Y-Balance тест (Динамічний баланс)",
    unit: "%",
    description: "Дотягування вільною ногою в Anterior, Posteromedial, Posterolateral напрямках.",
    benchmark: "Композитна симетрія > 95%, Anterior дефіцит < 4 см",
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
    benchmark: "Симетрія та відсутність пахового болю (0/10)",
  },
};

/**
 * Розраховує LSI для конкретного тесту
 */
export function calculateLsiScore(injured: number, uninjured: number, isTimed: boolean = false): {
  lsi: number;
  deficit: number;
  passed: boolean;
} {
  if (uninjured <= 0 || injured <= 0) {
    return { lsi: 0, deficit: 100, passed: false };
  }

  // Якщо тест на час (менше = краще, наприклад timed_hop_6m)
  if (isTimed) {
    const lsi = Math.round((uninjured / injured) * 100 * 10) / 10;
    const deficit = Math.round((100 - lsi) * 10) / 10;
    return { lsi, deficit, passed: lsi >= 90 };
  }

  // Для сили та дальності (більше = краще)
  const lsi = Math.round((injured / uninjured) * 100 * 10) / 10;
  const deficit = Math.round((100 - lsi) * 10) / 10;
  return { lsi, deficit, passed: lsi >= 90 };
}
