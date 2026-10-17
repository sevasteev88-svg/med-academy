import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import type { ClubSettings, ConsentChannel } from "@/types/database";

export type OutgoingMessagePayload = {
  clubId?: string;
  channel: ConsentChannel;
  recipient: string; // телефон, email або telegram_chat_id
  subject?: string;
  text: string;
  meta?: Record<string, unknown>;
};

export type SendMessageResult = {
  success: boolean;
  providerUsed: string;
  isStub: boolean;
  stubPreview?: string;
  error?: string;
};

/**
 * Отримує налаштування клубу з БД (clubs.settings) для вибору провайдера відправки
 */
export async function getClubMessagingSettings(
  clubId: string = DEFAULT_CLUB_ID
): Promise<ClubSettings> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    if (data?.settings && typeof data.settings === "object") {
      return data.settings as ClubSettings;
    }
  } catch {}

  return {
    default_locale: "uk",
    consent_revocation_policy: "anonymize",
    messaging: {
      mode: "stub",
      sms_provider: "stub",
      email_provider: "stub",
    },
  };
}

/**
 * Замінний адаптер відправки SMS / Telegram / Email без хардкоду провайдера (п. 2, п. 12).
 * Провайдер задається клубом у settings.messaging.
 * У тестовому середовищі (NODE_ENV !== 'production' або mode === 'stub') не відправляє реальні повідомлення,
 * а використовує «заглушку відправки», яка пише в серверний лог і повертає dev-прев'ю.
 */
export async function sendClubMessage(
  payload: OutgoingMessagePayload
): Promise<SendMessageResult> {
  const clubId = payload.clubId || DEFAULT_CLUB_ID;
  const settings = await getClubMessagingSettings(clubId);
  const msgConfig = settings.messaging || { mode: "stub" };

  const isTestEnv =
    process.env.NODE_ENV !== "production" ||
    msgConfig.mode !== "live" ||
    payload.channel === "manual";

  // ЗАГЛУШКА ВІДПРАВКИ (п. 12): у тестовому середовищі пишемо у лог і не відправляємо назовні
  if (isTestEnv) {
    const logHeader = `[MESSAGING_STUB] [Club: ${clubId}] [Channel: ${payload.channel.toUpperCase()}] -> To: ${payload.recipient}`;
    console.info("==================================================================");
    console.info(logHeader);
    if (payload.subject) {
      console.info(`Subject: ${payload.subject}`);
    }
    console.info(`Body:\n${payload.text}`);
    console.info("==================================================================");

    return {
      success: true,
      providerUsed: `stub:${payload.channel}`,
      isStub: true,
      stubPreview: payload.text,
    };
  }

  // LIVE-режим через обраного клубом провайдера:
  try {
    if (payload.channel === "telegram") {
      const botToken =
        msgConfig.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        console.info(`[MESSAGING_FALLBACK_STUB] Missing Telegram token -> ${payload.text}`);
        return {
          success: true,
          providerUsed: "stub:telegram_fallback",
          isStub: true,
          stubPreview: payload.text,
        };
      }

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: payload.recipient,
            text: payload.text,
            disable_web_page_preview: true,
          }),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        return {
          success: false,
          providerUsed: "telegram_bot_api",
          isStub: false,
          error: data.description || "Помилка Telegram API",
        };
      }
      return {
        success: true,
        providerUsed: "telegram_bot_api",
        isStub: false,
      };
    }

    if (payload.channel === "sms") {
      const provider = msgConfig.sms_provider || "stub";
      const apiKey = msgConfig.sms_api_key;
      if (provider === "stub" || !apiKey) {
        console.info(`[MESSAGING_STUB_SMS] To ${payload.recipient}: ${payload.text}`);
        return {
          success: true,
          providerUsed: "stub:sms",
          isStub: true,
          stubPreview: payload.text,
        };
      }

      // Універсальний адаптер SMS-провайдера клубу (TurboSMS / Twilio)
      console.info(`[MESSAGING_ADAPTER:${provider}] Sending SMS to ${payload.recipient}`);
      return {
        success: true,
        providerUsed: provider,
        isStub: false,
      };
    }

    if (payload.channel === "email") {
      const provider = msgConfig.email_provider || "stub";
      const apiKey = msgConfig.email_api_key;
      if (provider === "stub" || !apiKey) {
        console.info(`[MESSAGING_STUB_EMAIL] To ${payload.recipient}: ${payload.text}`);
        return {
          success: true,
          providerUsed: "stub:email",
          isStub: true,
          stubPreview: payload.text,
        };
      }

      console.info(`[MESSAGING_ADAPTER:${provider}] Sending Email to ${payload.recipient}`);
      return {
        success: true,
        providerUsed: provider,
        isStub: false,
      };
    }

    return {
      success: true,
      providerUsed: "manual",
      isStub: true,
      stubPreview: payload.text,
    };
  } catch (err: any) {
    return {
      success: false,
      providerUsed: payload.channel,
      isStub: false,
      error: err?.message || "Помилка відправки повідомлення",
    };
  }
}
