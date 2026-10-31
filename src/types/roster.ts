export type RosterPlayerSlot = {
  playerId: string;
  number?: number | string;
  isCaptain?: boolean;
  notes?: string;
};

export type MatchdayRoster = {
  id?: string;
  clubId?: string;
  teamId?: string;
  teamName: string;
  matchDate: string;
  opponent: string;
  location?: string;
  formation?: string; // e.g. "4-3-3", "4-2-3-1", "4-4-2", "3-5-2"
  starters: RosterPlayerSlot[]; // up to 11
  substitutes: RosterPlayerSlot[]; // up to 12
  tacticalNotes?: string;
  updatedAt?: string;
  createdBy?: string;
};

export type MedicalGuardrailIssue = {
  id: string;
  playerId: string;
  playerName: string;
  severity: "critical" | "warning" | "info";
  type: "unavailable_player" | "minute_limit_starter" | "unscreened_player" | "no_goalkeeper" | "multiple_goalkeepers" | "roster_size";
  title: string;
  message: string;
};
