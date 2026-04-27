/**
 * Типи бази даних — розширені мультиметодним PHV-модулем.
 *
 * Зміни:
 * - Player: додано sex
 * - AnthropometryLog: додано sitting_height, leg_length
 * - Новий: MaturationAssessment (з полями для кожного методу)
 */

// ─── Enums ──────────────────────────────────────────────────

export type Sex = "male" | "female";

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

export type GrowthPhase = "pre_phv" | "phv" | "post_phv";

export type RiskZone = "green" | "yellow" | "red";

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
  sex: Sex;
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
  sitting_height: number | null;
  leg_length: number | null;
  created_at: string;
};

export type MaturationAssessment = {
  id: string;
  player_id: string;
  anthropometry_log_id: string;
  age_at_measurement: number;

  // Результати кожного методу
  mirwald_offset: number | null;
  mirwald_phv_age: number | null;
  moore1_offset: number | null;
  moore1_phv_age: number | null;
  moore2_offset: number | null;
  moore2_phv_age: number | null;
  fransen_phv_age: number | null;

  // Консенсус
  consensus_offset: number;
  consensus_phv_age: number;
  methods_used: string[];

  growth_phase: GrowthPhase;
  height_velocity: number | null;
  weight_velocity: number | null;
  risk_zone: RiskZone;
  risk_factors: string[];
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
  days_missed?: number | null;
};

export type InjuryLog = {
  id: string;
  injury_id: string;
  date: string;
  note: string;
  created_at: string;
};

/** Гравець з останньою оцінкою матурації (для дашборду) */
export type PlayerWithMaturation = Player & {
  latest_maturation: MaturationAssessment | null;
  latest_anthropometry: AnthropometryLog | null;
};
