export type RedFlagItem =
  | "neck_pain"
  | "double_vision"
  | "weakness_tingling"
  | "severe_headache"
  | "seizure_convulsion"
  | "loss_of_consciousness"
  | "deteriorating_state"
  | "repeated_vomiting";

export type MaddocksQuestion = {
  id: string;
  question: string;
  correctAnswer: string;
};

export type ConcussionAssessment = {
  id: string;
  injury_id: string;
  date: string;
  examiner: string;

  // Крок 1: Червоні прапорці (Red Flags) - екстрена госпіталізація 103
  has_red_flags: boolean;
  red_flags_selected: RedFlagItem[];

  // Крок 2: Оцінка на полі (Maddocks Score: 0 - 5)
  maddocks_score: number; // 5 правильних відповідей = норма

  // Крок 3: Шкала симптомів SCAT6 (22 симптоми, кожен 0-6, всього 0 - 132 бали)
  total_symptoms_count: number; // к-сть не-нульових симптомів (0 - 22)
  total_symptom_severity_score: number; // сума балів тяжкості (0 - 132)

  // Крок 4: Тест балансу mBESS (помилки балансу на 2 ногах, 1 нозі, тандем: норма <= 3)
  bess_double_leg_errors: number;
  bess_single_leg_errors: number;
  bess_tandem_errors: number;
  bess_total_errors: number;

  // Крок 5: Поточний етап відновлення (Graduated Return-to-Play, 1 - 6)
  current_rtp_stage: 1 | 2 | 3 | 4 | 5 | 6;

  clinical_verdict: "suspected_concussion" | "cleared_no_concussion" | "recovering";
  recommendations: string;
  created_at: string;
};

export const RTP_CONCUSSION_STAGES: Record<
  1 | 2 | 3 | 4 | 5 | 6,
  { stage: string; title: string; activities: string; goal: string }
> = {
  1: {
    stage: "Етап 1",
    title: "Відносний фізичний та когнітивний спокій",
    activities: "Обмеження екранів смартфонів, прогулянки без навантажень (перші 24-48 год)",
    goal: "Зникнення гострих симптомів",
  },
  2: {
    stage: "Етап 2",
    title: "Легке аеробне навантаження",
    activities: "Велотренажер або біг підтюпцем у комфортному темпі (HR < 70% max, 15-20 хв)",
    goal: "Підвищення частоти серцевих скорочень без провокації симптомів",
  },
  3: {
    stage: "Етап 3",
    title: "Футбольно-специфічні вправи",
    activities: "Бігова робота, ведення м'яча, зміна напрямку без ударів головою",
    goal: "Координація рухів та футбольні рухові патерни",
  },
  4: {
    stage: "Етап 4",
    title: "Безконтактні тренувальні вправи",
    activities: "Складні тактичні вправи в групі, пасова робота, тренажерний зал (без спарингів)",
    goal: "Відновлення ігрової впевненості та навантаження мислення",
  },
  5: {
    stage: "Етап 5",
    title: "Повноконтактне тренування (після медичного допуску)",
    activities: "Звичайне командне тренування з єдиноборствами, верхові м'ячі (хедінг)",
    goal: "Оцінка стійкості у контактній грі",
  },
  6: {
    stage: "Етап 6",
    title: "Повернення до офіційних матчів (Return to Play)",
    activities: "Повний допуск до гри в календарі УПЛ / ДЮФЛУ",
    goal: "Змагальна діяльність",
  },
};
