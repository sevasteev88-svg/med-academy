export interface RehabCheckinData {
  id?: string;
  injury_id: string;
  player_id: string;
  date: string;
  time: string;
  vas_score: number; // 0-10
  swelling: "none" | "mild" | "moderate" | "severe";
  stiffness_minutes: number; // 0, 15, 30, 60
  exercises_completed: "full" | "partial" | "none";
  sleep_quality: number; // 1-5
  fatigue_level: number; // 1-5
  player_comment?: string;
}

export interface PlayerPinRecord {
  player_id: string;
  pin: string; // 4 digits
  updated_at: string;
}
