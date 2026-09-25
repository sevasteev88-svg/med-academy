import type { ExerciseLibraryItem } from "@/types/exercise-library";

export const EXERCISE_DATABASE: ExerciseLibraryItem[] = [
  // ==========================================
  // 1. ЗАДНЯ ПОВЕРХНЯ СТЕГНА (HAMSTRINGS)
  // ==========================================
  {
    id: "ham-extender",
    name: "Askling 'Extender' (Згинання-розгинання лежачи)",
    muscleGroups: ["hamstrings"],
    joints: ["hip", "knee"],
    injuryTags: ["hamstring_strain", "biceps_femoris", "tendinopathy"],
    phase: "early",
    defaultSetsReps: "3 підходи × 12 повторень",
    targetArea: "Мобільність сідничного нерва та задньої поверхні стегна",
    technique:
      "Стегно зафіксоване руками строго під 90°. Повільне розгинання гомілки вгору до відчуття легкого комфортного натяжіння. Темп плавний, не форсувати через біль (макс. 2/10).",
    equipment: "Власна вага",
    precautions: "Уникати різких рухів у кінцевій точці амплітуди.",
  },
  {
    id: "ham-ball-curl",
    name: "Сідничний міст на фітболі (Hamstring Ball Curl)",
    muscleGroups: ["hamstrings", "glutes_hips"],
    joints: ["knee", "hip"],
    injuryTags: ["hamstring_strain", "muscle_weakness"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 10-12 повторень",
    targetArea: "Двоголовий м'яз стегна у закритому кінематичному ланцюзі",
    technique:
      "Лежачи на спині, п'яти на вершині фітболу. Підняти таз до прямої лінії тіла. Згинаючи коліна, підтягувати м'яч п'ятами до сідниць, утримуючи таз високо. Повільно розігнути ноги назад.",
    equipment: "Фітбол (Gymball)",
    precautions: "Не допускати прогину в попереку.",
  },
  {
    id: "ham-nordic",
    name: "Нордичні опускання (Nordic Hamstring Exercise)",
    muscleGroups: ["hamstrings"],
    joints: ["knee"],
    injuryTags: ["hamstring_strain", "prevention_reinjury"],
    phase: "late_dynamic",
    defaultSetsReps: "3 підходи × 5-8 повторень",
    targetArea: "Ексцентрична сила дистального сухожилка та захист від рецидиву",
    technique:
      "Коліна на м'якому килимку, гомілки надійно зафіксовані партнером або під важкою штангою/валиком. Зберігаючи тулуб та стегна в одній лінії, максимально повільно опускатися вперед, опираючись силі тяжіння за рахунок хамстрінгів. В кінці м'яко зловити себе руками і відштовхнутися назад.",
    equipment: "Фіксатор для гомілок або партнер",
    precautions: "Золотий стандарт FIFA 11+ для профілактики надривів хамстрінга.",
  },
  {
    id: "ham-rdl-single",
    name: "Румунська тяга на одній нозі (Single Leg RDL)",
    muscleGroups: ["hamstrings", "glutes_hips"],
    joints: ["hip"],
    injuryTags: ["hamstring_strain", "hip_imbalance"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 8-10 повторень на кожну ногу",
    targetArea: "Ексцентричний контроль на довгих довжинах волокна",
    technique:
      "Опорне коліно злегка пом'якшене (15-20°). З прямою спиною нахиляти корпус уперед, одночасно відводячи вільну ногу назад до паралелі з підлогою. Відчути піковий натяг задньої поверхні опорної ноги та повернутися зусиллям сідниці.",
    equipment: "Гантель 6-12 кг або гіря",
  },
  {
    id: "ham-diver",
    name: "Askling 'The Diver' (Ластівка з динамічною стабілізацією)",
    muscleGroups: ["hamstrings", "core_lumbar"],
    joints: ["hip", "spine"],
    injuryTags: ["hamstring_strain", "functional_return"],
    phase: "late_dynamic",
    defaultSetsReps: "3 підходи × 6-8 повторень",
    targetArea: "Динамічний контроль хамстрінгів у повному розтягуванні корпусу",
    technique:
      "Стоячи на одній нозі, одночасно нахиляти тулуб уперед та розводити руки в боки («літак»), згинаючи опорне стегно до 90°. Контролювати горизонтальний рівень тазу без перекосу.",
    equipment: "Власна вага",
  },

  // ==========================================
  // 2. КОЛІННИЙ СУГЛОБ ТА КВАДРІЦЕПС
  // ==========================================
  {
    id: "knee-quad-sets",
    name: "Ізометричні квадріцепс-сети (Quad Sets)",
    muscleGroups: ["quadriceps", "knee_joint"],
    joints: ["knee"],
    injuryTags: ["acl_tear", "meniscus", "quad_contusion", "patellar_tendon"],
    phase: "early",
    defaultSetsReps: "3 підходи × 10 повторень (утримання 6 сек)",
    targetArea: "Медіальний широкий м'яз (VMO) та розгинальний апарат коліна",
    technique:
      "Лежачи на спині, невеликий валик під підколінною ямкою. Ізометрично напружувати передню поверхню стегна, вдавлюючи коліно вниз у кушетку та підтягуючи надколінок догори.",
    equipment: "Рушник / валик",
    precautions: "Перший крок після пластики ПКС або артроскопії меніска.",
  },
  {
    id: "knee-spanish-squat",
    name: "Іспанський присід з еспандером (Spanish Squat)",
    muscleGroups: ["quadriceps", "knee_joint"],
    joints: ["knee", "hip"],
    injuryTags: ["patellar_tendon", "jumper_knee", "quad_tendinopathy", "acl_tear"],
    phase: "intermediate",
    defaultSetsReps: "4 підходи × 8-10 повторень (темп 3-2-3)",
    targetArea: "Сухожилок чотириголового м'яза та зв'язка надколінка",
    technique:
      "Жорсткий джгут / еспандер зафіксований на висоті колін і одягнений за підколінні ямки обох ніг. Присідати до кута 70-80° із суворо вертикальною гомілкою та прямим корпусом. Утримати 2-3 секунди у нижній точці.",
    equipment: "Силовий еспандер (Power Band)",
    precautions: "Знижує компресійний стрес на пателофеморальний суглоб при вираженому тендиніті.",
  },
  {
    id: "knee-step-downs",
    name: "Ексцентричні сходинки вниз (Poliquin / Petersen Step-Down)",
    muscleGroups: ["quadriceps", "glutes_hips", "knee_joint"],
    joints: ["knee", "ankle"],
    injuryTags: ["acl_tear", "patellar_pain", "meniscus"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 10 повторень на ногу",
    targetArea: "Ексцентричний контроль квадріцепса та запобігання вальгусному завалу",
    technique:
      "Стоячи однією ногою на тумбі або сходинці 15-20 см, повільно опускати п'яту другої ноги до торкання підлоги, контролюючи щоб коліно опорної ноги дивилося строго по вектору 2-го пальця стопи.",
    equipment: "Степ-платформа 15-20 см",
  },
  {
    id: "knee-single-hop-stick",
    name: "Стрибок на одній нозі з м'якою фіксацією (Single Leg Hop & Stick)",
    muscleGroups: ["quadriceps", "calves_achilles", "knee_joint"],
    joints: ["knee", "ankle", "hip"],
    injuryTags: ["acl_tear", "fifa_rtp_clearance", "meniscus"],
    phase: "late_dynamic",
    defaultSetsReps: "3 підходи × 6 стрибків",
    targetArea: "Динамічна реактивна стабільність та пліометричний контроль",
    technique:
      "Стрибок вперед з однієї ноги на 60-80 см із м'яким приземленням на ту саму ногу, кут у коліні 45°, повна фіксація балансу та нерухомість протягом 3 секунд без підскоків.",
    equipment: "Розмітка / конуси",
    precautions: "Виконується лише при LSI силі розгинання > 85%.",
  },

  // ==========================================
  // 3. ПРИВІДНІ М'ЯЗИ ТА ПАХОВА ЗОНА (ADDUCTORS / GROIN)
  // ==========================================
  {
    id: "groin-copenhagen-short",
    name: "Копенгагенська планка (Copenhagen Adduction) — Коротка",
    muscleGroups: ["adductors", "core_lumbar"],
    joints: ["groin", "hip"],
    injuryTags: ["groin_pain", "adductor_longus", "pubalgia"],
    phase: "early",
    defaultSetsReps: "3 підходи × 15-20 сек на кожну сторону",
    targetArea: "Довгий та великий привідні м'язи стегна у статичному режимі",
    technique:
      "Бічна планка, де коліно верхньої ноги лежить на лаві або підтримується партнером, нижня нога вільно висить під лавою. Утримувати пряму лінію тулуба та тазу без провисання.",
    equipment: "Гімнастична лава",
  },
  {
    id: "groin-copenhagen-long",
    name: "Копенгагенська планка (Copenhagen Adduction) — Довгий важіль",
    muscleGroups: ["adductors", "core_lumbar"],
    joints: ["groin", "hip"],
    injuryTags: ["groin_pain", "prevention_reinjury"],
    phase: "late_dynamic",
    defaultSetsReps: "3 підходи × 8-10 динамічних підйомів",
    targetArea: "Максимальна ексцентрична сила та профілактика пахових травм",
    technique:
      "Опора на лаву здійснюється лише внутрішнім краєм стопи / гомілкостопом верхньої ноги. Підйом нижньої ноги до торкання дна лави і плавне опускання.",
    equipment: "Лава",
    precautions: "Не виконувати при гострому запаленні окістя лобкової кістки.",
  },
  {
    id: "groin-ball-squeeze",
    name: "Стискання м'яча між колінами (Isometric Squeeze)",
    muscleGroups: ["adductors"],
    joints: ["groin", "hip"],
    injuryTags: ["groin_pain", "adductor_strain"],
    phase: "early",
    defaultSetsReps: "4 підходи × 10 сек (70% зусилля)",
    targetArea: "Ізометрична активація привідного комплексу під кутом 45° та 0°",
    technique:
      "Лежачи на спині, коліна зігнуті на 45°. М'яч розміщений між внутрішніми виростками колін. Плавне нарощування тиску до 70% максимуму, утримання 10 секунд.",
    equipment: "М'яч медичний / пілатес",
  },
  {
    id: "groin-slider-lunge",
    name: "Бокові випади зі слайдером (Lateral Slide Lunge)",
    muscleGroups: ["adductors", "glutes_hips"],
    joints: ["groin", "hip", "knee"],
    injuryTags: ["groin_pain", "functional_return"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 8 повторень на ногу",
    targetArea: "Ексцентричне розтягування аддуктора під навантаженням власної ваги",
    technique:
      "Стоячи, одна нога на ковзному диску (слайдері). Згинаючи опорне коліно і відводячи таз назад, плавно відводити ногу на слайдері вбік до відчутного розтягування паху, потім притягнути ногу назад зусиллям аддуктора.",
    equipment: "Слайд-диск (Slider) / рушник на паркеті",
  },

  // ==========================================
  // 4. ГОМІЛКОСТОП, ЛИТКА ТА АХІЛЛ (ANKLE / CALF / ACHILLES)
  // ==========================================
  {
    id: "ankle-eccentric-heel-drop",
    name: "Ексцентричний Heel-Drop Альфредсона (Alfredson Protocol)",
    muscleGroups: ["calves_achilles", "ankle_joint"],
    joints: ["ankle"],
    injuryTags: ["achilles_tendinopathy", "calf_strain", "ankle_sprain"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 12-15 повторень на прямій і зігнутій нозі",
    targetArea: "Ікроножний та камбалоподібний м'язи, колагеновий матрикс Ахілла",
    technique:
      "Стоячи на краю сходинки подушечками стоп. Піднятися вгору на обох ногах, перенести вагу на травмовану ногу і повільно (за 3-4 сек) опустити п'яту нижче рівня сходинки.",
    equipment: "Сходинка або степ",
    precautions: "Виконувати з прямим коліном (литка) та з легким згинанням 30° (камбалоподібний).",
  },
  {
    id: "ankle-balance-airex",
    name: "Баланс на одній нозі на нестабільній подушці (Airex Balance)",
    muscleGroups: ["calves_achilles", "ankle_joint"],
    joints: ["ankle"],
    injuryTags: ["ankle_sprain", "lateral_ligaments", "instability"],
    phase: "early",
    defaultSetsReps: "3 підходи × 30-45 сек на кожну ногу",
    targetArea: "Глибока пропріоцепція та малогомілкові м'язи (peroneus longus/brevis)",
    technique:
      "Стоячи на пінопластовій подушці Airex на одній нозі, опорне коліно злегка зігнуте, погляд фіксований вперед. Утримувати нейтральну вісь гомілкостопа без завалів.",
    equipment: "Балансувальна подушка Airex",
  },
  {
    id: "ankle-star-excursion",
    name: "Дотягування ногою по зірці / Y-Balance тренування",
    muscleGroups: ["ankle_joint", "quadriceps", "glutes_hips"],
    joints: ["ankle", "knee", "hip"],
    injuryTags: ["ankle_sprain", "instability", "fifa_rtp_clearance"],
    phase: "late_dynamic",
    defaultSetsReps: "3 кола по 6 дотягувань у 3 напрямках",
    targetArea: "Динамічний контроль гомілкостопа при максимальній амплітуді",
    technique:
      "Опорна нога фіксована у центрі, вільною ногою плавно тягнутися носком у напрямках: передній, задньо-медіальний та задньо-латеральний, не переносячи вагу на вільну ногу.",
    equipment: "Маркери / конуси",
  },
  {
    id: "ankle-wb-lunge-mobilization",
    name: "Мобілізація тильного згинання стопи (WB Dorsiflexion Lunge)",
    muscleGroups: ["ankle_joint", "calves_achilles"],
    joints: ["ankle"],
    injuryTags: ["ankle_sprain", "limited_dorsiflexion", "syndesmosis"],
    phase: "early",
    defaultSetsReps: "2 підходи × 15 циклічних повторень",
    targetArea: "Таранно-гомілковий суглоб (Dorsiflexion ROM)",
    technique:
      "Випад перед стіною, пальці стопи за 10-12 см від стіни. Згинати гомілку вперед, намагаючись торкнутися коліном стіни без відриву п'яти від підлоги.",
    equipment: "Стіна або стійка",
  },

  // ==========================================
  // 5. СІДНИЦІ ТА СТАБІЛІЗАТОРИ ТАЗУ (GLUTES & HIPS)
  // ==========================================
  {
    id: "glute-clam-shell-band",
    name: "«Мушля» з гумовим кільцем (Clam Shell with Band)",
    muscleGroups: ["glutes_hips"],
    joints: ["hip"],
    injuryTags: ["groin_pain", "knee_valgus", "trochanteric_bursitis"],
    phase: "early",
    defaultSetsReps: "3 підходи × 15 повторень на кожен бік",
    targetArea: "Середній та малий сідничні м'язи (зовнішні ротатори стегна)",
    technique:
      "Лежачи на боці, коліна зігнуті під 90°, стопи разом, гумка вище колін. Розводити коліна вгору, не розкриваючи таз назад.",
    equipment: "Гумове міні-кільце (Mini Band)",
  },
  {
    id: "glute-single-leg-bridge",
    name: "Сідничний міст на одній нозі (Single Leg Glute Bridge)",
    muscleGroups: ["glutes_hips", "hamstrings", "core_lumbar"],
    joints: ["hip"],
    injuryTags: ["hamstring_strain", "acl_tear", "hip_imbalance"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 10-12 повторень на кожну ногу",
    targetArea: "Велика сіднична та біомеханічне розгинання стегна",
    technique:
      "Лежачи на спині, одна нога зігнута з опорою на п'яту, друга підтягнута до грудей. Потужним зусиллям сідниці виштовхувати таз угору до однієї лінії стегно-тулуб. Фіксація 2 сек угорі.",
    equipment: "Власна вага",
  },

  // ==========================================
  // 6. КОР, М'ЯЗИ ПРЕСУ ТА ПОПЕРЕК (CORE & LUMBAR)
  // ==========================================
  {
    id: "core-deadbug",
    name: "Активація глибокого кора (Dead Bug)",
    muscleGroups: ["core_lumbar"],
    joints: ["spine", "hip"],
    injuryTags: ["groin_pain", "lumbar_spine", "pubalgia"],
    phase: "early",
    defaultSetsReps: "3 підходи × 10 діагональних опускань",
    targetArea: "Поперечний м'яз живота (Transversus abdominis) та стабільність тазу",
    technique:
      "Лежачи на спині, руки підняті вгору, коліна зігнуті під 90° у повітрі. Поперек щільно втиснутий у підлогу. Одночасно повільно опускати праву руку і ліву ногу майже до підлоги, контролюючи щоб спина не вигиналася.",
    equipment: "Килимок",
  },
  {
    id: "core-pallof-press",
    name: "Жим Паллофа від блоку/гуми (Pallof Press)",
    muscleGroups: ["core_lumbar", "glutes_hips"],
    joints: ["spine"],
    injuryTags: ["lumbar_spine", "pubalgia", "functional_return"],
    phase: "intermediate",
    defaultSetsReps: "3 підходи × 12 повторень на кожну сторону",
    targetArea: "Анти-ротаційна стабілізація тулуба для єдиноборств",
    technique:
      "Стоячи боком до точки кріплення гуми/троса, утримувати ручку двома руками біля грудей. Витискати руки вперед перед собою, опираючись скручувальній силі.",
    equipment: "Еспандер або кросовер",
  },

  // ==========================================
  // 7. ПЛЕЧОВИЙ ПОЯС ТА КЛЮЧИЦЯ (SHOULDER)
  // ==========================================
  {
    id: "shoulder-sleeper-stretch",
    name: "Мобілізація капсули плеча (Sleeper Stretch & ER Rotations)",
    muscleGroups: ["shoulder_upper"],
    joints: ["shoulder"],
    injuryTags: ["shoulder_dislocation", "ac_joint_sprain", "rotator_cuff"],
    phase: "early",
    defaultSetsReps: "3 підходи × 12 повторень з легким еспандером",
    targetArea: "М'язи ротаторної манжети плеча (Infraspinatus, Teres minor)",
    technique:
      "Лікоть притиснутий до тулуба під кутом 90°. Плавне відведення передпліччя назовні проти опору гумового еспандера без руху плеча вгору.",
    equipment: "Легка гумова стрічка",
  },
];

/**
 * Фільтрація вправ за групою м'язів, суглобом або травмою
 */
export function filterExerciseDatabase(criteria: {
  muscleGroup?: string;
  joint?: string;
  injuryTag?: string;
  phase?: string;
  searchQuery?: string;
}): ExerciseLibraryItem[] {
  return EXERCISE_DATABASE.filter((item) => {
    if (criteria.muscleGroup && criteria.muscleGroup !== "all") {
      if (!item.muscleGroups.includes(criteria.muscleGroup as any)) return false;
    }
    if (criteria.joint && criteria.joint !== "all") {
      if (!item.joints.includes(criteria.joint as any)) return false;
    }
    if (criteria.injuryTag && criteria.injuryTag !== "all") {
      if (!item.injuryTags.includes(criteria.injuryTag)) return false;
    }
    if (criteria.phase && criteria.phase !== "all") {
      if (item.phase !== criteria.phase && item.phase !== "all") return false;
    }
    if (criteria.searchQuery && criteria.searchQuery.trim()) {
      const q = criteria.searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchTech = item.technique.toLowerCase().includes(q);
      const matchArea = item.targetArea.toLowerCase().includes(q);
      if (!matchName && !matchTech && !matchArea) return false;
    }
    return true;
  });
}
