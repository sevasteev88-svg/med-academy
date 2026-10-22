export type RpeScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type AttendanceStatus = "present" | "absent";

export type TrainingSessionType =
  | "match"
  | "training_team"
  | "individual_rehab"
  | "gym_strength"
  | "recovery";

export type SessionRpeEntry = {
  id: string;
  player_id: string;
  club_id?: string;
  team_id?: string | null;
  team_session_id?: string | null;
  date: string;
  session_type: TrainingSessionType;
  duration_minutes: number;
  rpe_score: RpeScore;
  coach_rpe?: RpeScore | null;
  player_rpe?: RpeScore | null;
  attendance_status?: AttendanceStatus;
  absence_reason?: string | null;
  workload_au: number;
  notes?: string | null;
  created_at: string;
};

export type AcwrRiskZone =
  | "insufficient_data"
  | "underload"
  | "sweet_spot"
  | "caution"
  | "danger";

export type PlayerWorkloadSummary = {
  playerId: string;
  playerName: string;
  teamName: string;
  position: string;
  acuteLoad: number;
  chronicLoad: number;
  weeklyChronicAverage: number;
  acwr: number | null;
  riskZone: AcwrRiskZone;
  isInsufficientData?: boolean;
  recentSessionsCount: number;
  lastSessionDate: string | null;
  lastSessionRpe: number | null;
  lastSessionWorkload: number | null;
  attendanceStatus?: AttendanceStatus;
  rpeDiscrepancy?: {
    coachRpe: number;
    playerRpe: number;
    diff: number;
  } | null;
};

export type TeamTrainingPlayerItem = {
  playerId: string;
  playerName: string;
  position: string;
  isPresent: boolean;
  absenceReason?: string;
  minutes: number;
  rpeScore: RpeScore;
  playerRpe?: RpeScore | null;
  notes?: string;
};

export type SaveTeamTrainingInput = {
  teamId: string;
  date: string;
  sessionType: TrainingSessionType;
  defaultMinutes: number;
  defaultRpe: RpeScore;
  sessionNotes?: string;
  players: {
    playerId: string;
    isPresent: boolean;
    absenceReason?: string | null;
    minutes: number;
    rpeScore: RpeScore;
    notes?: string | null;
  }[];
};

export const SESSION_TYPE_UA: Record<TrainingSessionType, { label: string; icon: string }> = {
  match: { label: "Офіційний матч", icon: "⚽" },
  training_team: { label: "Командне тренування", icon: "🏃" },
  individual_rehab: { label: "Індивідуальна реабілітація", icon: "🩹" },
  gym_strength: { label: "Силовий зал (Тренажерний зал)", icon: "🏋️" },
  recovery: { label: "Відновлювальне тренування", icon: "🧘" },
};

export const BORG_CR10_SCALE: Record<RpeScore, { label: string; desc: string; color: string }> = {
  0: { label: "Спокій / Відпочинок", desc: "Без зусиль (відпочинок або відсутній)", color: "#64748b" },
  1: { label: "Дуже легко", desc: "Майже без зусиль (розминка, стретчинг)", color: "#10b981" },
  2: { label: "Легко", desc: "Комфортний темп, вільне спілкування", color: "#10b981" },
  3: { label: "Помірно", desc: "Відчутне навантаження, прискорене дихання", color: "#22c55e" },
  4: { label: "Трохи важко", desc: "Початок накопичення втоми", color: "#84cc16" },
  5: { label: "Важко", desc: "Помітна втома, складно розмовляти", color: "#eab308" },
  6: { label: "Досить важко", desc: "Високий темп, інтенсивні відрізки", color: "#f59e0b" },
  7: { label: "Дуже важко", desc: "Швидкісно-силова робота, високий пульс", color: "#f97316" },
  8: { label: "Надзвичайно важко", desc: "Тяжке виснаження, боротьба з темпом", color: "#ea580c" },
  9: { label: "Майже максимум", desc: "Граничне навантаження (максимальний спринт)", color: "#ef4444" },
  10: { label: "Максимум (All-out)", desc: "Абсолютна межа можливостей організму", color: "#b91c1c" },
};

export const ABSENCE_REASONS = [
  { id: "injury", label: "Травма / реабілітація" },
  { id: "illness", label: "Хвороба / застуда" },
  { id: "recovery", label: "Планове відновлення" },
  { id: "personal", label: "Сімейні / особисті причини" },
  { id: "school", label: "Навчання / іспити" },
  { id: "unspecified", label: "Без пояснення" },
] as const;

/**
 * Розрахунок коефіцієнта ACWR (Gabbett Acute:Chronic Workload Ratio).
 * Враховує наукові правила задачі 3.1: якщо спостережень недостатньо (менше 14-28 днів
 * або хронічне навантаження 0), повертається статус "insufficient_data".
 */
export function calculateAcwr(
  acuteLoad7d: number,
  chronicLoad28d: number,
  options?: { chronicSessionsCount?: number }
): {
  acwr: number | null;
  riskZone: AcwrRiskZone;
  titleUa: string;
  badgeClass: string;
  isInsufficientData: boolean;
} {
  const weeklyChronic = chronicLoad28d > 0 ? chronicLoad28d / 4 : 0;
  const sessionsCount = options?.chronicSessionsCount ?? (chronicLoad28d > 0 ? 4 : 0);

  // Правило «недостатньо даних» (задача 3.1):
  // Для розрахунку хронічного навантаження необхідно мінімум систематичних записів у 28-денному вікні.
  if (weeklyChronic === 0 || sessionsCount < 3) {
    return {
      acwr: null,
      riskZone: "insufficient_data",
      titleUa: "Недостатньо даних (триває базовий збір навантажень)",
      badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
      isInsufficientData: true,
    };
  }

  const ratio = Math.round((acuteLoad7d / weeklyChronic) * 100) / 100;

  if (ratio < 0.8) {
    return {
      acwr: ratio,
      riskZone: "underload",
      titleUa: "Недонавантаження (ACWR < 0.8) — ризик деадаптації",
      badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      isInsufficientData: false,
    };
  }
  if (ratio <= 1.3) {
    return {
      acwr: ratio,
      riskZone: "sweet_spot",
      titleUa: "Зона оптимуму (0.8 – 1.3) — Sweet Spot",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      isInsufficientData: false,
    };
  }
  if (ratio < 1.5) {
    return {
      acwr: ratio,
      riskZone: "caution",
      titleUa: "Підвищене навантаження (1.3 – 1.5) — моніторинг",
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      isInsufficientData: false,
    };
  }
  return {
    acwr: ratio,
    riskZone: "danger",
    titleUa: "Небезпечна зона (ACWR >= 1.5) — ризик травми x2..4",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30 font-bold",
    isInsufficientData: false,
  };
}
