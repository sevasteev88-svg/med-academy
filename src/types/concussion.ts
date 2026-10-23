/**
 * concussion.ts — Типи та константи модуля струсу мозку (SCAT6 / FIFA Concussion Protocol)
 *
 * Відповідає вимогам безпеки:
 * - Захист копірайту: зміст опитувальників не копіюється, тільки поля числових балів та посилання
 * - Передсезонний бейзлайн (Baseline)
 * - Ступеневе повернення (6 ступенів GRTP) з контекстними симптомами-підказками
 * - Жорстке блокування гравця як «недоступний» у getPlayerAvailability
 */

export type RedFlagItem =
  | "neck_pain"
  | "double_vision"
  | "weakness_tingling"
  | "severe_headache"
  | "seizure_convulsion"
  | "loss_of_consciousness"
  | "deteriorating_state"
  | "repeated_vomiting";

export const RED_FLAG_LABELS: Record<RedFlagItem, string> = {
  neck_pain: "Біль або чутливість у шийному відділі хребта",
  double_vision: "Двоїння в очах (диплопія)",
  weakness_tingling: "Слабкість, оніміння або поколювання в руках/ногах",
  severe_headache: "Сильний наростаючий головний біль",
  seizure_convulsion: "Судоми або конвульсії",
  loss_of_consciousness: "Втрата свідомості (навіть короткочасна)",
  deteriorating_state: "Погіршення рівня свідомості або дезорієнтація",
  repeated_vomiting: "Повторне блювання",
};

export type ConcussionMechanism =
  | "head_to_head"
  | "head_to_ground"
  | "head_to_ball"
  | "body_impact"
  | "elbow_to_head"
  | "other";

export const CONCUSSION_MECHANISM_LABELS: Record<ConcussionMechanism, string> = {
  head_to_head: "Зіткнення головами у повітрі/єдиноборстві",
  head_to_ground: "Удар головою об газон при падінні",
  head_to_ball: "Потужний удар м'ячем у голову з близької відстані",
  elbow_to_head: "Удар ліктем/рукою суперника в голову",
  body_impact: "Силовий удар у тулуб з хлистовим рухом шиї (Whiplash)",
  other: "Інший механізм травми голови",
};

export type ConcussionStageNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type ConcussionStageDetail = {
  stage: ConcussionStageNumber;
  title: string;
  activities: string;
  goal: string;
  minDurationHours: number;
  requiresDoctorClearance: boolean;
  typicalSymptoms: string[]; // Характерні симптоми-підказки для цього ступеня
};

/**
 * 6 Ступенів поступового повернення (Graduated Return to Play — CISG Amsterdam 2023 / SCAT6)
 * з характерними симптомами-тригерами для кожного ступеня
 */
export const CONCUSSION_GRTP_STAGES: Record<ConcussionStageNumber, ConcussionStageDetail> = {
  1: {
    stage: 1,
    title: "Симптом-обмежена активність (24–48 год спокою)",
    activities: "Побутова активність, спокійна ходьба, обмеження гаджетів та екранів",
    goal: "Зникнення гострих симптомів у спокої",
    minDurationHours: 24,
    requiresDoctorClearance: false,
    typicalSymptoms: [
      "Головний біль при погляді на екрани гаджетів (screen time)",
      "Світлобоязнь (фотофобія) або непереносимість гучних звуків",
      "Нудота або запаморочення при звичайній ходьбі",
      "Швидка втома та затуманеність свідомості (brain fog)",
    ],
  },
  2: {
    stage: 2,
    title: "Легке аеробне навантаження (ЧСС < 70% max)",
    activities: "Велотренажер 15-20 хв, швидка ходьба. Жодних силових вправ чи стрибків!",
    goal: "Підвищення ЧСС без провокації симптомів та стрибків внутрішньочерепного тиску",
    minDurationHours: 24,
    requiresDoctorClearance: false,
    typicalSymptoms: [
      "Пульсуючий головний біль при зростанні пульсу",
      "Відчуття тиску в скронях або потилиці",
      "Шум або дзвін у вухах (тинітус)",
      "Задишка або нестійкість невідповідно легкому темпу",
    ],
  },
  3: {
    stage: 3,
    title: "Футбольно-специфічні вправи (БЕЗ гри головою!)",
    activities: "Бігова інтервальна робота, дриблінг ногами, зміна напрямку. ЖОДНОГО удару головою!",
    goal: "Відновлення координації рухів та вестибуло-окулярного рефлексу",
    minDurationHours: 24,
    requiresDoctorClearance: false,
    typicalSymptoms: [
      "Запаморочення при різких поворотах голови або гальмуванні",
      "Розмитість зору або двоїння в очах (порушення VOR)",
      "Втрата орієнтації на полі при швидкій зміні напрямку",
      "Нудота від вестибулярного навантаження",
    ],
  },
  4: {
    stage: 4,
    title: "Безконтактні тренувальні вправи в групі",
    activities: "Передачі в парах, тактичні вправи, силове тренування в залі (без натужування)",
    goal: "Когнітивне навантаження, швидкість мислення та спеціальна витривалість",
    minDurationHours: 24,
    requiresDoctorClearance: false,
    typicalSymptoms: [
      "Когнітивне перевантаження: складно сприймати швидкі тактичні завдання",
      "Головний біль при напруженні (маневр Вальсальви під час ваги)",
      "Дратівливість, емоційна лабільність",
      "Уповільнена реакція на м'яч наприкінці тренування",
    ],
  },
  5: {
    stage: 5,
    title: "Повноконтактне тренування (лише після допуску лікаря)",
    activities: "Повне тренування в загальній групі, єдиноборства, гра головою",
    goal: "Оцінка функціональної готовності та відновлення впевненості у боротьбі",
    minDurationHours: 24,
    requiresDoctorClearance: true, // Обов'язковий підпис лікаря перед виходом у контакт!
    typicalSymptoms: [
      "Страх контакту чи боротьби (психологічна неготовність)",
      "Симптоми після першого зіткнення чи удару по м'ячу головою",
      "Біль або скутість у шийному відділі хребта (цервікалгія)",
    ],
  },
  6: {
    stage: 6,
    title: "Повернення до офіційних матчів (Return to Play)",
    activities: "Повний допуск до гри в офіційних матчах",
    goal: "Повноцінна змагальна діяльність без обмежень",
    minDurationHours: 0,
    requiresDoctorClearance: true,
    typicalSymptoms: ["Будь-які поновлені симптоми під час або після матчу"],
  },
};

export type ConcussionStageProgress = {
  stage: ConcussionStageNumber;
  date: string; // YYYY-MM-DD
  doctor_signature_name: string;
  is_symptom_free_24h: boolean;
  symptoms_noted: string[];
  medical_clearance_granted?: boolean;
  notes?: string;
};

export type ConcussionBaseline = {
  id: string;
  club_id: string;
  player_id: string;
  season: string; // "2026/2027"
  date: string;
  examiner_doctor: string;
  baseline_symptoms_count: number; // 0 - 22
  baseline_severity_score: number; // 0 - 132
  baseline_sac_score: number; // 0 - 30 (Standardized Assessment of Concussion)
  baseline_bess_errors: number; // mBESS помилки
  notes?: string | null;
  created_at: string;
};

export type ConcussionCase = {
  id: string;
  club_id: string;
  injury_id?: string | null;
  player_id: string;
  incident_date: string;
  incident_time?: string;
  mechanism: ConcussionMechanism;
  mechanism_description?: string;
  has_red_flags: boolean;
  red_flags: RedFlagItem[];
  symptom_count: number; // 0 - 22
  symptom_severity: number; // 0 - 132
  sac_score?: number; // 0 - 30
  bess_errors?: number; // mBESS
  current_stage: ConcussionStageNumber;
  stage_history: ConcussionStageProgress[];
  baseline_id?: string | null;
  status: "active" | "recovering" | "closed";
  closed_at?: string | null;
  closed_by?: string | null;
  created_at: string;
  updated_at: string;
};

// Збережено сумісність з існуючим Scat6ConcussionAssessment
export type ConcussionAssessment = {
  id: string;
  injury_id: string;
  date: string;
  examiner: string;
  has_red_flags: boolean;
  red_flags_selected: RedFlagItem[];
  maddocks_score: number;
  total_symptoms_count: number;
  total_symptom_severity_score: number;
  bess_double_leg_errors: number;
  bess_single_leg_errors: number;
  bess_tandem_errors: number;
  bess_total_errors: number;
  current_rtp_stage: 1 | 2 | 3 | 4 | 5 | 6;
  clinical_verdict: "suspected_concussion" | "cleared_no_concussion" | "recovering";
  recommendations: string;
  created_at: string;
};

export const RTP_CONCUSSION_STAGES = CONCUSSION_GRTP_STAGES;

/**
 * Валідація переходу на наступний ступінь GRTP:
 * - Відсутність симптомів протягом щонайменше 24 годин
 * - Якщо симптоми присутні — повернення на ступінь назад!
 * - Для Ступеня 5 необхідний явний медичний допуск лікаря
 */
export function validateStageTransition(params: {
  currentStage: ConcussionStageNumber;
  targetStage: ConcussionStageNumber;
  isSymptomFree24h: boolean;
  symptomsNoted: string[];
  doctorSignatureName: string;
  medicalClearanceGranted?: boolean;
}): {
  allowed: boolean;
  nextStage: ConcussionStageNumber;
  actionReason: string;
  error?: string;
} {
  if (!params.doctorSignatureName || params.doctorSignatureName.trim().length === 0) {
    return {
      allowed: false,
      nextStage: params.currentStage,
      actionReason: "Помилка валідації",
      error: "Необхідно зазначити ПІБ лікаря для електронного підпису протоколу",
    };
  }

  // Якщо симптоми присутні або не витримано 24 години спокою
  if (!params.isSymptomFree24h || params.symptomsNoted.length > 0) {
    const fallbackStage = Math.max(1, params.currentStage - 1) as ConcussionStageNumber;
    return {
      allowed: false,
      nextStage: fallbackStage,
      actionReason: `Зафіксовано симптоми (${params.symptomsNoted.join(", ")}). Згідно з протоколом SCAT6, навантаження зупинено: повернення на Ступінь ${fallbackStage} після 24 год спокою.`,
      error: `Неможливо перейти далі: наявні симптоми. Пацієнт повертається на Ступінь ${fallbackStage}.`,
    };
  }

  // Перевірка Ступеня 5 (повноконтактне тренування)
  if (params.targetStage === 5 && !params.medicalClearanceGranted) {
    return {
      allowed: false,
      nextStage: params.currentStage,
      actionReason: "Потрібен окремий клінічний допуск",
      error: "Для переходу до повноконтактного тренування (Ступінь 5) обов'язковий окремий Medical Clearance лікаря!",
    };
  }

  return {
    allowed: true,
    nextStage: params.targetStage,
    actionReason: `Успішний перехід на Ступінь ${params.targetStage}: симптоми відсутні > 24 год, підтверджено лікарем ${params.doctorSignatureName}`,
  };
}
