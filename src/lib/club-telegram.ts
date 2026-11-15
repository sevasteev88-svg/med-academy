import { createAdminClient } from "@/utils/supabase/admin";
import { decryptServerSecret } from "@/lib/server-crypto";
import { getTelegramBotUsername } from "@/lib/telegram-auth";

export interface ClubTelegramConfig {
  botToken: string;
  botUsername: string;
}

/**
 * Повертає Telegram-бота для конкретного клубу (з clubs.settings.telegram)
 * або глобального бота з env-змінних, якщо для клубу не налаштований окремий бот.
 */
export async function getClubTelegramConfig(clubId?: string | null): Promise<ClubTelegramConfig> {
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const defaultUsername = getTelegramBotUsername();

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

    return {
      botToken: customToken || defaultToken,
      botUsername: customUsername || defaultUsername,
    };
  } catch {
    return { botToken: defaultToken, botUsername: defaultUsername };
  }
}
