import type { PharmacyCategory, WadaStatus } from "@/types/pharmacy";
import { WADA_PROHIBITED_CATALOG, WADA_PERMITTED_SAFE_MEDS } from "./wada-prohibited-list.ts";

export interface ClinicalDrugInfo {
  name: string;
  active_substance: string;
  category: PharmacyCategory;
  wada_status: WadaStatus;
  wada_source_note: string;
  washout_note: string;
  indications: string;
  min_age: number | null;
  age_note: string;
  requires_review: boolean;
  storage_location: string;
  unit: string;
  min_alert_threshold: number;
  aliases: string[];
}

/**
 * Велика еталонна база медикаментів спортивної медицини, ін'єкцій та виробів
 */
export const CLINICAL_DRUG_PRESETS: ClinicalDrugInfo[] = [
  // ── НПЗЗ ТА ЗНЕБОЛЮВАЛЬНІ ──
  {
    name: "Німесулід (Німесил) 100 мг",
    active_substance: "Німесулід (Nimesulide)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Нестероїдні протизапальні засоби дозволені у спорті без обмежень.",
    washout_note: "Період напіввиведення 3.2–6 год. Повне виведення метаболітів до 24 годин.",
    indications: "Симптоматичне лікування гострого болю при тендинітах, бурситах, розтягненнях зв'язкового апарату другого ступеня.",
    min_age: 18,
    age_note: "Протипоказано дітям до 18 років згідно з інструкцією МОЗ через ризик гепатотоксичності.",
    requires_review: true,
    storage_location: "Аптечка медкабінету",
    unit: "пакетиків",
    min_alert_threshold: 15,
    aliases: ["німесил", "nimesil", "німесулід", "німид", "аффіда", "ремесулід"],
  },
  {
    name: "Ібупрофен 400 мг",
    active_substance: "Ібупрофен (Ibuprofen)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Дозволено без обмежень у будь-який період.",
    washout_note: "Період напіввиведення 1.8–2.5 години. Повне виведення за 12–24 год.",
    indications: "Помірний біль у м'язах, суглобах, посттравматичний набряк та запалення зв'язкового апарату.",
    min_age: 12,
    age_note: "Дозволено юніорам (з 12 років або масою від 40 кг). Не перевищувати 1200 мг/добу без нагляду лікаря.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 20,
    aliases: ["ібупрофен", "нурофен", "nurofen", "імет", "гофен", "бруфен", "ібупром"],
  },
  {
    name: "Парацетамол 500 мг",
    active_substance: "Парацетамол (Paracetamol / Acetaminophen)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Дозволено без обмежень.",
    washout_note: "Період напіввиведення 2–3 години.",
    indications: "Купірування больового синдрому слабкої та помірної інтенсивності, головний біль, гарячкові стани.",
    min_age: 12,
    age_note: "Корекція дози залежно від маси тіла. Максимальна добова доза для юніорів — до 2 г, для дорослих — 4 г.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 15,
    aliases: ["парацетамол", "paracetamol", "панадол", "ефералган", "рапідол"],
  },
  {
    name: "Диклофенак натрію 75 мг / 3 мл",
    active_substance: "Диклофенак натрію (Diclofenac sodium)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: НПЗП дозволені без обмежень перорально та ін'єкційно.",
    washout_note: "Період напіввиведення 1–2 години. Виводиться повністю протягом доби.",
    indications: "Гострий виражений больовий синдром при люмбалгії, міозитах, бурситах, післятравматичних набряках.",
    min_age: 18,
    age_note: "Ін'єкційна форма протипоказана дітям до 18 років. Тільки для дорослого складу клубу.",
    requires_review: true,
    storage_location: "Медкабінет база",
    unit: "ампул",
    min_alert_threshold: 10,
    aliases: ["диклофенак", "диклак", "вольтарен", "диклоберл", "олфен"],
  },
  {
    name: "Декскетопрофен (Дексалгін) 50 мг / 2 мл",
    active_substance: "Декскетопрофен трометамол (Dexketoprofen)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: НПЗП швидкої дії дозволені у змагальний та позазмагальний період.",
    washout_note: "Період напіввиведення 1–2.7 год. Швидка елімінація без кумуляції.",
    indications: "Купірування гострого сильного болю при гострих м'язових спазмах, забоях окістя, травмах суглобів.",
    min_age: 18,
    age_note: "Застосування у дітей та підлітків до 18 років не вивчалось (протипоказано).",
    requires_review: true,
    storage_location: "Медкабінет база",
    unit: "ампул",
    min_alert_threshold: 8,
    aliases: ["дексалгін", "dexalgin", "декскетопрофен", "кейвер", "депіофен"],
  },
  {
    name: "Кеторолак (Кетанов) 30 мг/мл",
    active_substance: "Кеторолаку трометамін (Ketorolac)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Дозволено, але не рекомендовано для тривалого курсу.",
    washout_note: "Період напіввиведення 5–6 годин.",
    indications: "Короткочасне купірування вираженого больового синдрому при свіжих вивихах, переломах (до 2 діб).",
    min_age: 16,
    age_note: "Протипоказано до 16 років. Суворий моніторинг коагуляції та шлунково-кишкового тракту.",
    requires_review: true,
    storage_location: "Медкабінет база",
    unit: "ампул",
    min_alert_threshold: 5,
    aliases: ["кеторолак", "кетанов", "кеторол", "кетолонг"],
  },
  {
    name: "Мелоксикам (Моваліс) 15 мг/1.5 мл",
    active_substance: "Мелоксикам (Meloxicam)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Селективні інгібітори ЦОГ-2 дозволені у спорті.",
    washout_note: "Період напіввиведення 13–20 годин (полонгований ефект однієї дози на добу).",
    indications: "Артрити, спондилоартрити, загострення періартритів плечового та кульшового суглобів.",
    min_age: 18,
    age_note: "Протипоказано підліткам до 18 років.",
    requires_review: true,
    storage_location: "Медкабінет база",
    unit: "ампул",
    min_alert_threshold: 6,
    aliases: ["мелоксикам", "моваліс", "мовсін", "мелбек", "ревмоксикам"],
  },

  // ── ГЛЮКОКОРТИКОЇДИ (WADA S9 — ОСОБЛИВИЙ КОНТРОЛЬ / БЛОКАДИ) ──
  {
    name: "Дексаметазон 4 мг/мл",
    active_substance: "Дексаметазону натрію фосфат (Dexamethasone)",
    category: "injections",
    wada_status: "prohibited_in_competition",
    wada_source_note: "WADA Prohibited List 2026, Клас S9: Глюкокортикоїди заборонені у змагальний період при ін'єкціях.",
    washout_note: "Період виведення при в/м або періартикулярному введенні — 7–14 діб. У змагальний період потрібен TUE.",
    indications: "Купірування важких гострих асептичних набряків, вираженого запалення при неефективності НПЗЗ.",
    min_age: 18,
    age_note: "У підлітковому віці пригнічує зони росту кісток та гіпоталамо-гіпофізарну вісь. Тільки за вітальними показаннями.",
    requires_review: true,
    storage_location: "Сейф суворої звітності",
    unit: "ампул",
    min_alert_threshold: 6,
    aliases: ["дексаметазон", "dexamethasone", "дексапос", "медексол"],
  },
  {
    name: "Бетаметазон (Дипроспан / Флостерон) 2 мг+5 мг/мл",
    active_substance: "Бетаметазону дипропіонат та натрію фосфат (Betamethasone)",
    category: "injections",
    wada_status: "prohibited_in_competition",
    wada_source_note: "WADA Prohibited List 2026, Клас S9: Заборонено у змагальний період! Депо-форма тривалої кумуляції.",
    washout_note: "УВАГА: Період виведення з тканин після блокади становить від 30 до 60 ДНІВ! Обов'язковий TUE перед матчами.",
    indications: "Локальні ін'єкції при рецидивуючих тендинітах, синовітах, капсулітах за рішенням консиліуму.",
    min_age: 18,
    age_note: "Категорично не рекомендовано юніорам через ризик дистрофії сухожилків та мікронекрозів.",
    requires_review: true,
    storage_location: "Сейф суворої звітності",
    unit: "ампул",
    min_alert_threshold: 4,
    aliases: ["дипроспан", "diprospan", "флостерон", "бетаметазон", "бетаспан"],
  },
  {
    name: "Тріамцинолон (Кеналог 40) 40 мг/мл",
    active_substance: "Тріамцинолону ацетонід (Triamcinolone acetonide)",
    category: "injections",
    wada_status: "prohibited_in_competition",
    wada_source_note: "WADA Prohibited List 2026, Клас S9: Глюкокортикоїд пролонгованої дії, заборонений у змагання.",
    washout_note: "Період виведення не менше 30 діб після внутрішньосуглобового введення.",
    indications: "Внутрішньосуглобове введення при важких неінфекційних ексудативних артритах колінного суглоба.",
    min_age: 18,
    age_note: "Протипоказано дітям та юніорам.",
    requires_review: true,
    storage_location: "Сейф суворої звітності",
    unit: "ампул",
    min_alert_threshold: 3,
    aliases: ["кеналог", "kenalog", "тріамцинолон", "полькортолон"],
  },

  // ── БІОЛОГІЧНІ ЗАСОБИ ТА ХОНДРОПРОТЕКТОРИ ──
  {
    name: "PRP Набори для плазмоліфтингу (Autologous PRP)",
    active_substance: "Аутологічна тромбоцитарна плазма (PRP)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List (М2.2 виняток): аутологічні препарати крові без додаткових факторів росту дозволені.",
    washout_note: "Період виведення не застосовується (біологічний аутоматеріал спортсмена).",
    indications: "Ентезопатії, тендинопатії надколінка, ахіллового сухожилка, відновний період після часткових мікророзривів м'язів.",
    min_age: 16,
    age_note: "У юніорів молодше 18 років застосовувати за рішенням консиліуму лікарів клубу за письмової згоди батьків.",
    requires_review: true,
    storage_location: "Холодильник медкабінету (+4°C)",
    unit: "наборів",
    min_alert_threshold: 5,
    aliases: ["prp", "плазмоліфтинг", "плазма", "autologous prp"],
  },
  {
    name: "Гіалуронова кислота 2.0% (Остеніл / Ферматрон)",
    active_substance: "Натрію гіалуронат високомолекулярний (Sodium hyaluronate)",
    category: "injections",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Препарати віскосапплементації не заборонені.",
    washout_note: "Не застосовується.",
    indications: "Внутрішньосуглобовий больовий синдром, обмеження амплітуди рухів при посттравматичній хондромаляції.",
    min_age: 18,
    age_note: "Досвід застосування у дітей обмежений. Тільки для дорослих гравців за УЗД-контролю.",
    requires_review: true,
    storage_location: "Медкабінет база",
    unit: "шприців",
    min_alert_threshold: 3,
    aliases: ["гіалуронова кислота", "остеніл", "ферматрон", "синокром", "гіалурон", "hyaluronate"],
  },

  // ── МІОРЕЛАКСАНТИ ТА СПАЗМОЛІТИКИ ──
  {
    name: "Тольперизон (Мідокалм) 150 мг",
    active_substance: "Тольперизону гідрохлорид (Tolperisone)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Центральні міорелаксанти дозволені без обмежень.",
    washout_note: "Період напіввиведення 1.5–2.5 години.",
    indications: "М'язовий гіпертонус, рефлекторний м'язовий спазм після тренувань, міофасціальний больовий синдром спини.",
    min_age: 18,
    age_note: "Протипоказано дітям та юніорам до 18 років.",
    requires_review: true,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 15,
    aliases: ["мідокалм", "midocalm", "тольперизон", "толперил"],
  },
  {
    name: "Тізанідин (Сірдалуд) 2 мг",
    active_substance: "Тізанідину гідрохлорид (Tizanidine)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Дозволено.",
    washout_note: "Період напіввиведення 2–4 години.",
    indications: "Болісні спазми паравертебральних м'язів, гострий цервікальний або поперековий синдром.",
    min_age: 18,
    age_note: "Протипоказано до 18 років. Може викликати седацію та гіпотензію, приймати перед сном.",
    requires_review: true,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 10,
    aliases: ["сірдалуд", "sirdalud", "тізанідин", "тизалуд"],
  },

  // ── МІСЦЕВІ ФОРМИ, МАЗІ ТА ГЕЛІ ──
  {
    name: "Вольтарен Форте 2.32% гель 100 г",
    active_substance: "Диклофенак діетиламін (Diclofenac diethylamine)",
    category: "creams_gels",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Топічні НПЗП дозволені без обмежень.",
    washout_note: "Не впливає на системні допінг-тести.",
    indications: "Локальне знеболення при закритих травмах сухожилків, зв'язок, м'язів та суглобів.",
    min_age: 14,
    age_note: "Дозволено підліткам з 14 років. Наносити 2 рази на добу на неушкоджену шкіру.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "туб",
    min_alert_threshold: 5,
    aliases: ["вольтарен гель", "диклофенак гель", "диклак гель", "олфен гель"],
  },
  {
    name: "Траумель С (Мазь / Ампули)",
    active_substance: "Комплекс рослинних та мінеральних компонентів (Arnica, Calendula, Hamamelis)",
    category: "creams_gels",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Не містить заборонених допінг-субстанцій.",
    washout_note: "Не застосовується.",
    indications: "Комплексна терапія вивихів, гематом, посттравматичних набряків м'яких тканин.",
    min_age: 12,
    age_note: "Безпечно для юнацьких команд Академії з 12 років.",
    requires_review: false,
    storage_location: "Виїзна валіза матчу",
    unit: "туб",
    min_alert_threshold: 4,
    aliases: ["траумель", "traumeel", "траумель с"],
  },

  // ── ТЕЙПИ, ФІКСАЦІЯ ТА ВИТРАТНІ МАТЕРІАЛИ ──
  {
    name: "Кінезіотейп K-Active Pro (5 см × 5 м)",
    active_substance: "Бавовняна еластична стрічка з термоактивним акриловим адгезивом",
    category: "tapes_bandages",
    wada_status: "allowed",
    wada_source_note: "Не містить субстанцій з Моніторингу чи Забороненого списку WADA.",
    washout_note: "Не застосовується.",
    indications: "Функціональна іммобілізація суглобів, лімфодренажне тейпування, біомеханічна стабілізація.",
    min_age: null,
    age_note: "Вікових обмежень немає. Контролювати стан шкіри на предмет контактного дерматиту.",
    requires_review: false,
    storage_location: "Шафа роздягальні / Виїзна валіза",
    unit: "рулонів",
    min_alert_threshold: 10,
    aliases: ["тейп", "кінезіотейп", "k-active", "rocktape", "mueller tape", "тейпи"],
  },
  {
    name: "Підтейпник поролоновий Mueller M-Wrap (7 см × 27 м)",
    active_substance: "Поролонова стрічка без клейового шару",
    category: "tapes_bandages",
    wada_status: "allowed",
    wada_source_note: "Виріб медичного призначення. Дозволено без обмежень.",
    washout_note: "Не застосовується.",
    indications: "Захист шкіри спортсмена перед жорстким функціональним тейпуванням гомілкостопа.",
    min_age: null,
    age_note: "Вікових обмежень немає.",
    requires_review: false,
    storage_location: "Шафа роздягальні / Виїзна валіза",
    unit: "рулонів",
    min_alert_threshold: 8,
    aliases: ["підтейпник", "m-wrap", "поролон під тейп"],
  },
  {
    name: "Еластичний бинт високої розтяжності (10 см × 5 м)",
    active_substance: "Бавовна, поліамід, еластан",
    category: "tapes_bandages",
    wada_status: "allowed",
    wada_source_note: "Дозволено без обмежень.",
    washout_note: "Не застосовується.",
    indications: "Компресійна фіксація суглобів при першій допомозі (R.I.C.E.), профілактика набряку.",
    min_age: null,
    age_note: "Без обмежень.",
    requires_review: false,
    storage_location: "Виїзна валіза матчу",
    unit: "шт.",
    min_alert_threshold: 12,
    aliases: ["еластичний бинт", "бинт компресійний", "бинт еластичний"],
  },

  // ── ЕКСТРЕНА ДОПОМОГА, АНТИСЕПТИКИ ТА КРІОТЕРАПІЯ ──
  {
    name: "Охолоджувальний аерозоль (Спортивний кріоспрей 400 мл)",
    active_substance: "Суміш зріджених ізобутану та пропану з ментолом",
    category: "emergency_antiseptics",
    wada_status: "allowed",
    wada_source_note: "WADA: Повністю дозволено без обмежень.",
    washout_note: "Не застосовується.",
    indications: "Екстрена холодова терапія на футбольному полі при свіжих ударах, гематомах, розтягненнях.",
    min_age: 12,
    age_note: "Уникати розпилення на відкриті рани. Тримати дистанцію 15–20 см для уникнення холодового опіку.",
    requires_review: false,
    storage_location: "Виїзна валіза матчу",
    unit: "балонів",
    min_alert_threshold: 6,
    aliases: ["кріоспрей", "заморозка", "охолоджуючий спрей", "ice spray", "кріо"],
  },
  {
    name: "Хлоргексидину біглюконат 0.05% розчин 200 мл",
    active_substance: "Хлоргексидину біглюконат (Chlorhexidine)",
    category: "emergency_antiseptics",
    wada_status: "allowed",
    wada_source_note: "Антисептик. Дозволено без обмежень WADA.",
    washout_note: "Не застосовується.",
    indications: "Антисептична обробка саден, потертостей від бутс, неглибоких ран після падінь на газоні.",
    min_age: null,
    age_note: "Без вікових обмежень.",
    requires_review: false,
    storage_location: "Виїзна валіза матчу",
    unit: "флаконів",
    min_alert_threshold: 8,
    aliases: ["хлоргексидин", "антисептик", "chlorhexidine"],
  },
  {
    name: "Бетадин (Повідон-йод) розчин 10% 100 мл",
    active_substance: "Повідон-йод (Povidone-iodine)",
    category: "emergency_antiseptics",
    wada_status: "allowed",
    wada_source_note: "Дозволено без обмежень.",
    washout_note: "Не застосовується.",
    indications: "Обробка країв інфікованих ран, саден, антисептична підготовка операційного поля.",
    min_age: null,
    age_note: "Перевірити анамнез на алергію до йоду та захворювання щитоподібної залози.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "флаконів",
    min_alert_threshold: 4,
    aliases: ["бетадин", "betadine", "йод", "повідон йод"],
  },

  // ── ВІТАМІНИ, ВІДНОВЛЕННЯ ТА НУТРИЦІОЛОГІЯ ──
  {
    name: "Колаген гідролізат (Тип I та III) + Вітамін C",
    active_substance: "Гідролізований пептидний колаген 10 г, вітамін C 50 мг",
    category: "vitamins_supplements",
    wada_status: "allowed",
    wada_source_note: "Сертифіковано за стандартом Informed Sport / Kölner Liste (без допінг-домішок).",
    washout_note: "Не застосовується.",
    indications: "Підтримка синтезу ендогенного колагену в період реабілітації після мікророзривів зв'язок.",
    min_age: 14,
    age_note: "Дозволено для академії та юнацьких складів за індивідуальною схемою нутриціолога.",
    requires_review: false,
    storage_location: "Нутриціологічний склад",
    unit: "банок",
    min_alert_threshold: 8,
    aliases: ["колаген", "collagen", "пептиди колагену"],
  },
  {
    name: "Магній В6 форте (Магнію лактат + Піридоксин)",
    active_substance: "Магній 100 мг, піридоксину гідрохлорид 10 мг",
    category: "vitamins_supplements",
    wada_status: "allowed",
    wada_source_note: "WADA: Дозволено без обмежень.",
    washout_note: "Не застосовується.",
    indications: "Профілактика нічних судом литкових м'язів, дефіцит магнію при інтенсивних зборах.",
    min_age: 12,
    age_note: "Дозволено юніорам з 12 років під час зборів та високих навантажень.",
    requires_review: false,
    storage_location: "Нутриціологічний склад",
    unit: "табл.",
    min_alert_threshold: 30,
    aliases: ["магній", "магне в6", "magnesium", "магне б6"],
  },
  {
    name: "Діосмін + Гесперидин (Детралекс / Флебодіа) 1000 мг",
    active_substance: "Очищена мікронізована флавоноїдна фракція (Diosmin + Hesperidin)",
    category: "vitamins_supplements",
    wada_status: "allowed",
    wada_source_note: "WADA Prohibited List: Венотоніки дозволені без обмежень.",
    washout_note: "Період напіввиведення 11 годин.",
    indications: "Зниження венозного стазу та набряклості ніг після тривалих переїздів на виїзні матчі.",
    min_age: 18,
    age_note: "Застосовується у дорослих футболістів.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 15,
    aliases: ["детралекс", "detralex", "флебодіа", "діосмін", "нормавен"],
  },

  // ── ДИХАЛЬНА СИСТЕМА ТА АЛЕРГІЯ (WADA S3 / ДОЗВОЛЕНІ ФОРМИ) ──
  {
    name: "Сальбутамол (Вентолін) аерозоль 100 мкг/доза",
    active_substance: "Сальбутамол (Salbutamol)",
    category: "emergency_antiseptics",
    wada_status: "allowed",
    wada_source_note: "WADA 2026 Клас S3: Інгаляційно дозволено до 1600 мкг/24 год (макс. 600 мкг за 8 год). Перорально — ЗАБОРОНЕНО!",
    washout_note: "При дотриманні добового порогу інгаляцій концентрація в сечі не перевищує 1000 нг/мл.",
    indications: "Бронхоспазм фізичного навантаження, приступ експіраторної задишки на холодному повітрі.",
    min_age: 12,
    age_note: "Юніорам дозволено інгаляційно. Обов'язкова фіксація кожного використання у медичній карті.",
    requires_review: true,
    storage_location: "Виїзна валіза матчу",
    unit: "інгаляторів",
    min_alert_threshold: 4,
    aliases: ["сальбутамол", "вентолін", "ventolin", "небутамол"],
  },
  {
    name: "Отривін (Ксилометазолін 0.1%) спрей 10 мл",
    active_substance: "Ксилометазоліну гідрохлорид (Xylometazoline)",
    category: "emergency_antiseptics",
    wada_status: "allowed",
    wada_source_note: "WADA: Назальний ксилометазолін повністю дозволений (на відміну від перорального псевдоефедрину!).",
    washout_note: "Не дає системних допінг-метаболітів.",
    indications: "Гострий риніт, набряк слизової оболонки носоглотки перед тренуванням або грою.",
    min_age: 12,
    age_note: "Застосовувати не довше 5–7 діб підряд для запобігання медикаментозному риніту.",
    requires_review: false,
    storage_location: "Виїзна валіза матчу",
    unit: "флаконів",
    min_alert_threshold: 6,
    aliases: ["отривін", "otrivin", "ксилометазолін", "фармазолін", "длянос", "евказолін"],
  },
  {
    name: "Дезлоратадин (Еріус / Едем) 5 мг",
    active_substance: "Дезлоратадин (Desloratadine)",
    category: "nsaid_painkillers",
    wada_status: "allowed",
    wada_source_note: "WADA: Антигістамінні препарати другого покоління повністю дозволені.",
    washout_note: "Період напіввиведення 27 годин.",
    indications: "Сезонний алергічний риніт (поліноз при тренуваннях на цвітінні трав), кропив'янка.",
    min_age: 12,
    age_note: "Дозволено підліткам з 12 років. Не викликає вираженої сонливості.",
    requires_review: false,
    storage_location: "Аптечка медкабінету",
    unit: "табл.",
    min_alert_threshold: 10,
    aliases: ["еріус", "erius", "едем", "дезлоратадин", "алергомакс"],
  },

  // ── СУВОРО ЗАБОРОНЕНІ WADA ЗАСОБИ (ПЕРЕВІРКА БЕЗПЕКИ КЛУБУ) ──
  {
    name: "Трамадол 50 мг / капсули",
    active_substance: "Трамадолу гідрохлорид (Tramadol)",
    category: "nsaid_painkillers",
    wada_status: "prohibited_in_competition",
    wada_source_note: "WADA Prohibited List, Клас S7 (Наркотики): ЗАБОРОНЕНО у змагальний період з 1 січня 2024 року!",
    washout_note: "Період виведення становить не менше 72 годин до офіційного старту змагань.",
    indications: "Сильний больовий синдром виключно в позазмагальний період при серйозних травмах.",
    min_age: 18,
    age_note: "Опіоїдний анальгетик. Суворо протипоказано дітям та підліткам.",
    requires_review: true,
    storage_location: "Сейф суворої звітності",
    unit: "капсул",
    min_alert_threshold: 5,
    aliases: ["трамадол", "tramadol", "трамал", "залдіар"],
  },
  {
    name: "Мельдоній (Мілдронат) 500 мг",
    active_substance: "Мельдоній дигідрат (Meldonium)",
    category: "vitamins_supplements",
    wada_status: "prohibited_always",
    wada_source_note: "WADA Prohibited List, Клас S4 (Модулятори метаболізму): ПОВНИЙ БАН ПОСТІЙНО (у змагання та поза ними)!",
    washout_note: "Тривала кумуляція в тканинах: сліди виявляються в сечі до 90–120 діб!",
    indications: "Знижена працездатність, ішемічні розлади (НЕ застосовувати у спорті без офіційного TUE).",
    min_age: 18,
    age_note: "Заборонено антидопінговим законодавством.",
    requires_review: true,
    storage_location: "Сейф суворої звітності",
    unit: "капсул",
    min_alert_threshold: 5,
    aliases: ["мельдоній", "мілдронат", "mildronate", "метамакс", "вазопро"],
  },
];

/**
 * Нормалізація рядка для гнучкого пошуку
 */
function normalizeQuery(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\dа-яіїєґ]/gi, "");
}

/**
 * Пошук за назвою або діючою речовиною у вбудованій клінічній базі
 */
export function findClinicalDrugPreset(query: string): ClinicalDrugInfo | null {
  if (!query || query.trim().length < 2) return null;
  const qClean = normalizeQuery(query);

  // 1. Прямий або точний збіг за назвою чи аліасами
  for (const drug of CLINICAL_DRUG_PRESETS) {
    if (normalizeQuery(drug.name).includes(qClean) || qClean.includes(normalizeQuery(drug.name))) {
      return drug;
    }
    if (normalizeQuery(drug.active_substance).includes(qClean)) {
      return drug;
    }
    for (const alias of drug.aliases) {
      const aliasClean = normalizeQuery(alias);
      if (qClean === aliasClean || qClean.includes(aliasClean) || aliasClean.includes(qClean)) {
        return drug;
      }
    }
  }

  // 2. Якщо не знайдено прямого збігу — перевіряємо каталоги WADA
  for (const item of WADA_PROHIBITED_CATALOG) {
    const nameUa = normalizeQuery(item.name_uk);
    const nameEn = normalizeQuery(item.name_en);
    const brandMatches = item.brand_names_ua.some((b) => normalizeQuery(b).includes(qClean) || qClean.includes(normalizeQuery(b)));

    if (nameUa.includes(qClean) || nameEn.includes(qClean) || brandMatches) {
      const isAlways = item.prohibition_scope === "always";
      const status: WadaStatus = isAlways
        ? "prohibited_always"
        : item.requires_tue
        ? "requires_tue"
        : "prohibited_in_competition";

      return {
        name: `${item.name_uk} (${item.brand_names_ua[0] || item.name_en})`,
        active_substance: `${item.name_uk} (${item.name_en})`,
        category: "nsaid_painkillers",
        wada_status: status,
        wada_source_note: `WADA Prohibited List 2026, Клас ${item.wada_class}: ${item.threshold_details || "Субстанція під особливим контролем WADA."}`,
        washout_note: item.washout_period_hours ? `Період виведення: від ${Math.ceil(item.washout_period_hours / 24)} діб.` : "Потребує перевірки терміну TUE.",
        indications: "Фармакотерапія за суворими медичними показаннями лікаря клубу.",
        min_age: 18,
        age_note: "Препарат під особливим антидопінговим та медичним контролем.",
        requires_review: true,
        storage_location: "Сейф суворої звітності",
        unit: "ампул",
        min_alert_threshold: 5,
        aliases: [item.name_uk.toLowerCase(), item.name_en.toLowerCase(), ...item.brand_names_ua.map((b) => b.toLowerCase())],
      };
    }
  }

  for (const safe of WADA_PERMITTED_SAFE_MEDS) {
    const safeName = normalizeQuery(safe.name);
    const brandMatch = safe.brand_names.some((b) => normalizeQuery(b).includes(qClean) || qClean.includes(normalizeQuery(b)));
    if (safeName.includes(qClean) || brandMatch) {
      return {
        name: `${safe.name} (${safe.brand_names[0] || "Стандарт"})`,
        active_substance: safe.name,
        category: "nsaid_painkillers",
        wada_status: "allowed",
        wada_source_note: `WADA Prohibited List: ${safe.note}`,
        washout_note: "Період напіввиведення стандартний, допінгових обмежень немає.",
        indications: "Симптоматична терапія та знеболення за призначенням лікаря.",
        min_age: 12,
        age_note: "Дозволено юніорам згідно з інструкцією до препарату.",
        requires_review: false,
        storage_location: "Аптечка медкабінету",
        unit: "табл.",
        min_alert_threshold: 15,
        aliases: [safe.name.toLowerCase(), ...safe.brand_names.map((b) => b.toLowerCase())],
      };
    }
  }

  return null;
}

/**
 * Запит до ШІ (Gemini API з fallback на внутрішню модель) для нового/рідкісного препарату
 */
export async function lookupDrugWithAI(query: string): Promise<ClinicalDrugInfo | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const systemInstruction = `Ти — експерт зі спортивної медицини, фармакології та офіційного регламенту WADA / НАДЦ України 2026 року.
Користувач вводить назву препарату або діючу речовину. Твоя задача — повернути строго валідний JSON-об'єкт (без markdown розмітки) з офіційними медичними даними:
{
  "name": "Торгова назва з дозуванням українською",
  "active_substance": "Діюча речовина (INN)",
  "category": "injections" | "nsaid_painkillers" | "tapes_bandages" | "vitamins_supplements" | "emergency_antiseptics" | "creams_gels",
  "wada_status": "allowed" | "prohibited_in_competition" | "prohibited_always" | "requires_tue",
  "wada_source_note": "Офіційний пункт списку WADA 2026 або 'WADA: Дозволено без обмежень'",
  "washout_note": "Період виведення з організму для змагань (Washout note)",
  "indications": "Лаконічні показання з офіційної інструкції МОЗ України",
  "min_age": 18 (число або null, якщо без вікових обмежень),
  "age_note": "Особливості застосування у юніорів Академії чи протипоказання",
  "requires_review": true або false,
  "storage_location": "Холодильник (+2..+8°C)" | "Сейф суворої звітності" | "Аптечка медкабінету" | "Виїзна валіза матчу" | "Медкабінет база",
  "unit": "табл." | "ампул" | "пакетиків" | "туб" | "флаконів" | "рулонів" | "наборів",
  "min_alert_threshold": 5
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemInstruction}\n\nПрепарат для аналізу: "${query}"` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!res.ok) {
      console.warn("Gemini API drug lookup HTTP error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    const parsed = JSON.parse(candidateText);
    if (!parsed.name || !parsed.wada_status) return null;

    return {
      name: parsed.name,
      active_substance: parsed.active_substance || query,
      category: parsed.category || "nsaid_painkillers",
      wada_status: parsed.wada_status || "allowed",
      wada_source_note: parsed.wada_source_note || "WADA Prohibited List: Офіційний статус",
      washout_note: parsed.washout_note || "Період виведення уточнюється за інструкцією.",
      indications: parsed.indications || "Показання згідно з офіційною інструкцією препарату.",
      min_age: typeof parsed.min_age === "number" ? parsed.min_age : null,
      age_note: parsed.age_note || "Застосовувати під наглядом спортивного лікаря клубу.",
      requires_review: Boolean(parsed.requires_review),
      storage_location: parsed.storage_location || "Аптечка медкабінету",
      unit: parsed.unit || "упак.",
      min_alert_threshold: parsed.min_alert_threshold || 5,
      aliases: [query.toLowerCase()],
    };
  } catch (err) {
    console.warn("Failed to lookup drug with Gemini AI:", err);
    return null;
  }
}
