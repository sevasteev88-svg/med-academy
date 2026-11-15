export type ClearanceStatus = "cleared" | "provisional" | "disqualified";

export type EcgRestResult = "normal" | "borderline" | "abnormal" | "not_done";
export type EchoResult = "normal" | "abnormal" | "not_done";
export type ThomasTestResult = "normal" | "tight" | "not_done";

export type PreSeasonScreening = {
  id: string;
  player_id: string;
  season: string; // e.g., "2026/2027"
  date: string;
  examiner_doctor: string;

  // 1. Кардіологічний допуск
  cardio_ecg_rest: EcgRestResult;
  cardio_echo: EchoResult;
  cardio_bp_systolic: number | null; // e.g. 115
  cardio_bp_diastolic: number | null; // e.g. 75
  cardio_hr_rest: number | null; // e.g. 60
  cardio_clearance: boolean;
  cardio_interpreter_doctor?: string | null; // П.І.Б. лікаря, що інтерпретував ЕКГ/ЕхоКГ
  cardio_conclusion_file_url?: string | null; // Data URL або посилання на файл висновку
  cardio_conclusion_file_name?: string | null;

  // 2. Ортопедо-біомеханічний скринінг
  ortho_thomas_test_left: ThomasTestResult; // Згиначі стегна
  ortho_thomas_test_right: ThomasTestResult;
  ortho_hamstrings_90_90_left: number | null; // Кут дефіциту (градуси), напр. 15
  ortho_hamstrings_90_90_right: number | null;
  ortho_ankle_lunge_wblt_left: number | null; // Дорсифлексія (см від стіни), норма >= 10 см
  ortho_ankle_lunge_wblt_right: number | null;
  ortho_beighton_hypermobility_score: number | null; // 0-9 шкала Бейтона
  ortho_previous_surgeries: string | null;

  // 3. Лабораторний профіль
  lab_hemoglobin: number | null; // г/л
  lab_ferritin: number | null; // нг/мл (запас заліза)
  lab_vitamin_d: number | null; // нг/мл

  // 4. Фінальний вердикт
  overall_status: ClearanceStatus;
  restrictions_notes: string | null;
  valid_until: string;
  created_at: string;
};

export const CLEARANCE_STATUS_META: Record<
  ClearanceStatus,
  { label: string; badgeClass: string; icon: string }
> = {
  cleared: {
    label: "Допущений до змагань (Повний допуск)",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: "🟢",
  },
  provisional: {
    label: "Умовний допуск (Потребує контролю)",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: "🟡",
  },
  disqualified: {
    label: "Не допущений (Медичне відсторонення)",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: "🔴",
  },
};

export const ECG_STATUS_META: Record<
  EcgRestResult,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  normal: {
    label: "Норма (без аритмій та ішемії)",
    shortLabel: "Норма",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  borderline: {
    label: "Прикордонна (потребує контролю)",
    shortLabel: "Прикордонна",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  abnormal: {
    label: "Патологія (патологічні зміни)",
    shortLabel: "Патологія",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  not_done: {
    label: "Не обстежено",
    shortLabel: "Не обстежено",
    badgeClass: "bg-slate-700/40 text-slate-400 border-slate-600/40",
  },
};

/**
 * Розраховує футбольний сезон за датою (початок сезону — 1 липня).
 * Якщо дата 1 липня і пізніше -> YYYY/YYYY+1 (напр. 2026-07-05 -> 2026/2027)
 * Якщо дата до 1 липня -> YYYY-1/YYYY (напр. 2026-03-12 -> 2025/2026)
 */
export function calcFootballSeason(dateStr: string): string {
  if (!dateStr) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}/${startYear + 1}`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const year = new Date().getFullYear();
    return `${year}/${year + 1}`;
  }

  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const startYear = month >= 7 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

/**
 * Перевіряє, чи є скринінг чинним на задану дату (за замовчуванням — сьогодні).
 * Для повного допуску гравець повинен мати статус 'cleared' та строк дії >= referenceDate.
 */
export function isScreeningValid(
  screening: PreSeasonScreening | null | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!screening) return false;
  if (!screening.valid_until) return false;

  const validUntilDate = new Date(screening.valid_until);
  if (isNaN(validUntilDate.getTime())) return false;

  // Порівнюємо за початком дня
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  validUntilDate.setHours(23, 59, 59, 999);

  return validUntilDate >= today && screening.overall_status === "cleared";
}

/**
 * Фізіологічні діапазони для валідації скринінгу
 */
export const SCREENING_RANGES = {
  bpSystolic: { min: 60, max: 240, label: "АТ систолічний (60–240 мм рт. ст.)" },
  bpDiastolic: { min: 40, max: 140, label: "АТ діастолічний (40–140 мм рт. ст.)" },
  hrRest: { min: 35, max: 200, label: "Пульс спокою (35–200 уд/хв)" },
  wblt: { min: 0, max: 35, label: "WBLT гомілкостоп (0–35 см)" },
  hamstrings: { min: 0, max: 90, label: "Кут дефіциту Hamstrings (0–90°)" },
  beighton: { min: 0, max: 9, label: "Шкала Бейтона (0–9)" },
  hemoglobin: { min: 50, max: 220, label: "Гемоглобін (50–220 г/л)" },
  ferritin: { min: 1, max: 1500, label: "Феритин (1–1500 нг/мл)" },
  vitaminD: { min: 1, max: 250, label: "Вітамін D (1–250 нг/мл)" },
};

export interface ScreeningBaselineComparison {
  hasBaseline: boolean;
  baselineDate: string;
  baselineSeason: string;
  latestDate: string;
  latestSeason: string;
  wbltLeftDelta: number | null;
  wbltRightDelta: number | null;
  wbltAsymmetryLatest: number | null;
  wbltAsymmetryBaseline: number | null;
  hamstringsLeftDelta: number | null;
  hamstringsRightDelta: number | null;
  hamstringsAsymmetryLatest: number | null;
  hamstringsAsymmetryBaseline: number | null;
  hasFlexibilityDecline: boolean;
  hasAsymmetryWorsening: boolean;
  phvClinicalAlert: string | null;
  phvRecommendation: string | null;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function calcDiff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return round1(a - b);
}

function calcAbsDiff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return round1(Math.abs(a - b));
}

/**
 * Порівнює останній скринінг із передсезонним бейзлайном цього ж гравця
 * та формує клінічний алерт при фазі PHV + погіршенні гнучкості/асиметрії.
 */
export function compareScreeningWithBaseline(
  latest: PreSeasonScreening,
  baseline: PreSeasonScreening | null | undefined,
  growthPhase?: "pre_phv" | "phv" | "post_phv" | null
): ScreeningBaselineComparison {
  const hasBaseline = Boolean(baseline && baseline.id !== latest.id);
  const base = hasBaseline ? baseline! : latest;

  const wbltLeftDelta = hasBaseline
    ? calcDiff(latest.ortho_ankle_lunge_wblt_left, base.ortho_ankle_lunge_wblt_left)
    : null;
  const wbltRightDelta = hasBaseline
    ? calcDiff(latest.ortho_ankle_lunge_wblt_right, base.ortho_ankle_lunge_wblt_right)
    : null;

  const wbltAsymmetryLatest = calcAbsDiff(
    latest.ortho_ankle_lunge_wblt_left,
    latest.ortho_ankle_lunge_wblt_right
  );
  const wbltAsymmetryBaseline = hasBaseline
    ? calcAbsDiff(base.ortho_ankle_lunge_wblt_left, base.ortho_ankle_lunge_wblt_right)
    : null;

  const hamstringsLeftDelta = hasBaseline
    ? calcDiff(latest.ortho_hamstrings_90_90_left, base.ortho_hamstrings_90_90_left)
    : null;
  const hamstringsRightDelta = hasBaseline
    ? calcDiff(latest.ortho_hamstrings_90_90_right, base.ortho_hamstrings_90_90_right)
    : null;

  const hamstringsAsymmetryLatest = calcAbsDiff(
    latest.ortho_hamstrings_90_90_left,
    latest.ortho_hamstrings_90_90_right
  );
  const hamstringsAsymmetryBaseline = hasBaseline
    ? calcAbsDiff(base.ortho_hamstrings_90_90_left, base.ortho_hamstrings_90_90_right)
    : null;

  // Погіршення гнучкості: зменшення WBLT >= 1.0 см або збільшення дефіциту hamstrings >= 5°
  const wbltDeclined =
    (wbltLeftDelta != null && wbltLeftDelta <= -1.0) ||
    (wbltRightDelta != null && wbltRightDelta <= -1.0) ||
    (latest.ortho_ankle_lunge_wblt_left != null && latest.ortho_ankle_lunge_wblt_left < 10) ||
    (latest.ortho_ankle_lunge_wblt_right != null && latest.ortho_ankle_lunge_wblt_right < 10);

  const hamstringsDeclined =
    (hamstringsLeftDelta != null && hamstringsLeftDelta >= 5) ||
    (hamstringsRightDelta != null && hamstringsRightDelta >= 5) ||
    (latest.ortho_hamstrings_90_90_left != null && latest.ortho_hamstrings_90_90_left > 20) ||
    (latest.ortho_hamstrings_90_90_right != null && latest.ortho_hamstrings_90_90_right > 20);

  const hasFlexibilityDecline = wbltDeclined || hamstringsDeclined;

  // Погіршення асиметрії: >= 2.0 см (WBLT) або >= 5° (Hamstrings)
  const wbltAsymWorse =
    wbltAsymmetryLatest != null &&
    wbltAsymmetryLatest >= 2.0 &&
    (wbltAsymmetryBaseline == null || wbltAsymmetryLatest > wbltAsymmetryBaseline);

  const hamstringsAsymWorse =
    hamstringsAsymmetryLatest != null &&
    hamstringsAsymmetryLatest >= 5 &&
    (hamstringsAsymmetryBaseline == null ||
      hamstringsAsymmetryLatest > hamstringsAsymmetryBaseline);

  const hasAsymmetryWorsening = wbltAsymWorse || hamstringsAsymWorse;

  let phvClinicalAlert: string | null = null;
  let phvRecommendation: string | null = null;

  if (growthPhase === "phv" && (hasFlexibilityDecline || hasAsymmetryWorsening)) {
    phvClinicalAlert =
      "Клінічний алерт (PHV + Скринінг): гравець у піковій фазі стрибка росту має зниження гнучкості або зростання асиметрії порівняно з передсезонним бейзлайном.";
    phvRecommendation =
      "Рекомендація: знизити обсяг пліометрики та максимальних спринтів на 20–30%, додати щоденну мобілізацію гомілкостопа (WBLT) та контроль хамстрінгів.";
  }

  return {
    hasBaseline,
    baselineDate: base.date,
    baselineSeason: base.season,
    latestDate: latest.date,
    latestSeason: latest.season,
    wbltLeftDelta,
    wbltRightDelta,
    wbltAsymmetryLatest,
    wbltAsymmetryBaseline,
    hamstringsLeftDelta,
    hamstringsRightDelta,
    hamstringsAsymmetryLatest,
    hamstringsAsymmetryBaseline,
    hasFlexibilityDecline,
    hasAsymmetryWorsening,
    phvClinicalAlert,
    phvRecommendation,
  };
}

export interface PreSeasonHealthyLimbReference {
  baselineDate: string;
  baselineSeason: string;
  healthySide: "left" | "right";
  wbltCm: number | null;
  hamstringsDeg: number | null;
  thomasTest: ThomasTestResult;
}

/**
 * Повертає передсезонні показники здорової (нетравмованої) ноги як додатковий орієнтир для RTP/LSI.
 */
export function getPreSeasonHealthyLimbReference(
  screenings: PreSeasonScreening[],
  injuredSide?: "left" | "right" | "bilateral"
): PreSeasonHealthyLimbReference | null {
  if (!screenings || screenings.length === 0) return null;
  // Найдавніший скринінг у списку (відсортовано від новіших до старіших) — передсезонний бейзлайн
  const sorted = [...screenings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const baseline = sorted[0];

  const healthySide: "left" | "right" =
    injuredSide === "left" ? "right" : injuredSide === "right" ? "left" : "right";

  const wbltCm =
    healthySide === "left"
      ? baseline.ortho_ankle_lunge_wblt_left
      : baseline.ortho_ankle_lunge_wblt_right;
  const hamstringsDeg =
    healthySide === "left"
      ? baseline.ortho_hamstrings_90_90_left
      : baseline.ortho_hamstrings_90_90_right;
  const thomasTest =
    healthySide === "left"
      ? baseline.ortho_thomas_test_left
      : baseline.ortho_thomas_test_right;

  if (wbltCm == null && hamstringsDeg == null && thomasTest === "not_done") {
    return null;
  }

  return {
    baselineDate: baseline.date,
    baselineSeason: baseline.season,
    healthySide,
    wbltCm,
    hamstringsDeg,
    thomasTest,
  };
}
