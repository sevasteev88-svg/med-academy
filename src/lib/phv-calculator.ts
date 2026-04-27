/**
 * Мультиметодний калькулятор PHV (Peak Height Velocity)
 *
 * Реалізовані методи:
 *   1. Mirwald et al. (2002) — Med Sci Sports Exerc, 34(4), 689-694
 *      Потребує: вік, зріст, вагу, зріст сидячи
 *      SEE: 0.592р (хлопці), 0.569р (дівчата)
 *
 *   2. Moore et al. (2015) — Med Sci Sports Exerc, 47(8), 1755-1764
 *      Moore-1 (рекомендована): вік × зріст сидячи (хлопці) / вік × зріст (дівчата)
 *      Moore-2 (альтернативна): вік × зріст (тільки хлопці)
 *      SEE: 0.514р (Moore-1 хлопці), 0.528р (дівчата)
 *
 *   3. Fransen et al. (2018) — Pediatr Exerc Sci, 30(2), 296-307
 *      Maturity ratio (поліноміальне). Тільки хлопці.
 *      R² = 90.82%. Ще не валідований третьою стороною.
 *      СТАТУС: слот для підключення (потрібні коефіцієнти з оригінальної статті)
 *
 * Стратегія: рахуємо всіма доступними методами → виводимо consensus (середнє).
 * Лікар бачить діапазон оцінок, а не одну цифру.
 */

// ─── Типи ───────────────────────────────────────────────────

export type Sex = "male" | "female";
export type GrowthPhase = "pre_phv" | "phv" | "post_phv";
export type RiskZone = "green" | "yellow" | "red";

export type MethodName = "mirwald" | "moore1" | "moore2" | "fransen";

export type PhvInput = {
  dateOfBirth: string;
  sex: Sex;
  measurementDate: string;
  height: number; // см
  weight: number; // кг
  sittingHeight: number | null; // см (може бути null — тоді працює тільки Moore-2)
};

/** Результат одного методу */
export type MethodResult = {
  method: MethodName;
  offset: number; // Maturity offset (роки від PHV)
  estimatedPhvAge: number;
  see: number; // Standard Error of Estimate
};

/** Повний результат мультиметодної оцінки */
export type PhvResult = {
  ageAtMeasurement: number;
  legLength: number | null;

  /** Результати кожного застосованого методу */
  methods: MethodResult[];

  /** Консенсусна оцінка (середнє) */
  consensusOffset: number;
  consensusPhvAge: number;

  /** Фаза росту (на основі consensus) */
  growthPhase: GrowthPhase;

  /** Ризик */
  riskZone: RiskZone;
  riskFactors: string[];
};

// ─── Утиліти ────────────────────────────────────────────────

/** Десятковий вік */
export function calcDecimalAge(dob: string, date: string): number {
  const d1 = new Date(dob);
  const d2 = new Date(date);
  const days = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round((days / 365.25) * 100) / 100;
}

/** Швидкість росту (см/рік) */
export function calcHeightVelocity(
  prevH: number,
  prevDate: string,
  currH: number,
  currDate: string
): number {
  const days =
    (new Date(currDate).getTime() - new Date(prevDate).getTime()) /
    (1000 * 60 * 60 * 24);
  if (days <= 0) return 0;
  return Math.round(((currH - prevH) / (days / 365.25)) * 10) / 10;
}

/** Швидкість зміни ваги (кг/рік) */
export function calcWeightVelocity(
  prevW: number,
  prevDate: string,
  currW: number,
  currDate: string
): number {
  const days =
    (new Date(currDate).getTime() - new Date(prevDate).getTime()) /
    (1000 * 60 * 60 * 24);
  if (days <= 0) return 0;
  return Math.round(((currW - prevW) / (days / 365.25)) * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Метод 1: Mirwald et al. (2002) ────────────────────────
//
// ХЛОПЦІ:
// Offset = −9.236
//   + 0.0002708 × (LegLength × SittingHeight)
//   − 0.001663  × (Age × LegLength)
//   + 0.007216  × (Age × SittingHeight)
//   + 0.02292   × (Weight/Height × 100)
//
// ДІВЧАТА:
// Offset = −9.376
//   + 0.0001882 × (LegLength × SittingHeight)
//   + 0.0022    × (Age × LegLength)
//   + 0.005841  × (Age × SittingHeight)
//   − 0.002658  × (Age × Weight)
//   + 0.07693   × (Weight/Height × 100)

function mirwald(
  sex: Sex,
  age: number,
  height: number,
  weight: number,
  sittingHeight: number
): MethodResult | null {
  const legLength = height - sittingHeight;
  const whr = (weight / height) * 100;
  let offset: number;

  if (sex === "male") {
    offset =
      -9.236 +
      0.0002708 * (legLength * sittingHeight) -
      0.001663 * (age * legLength) +
      0.007216 * (age * sittingHeight) +
      0.02292 * whr;
  } else {
    offset =
      -9.376 +
      0.0001882 * (legLength * sittingHeight) +
      0.0022 * (age * legLength) +
      0.005841 * (age * sittingHeight) -
      0.002658 * (age * weight) +
      0.07693 * whr;
  }

  return {
    method: "mirwald",
    offset: round2(offset),
    estimatedPhvAge: round2(age - offset),
    see: sex === "male" ? 0.592 : 0.569,
  };
}

// ─── Метод 2: Moore et al. (2015) ──────────────────────────
//
// Moore-1 (рекомендована):
//   Хлопці: Offset = −8.128741 + (0.0070346 × Age × SittingHeight)
//   Дівчата: Offset = −7.709133 + (0.0042232 × Age × Stature)
//
// Moore-2 (альтернативна, тільки хлопці):
//   Offset = −7.999994 + (0.0036124 × Age × Stature)

function moore1(
  sex: Sex,
  age: number,
  height: number,
  sittingHeight: number | null
): MethodResult | null {
  if (sex === "male") {
    if (sittingHeight == null) return null;
    const offset = -8.128741 + 0.0070346 * age * sittingHeight;
    return {
      method: "moore1",
      offset: round2(offset),
      estimatedPhvAge: round2(age - offset),
      see: 0.514,
    };
  } else {
    // Дівчата: використовує зріст, не sitting height
    const offset = -7.709133 + 0.0042232 * age * height;
    return {
      method: "moore1",
      offset: round2(offset),
      estimatedPhvAge: round2(age - offset),
      see: 0.528,
    };
  }
}

function moore2(sex: Sex, age: number, height: number): MethodResult | null {
  // Moore-2 тільки для хлопців
  if (sex !== "male") return null;
  const offset = -7.999994 + 0.0036124 * age * height;
  return {
    method: "moore2",
    offset: round2(offset),
    estimatedPhvAge: round2(age - offset),
    see: 0.542,
  };
}

// ─── Метод 3: Fransen et al. (2018) — СЛОТ ─────────────────
//
// Поліноміальне рівняння для maturity ratio (тільки хлопці).
// Предиктори: CA, height, weight, leg_length.
// APHV = CA / maturity_ratio
//
// Коефіцієнти з оригінальної статті (Pediatr Exerc Sci, 30(2), 296-307).
// Стаття за пейволом — коли матимете доступ, вставте коефіцієнти нижче.
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _fransen(
  _age: number,
  _height: number,
  _weight: number,
  _legLength: number
): MethodResult | null {
  // TODO: вставити коефіцієнти з Fransen et al. (2018) Table 3
  // Формула: maturityRatio = polynomial(age, height, weight, legLength)
  // APHV = age / maturityRatio
  // offset = age - APHV
  //
  // Коли додасте:
  // 1. Розкоментуйте виклик у calculatePhv()
  // 2. Додайте "fransen" до масиву methods
  return null;
}

// ─── Визначення фази та ризику ──────────────────────────────

function determinePhase(offset: number): GrowthPhase {
  if (offset < -0.5) return "pre_phv";
  if (offset > 0.5) return "post_phv";
  return "phv";
}

function assessRisk(
  phase: GrowthPhase,
  offset: number,
  heightVelocity?: number
): { zone: RiskZone; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  if (phase === "phv") {
    score += 3;
    factors.push("Фаза PHV — максимальна вразливість зон росту та апофізів");
    factors.push(
      "Підвищений ризик: Osgood-Schlatter, Sever, відривні переломи, Sinding-Larsen-Johansson"
    );
  } else if (phase === "pre_phv" && offset > -1.0) {
    score += 2;
    factors.push("Наближення до PHV (< 1 року) — зростаюча вразливість");
  } else if (phase === "post_phv" && offset < 1.5) {
    score += 1;
    factors.push("Рання post-PHV — кісткова тканина ще адаптується");
    factors.push("Підвищений ризик: стресові переломи, тендинопатії, ACL");
  }

  if (heightVelocity !== undefined) {
    if (heightVelocity > 10) {
      score += 2;
      factors.push(
        `Дуже висока швидкість росту: ${heightVelocity} см/рік (норма < 8)`
      );
    } else if (heightVelocity > 8) {
      score += 1;
      factors.push(`Підвищена швидкість росту: ${heightVelocity} см/рік`);
    }
  }

  let zone: RiskZone = "green";
  if (score >= 4) zone = "red";
  else if (score >= 2) zone = "yellow";

  if (factors.length === 0) {
    factors.push("Стандартний моніторинг — низький ризик");
  }

  return { zone, factors };
}

// ─── Головна функція ────────────────────────────────────────

export function calculatePhv(
  input: PhvInput,
  heightVelocity?: number
): PhvResult {
  const age = calcDecimalAge(input.dateOfBirth, input.measurementDate);
  const legLength =
    input.sittingHeight != null ? input.height - input.sittingHeight : null;

  // Збираємо результати всіх доступних методів
  const methods: MethodResult[] = [];

  // Mirwald: потребує sitting_height
  if (input.sittingHeight != null) {
    const m = mirwald(
      input.sex,
      age,
      input.height,
      input.weight,
      input.sittingHeight
    );
    if (m) methods.push(m);
  }

  // Moore-1: потребує sitting_height (хлопці) або height (дівчата)
  const m1 = moore1(input.sex, age, input.height, input.sittingHeight);
  if (m1) methods.push(m1);

  // Moore-2: тільки хлопці, потребує тільки height (завжди доступний)
  const m2 = moore2(input.sex, age, input.height);
  if (m2) methods.push(m2);

  // Fransen: слот (розкоментувати коли будуть коефіцієнти)
  // if (input.sex === "male" && legLength != null) {
  //   const f = fransen(age, input.height, input.weight, legLength);
  //   if (f) methods.push(f);
  // }

  // Consensus: зважене середнє (SEE як інверсна вага)
  let consensusOffset: number;
  let consensusPhvAge: number;

  if (methods.length === 0) {
    // Немає жодного методу — fallback
    consensusOffset = 0;
    consensusPhvAge = age;
  } else if (methods.length === 1) {
    consensusOffset = methods[0].offset;
    consensusPhvAge = methods[0].estimatedPhvAge;
  } else {
    // Зважене середнє: менша SEE → більша вага
    const totalInvSee = methods.reduce((s, m) => s + 1 / m.see, 0);
    consensusOffset = round2(
      methods.reduce((s, m) => s + (m.offset * (1 / m.see)) / totalInvSee, 0)
    );
    consensusPhvAge = round2(age - consensusOffset);
  }

  const growthPhase = determinePhase(consensusOffset);
  const { zone, factors } = assessRisk(
    growthPhase,
    consensusOffset,
    heightVelocity
  );

  return {
    ageAtMeasurement: age,
    legLength,
    methods,
    consensusOffset,
    consensusPhvAge,
    growthPhase,
    riskZone: zone,
    riskFactors: factors,
  };
}

// ─── Константи для UI ───────────────────────────────────────

export const GROWTH_PHASE_LABELS: Record<GrowthPhase, string> = {
  pre_phv: "Pre-PHV",
  phv: "PHV (Пік росту)",
  post_phv: "Post-PHV",
};

export const RISK_ZONE_LABELS: Record<RiskZone, string> = {
  green: "Зелена",
  yellow: "Жовта",
  red: "Червона",
};

export const METHOD_LABELS: Record<MethodName, string> = {
  mirwald: "Mirwald (2002)",
  moore1: "Moore-1 (2015)",
  moore2: "Moore-2 (2015)",
  fransen: "Fransen (2018)",
};

export const METHOD_DESCRIPTIONS: Record<MethodName, string> = {
  mirwald: "Вік, зріст, вага, зріст сидячи · SEE 0.59р",
  moore1: "Вік × зріст сидячи (хл.) / вік × зріст (дів.) · SEE 0.51-0.53р",
  moore2: "Вік × зріст (тільки хлопці) · SEE 0.54р",
  fransen: "Maturity ratio, поліноміальна (тільки хлопці) · R² 90.8%",
};

/** Типові юнацькі патології по фазах */
export const PHASE_TYPICAL_INJURIES: Record<GrowthPhase, string[]> = {
  pre_phv: [
    "Хвороба Сівера (апофізит п'ятки)",
    "Хвороба Ісленда (апофізит V плюсневої)",
    "Тракційні апофізити",
  ],
  phv: [
    "Хвороба Осгуда-Шлаттера (горбистість великогомілкової)",
    "Синдром Сіндінга-Ларсена-Йогансона",
    "Хвороба Сівера (апофізит п'ятки)",
    "Відривні переломи апофізів (ASIS, AIIS, ischium)",
    "Стресові переломи зон росту",
  ],
  post_phv: [
    "Стресові переломи (метатарзальні, великогомілкові)",
    "Тендинопатії (пателярна, ахіллова)",
    "Травми ПКС (пік ризику 14-17 років)",
    "М'язові травми при швидкому наборі маси",
  ],
};

/** Рекомендований діапазон вимірів для кожного методу */
export const METHOD_AGE_RANGES: Record<MethodName, { min: number; max: number }> = {
  mirwald: { min: 8, max: 18 },
  moore1: { min: 8, max: 18 },
  moore2: { min: 8, max: 18 },
  fransen: { min: 8, max: 18 },
};

/** Рекомендовані вікові рамки для найточніших результатів */
export const RECOMMENDED_AGE_RANGE = {
  male: { min: 12, max: 16 },
  female: { min: 10, max: 14 },
};
