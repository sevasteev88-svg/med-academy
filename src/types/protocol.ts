export type MatchdayProtocolClubSettings = {
  title: string;
  is_official: boolean;
  default_doctor_name: string;
  default_coach_name: string;
};

export const DEFAULT_PROTOCOL_SETTINGS: MatchdayProtocolClubSettings = {
  title: "Внутрішній протокол допуску",
  is_official: false,
  default_doctor_name: "Головний лікар Академії",
  default_coach_name: "Головний тренер",
};
