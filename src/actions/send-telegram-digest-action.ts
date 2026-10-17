"use server";

import { assertAuth } from "@/lib/auth";

type TelegramSendInput = {
  text: string;
};

/**
 * Server Action для надсилання агрегованих медичних звітів у Telegram (п. 1.5.4, 1.5.6).
 *
 * Вимоги безпеки:
 * 1. Ключі та Chat ID беруться виключно із серверних змінних середовища (.env.local),
 *    без можливості передачі або заміни з клієнтського браузера.
 * 2. Доступно лише для авторизованого медичного/адміністративного персоналу.
 */
export async function sendTelegramDigestAction(input: TelegramSendInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { error: auth.error };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chat) {
    return {
      error:
        "TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID не налаштовані у серверних змінних середовища (.env.local). Додайте їх на сервері.",
    };
  }

  if (!input.text || !input.text.trim()) {
    return { error: "Текст повідомлення порожній" };
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
