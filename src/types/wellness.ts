export type WellnessScore = 1 | 2 | 3 | 4 | 5;

export type WellnessEntrySource = "player" | "kiosk" | "staff";

export interface WellnessEntry {
  id: string;
  club_id: string;
  player_id: string;
  date: string; // YYYY-MM-DD
  sleep_quality: WellnessScore; // 1-5
  fatigue: WellnessScore; // 1-5 (1 виснажений, 5 свіжий)
  soreness: WellnessScore; // 1-5 (1 біль, 5 м'язи свіжі)
  stress: WellnessScore | null; // 1-5 (1 стрес, 5 спокійний). Null для тренера!
  sleep_hours: number | null;
  pain: boolean;
  pain_vas: number | null; // 0-10
  pain_locations: string[] | null;
  illness: boolean;
  comment: string | null; // Null для тренера!
  submitted_at: string;
  source: WellnessEntrySource;
}

export type CoachWellnessEntry = Omit<WellnessEntry, "stress" | "comment"> & {
  stress: null;
  comment: null;
};

export const PAIN_LOCATIONS_LIST = [
  { id: "head", label: "Голова", icon: "🧠" },
  { id: "neck_shoulder", label: "Шия / Плече", icon: "🦒" },
  { id: "back_lumbar", label: "Спина / Поперек", icon: "🧱" },
  { id: "groin", label: "Пах / Привідні м'язи", icon: "🩲" },
  { id: "thigh_anterior", label: "Стегно спереду (Квадрицепс)", icon: "🦵" },
  { id: "thigh_posterior", label: "Стегно ззаду (Хамстрінг)", icon: "🦵" },
  { id: "knee_left", label: "Коліно ліве", icon: "⚪" },
  { id: "knee_right", label: "Коліно праве", icon: "⚪" },
  { id: "calf_shin", label: "Гомілка / Литка", icon: "🦶" },
  { id: "achilles", label: "Ахілл / П'ята", icon: "👟" },
  { id: "foot_ankle", label: "Стопа / Гомілковостоп", icon: "👣" },
];

export type WellnessSurvey = {
  id: string;
  player_id: string;
  date: string;
  sleep_quality: WellnessScore; // 1 = Дуже погано, 5 = Чудово
  fatigue_level: WellnessScore; // 1 = Сильне виснаження, 5 = Свіжий/бадьорий
  muscle_soreness: WellnessScore; // 1 = Сильна крепатура/біль, 5 = Нормально/без болю
  stress_level: WellnessScore; // 1 = Високий стрес, 5 = Спокійний/гарний настрій
  soreness_location?: string | null; // e.g., "Стегно (задня поверхня)", "Литка"
  total_score: number; // Сума балів (4 - 20). 
  readiness_status: "optimal" | "warning" | "risk"; // 16-20 optimal, 12-15 warning, <12 risk
  notes?: string | null;
  created_at: string;
};

/**
 * Розрахунок статусу готовності за шкалою Hooper-Mackinnon (Total Wellness Score):
 * Максимум 20 балів.
 * 16–20: 🟢 Оптимальна готовність до тренування (Optimal)
 * 12–15: 🟡 Помірна втома / крепатура — рекомендується моніторинг (Warning)
 * < 12 або будь-який показник = 1: 🔴 Високий ризик травми — потрібна консультація лікаря (Risk)
 */
export function calculateWellnessReadiness(survey: {
  sleep_quality: number;
  fatigue_level: number;
  muscle_soreness: number;
  stress_level: number;
}): { total_score: number; readiness_status: "optimal" | "warning" | "risk" } {
  const total =
    survey.sleep_quality +
    survey.fatigue_level +
    survey.muscle_soreness +
    survey.stress_level;

  if (
    total < 12 ||
    survey.sleep_quality === 1 ||
    survey.fatigue_level === 1 ||
    survey.muscle_soreness === 1
  ) {
    return { total_score: total, readiness_status: "risk" };
  }

  if (total <= 15 || survey.muscle_soreness === 2) {
    return { total_score: total, readiness_status: "warning" };
  }

  return { total_score: total, readiness_status: "optimal" };
}
