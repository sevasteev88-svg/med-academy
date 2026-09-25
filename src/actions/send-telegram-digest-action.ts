"use server";

import { assertAuth } from "@/lib/auth";

type TelegramSendInput = {
  botToken?: string;
  chatId?: string;
  text: string;
};

export async function sendTelegramDigestAction(input: TelegramSendInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { error: auth.error };

  const token = input.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chat = input.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return {
      error:
        "Відсутні TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID. Введіть їх у формі налаштувань або додайте в .env.local",
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: input.text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { error: data.description || "Помилка відправки в Telegram API" };
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Мережева помилка звʼязку з Telegram" };
  }
}
