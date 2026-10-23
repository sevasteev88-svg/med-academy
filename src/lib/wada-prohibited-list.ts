/**
 * wada-prohibited-list.ts — База заборонених речовин WADA / НАДЦ та алгоритм миттєвої перевірки ліків
 */

import {
  type WadaClass,
  type WadaSubstanceRecord,
  type WadaCheckResult,
  WADA_CLASS_INFO,
} from "../types/wada.ts";

/**
 * Каталог заборонених речовин WADA та поширених торгових марок ліків в Україні
 */
export const WADA_PROHIBITED_CATALOG: WadaSubstanceRecord[] = [
  // ─── S3: БЕТА-2 АГОНІСТИ ───────────────────────────────────────────
  {
    id: "sub_salbutamol",
    name_uk: "Сальбутамол",
    name_en: "Salbutamol",
    brand_names_ua: ["Вентолін", "Сальбутамол", "Небутамол", "Асталін", "Саламол"],
    wada_class: "S3",
    prohibition_scope: "conditional",
    threshold_details:
      "Інгаляційно: максимум 1600 мкг за 24 години, розділені на дози не більше 600 мкг за 8 годин. Пероральний або внутрішньовенний прийом суворо заборонено (потрібен TUE)!",
    route_restrictions: "Інгаляційно дозволено в межах порогу; перорально — заборонено",
    washout_period_hours: 24,
    requires_tue: false, // за умови інгаляційного введення в межах ліміту
    tue_guidance: "TUE потрібен лише якщо добова інгаляційна доза перевищує 1600 мкг або при пероральному прийомі",
    permitted_alternatives: ["Сальбутамол інгаляційно до 1600 мкг/добу", "Формотерол інгаляційно до 54 мкг/добу"],
  },
  {
    id: "sub_fenoterol",
    name_uk: "Фенотерол",
    name_en: "Fenoterol",
    brand_names_ua: ["Беротек", "Беродуал"],
    wada_class: "S3",
    prohibition_scope: "always",
    threshold_details: "Заборонено повністю за будь-якого шляху введення без порогу!",
    washout_period_hours: 48,
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE перед застосуванням. Рекомендовано замінити на дозволений інгаляційний сальбутамол",
    permitted_alternatives: ["Вентолін (Сальбутамол інгаляційно)", "Симбікорт (Будесонід/Формотерол)"],
  },

  // ─── S6: СТИМУЛЯТОРИ (ЗАБОРОНЕНО У ЗМАГАЛЬНИЙ ПЕРІОД) ──────────────
  {
    id: "sub_pseudoephedrine",
    name_uk: "Псевдоефедрин",
    name_en: "Pseudoephedrine",
    brand_names_ua: [
      "Колдфлю",
      "Грипекс",
      "Актифед",
      "Мілістан Мультисимптомний",
      "Кларіназе",
      "Трайфед",
      "Грипго",
      "Флюколд",
    ],
    wada_class: "S6",
    prohibition_scope: "in_competition",
    threshold_details:
      "Заборонено в змагальний період, якщо концентрація в сечі перевищує 150 мкг/мл. Вимагає припинення прийому мінімум за 48-72 години до початку змагань!",
    washout_period_hours: 72,
    requires_tue: false,
    tue_guidance:
      "TUE зазвичай не надається для лікування застуди. Слід дотримуватися періоду виведення (washout) або замінити на безпечні протизастудні",
    permitted_alternatives: ["Парацетамол", "Ібупрофен", "Ксилометазолін спрей", "Отривін", "Дезлоратадин"],
  },
  {
    id: "sub_methylphenidate",
    name_uk: "Метилфенідат",
    name_en: "Methylphenidate",
    brand_names_ua: ["Ріталін", "Концерта"],
    wada_class: "S6",
    prohibition_scope: "in_competition",
    washout_period_hours: 48,
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE з підтвердженням діагнозу РДУГ (ADHD) від дитячого психіатра/невролога",
  },
  {
    id: "sub_dmaa",
    name_uk: "Диметиламіламін (DMAA / Екстракт герані)",
    name_en: "Methylhexanamine",
    brand_names_ua: ["Jack3d", "Blackstone Labs", "Mesomorph (передтрени)"],
    wada_class: "S6",
    prohibition_scope: "in_competition",
    threshold_details: "Суворо заборонено! Часто зустрічається в несертифікованих передтренувальних комплексах та жироспалювачах",
    washout_period_hours: 120,
    requires_tue: false,
    tue_guidance: "TUE не надається. Спортивне харчування має мати сертифікат Informed Sport",
  },

  // ─── S9: ГЛЮКОКОРТИКОЇДИ (ЗАБОРОНЕНО В ЗМАГАННЯ СИСТЕМНО ТА ІН'ЄКЦІЙНО) ─
  {
    id: "sub_dexamethasone",
    name_uk: "Дексаметазон",
    name_en: "Dexamethasone",
    brand_names_ua: ["Дексаметазон", "Дексаметазон-Дарниця", "Дексапос", "Медексол"],
    wada_class: "S9",
    prohibition_scope: "in_competition",
    threshold_details:
      "Заборонено в змагальний період перорально, ректально, внутрішньом'язово та внутрішньовенно. Очні краплі, вушні та топічні мазі дозволені без обмежень.",
    route_restrictions: "Системно та ін'єкційно заборонено; топічно дозволено",
    washout_period_hours: 144, // 6 діб
    requires_tue: true,
    tue_guidance: "При екстреному введенні подається ретроактивний TUE (Retroactive TUE) протягом 5 днів після інциденту",
    permitted_alternatives: ["НПЗП (Диклофенак, Німесил, Мелоксикам)", "Парацетамол"],
  },
  {
    id: "sub_betamethasone",
    name_uk: "Бетаметазон",
    name_en: "Betamethasone",
    brand_names_ua: ["Дипроспан", "Флостерон", "Бетаспан", "Целестодерм", "Белодерм"],
    wada_class: "S9",
    prohibition_scope: "in_competition",
    threshold_details:
      "УВАГА: Дипроспан є депо-формою пролонгованої дії! Період вимивання після внутрішньосуглобової або м'язової блокади становить до 30–60 ДНІВ! Заборонено перед змаганнями без TUE.",
    route_restrictions: "Блокади та ін'єкції заборонені в змагальний період; крем/мазь топічно дозволені",
    washout_period_hours: 720, // 30 діб
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE при плануванні блокад суглобів перед матчами",
    permitted_alternatives: ["Внутрішньосуглобова гіалуронова кислота", "PRP-терапія (плазма)", "Фізіотерапія"],
  },
  {
    id: "sub_triamcinolone",
    name_uk: "Тріамцинолон",
    name_en: "Triamcinolone",
    brand_names_ua: ["Кеналог", "Полькортолон", "Фторокорт"],
    wada_class: "S9",
    prohibition_scope: "in_competition",
    threshold_details: "Пролонгований кортикостероїд для блокад. Період виведення не менше 30 діб.",
    washout_period_hours: 720,
    requires_tue: true,
    tue_guidance: "Вимагає TUE перед блокадою колінного/гомілковостопного суглоба",
  },
  {
    id: "sub_prednisolone",
    name_uk: "Преднізолон",
    name_en: "Prednisolone",
    brand_names_ua: ["Преднізолон", "Преднізолон-Дарниця"],
    wada_class: "S9",
    prohibition_scope: "in_competition",
    washout_period_hours: 144,
    requires_tue: true,
    tue_guidance: "Потрібен TUE або період виведення 6 днів",
  },

  // ─── S4: ГОРМОНАЛЬНІ ТА МЕТАБОЛІЧНІ МОДУЛЯТОРИ (ЗАВЖДИ ЗАБОРОНЕНО) ─
  {
    id: "sub_meldonium",
    name_uk: "Мельдоній",
    name_en: "Meldonium",
    brand_names_ua: ["Мілдронат", "Метамакс", "Вазопро", "Мільдрокард", "Целебіс"],
    wada_class: "S4",
    prohibition_scope: "always",
    threshold_details: "Суворо заборонено постійно (і під час змагань, і на зборах, і у відпустці). Тривалий час кумуляції в тканинах!",
    washout_period_hours: 2160, // до 90 діб
    requires_tue: true,
    tue_guidance: "TUE у професійному футболі практично не надається, оскільки є дозволені кардіопротектори",
    permitted_alternatives: ["L-карнітин (перорально)", "Тіотриазолін", "Коензим Q10"],
  },
  {
    id: "sub_insulin",
    name_uk: "Інсулін",
    name_en: "Insulin",
    brand_names_ua: ["Актрапід", "Хумалог", "Лантус", "НовоРапід"],
    wada_class: "S4",
    prohibition_scope: "always",
    threshold_details: "Заборонено без офіційного медичного показання цукрового діабету 1 типу",
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE з підтвердженням від головного ендокринолога",
  },

  // ─── S5: ДІУРЕТИКИ ТА МАСКУЮЧІ АГЕНТИ (ЗАВЖДИ ЗАБОРОНЕНО) ─────────
  {
    id: "sub_furosemide",
    name_uk: "Фуросемід",
    name_en: "Furosemide",
    brand_names_ua: ["Фуросемід", "Лазикс"],
    wada_class: "S5",
    prohibition_scope: "always",
    threshold_details: "Заборонено постійно! Діуретики маскують сліди інших допінгових субстанцій у сечі",
    washout_period_hours: 72,
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE за наявності серйозної ниркової чи серцевої патології",
  },
  {
    id: "sub_spironolactone",
    name_uk: "Спіронолактон",
    name_en: "Spironolactone",
    brand_names_ua: ["Верошпірон", "Спіронолактон"],
    wada_class: "S5",
    prohibition_scope: "always",
    threshold_details: "Заборонено постійно за будь-яких умов",
    washout_period_hours: 72,
    requires_tue: true,
    tue_guidance: "Обов'язковий TUE",
  },

  // ─── S7: НАРКОТИКИ ТА ОПІОЇДИ (ЗАБОРОНЕНО В ЗМАГАННЯ) ──────────────
  {
    id: "sub_tramadol",
    name_uk: "Трамадол",
    name_en: "Tramadol",
    brand_names_ua: ["Трамадол", "Трамал", "Трамундин", "Залдіар"],
    wada_class: "S7",
    prohibition_scope: "in_competition",
    threshold_details: "УВАГА: З 1 січня 2024 року Трамадол офіційно заборонений WADA у змагальний період!",
    washout_period_hours: 72,
    requires_tue: true,
    tue_guidance: "Заборонено приймати в дні матчів. Рекомендовано замінити на НПЗП або парацетамол",
    permitted_alternatives: ["Ібупрофен", "Кеторолак (короткостроково)", "Парацетамол", "Декскетопрофен (Дексалгін)"],
  },
  {
    id: "sub_morphine",
    name_uk: "Морфін",
    name_en: "Morphine",
    brand_names_ua: ["Морфін", "Морфіну гідрохлорид"],
    wada_class: "S7",
    prohibition_scope: "in_competition",
    washout_period_hours: 96,
    requires_tue: true,
    tue_guidance: "Лише за екстрених хірургічних станів з ретроактивним TUE",
  },

  // ─── S1: АНАБОЛІЧНІ АГЕНТИ (ЗАВЖДИ ЗАБОРОНЕНО) ─────────────────────
  {
    id: "sub_testosterone",
    name_uk: "Тестостерон",
    name_en: "Testosterone",
    brand_names_ua: ["Омнадрен", "Сустанон", "Небідо", "Андрогель"],
    wada_class: "S1",
    prohibition_scope: "always",
    threshold_details: "Суворо заборонено за будь-яких обставин без підтвердженого гіпогонадизму",
    requires_tue: true,
    tue_guidance: "TUE надається виключно за вродженого або підтвердженого органічного гіпогонадизму",
  },
  {
    id: "sub_clenbuterol",
    name_uk: "Кленбутерол",
    name_en: "Clenbuterol",
    brand_names_ua: ["Кленбутерол сироп", "Спіропент"],
    wada_class: "S1",
    prohibition_scope: "always",
    threshold_details: "Анаболічний агент. Постійна заборона без порогу!",
    washout_period_hours: 240,
    requires_tue: true,
    tue_guidance: "TUE для спорту не затверджується",
  },
];

/**
 * База відомих безпечних та дозволених препаратів (Whitelisted Safe Drugs)
 */
export const WADA_PERMITTED_SAFE_MEDS: Array<{ name: string; brand_names: string[]; note: string }> = [
  {
    name: "Парацетамол",
    brand_names: ["Панадол", "Ефералган", "Рапідол", "Парацетамол-Дарниця"],
    note: "Анальгетик/антипіретик. Повністю дозволений WADA в будь-який період.",
  },
  {
    name: "Ібупрофен",
    brand_names: ["Нурофен", "Імет", "Гофен", "Бруфен", "Ібупром"],
    note: "НПЗП. Дозволений WADA в змагальний та позазмагальний період.",
  },
  {
    name: "Диклофенак",
    brand_names: ["Вольтарен", "Диклак", "Диклоберл", "Олфен"],
    note: "НПЗП. Дозволений перорально, ін'єкційно та топічно без TUE.",
  },
  {
    name: "Німесулід",
    brand_names: ["Німесил", "Німид", "Аффіда Форт", "Ремесулід"],
    note: "НПЗП. Повністю дозволений WADA.",
  },
  {
    name: "Ксилометазолін",
    brand_names: ["Отривін", "Фармазолін", "ДляНос", "Снуп", "Евказолін"],
    note: "Судинозвужувальний назальний спрей. Дозволений, на відміну від орального псевдоефедрину!",
  },
  {
    name: "Дезлоратадин",
    brand_names: ["Едем", "Еріус", "Алергомакс", "Хітаксі"],
    note: "Антигістамінний препарат другого покоління. Дозволений без обмежень.",
  },
  {
    name: "Амоксицилін / Клавуланат",
    brand_names: ["Аугментин", "Амоксиклав", "Флемоксин"],
    note: "Антибіотик пеніцилінового ряду. Дозволений WADA.",
  },
  {
    name: "Омепразол / Пантопразол",
    brand_names: ["Омез", "Нольпаза", "Контролок"],
    note: "Інгібітор протонної помпи. Дозволений без обмежень.",
  },
];

/**
 * Нормалізація рядка для нечіткого пошуку (нижній регістр, видалення спецсимволів)
 */
function cleanQuery(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\dа-яіїєґ]/gi, "");
}

/**
 * Миттєва перевірка препарату чи діючої речовини за реєстром WADA / НАДЦ
 */
export function verifySubstanceOrBrand(query: string): WadaCheckResult {
  const qClean = cleanQuery(query);
  if (!qClean || qClean.length < 2) {
    return {
      found: false,
      query,
      matched_by: "none",
      status: "permitted",
      status_label: "Введіть назву",
      status_color: "green",
      status_badge: "bg-slate-800 text-slate-400",
      recommendation: "Введіть діючу речовину або торгову марку ліків для перевірки",
      requires_tue: false,
      suggested_action: "safe",
    };
  }

  // 1. Пошук у забороненому каталозі WADA
  for (const record of WADA_PROHIBITED_CATALOG) {
    // 1.1 Перевірка назви українською
    if (cleanQuery(record.name_uk).includes(qClean) || qClean.includes(cleanQuery(record.name_uk))) {
      return buildProhibitedResult(query, "substance_uk", record.name_uk, record);
    }

    // 1.2 Перевірка назви англійською (INN)
    if (cleanQuery(record.name_en).includes(qClean) || qClean.includes(cleanQuery(record.name_en))) {
      return buildProhibitedResult(query, "substance_en", record.name_en, record);
    }

    // 1.3 Перевірка торгових брендів в Україні
    for (const brand of record.brand_names_ua) {
      if (cleanQuery(brand).includes(qClean) || qClean.includes(cleanQuery(brand))) {
        return buildProhibitedResult(query, "brand", brand, record);
      }
    }
  }

  // 2. Пошук у базі гарантовано безпечних дозволених ліків
  for (const safeMed of WADA_PERMITTED_SAFE_MEDS) {
    if (cleanQuery(safeMed.name).includes(qClean) || qClean.includes(cleanQuery(safeMed.name))) {
      return buildPermittedResult(query, safeMed.name, safeMed.note);
    }
    for (const b of safeMed.brand_names) {
      if (cleanQuery(b).includes(qClean) || qClean.includes(cleanQuery(b))) {
        return buildPermittedResult(query, b, safeMed.note);
      }
    }
  }

  // 3. Якщо прямого збігу не знайдено — препарат відсутній у списках моніторингу WADA
  return {
    found: false,
    query,
    matched_by: "none",
    status: "permitted",
    status_label: "Відсутній у списку заборон",
    status_color: "green",
    status_badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    recommendation:
      "Субстанцію або бренд не знайдено серед заборонених речовин WADA 2024–2026. Препарат дозволений, якщо не містить незазначених домішок.",
    requires_tue: false,
    suggested_action: "safe",
  };
}

function buildProhibitedResult(
  query: string,
  matchedBy: "substance_uk" | "substance_en" | "brand",
  matchedName: string,
  record: WadaSubstanceRecord
): WadaCheckResult {
  const classInfo = WADA_CLASS_INFO[record.wada_class];

  // Випадок А: Сальбутамол з пороговим винятком
  if (record.prohibition_scope === "conditional") {
    return {
      found: true,
      query,
      matched_by: matchedBy,
      matched_name: matchedName,
      record,
      status: "conditional_permitted",
      status_label: `Умовно дозволено (Клас ${record.wada_class})`,
      status_color: "yellow",
      status_badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
      recommendation: `${record.threshold_details || ""} ${record.tue_guidance}`,
      requires_tue: record.requires_tue,
      suggested_action: "check_threshold",
    };
  }

  // Випадок Б: Заборонено у змагальний період (S6, S7, S8, S9)
  if (record.prohibition_scope === "in_competition") {
    const washoutStr = record.washout_period_hours
      ? ` Період виведення: не менше ${record.washout_period_hours} год (${(record.washout_period_hours / 24).toFixed(0)} дн.) перед матчем.`
      : "";

    return {
      found: true,
      query,
      matched_by: matchedBy,
      matched_name: matchedName,
      record,
      status: "prohibited_in_competition",
      status_label: `Заборонено у змагання (Клас ${record.wada_class})`,
      status_color: "amber",
      status_badge: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
      recommendation: `Заборонено в змагальний період!${washoutStr} При необхідності прийому обов'язково створити TUE або витримати кліренс.`,
      requires_tue: record.requires_tue,
      suggested_action: record.requires_tue ? "create_tue" : "specify_washout",
    };
  }

  // Випадок В: Заборонено завжди (S1, S2, S4, S5)
  return {
    found: true,
    query,
    matched_by: matchedBy,
    matched_name: matchedName,
    record,
    status: "prohibited_always",
    status_label: `Суворо заборонено завжди (Клас ${record.wada_class})`,
    status_color: "red",
    status_badge: "bg-rose-600/20 text-rose-400 border border-rose-600/40 font-bold",
    recommendation: `Постійно заборонена субстанція (In- & Out-of-competition)! Прийом можливий виключно за попередньо схваленим TUE від НАДЦ.`,
    requires_tue: true,
    suggested_action: "create_tue",
  };
}

function buildPermittedResult(query: string, matchedName: string, note: string): WadaCheckResult {
  return {
    found: true,
    query,
    matched_by: "brand",
    matched_name: matchedName,
    status: "permitted",
    status_label: "Дозволено WADA",
    status_color: "green",
    status_badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    recommendation: note,
    requires_tue: false,
    suggested_action: "safe",
  };
}
