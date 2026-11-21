import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { decryptServerSecret } from "@/lib/server-crypto";
import { getTelegramBotUsername } from "@/lib/telegram-auth";

export interface ClubTelegramConfig {
  botToken: string;
  botUsername: string;
}

/**
 * Повертає Telegram-бота для конкретного клубу (з clubs.settings.telegram).
 * Для не-дефолтних клубів або клубів із налаштованим власним ботом
 * ніколи не допускає крос-клубний fallback на глобальний бот (fail-closed).
 */
export async function getClubTelegramConfig(clubId?: string | null): Promise<ClubTelegramConfig> {
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const defaultUsername = getTelegramBotUsername();
  const isNonDefaultClub = Boolean(clubId && clubId !== DEFAULT_CLUB_ID);

  if (!clubId) {
    return { botToken: defaultToken, botUsername: defaultUsername };
  }

  try {
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const tg = (club as any)?.settings?.telegram;
    const customToken = tg?.encrypted_token ? decryptServerSecret(tg.encrypted_token) : "";
    const customUsername = typeof tg?.bot_username === "string" ? tg.bot_username.trim().replace(/^@/, "") : "";
    const hasCustomBotConfigured = Boolean(tg?.encrypted_token || customUsername);

    if (isNonDefaultClub || hasCustomBotConfigured) {
      if (!customToken) {
        console.error(
          "[club-telegram] Club Telegram bot token is missing or failed to decrypt; refusing cross-club fallback.",
          { clubId }
        );
        return { botToken: "", botUsername: customUsername };
      }
      return {
        botToken: customToken,
        botUsername: customUsername,
      };
    }

    return {
      botToken: defaultToken,
      botUsername: defaultUsername,
    };
  } catch {
    if (isNonDefaultClub) {
      return { botToken: "", botUsername: "" };
    }
    return { botToken: defaultToken, botUsername: defaultUsername };
  }
}
