export type ClearanceStatus = "cleared" | "provisional" | "disqualified";

export type PreSeasonScreening = {
  id: string;
  player_id: string;
  season: string; // e.g., "2025/2026"
  date: string;
  examiner_doctor: string;

  // 1. Кардіологічний допуск
  cardio_ecg_rest: "normal" | "borderline" | "abnormal";
  cardio_echo: "normal" | "abnormal" | "not_done";
  cardio_bp_systolic: number; // e.g. 115
  cardio_bp_diastolic: number; // e.g. 75
  cardio_hr_rest: number; // e.g. 60
  cardio_clearance: boolean;

  // 2. Ортопедо-біомеханічний скринінг
  ortho_thomas_test_left: "normal" | "tight"; // Згиначі стегна
  ortho_thomas_test_right: "normal" | "tight";
  ortho_hamstrings_90_90_left: number; // Кут дефіциту (градуси), напр. 15
  ortho_hamstrings_90_90_right: number;
  ortho_ankle_lunge_wblt_left: number; // Дорсифлексія (см від стіни), норма >= 10 см
  ortho_ankle_lunge_wblt_right: number;
  ortho_beighton_hypermobility_score: number; // 0-9 шкала Бейтона
  ortho_previous_surgeries: string | null;

  // 3. Лабораторний профіль
  lab_hemoglobin: number | null; // г/л
  lab_ferritin: number | null; // нг/мл (запас заліза)
  lab_vitamin_d: number | null; // нг/мл

  // 4. Фінальний вердикт
  overall_status: ClearanceStatus;
  restrictions_notes: string | null;
  valid_until: string;
  created_at: string;
};

export const CLEARANCE_STATUS_META: Record<
  ClearanceStatus,
  { label: string; badgeClass: string; icon: string }
> = {
  cleared: {
    label: "Допущений до змагань (Повний допуск)",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: "🟢",
  },
  provisional: {
    label: "Умовний допуск (Потребує контролю)",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: "🟡",
  },
  disqualified: {
    label: "Не допущений (Медичне відсторонення)",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: "🔴",
  },
};
