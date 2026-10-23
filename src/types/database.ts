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
  | "ВР" | "ЦЗ" | "ЛЗ" | "ПЗ" | "ОП"
  | "ЦП" | "ЦАП" | "ЛВ" | "ПВ" | "НП"
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

// ─── Стандарти OSIICS та UEFA (Етап 4.1) ───────────────────────────
export type InjuryOnset = "acute" | "gradual" | "unknown";
export type InjuryOccurrence = "new" | "recurrence" | "exacerbation" | "unknown";
export type UefaSeverity = "minimal" | "mild" | "moderate" | "severe";

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

// ─── Ролі користувачів та мультиклубність ───────────────────────────
export type UserRole = "doctor" | "coach" | "admin";

export type ClubSettings = {
  default_locale?: "uk" | "en" | "ru";
  supported_locales?: string[];
  primary_color?: string;
  /** Політика при відкликанні згоди: видалення або знеособлення даних */
  consent_revocation_policy?: "delete" | "anonymize";
  /** Конфігурація адаптера відправки повідомлень (SMS, Telegram, Email) */
  messaging?: {
    mode?: "stub" | "live";
    sms_provider?: "turbosms" | "twilio" | "stub";
    sms_api_key?: string;
    sms_sender?: string;
    telegram_bot_token?: string;
    email_provider?: "resend" | "smtp" | "stub";
    email_api_key?: string;
    email_from?: string;
  };
  privacy_contact_email?: string;
  club_legal_name?: string;
  club_address?: string;
  [key: string]: unknown;
};

// ─── clubs ────────────────────────────────────────────────────────────
export type Club = {
  id: string;
  name: string;
  logo_url: string | null;
  settings: ClubSettings;
  created_at: string;
  updated_at: string;
};

// ─── club_members ─────────────────────────────────────────────────────
export type ClubMember = {
  id: string;
  user_id: string;
  club_id: string;
  role: UserRole;
  created_at: string;
};

// ─── teams ────────────────────────────────────────────────────────────
export type Team = {
  id: string;
  club_id: string;
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
  role: UserRole | string;
  created_at: string;
};

// ─── players ──────────────────────────────────────────────────────────
export type Player = {
  id: string;
  club_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  position: PlayerPosition;
  dominant_leg: DominantSide;
  dominant_arm: DominantSide;
  sex: Sex | null;
  portal_token?: string;
  must_change_pin?: boolean;
  failed_attempts?: number;
  locked_until?: string | null;
  assent_acknowledged?: boolean;
  assent_acknowledged_at?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_at: string;
};

// ─── anthropometry_logs ──────────────────────────────────────────────
export type AnthropometryLog = {
  id: string;
  club_id: string;
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
  club_id: string;
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
  club_id: string;
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
  activity_type?: "training" | "match" | "other" | null;
  description: string | null;
  days_missed: number | null;
  created_at: string;

  // ─── Стандарти OSIICS та UEFA (Етап 4.1) ──────────────────────────
  /** Код за OSIICS (наприклад, 'TMHM') */
  osiics_code?: string | null;
  /** Характер виникнення за UEFA (гострий або поступовий) */
  onset?: InjuryOnset;
  /** Тип випадку за UEFA (нова, рецидив, загострення) */
  occurrence?: InjuryOccurrence;
  /** Посилання на попередню травму (для рецидиву / загострення) */
  previous_injury_id?: string | null;
  /** Фактичні або поточні дні втрати працездатності (time-loss) */
  time_loss_days?: number | null;

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
  club_id: string;
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
  club_id: string;
  injury_id: string;
  date: string;
  note: string;
  category: LogCategory;
  created_at: string;
};

// ─── rehab_phases ─────────────────────────────────────────────────────
export type RehabPhase = {
  id: string;
  club_id: string;
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

// ════════════════════════════════════════════════════════════════════
//  ПРЕДСТАВЛЕННЯ (VIEWS)
// ════════════════════════════════════════════════════════════════════

/**
 * Відповідає public.coach_player_availability_view
 * Безпечне представлення для тренера без діагнозів та клінічних деталей
 */
export type CoachPlayerAvailability = {
  club_id: string;
  team_id: string;
  team_name: string;
  team_category: TeamCategory;
  team_sort_order: number;
  player_id: string;
  first_name: string;
  last_name: string;
  position: PlayerPosition;
  date_of_birth: string;
  availability_status: "available" | "restricted" | "unavailable";
  max_minutes: number;
  restriction_notes: string;
  days_missed: number | null;
  expected_return_date: string | null;
  wellness_readiness: "optimal" | "warning" | "risk";
};

// ─── audit_log ────────────────────────────────────────────────────────
export type AuditAction =
  | "view_player"
  | "create_injury"
  | "update_injury"
  | "delete_injury"
  | "add_examination"
  | "save_screening"
  | "prescribe_treatment"
  | "reset_pin"
  | "export_pdf"
  | "ai_call"
  | "send_consent_request"
  | "grant_consent"
  | "revoke_consent"
  | "upload_consent_scan"
  | "upload_injury_attachment"
  | "view_injury_attachment"
  | "archive_injury_attachment"
  | "restore_injury_attachment"
  | "export_player_ehr"
  | "import_player_ehr"
  | "create_tue_case"
  | "update_tue_case";

export type AuditEntity =
  | "player"
  | "injury"
  | "injury_attachment"
  | "tue_case"
  | "examination"
  | "screening"
  | "pharmacy"
  | "auth"
  | "report"
  | "ai"
  | "consent";

export type AuditLogEntry = {
  id: string;
  club_id: string;
  user_id: string | null;
  action: AuditAction | string;
  entity: AuditEntity | string;
  entity_id: string | null;
  player_id: string | null;
  at: string;
  meta: Record<string, unknown>;
};

// ─── 1.4 Згоди батьків та політика конфіденційності ──────────────────

export type ConsentScope =
  | "data_processing"
  | "ai_processing"
  | "wearables"
  | "supplements"
  | "gps"
  | "photo";

export type ConsentMethod =
  | "link_otp"
  | "paper"
  | "e_signature"
  | "adult_self";

export type ConsentChannel = "sms" | "telegram" | "email" | "manual";

export type GuardianRelation = "mother" | "father" | "guardian" | "other" | string;

export type Guardian = {
  id: string;
  club_id: string;
  player_id: string;
  full_name: string;
  relation: GuardianRelation;
  phone: string;
  email: string | null;
  telegram_chat_id: string | null;
  is_primary: boolean;
  created_at?: string;
};

export type ConsentDocument = {
  id: string;
  club_id: string;
  scope: ConsentScope;
  version: string;
  title: string;
  body_markdown: string;
  effective_from: string;
  is_active: boolean;
  created_at?: string;
};

export type ConsentEvidence = {
  ip?: string;
  user_agent?: string;
  otp_verified?: boolean;
  otp_verified_at?: string;
  signer_full_name: string;
  signer_relation?: string;
  document_version?: string;
  document_number?: string;
  player_assent?: boolean;
  revoked_reason?: string;
  retention_policy_applied?: "delete" | "anonymize";
};

export type Consent = {
  id: string;
  club_id: string;
  player_id: string;
  guardian_id: string | null;
  scope: ConsentScope;
  document_id: string;
  method: ConsentMethod;
  granted_at: string;
  revoked_at: string | null;
  evidence: ConsentEvidence;
  scan_path: string | null;
  collected_by: string | null;
  player_assent?: boolean;
  player_assent_at?: string | null;
  retention_status?: "active" | "marked_for_deletion" | "marked_for_anonymization" | null;
};

export type ConsentRequest = {
  id: string;
  club_id?: string;
  player_id: string;
  guardian_id: string | null;
  token_hash: string;
  scopes: ConsentScope[];
  channel: ConsentChannel;
  sent_at: string;
  expires_at: string;
  used_at: string | null;
  otp_hash: string | null;
  otp_expires_at?: string | null;
  otp_attempts: number;
};

// ─── Експозиції (exposures) ──────────────────────────────────────────
export type ExposureType = "training" | "match" | "rehab" | "other";
export type ExposureSessionType = "training" | "match";

export type Exposure = {
  id: string;
  club_id: string;
  team_id?: string | null;
  player_id?: string | null;
  date: string;
  type: ExposureSessionType;
  exposure_type?: ExposureType;
  minutes: number;
  players_count: number;
  workload_session_id?: string | null;
  notes?: string | null;
  created_at: string;
  teams?: { id: string; name: string } | null;
};

// ─── Довідник OSIICS (osiics_codes) ──────────────────────────────────
export type OsiicsCode = {
  id: string;
  club_id: string | null;
  code: string;
  title: string;
  category: string | null;
  anatomical_site: string | null;
  description: string | null;
  created_at: string;
};


