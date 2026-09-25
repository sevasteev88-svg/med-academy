export type MuscleGroup =
  | "hamstrings" // Задня поверхня стегна
  | "quadriceps" // Чотириголовий м'яз / передня поверхня стегна
  | "adductors" // Привідні м'язи / пахова зона
  | "calves_achilles" // Гомілка, литка та ахіллове сухожилля
  | "glutes_hips" // Сідничні м'язи та кульшовий суглоб
  | "core_lumbar" // Кор, м'язи живота та поперек
  | "shoulder_upper" // Плечовий пояс та верхній плечовий комплекс
  | "knee_joint" // Колінний суглоб (ПКС, ЗКС, меніски, пателофеморальний синдром)
  | "ankle_joint"; // Гомілкостоп (зв'язки ATFL, CFL, синдесмоз)

export type ExerciseTargetType = "muscle" | "joint" | "injury";

export type RehabPhaseType = "early" | "intermediate" | "late_dynamic" | "all";

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  joints: ("knee" | "ankle" | "hip" | "groin" | "spine" | "shoulder")[];
  injuryTags: string[]; // напр., ["hamstring_strain", "acl_tear", "ankle_sprain", "groin_pain", "meniscus"]
  phase: RehabPhaseType;
  defaultSetsReps: string; // "3 підходи × 10-12 повторень"
  targetArea: string;
  technique: string;
  equipment?: string; // "Фітбол", "Еспандер", "Airex подушка", "Власна вага", "Гантелі"
  videoUrl?: string;
  precautions?: string; // На що звернути увагу, протипоказання
}

export interface CustomRehabPlanItem {
  exerciseId: string;
  name: string;
  setsReps: string;
  targetArea: string;
  technique: string;
  notes?: string;
}

export interface PlayerCustomRehabPlan {
  id?: string;
  player_id: string;
  doctor_name: string;
  title: string;
  muscle_or_injury_focus: string;
  exercises: CustomRehabPlanItem[];
  created_at: string;
  is_active: boolean;
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, { label: string; icon: string }> = {
  hamstrings: { label: "Задня поверхня стегна (Хамстрінг)", icon: "🦵" },
  quadriceps: { label: "Чотириголовий м'яз (Квадріцепс)", icon: "⚡" },
  adductors: { label: "Привідні м'язи (Пах / Аддуктори)", icon: "🩲" },
  calves_achilles: { label: "Гомілка, литка та Ахілл", icon: "🦶" },
  glutes_hips: { label: "Сідниці та кульшовий суглоб", icon: "🍑" },
  core_lumbar: { label: "Кор, прес та поперековий відділ", icon: "🧱" },
  shoulder_upper: { label: "Плече та верхній плечовий пояс", icon: "🦾" },
  knee_joint: { label: "Колінний суглоб (ПКС/ЗКС/Меніск)", icon: "🦿" },
  ankle_joint: { label: "Гомілкостоп та стопа", icon: "👟" },
};
