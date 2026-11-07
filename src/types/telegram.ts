export const DEFAULT_DOCTOR_PHONE = "+380935623945";
export const DEFAULT_DOCTOR_TG_URL = "https://t.me/+380935623945";

export interface PlayerTelegramToken {
  id: string;
  player_id: string;
  club_id?: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PlayerTelegramBinding {
  id: string;
  player_id: string;
  club_id?: string;
  telegram_chat_id: string;
  telegram_username?: string | null;
  status: "active" | "unlinked";
  created_at: string;
  unlinked_at?: string | null;
}

export interface TelegramBindingEligibility {
  eligible: boolean;
  isMinor: boolean;
  age: number;
  hasParentConsent: boolean;
  reason?: string;
}

export interface TelegramDeepLinkResult {
  success: boolean;
  token?: string;
  deepLink?: string;
  expiresAt?: string;
  botUsername?: string;
  eligibility?: TelegramBindingEligibility;
  error?: string;
}

export interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: "private" | "group" | "supergroup" | "channel";
    };
    date: number;
    text?: string;
    caption?: string;
    photo?: any[];
    voice?: any;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number | string;
      };
      text?: string;
    };
    data?: string;
  };
}

export interface CoachTelegramBinding {
  id: string;
  coach_user_id: string;
  club_id: string;
  telegram_chat_id: string;
  telegram_username?: string | null;
  status: "active" | "unlinked";
  morning_report_time: string;
  receive_morning_report: boolean;
  created_at: string;
  unlinked_at?: string | null;
}

export interface CoachTelegramSessionDraft {
  team_id?: string;
  team_name?: string;
  date?: string;
  session_type?: "training_team" | "match" | "gym_strength" | "recovery" | "individual_rehab";
  duration_minutes?: number;
  rpe_score?: number;
  surface?: "natural" | "artificial" | "indoor" | "gym";
  incident?: "none" | "injury";
  notes?: string;
}

export interface CoachWeeklyTelegramSummary {
  teamId?: string;
  teamName: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  compliancePct: number; // 0 - 100%
  completedSurveysCount: number;
  totalSurveysExpected: number;
  yellowFlagsCount: number; // Лічильник жовтих прапорців (БЕЗ імен)
  redFlagsCount: number; // Лічильник червоних прапорців (БЕЗ імен)
  averageFatigueScore: number; // 1.0 - 5.0
  averageSorenessScore: number; // 1.0 - 5.0
  overallWorkloadDescription: string; // "Нормальне", "Підвищене", "Відновлювальне"
  requiresAttentionCount: number; // Кількість гравців, що потребують уваги (тільки цифра!)
  appReadinessUrl: string; // Посилання на захищений кабінет тренера
}

export interface MorningReminderOptions {
  playerName?: string;
  clubName?: string;
  wellnessUrl: string;
}

export interface PostSessionReminderOptions {
  playerName?: string;
  clubName?: string;
  sessionType: string;
  durationMinutes: number;
  date: string;
  portalUrl: string;
}
