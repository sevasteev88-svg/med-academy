/**
 * wada.ts — Типи та константи Забороненого списку WADA / НАДЦ
 */

export type WadaClass =
  | "S1" // Анаболічні агенти
  | "S2" // Пептидні гормони, фактори росту
  | "S3" // Бета-2 агоністи
  | "S4" // Гормональні та метаболічні модулятори
  | "S5" // Діуретики та маскуючі агенти
  | "S6" // Стимулятори
  | "S7" // Наркотики
  | "S8" // Канабіноїди
  | "S9" // Глюкокортикоїди
  | "P1" // Бета-блокатори
  | "M1_M3"; // Заборонені методи

export const WADA_CLASS_INFO: Record<
  WadaClass,
  { code: string; name_uk: string; defaultScope: "always" | "in_competition"; description: string }
> = {
  S1: {
    code: "S1",
    name_uk: "Анаболічні агенти",
    defaultScope: "always",
    description: "Стероїди та інші анаболічні субстанції (заборонені постійно)",
  },
  S2: {
    code: "S2",
    name_uk: "Пептидні гормони та фактори росту",
    defaultScope: "always",
    description: "ЕПО, гормон росту (GH), фактори росту (заборонені постійно)",
  },
  S3: {
    code: "S3",
    name_uk: "Бета-2 агоністи",
    defaultScope: "always",
    description: "Бронхолітики (сальбутамол, формотерол з пороговими винятками)",
  },
  S4: {
    code: "S4",
    name_uk: "Гормональні та метаболічні модулятори",
    defaultScope: "always",
    description: "Мельдоній, інсулін, модулятори естрогену, AMPK активатори",
  },
  S5: {
    code: "S5",
    name_uk: "Діуретики та маскуючі агенти",
    defaultScope: "always",
    description: "Сечогінні препарати (фуросемід, спіронолактон) та плазмозамінники",
  },
  S6: {
    code: "S6",
    name_uk: "Стимулятори",
    defaultScope: "in_competition",
    description: "Псевдоефедрин, амфетаміни, кокаїн (заборонені у змагальний період)",
  },
  S7: {
    code: "S7",
    name_uk: "Наркотики",
    defaultScope: "in_competition",
    description: "Опіоїдні анальгетики (морфін, оксикодон, фентаніл, трамадол)",
  },
  S8: {
    code: "S8",
    name_uk: "Канабіноїди",
    defaultScope: "in_competition",
    description: "ТГК та синтетичні канабіноїди (крім CBD / канабідіолу)",
  },
  S9: {
    code: "S9",
    name_uk: "Глюкокортикоїди",
    defaultScope: "in_competition",
    description: "Системні та ін'єкційні кортикостероїди (дексаметазон, дипроспан)",
  },
  P1: {
    code: "P1",
    name_uk: "Бета-блокатори",
    defaultScope: "in_competition",
    description: "Препарати для зниження тиску/пульсу в окремих видах спорту",
  },
  M1_M3: {
    code: "M1-M3",
    name_uk: "Заборонені методи",
    defaultScope: "always",
    description: "Маніпуляції з кров'ю, внутрішньовенні інфузії > 100 мл за 12 год",
  },
};

export type WadaProhibitionScope = "always" | "in_competition" | "conditional";

export type WadaVerificationStatus =
  | "prohibited_always" // 🔴 Заборонено завжди (In- & Out-of-competition)
  | "prohibited_in_competition" // 🟠 Заборонено лише в змагальний період
  | "conditional_permitted" // 🟡 Дозволено з пороговим обмеженням / конкретним шляхом введення
  | "permitted"; // 🟢 Дозволено (не заборонено WADA)

export type WadaSubstanceRecord = {
  id: string;
  name_uk: string;
  name_en: string;
  brand_names_ua: string[];
  wada_class: WadaClass;
  prohibition_scope: WadaProhibitionScope;
  threshold_details?: string;
  route_restrictions?: string;
  washout_period_hours?: number;
  requires_tue: boolean;
  tue_guidance: string;
  permitted_alternatives?: string[];
};

export type WadaCheckResult = {
  found: boolean;
  query: string;
  matched_by: "substance_uk" | "substance_en" | "brand" | "none";
  matched_name?: string;
  record?: WadaSubstanceRecord;
  status: WadaVerificationStatus;
  status_label: string;
  status_color: "red" | "amber" | "yellow" | "green";
  status_badge: string;
  recommendation: string;
  requires_tue: boolean;
  suggested_action: "create_tue" | "specify_washout" | "check_threshold" | "safe";
};
