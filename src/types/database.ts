/**
 * Типи бази даних.
 *
 * Для автогенерації з Supabase виконай:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/types/database.ts
 */

// ─── Enums: загальні ────────────────────────────────────────

export type DominantSide = "left" | "right" | "both";

export type InjuryType =
  | "muscular"
  | "ligament"
  | "bone"
  | "tendon"
  | "cartilage"
  | "concussion"
  | "contusion"
  | "other";

export type InjuryLocation =
  | "knee"
  | "ankle"
  | "shoulder"
  | "hip"
  | "thigh"
  | "calf"
  | "foot"
  | "groin"
  | "back"
  | "neck"
  | "wrist"
  | "head"
  | "other";

export type InjurySide = "left" | "right" | "bilateral";

export type InjurySeverity =
  | "minimal"
  | "mild"
  | "moderate"
  | "severe"
  | "career_threatening";

export type InjuryMechanism = "contact" | "non_contact" | "overuse";

export type InjuryStatus = "active" | "rehabilitation" | "closed";

// ─── Enums: класифікація м'язових пошкоджень ────────────────

/**
 * Мюнхенський консенсус (MCIC) — Munich Consensus Classification
 *
 * Тип 1 — Функціональні (без макроскопічного розриву):
 *   1A — Перевтома (overexertion)
 *   1B — Мікроушкодження DOMS
 *
 * Тип 2 — Нервово-м'язові функціональні:
 *   2A — Спінальна (проблеми зі спиною)
 *   2B — М'язова (локальний нейром'язовий збій)
 *
 * Тип 3 — Структурні (є розрив волокон):
 *   3A — Мікророзрив (< 0.5 cm)
 *   3B — Частковий розрив (≥ 0.5 cm)
 *
 * Тип 4 — Повний розрив або відрив від кістки
 */
export type MunichGrade =
  | "1A"
  | "1B"
  | "2A"
  | "2B"
  | "3A"
  | "3B"
  | "4";

/**
 * BAMIC — British Athletics Muscle Injury Classification
 *
 * Ступінь 0–4 (тяжкість) + буква локалізації:
 *   a — міофасціальне (по краях м'яза)
 *   b — внутрішньом'язове (в брюшці)
 *   c — інтрам'язове сухожилля (T-junction) ⚠️
 *
 * Увага: суфікс "c" (T-junction) = подвійний термін реабілітації!
 */
export type BamicGrade = 0 | 1 | 2 | 3 | 4;
export type BamicLocation = "a" | "b" | "c";

/** Яку класифікаційну систему використовував лікар */
export type ClassificationSystem = "munich" | "bamic" | "ismult" | "none";

// ─── Прогноз повернення в стрій ─────────────────────────────

/**
 * Розрахований прогноз RTP (Return to Play).
 * Зберігається поряд з травмою для аналітики.
 */
export type RtpPrediction = {
  min_days: number;
  max_days: number;
  is_t_junction_risk: boolean;     // true → "червоний прапор" T-junction
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

// ─── Row types ──────────────────────────────────────────────

export type Team = {
  id: string;
  name: string;
  created_at: string;
};

export type Player = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  position: string;
  dominant_leg: DominantSide;
  dominant_arm: DominantSide;
  created_at: string;
};

export type AnthropometryLog = {
  id: string;
  player_id: string;
  date: string;
  height: number;
  weight: number;
  created_at: string;
};

export type Injury = {
  id: string;
  player_id: string;
  injury_type: InjuryType;
  location: InjuryLocation;
  side: InjurySide;
  severity: InjurySeverity;
  mechanism: InjuryMechanism;
  date_of_injury: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: InjuryStatus;
  description: string | null;
  created_at: string;

  // ─── Класифікація м'язових пошкоджень (нові поля) ──────
  classification_system: ClassificationSystem;

  /** Мюнхенський консенсус — тип пошкодження */
  munich_grade: MunichGrade | null;

  /** BAMIC — числова ступінь (0–4) */
  bamic_grade: BamicGrade | null;

  /** BAMIC — локалізація (a/b/c). c = T-junction ⚠️ */
  bamic_location: BamicLocation | null;

  /** Розрахований прогноз RTP (кешується при збереженні) */
  rtp_prediction: RtpPrediction | null;

  // computed (не в БД)
  days_missed?: number | null;
};

export type InjuryLog = {
  id: string;
  injury_id: string;
  date: string;
  note: string;
  created_at: string;
};
