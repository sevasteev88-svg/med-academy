/**
 * dictionaries.ts — Єдиний центр словників та перекладів медичної системи MedAcademy
 *
 * Призначення:
 * 1. Гарантувати, що жодне сире enum-значення англійською (muscular, thigh, active тощо)
 *    ніколи не відображається в інтерфейсі користувача.
 * 2. Єдиний стандарт футбольних позицій українською (ВР, ЦЗ, ЛЗ, ПЗ, ОП, ЦП, ЦАП, ЛВ, ПВ, НП).
 * 3. Безпечні функції форматування з фолбеком на зрозумілий український текст.
 */

// ════════════════════════════════════════════════════════════════════
//  1. ФУТБОЛЬНІ ПОЗИЦІЇ (Єдиний довідник)
// ════════════════════════════════════════════════════════════════════

export const CANONICAL_POSITIONS = [
  "ВР",  // Воротар
  "ЦЗ",  // Центральний захисник
  "ЛЗ",  // Лівий захисник
  "ПЗ",  // Правий захисник
  "ОП",  // Опорний півзахисник
  "ЦП",  // Центральний півзахисник
  "ЦАП", // Центральний атакуючий півзахисник
  "ЛВ",  // Лівий вінгер
  "ПВ",  // Правий вінгер
  "НП",  // Нападник
] as const;

export type CanonicalPosition = (typeof CANONICAL_POSITIONS)[number];

export const POSITION_FULL_UA: Record<string, string> = {
  ВР: "Воротар",
  ЦЗ: "Центральний захисник",
  ЛЗ: "Лівий захисник",
  ПЗ: "Правий захисник",
  ОП: "Опорний півзахисник",
  ЦОП: "Опорний півзахисник",
  ЦП: "Центральний півзахисник",
  ЦАП: "Центральний атакуючий півзахисник",
  ЛВ: "Лівий вінгер",
  ПВ: "Правий вінгер",
  НП: "Нападник",
  ЦН: "Центральний нападник",

  // Англійські еквіваленти для безпечного мапінгу
  GK: "Воротар",
  CB: "Центральний захисник",
  LB: "Лівий захисник",
  RB: "Правий захисник",
  CDM: "Опорний півзахисник",
  CM: "Центральний півзахисник",
  CAM: "Центральний атакуючий півзахисник",
  LW: "Лівий вінгер",
  RW: "Правий вінгер",
  ST: "Нападник",
  CF: "Центральний нападник",
};

/**
 * Нормалізація позиції у канонічний український код (ВР, ЦЗ, ЛЗ, ПЗ, ОП, ЦП, ЦАП, ЛВ, ПВ, НП).
 */
export function normalizePosition(raw?: string | null): CanonicalPosition | string {
  if (!raw) return "—";
  const trimmed = raw.trim().toUpperCase();

  const map: Record<string, CanonicalPosition> = {
    // Англійські коди
    GK: "ВР",
    CB: "ЦЗ",
    LB: "ЛЗ",
    RB: "ПЗ",
    CDM: "ОП",
    DM: "ОП",
    CM: "ЦП",
    CAM: "ЦАП",
    AM: "ЦАП",
    LW: "ЛВ",
    RW: "ПВ",
    ST: "НП",
    CF: "НП",

    // Українські варіанти та синоніми
    ВР: "ВР",
    ВОРОТАР: "ВР",
    ЦЗ: "ЦЗ",
    ЗХ: "ЦЗ",
    ЛЗ: "ЛЗ",
    ПЗ: "ПЗ",
    ПРЗ: "ПЗ",
    ОП: "ОП",
    ЦОП: "ОП",
    ЦПЗ: "ОП",
    ЦП: "ЦП",
    ЦАП: "ЦАП",
    АПЗ: "ЦАП",
    ЛВ: "ЛВ",
    ПВ: "ПВ",
    НП: "НП",
    ЦН: "НП",
    ФОРВАРД: "НП",
    НАПАДНИК: "НП",
  };

  return map[trimmed] ?? trimmed;
}

/**
 * Безпечне виведення скорочення позиції (завжди українською)
 */
export function formatPosition(pos?: string | null): string {
  if (!pos) return "—";
  const norm = normalizePosition(pos);
  return norm || "—";
}

/**
 * Повна розшифрована назва позиції українською
 */
export function formatPositionFull(pos?: string | null): string {
  if (!pos) return "—";
  const norm = normalizePosition(pos);
  return POSITION_FULL_UA[norm] ?? POSITION_FULL_UA[pos.trim().toUpperCase()] ?? norm;
}

// ════════════════════════════════════════════════════════════════════
//  2. ТРАВМИ ТА АНАТОМІЧНА ЛОКАЛІЗАЦІЯ
// ════════════════════════════════════════════════════════════════════

export const INJURY_TYPE_UA: Record<string, string> = {
  muscular: "М'язова",
  muscle: "М'язова",
  ligament: "Зв'язки",
  bone: "Кісткова",
  cartilage: "Хрящова",
  tendon: "Сухожилля",
  concussion: "Струс мозку",
  contusion: "Забій",
  other: "Інше",
};

export const LOCATION_UA: Record<string, string> = {
  knee: "Коліно",
  ankle: "Гомілковостоп",
  thigh: "Стегно",
  calf: "Литка",
  foot: "Стопа",
  groin: "Пах",
  shoulder: "Плече",
  elbow: "Лікоть",
  wrist: "Кисть",
  spine: "Хребет",
  head: "Голова",
  hamstring: "Задня поверхня стегна",
  quadriceps: "Квадрицепс",
  adductor: "Привідний м'яз",
  back: "Спина",
  neck: "Шия",
  other: "Інше",
};

export const SIDE_UA: Record<string, string> = {
  left: "Ліва",
  right: "Права",
  bilateral: "Двостороння",
  both: "Обидві",
};

export const SEVERITY_UA: Record<string, string> = {
  minimal: "Мінімальна",
  mild: "Легка",
  moderate: "Середня",
  severe: "Тяжка",
  career_threatening: "Критична",
};

export const UEFA_SEVERITY_UA: Record<string, string> = {
  minimal: "Мінімальна (1–3 дні)",
  mild: "Легка (4–7 днів)",
  moderate: "Середня (8–28 днів)",
  severe: "Тяжка (>28 днів)",
};

export const ONSET_UA: Record<string, string> = {
  acute: "Гострий початок (Acute)",
  gradual: "Поступовий розвиток (Overuse/Gradual)",
  unknown: "Невідомо",
};

export const OCCURRENCE_UA: Record<string, string> = {
  new: "Нова травма (New injury)",
  recurrence: "Рецидив (Recurrence)",
  exacerbation: "Загострення (Exacerbation)",
  unknown: "Невідомо",
};

export const MECHANISM_UA: Record<string, string> = {
  contact: "Контактна",
  non_contact: "Безконтактна",
  overuse: "Перевантаження",
};

export const INJURY_STATUS_UA: Record<string, string> = {
  active: "Гостра фаза",
  rehabilitation: "Реабілітація",
  closed: "Закрита",
};

export const STATUS_UA = INJURY_STATUS_UA;

export const DOMINANT_SIDE_UA: Record<string, string> = {
  left: "Ліва",
  right: "Права",
  both: "Обидві",
};

// ════════════════════════════════════════════════════════════════════
//  3. ОБСТЕЖЕННЯ ТА КЛІНІЧНІ ШКАЛИ
// ════════════════════════════════════════════════════════════════════

export const EXAM_GRADE_UA: Record<string, string> = {
  none: "Відсутній",
  mild: "Незначний",
  moderate: "Помірний",
  severe: "Виражений",
};

export const ROM_GRADE_UA: Record<string, string> = {
  full: "Повний",
  slightly_limited: "Незначно обмежений",
  moderately_limited: "Помірно обмежений",
  severely_limited: "Значно обмежений",
};

export const MUSCLE_TONE_UA: Record<string, string> = {
  normal: "Нормальний",
  hypotonic: "Знижений",
  hypertonic: "Підвищений",
};

export const REHAB_STATUS_UA: Record<string, string> = {
  planned: "Заплановано",
  in_progress: "В процесі",
  completed: "Завершено",
  skipped: "Пропущено",
};

export const LOG_CATEGORY_UA: Record<string, string> = {
  examination: "Огляд",
  investigation: "Обстеження",
  prescription: "Призначення",
  procedure: "Процедура",
  note: "Примітка",
};

export const TEAM_CATEGORY_UA: Record<string, string> = {
  youth: "Молодіжка",
  academy: "Академія",
};

export const AVAILABILITY_STATUS_UA: Record<string, string> = {
  available: "Готовий до матчу",
  restricted: "Обмежений",
  unavailable: "Недоступний (лазарет)",
};

// ════════════════════════════════════════════════════════════════════
//  4. БЕЗПЕЧНІ ФОРМАТУВАЧІ (ГАРАНТІЯ ВІДСУТНОСТІ СИРИХ СТРІНГІВ)
// ════════════════════════════════════════════════════════════════════

export function formatInjuryType(type?: string | null): string {
  if (!type) return "—";
  return INJURY_TYPE_UA[type.toLowerCase()] ?? "Інше";
}

export function formatLocation(location?: string | null): string {
  if (!location) return "—";
  return LOCATION_UA[location.toLowerCase()] ?? "Інше";
}

export function formatSide(side?: string | null): string {
  if (!side) return "—";
  return SIDE_UA[side.toLowerCase()] ?? side;
}

export function formatSeverity(severity?: string | null): string {
  if (!severity) return "—";
  return SEVERITY_UA[severity.toLowerCase()] ?? "—";
}

export function formatMechanism(mechanism?: string | null): string {
  if (!mechanism) return "—";
  return MECHANISM_UA[mechanism.toLowerCase()] ?? "—";
}

export function formatInjuryStatus(status?: string | null): string {
  if (!status) return "—";
  return INJURY_STATUS_UA[status.toLowerCase()] ?? "—";
}

export function formatExamGrade(grade?: string | null): string {
  if (!grade) return "—";
  return EXAM_GRADE_UA[grade.toLowerCase()] ?? "—";
}

export function formatRomGrade(rom?: string | null): string {
  if (!rom) return "—";
  return ROM_GRADE_UA[rom.toLowerCase()] ?? "—";
}

export function formatMuscleTone(tone?: string | null): string {
  if (!tone) return "—";
  return MUSCLE_TONE_UA[tone.toLowerCase()] ?? "—";
}

export function formatRehabStatus(status?: string | null): string {
  if (!status) return "—";
  return REHAB_STATUS_UA[status.toLowerCase()] ?? "—";
}

export function formatLogCategory(cat?: string | null): string {
  if (!cat) return "Примітка";
  return LOG_CATEGORY_UA[cat.toLowerCase()] ?? "Примітка";
}

export function formatDominantSide(side?: string | null): string {
  if (!side) return "—";
  return DOMINANT_SIDE_UA[side.toLowerCase()] ?? "—";
}

export function formatTeamCategory(cat?: string | null): string {
  if (!cat) return "—";
  return TEAM_CATEGORY_UA[cat.toLowerCase()] ?? "—";
}
