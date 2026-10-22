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
  };
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
