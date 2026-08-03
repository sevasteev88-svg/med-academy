/**
 * database.ts — Типи бази даних MedAcademy
 *
 * Відповідає реальній схемі Supabase (9 таблиць).
 * Enum-значення взяті 1:1 з pg_enum, не вигадані.
 *
 * Для автогенерації (альтернатива ручному веденню):
 *   npx supabase gen types typescript --project-id wyfqqqibpdsdydswdipm > src/types/database.ts
 *
 * ─── ВАЖЛИВО про класифікацію м'язових травм ───────────────────────
 * В базі історично два покоління полів класифікації:
 *   СТАРЕ (deprecated, буде видалено SQL-міграцією):
 *     classification_system, munich_grade (enum), rtp_prediction (jsonb)
 *   НОВЕ (цільове, MLG-R + BAMIC + Munich як окремі колонки):
 *     mlgr_*, bamic_grade, bamic_location, munich_type, rtp_min/max_days, rtp_risk
 * Нижче типізовані обидва, старі позначені @deprecated.
 */

// ════════════════════════════════════════════════════════════════════
//  ENUMS — усі взяті напряму з бази (pg_enum)
// ════════════════════════════════════════════════════════════════════

// ─── Гравці / команди ───────────────────────────────────────────────
export type DominantSide = "left" | "right" | "both";

export type PlayerPosition =
  | "GK" | "CB" | "LB" | "RB" | "CDM"
  | "CAM" | "LW" | "RW" | "ST" | "CF";

export type TeamCategory = "youth" | "academy";

// ─── Травми ──────────────────────────────────────────────────────────
export type InjuryType =
  | "muscular" | "ligament" | "bone" | "tendon"
  | "cartilage" | "concussion" | "contusion" | "other";

// УВАГА: в базі enum injury_location містить "elbow" та "spine"
// (не "back"/"neck", як було в старому database.ts). Виправлено.
export type InjuryLocation =
  | "knee" | "ankle" | "thigh" | "calf" | "foot" | "groin"
  | "shoulder" | "elbow" | "wrist" | "spine" | "head" | "other";

export type InjurySide = "left" | "right" | "bilateral";

export type InjurySeverity =
  | "minimal" | "mild" | "moderate" | "severe" | "career_threatening";

export type InjuryMechanism = "contact" | "non_contact" | "overuse";

export type InjuryStatus = "active" | "rehabilitation" | "closed";

// ─── Огляди (injury_examinations) ────────────────────────────────────
export type ExamGrade = "none" | "mild" | "moderate" | "severe";

export type RomGrade =
  | "full" | "slightly_limited" | "moderately_limited" | "severely_limited";

export type MuscleTone = "normal" | "hypotonic" | "hypertonic";

// ─── Журнал (injury_logs) ────────────────────────────────────────────
export type LogCategory =
  | "examination" | "investigation" | "prescription" | "procedure" | "note";

// ─── Реабілітація (rehab_phases) ─────────────────────────────────────
export type RehabPhaseStatus =
  | "planned" | "in_progress" | "completed" | "skipped";

// ─── Класифікація м'язових травм ─────────────────────────────────────

/** Munich Consensus 2012 — тип пошкодження (нове поле munich_type: text) */
export type MunichType = "1A" | "1B" | "2A" | "2B" | "3A" | "3B" | "4";

/** BAMIC ступінь (0–4). В базі bamic_grade: smallint */
export type BamicGrade = 0 | 1 | 2 | 3 | 4;

/** BAMIC локалізація. c = T-junction ⚠️ */
export type BamicLocation = "a" | "b" | "c";

/** MLG-R механізм (Valle 2017) */
export type MlgrMechanism = "T" | "I-p" | "I-s" | "N-p" | "N-s";

/** MLG-R локалізація (третини м'яза × MTJ) */
export type MlgrLocation = "Pp" | "Pd" | "Mp" | "Md" | "Dp" | "Dd";

/** MLG-R грейд (0–3) */
export type MlgrGrade = 0 | 1 | 2 | 3;

/** Рівень ризику рецидиву (розрахований класифікатором) */
export type RtpRisk = "low" | "moderate" | "high";

/** Ключі м'язів MLG-R (19 м'язів по 5 групах) */
export type MlgrMuscle =
  | "BFlh" | "BFsh" | "ST" | "SM"          // hamstring
  | "RF" | "VL" | "VM" | "VI"              // quadriceps
  | "AL" | "AB" | "AM" | "GR"              // adductor
  | "GM" | "GL" | "SOL" | "PLT"            // calf
  | "GMed" | "GMin" | "PIR";              // gluteal

// ─── @deprecated старі типи класифікації (видаляються міграцією) ─────

/** @deprecated Стара система. Замінено на окремі munich_type/bamic/mlgr поля. */
export type ClassificationSystem = "munich" | "bamic" | "ismult" | "none";

/** @deprecated Старий enum munich_grade. Замінено на MunichType (text). */
export type MunichGrade = "1A" | "1B" | "2A" | "2B" | "3A" | "3B" | "4";

/** @deprecated Старий jsonb rtp_prediction. Замінено на rtp_min/max_days + rtp_risk. */
export type RtpPrediction = {
  min_days: number;
  max_days: number;
  is_t_junction_risk: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

// ─── PHV / матурація (текстові поля, не enum в базі) ─────────────────
export type GrowthPhase = "pre_phv" | "phv" | "post_phv";
export type RiskZone = "green" | "yellow" | "red";
export type Sex = "male" | "female";

// ════════════════════════════════════════════════════════════════════
//  ROW TYPES — відповідають колонкам таблиць
// ════════════════════════════════════════════════════════════════════

// ─── teams ────────────────────────────────────────────────────────────
export type Team = {
  id: string;
  name: string;
  category: TeamCategory;
  sort_order: number;
  created_at: string;
};

// ─── profiles ─────────────────────────────────────────────────────────
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string; // "doctor" | "coach" — поки text у базі
  created_at: string;
};

// ─── players ──────────────────────────────────────────────────────────
export type Player = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  position: PlayerPosition;
  dominant_leg: DominantSide;
  dominant_arm: DominantSide;
  sex: Sex | null;
  created_at: string;
};

// ─── anthropometry_logs ──────────────────────────────────────────────
export type AnthropometryLog = {
  id: string;
  player_id: string;
  date: string;
  height: number;        // numeric
  weight: number;        // numeric
  sitting_height: number | null;
  leg_length: number | null;
  body_fat_pct: number | null;  // % жиру (Tanita, біоімпеданс)
  created_at: string;
};

// ─── maturation_assessments ──────────────────────────────────────────
export type MaturationAssessment = {
  id: string;
  player_id: string;
  anthropometry_log_id: string;
  age_at_measurement: number;
  mirwald_offset: number | null;
  mirwald_phv_age: number | null;
  moore1_offset: number | null;
  moore1_phv_age: number | null;
  moore2_offset: number | null;
  moore2_phv_age: number | null;
  fransen_phv_age: number | null;
  consensus_offset: number;
  consensus_phv_age: number;
  methods_used: string[];      // _text (ARRAY)
  growth_phase: GrowthPhase;
  height_velocity: number | null;
  weight_velocity: number | null;
  risk_zone: RiskZone;
  risk_factors: string[];      // _text (ARRAY)
  created_at: string;
};

// ─── injuries ─────────────────────────────────────────────────────────
export type Injury = {
  id: string;
  player_id: string;
  injury_type: InjuryType;
  location: InjuryLocation;
  side: InjurySide;
  severity: InjurySeverity;
  mechanism: InjuryMechanism;
  vas_score: number | null;
  date_of_injury: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  next_exam_date: string | null;  // дата наступного контрольного огляду (НЕ прогноз RTP)

  status: InjuryStatus;
  description: string | null;
  days_missed: number | null;
  created_at: string;

  // ── Нова класифікація (цільова) ──
  /** Munich Consensus тип (text): "3B" */
  munich_type: MunichType | null;
  /** BAMIC ступінь 0–4 */
  bamic_grade: BamicGrade | null;
  /** BAMIC локалізація a/b/c (c = T-junction) */
  bamic_location: BamicLocation | null;
  /** BAMIC зібраний код: "2c" */
  bamic_code: string | null;
  /** MLG-R повний код: "I-p Pp Gr3(20%) R1" */
  mlgr_code: string | null;
  mlgr_muscle: MlgrMuscle | null;
  mlgr_mechanism: MlgrMechanism | null;
  mlgr_location: MlgrLocation | null;
  mlgr_grade: MlgrGrade | null;
  mlgr_has_r: boolean;
  mlgr_csa_pct: number | null;
  mlgr_reinjury: number;
  /** RTP прогноз (розрахований) */
  rtp_min_days: number | null;
  rtp_max_days: number | null;
  rtp_risk: RtpRisk | null;
  /** Чи проведена детальна класифікація (після МРТ) */
  is_classified: boolean;

  // ── @deprecated старі поля (видаляються міграцією) ──
  /** @deprecated */
  classification_system?: ClassificationSystem;
  /** @deprecated */
  munich_grade?: MunichGrade | null;
  /** @deprecated */
  rtp_prediction?: RtpPrediction | null;
};

// ─── injury_examinations ─────────────────────────────────────────────
export type InjuryExamination = {
  id: string;
  injury_id: string;
  date: string;
  vas_score: number;
  edema: ExamGrade;
  hematoma: ExamGrade;
  rom: RomGrade;
  palpation_pain: ExamGrade;
  muscle_tone: MuscleTone;
  objective_note: string | null;
  subjective_note: string | null;
  created_at: string;
};

// ─── injury_logs ──────────────────────────────────────────────────────
export type InjuryLog = {
  id: string;
  injury_id: string;
  date: string;
  note: string;
  category: LogCategory;
  created_at: string;
};

// ─── rehab_phases ─────────────────────────────────────────────────────
export type RehabPhase = {
  id: string;
  injury_id: string;
  name: string;
  sort_order: number;
  status: RehabPhaseStatus;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

// ════════════════════════════════════════════════════════════════════
//  ПОХІДНІ ТИПИ (joins) — зручні для запитів з вкладеними даними
// ════════════════════════════════════════════════════════════════════

export type PlayerWithTeam = Player & {
  teams: Pick<Team, "name" | "category"> | null;
};

export type InjuryWithPlayer = Injury & {
  players: (Pick<Player, "id" | "first_name" | "last_name" | "position"> & {
    teams: Pick<Team, "name"> | null;
  }) | null;
};
