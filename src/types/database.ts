/**
 * Типи бази даних — відповідають SQL-схемі supabase-schema.sql
 */

// ─── Enums ──────────────────────────────────────────────────

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
  vas_score: number; // 0–10, ВАШ (візуальна аналогова шкала болю)
  date_of_injury: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: InjuryStatus;
  description: string | null;
  created_at: string;
  days_missed?: number | null; // computed
};

export type InjuryLog = {
  id: string;
  injury_id: string;
  date: string;
  note: string;
  created_at: string;
};
