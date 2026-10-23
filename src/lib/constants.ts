export * from "./dictionaries.ts";

export const DOMINANT_UA = DOMINANT_SIDE_UA;

export const POSITION_LABELS: Record<string, string> = {
  GK: "ВР", CB: "ЦЗ", LB: "ЛЗ", RB: "ПЗ", CDM: "ОП", CM: "ЦП", CAM: "ЦАП", LW: "ЛВ", RW: "ПВ", ST: "НП", CF: "НП",
  ВР: "ВР", ЦЗ: "ЦЗ", ЛЗ: "ЛЗ", ПЗ: "ПЗ", ОП: "ОП", ЦОП: "ОП", ЦП: "ЦП", ЦАП: "ЦАП", ЛВ: "ЛВ", ПВ: "ПВ", НП: "НП", ЦН: "НП"
};

export const POSITION_FULL: Record<string, string> = {
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
  GK: "Воротар",
  CB: "Центральний захисник",
  LB: "Лівий захисник",
  RB: "Правий захисник",
  CDM: "Опорний півзахисник",
  CM: "Центральний півзахисник",
  CAM: "Атакуючий півзахисник",
  LW: "Лівий вінгер",
  RW: "Правий вінгер",
  ST: "Нападник",
  CF: "Центральний нападник"
};

export const LOG_CATEGORY_ICONS: Record<string, string> = {
  examination: "🩺",
  investigation: "📋",
  prescription: "💊",
  procedure: "⚕️",
  note: "📝"
};

export const REHAB_TEMPLATE = [
  "Спокій / іммобілізація",
  "Ізометричні вправи",
  "Концентричні вправи",
  "Ексцентричні вправи",
  "Бігова робота",
  "Робота з м'ячем",
  "Загальна група"
];

export const VAS_ALERT_THRESHOLD = 7;
export const URGENT_CASE_WARNING =
  "Ця форма не для термінових випадків. Якщо сильний біль, онімінння, швидкий набряк або не можеш спиратись на ногу, одразу скажи тренеру або лікарю.";

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

