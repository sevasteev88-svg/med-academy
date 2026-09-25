export const POSITION_LABELS: Record<string, string> = { GK: "ВР", CB: "ЦЗ", LB: "ЛЗ", RB: "ПЗ", CDM: "ЦПЗ", CAM: "ЦАП", LW: "ЛВ", RW: "ПВ", ST: "НП", CF: "ЦН" };
export const POSITION_FULL: Record<string, string> = { GK: "Воротар", CB: "Центральний захисник", LB: "Лівий захисник", RB: "Правий захисник", CDM: "Опорний півзахисник", CAM: "Атакуючий півзахисник", LW: "Лівий вінгер", RW: "Правий вінгер", ST: "Нападник", CF: "Центральний нападник" };
export const LOCATION_UA: Record<string, string> = { knee: "Коліно", ankle: "Гомілковостоп", thigh: "Стегно", calf: "Литка", foot: "Стопа", groin: "Пах", shoulder: "Плече", elbow: "Лікоть", wrist: "Кисть", spine: "Хребет", head: "Голова", other: "Інше" };
export const INJURY_TYPE_UA: Record<string, string> = { muscular: "М'язова", ligament: "Зв'язки", bone: "Кісткова", cartilage: "Хрящова", tendon: "Сухожилля", concussion: "Струс мозку", contusion: "Забій", other: "Інше" };
export const SEVERITY_UA: Record<string, string> = { minimal: "Мінімальна", mild: "Легка", moderate: "Середня", severe: "Тяжка", career_threatening: "Критична" };
export const MECHANISM_UA: Record<string, string> = { contact: "Контактна", non_contact: "Безконтактна", overuse: "Перенавантаження" };
export const SIDE_UA: Record<string, string> = { left: "Ліва", right: "Права", bilateral: "Двостороння" };
export const STATUS_UA: Record<string, string> = { active: "Гостра", rehabilitation: "Реабілітація", closed: "Закрита" };
export const DOMINANT_UA: Record<string, string> = { left: "Ліва", right: "Права", both: "Обидві" };
export const TEAM_CATEGORY_UA: Record<string, string> = { youth: "Молодіжка", academy: "Академія" };
export const EXAM_GRADE_UA: Record<string, string> = { none: "Відсутній", mild: "Незначний", moderate: "Помірний", severe: "Виражений" };
export const ROM_GRADE_UA: Record<string, string> = { full: "Повний", slightly_limited: "Незначно обмежений", moderately_limited: "Помірно обмежений", severely_limited: "Значно обмежений" };
export const MUSCLE_TONE_UA: Record<string, string> = { normal: "Нормальний", hypotonic: "Знижений", hypertonic: "Підвищений" };
export const REHAB_STATUS_UA: Record<string, string> = { planned: "Заплановано", in_progress: "В процесі", completed: "Завершено", skipped: "Пропущено" };
export const LOG_CATEGORY_UA: Record<string, string> = { examination: "Огляд", investigation: "Обстеження", prescription: "Призначення", procedure: "Процедура", note: "Примітка" };
export const LOG_CATEGORY_ICONS: Record<string, string> = { examination: "🩺", investigation: "📋", prescription: "💊", procedure: "⚕️", note: "📝" };
export const REHAB_TEMPLATE = [ "Спокій / іммобілізація", "Ізометричні вправи", "Концентричні вправи", "Ексцентричні вправи", "Бігова робота", "Робота з м'ячем", "Загальна група" ];

// ── Общие форматтеры (DRY) ───────────────────────────────────────────────────
export function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function vasColor(vas: number | null | undefined): string {
  if (vas == null) return "text-slate-500";
  if (vas >= 7) return "text-red-400";
  if (vas >= 4) return "text-amber-400";
  return "text-green-400";
}

export function initials(p: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

export function fullNameShort(p: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  if (!p || !p.last_name) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

export function calcAge(dob: string): number {
  if (!dob) return 0;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
