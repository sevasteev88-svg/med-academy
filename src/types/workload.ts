export type RpeScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type TrainingSessionType =
  | "match"
  | "training_team"
  | "individual_rehab"
  | "gym_strength"
  | "recovery";

export type SessionRpeEntry = {
  id: string;
  player_id: string;
  date: string;
  session_type: TrainingSessionType;
  duration_minutes: number;
  rpe_score: RpeScore;
  workload_au: number;
  notes?: string | null;
  created_at: string;
};

export type PlayerWorkloadSummary = {
  playerId: string;
  playerName: string;
  teamName: string;
  position: string;
  acuteLoad: number;
  chronicLoad: number;
  weeklyChronicAverage: number;
  acwr: number;
  riskZone: "underload" | "sweet_spot" | "caution" | "danger";
  recentSessionsCount: number;
  lastSessionDate: string | null;
  lastSessionRpe: number | null;
  lastSessionWorkload: number | null;
};

export const SESSION_TYPE_UA: Record<TrainingSessionType, { label: string; icon: string }> = {
  match: { label: "Офіційний матч", icon: "⚽" },
  training_team: { label: "Командне тренування", icon: "🏃" },
  individual_rehab: { label: "Індивідуальна реабілітація", icon: "🩹" },
  gym_strength: { label: "Силовий зал (Тренажерний зал)", icon: "🏋️" },
  recovery: { label: "Відновлювальне тренування", icon: "🧘" },
};

export const BORG_CR10_SCALE: Record<RpeScore, { label: string; desc: string; color: string }> = {
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

export function calculateAcwr(acuteLoad7d: number, chronicLoad28d: number): {
  acwr: number;
  riskZone: "underload" | "sweet_spot" | "caution" | "danger";
  titleUa: string;
  badgeClass: string;
} {
  const weeklyChronic = chronicLoad28d > 0 ? chronicLoad28d / 4 : 0;
  if (weeklyChronic === 0) {
    return {
      acwr: acuteLoad7d > 0 ? 1.0 : 0,
      riskZone: "sweet_spot",
      titleUa: "Базовий стан (початок циклу)",
      badgeClass: "bg-slate-800 text-slate-300 border-slate-700",
    };
  }

  const ratio = Math.round((acuteLoad7d / weeklyChronic) * 100) / 100;

  if (ratio < 0.8) {
    return {
      acwr: ratio,
      riskZone: "underload",
      titleUa: "Недонавантаження (ACWR < 0.8) — ризик деадаптації",
      badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    };
  }
  if (ratio <= 1.3) {
    return {
      acwr: ratio,
      riskZone: "sweet_spot",
      titleUa: "Зона оптимуму (0.8 – 1.3) — Sweet Spot",
      badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    };
  }
  if (ratio < 1.5) {
    return {
      acwr: ratio,
      riskZone: "caution",
      titleUa: "Підвищене навантаження (1.3 – 1.5) — моніторинг",
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    };
  }
  return {
    acwr: ratio,
    riskZone: "danger",
    titleUa: "Небезпечна зона (ACWR >= 1.5) — ризик травми x2..4",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30 font-bold",
  };
}
