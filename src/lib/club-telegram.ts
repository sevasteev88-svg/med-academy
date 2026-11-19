import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { decryptServerSecret } from "@/lib/server-crypto";
import { getTelegramBotUsername } from "@/lib/telegram-auth";

export interface ClubTelegramConfig {
  botToken: string;
  botUsername: string;
  chatId?: string;
}

/**
 * Повертає Telegram-бота для конкретного клубу (з clubs.settings.telegram).
 * Для не-дефолтних клубів або клубів із налаштованим власним ботом
 * ніколи не допускає крос-клубний fallback на глобальний бот (fail-closed).
 */
export async function getClubTelegramConfig(clubId?: string | null): Promise<ClubTelegramConfig> {
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const defaultUsername = getTelegramBotUsername();
  const defaultChatId = process.env.TELEGRAM_CHAT_ID || "";
  const isNonDefaultClub = Boolean(clubId && clubId !== DEFAULT_CLUB_ID);

  if (!clubId) {
    return {
      botToken: defaultToken,
      botUsername: defaultUsername,
      chatId: defaultChatId,
    };
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
    const customUsername =
      typeof tg?.bot_username === "string" ? tg.bot_username.trim().replace(/^@/, "") : "";
    const customChatId = tg?.encrypted_chat_id ? decryptServerSecret(tg.encrypted_chat_id) : "";
    const hasCustomBotConfigured = Boolean(
      tg?.encrypted_token || customUsername || tg?.encrypted_chat_id
    );

    if (isNonDefaultClub || hasCustomBotConfigured) {
      if (!customToken) {
        console.error(
          "[club-telegram] Club Telegram bot token is missing or failed to decrypt; refusing cross-club fallback.",
          { clubId }
        );
        return {
          botToken: "",
          botUsername: customUsername,
          chatId: customChatId,
        };
      }
      return {
        botToken: customToken,
        botUsername: customUsername,
        chatId: customChatId,
      };
    }

    return {
      botToken: defaultToken,
      botUsername: defaultUsername,
      chatId: defaultChatId,
    };
  } catch {
    if (isNonDefaultClub) {
      return { botToken: "", botUsername: "", chatId: "" };
    }
    return {
      botToken: defaultToken,
      botUsername: defaultUsername,
      chatId: defaultChatId,
    };
  }
}
