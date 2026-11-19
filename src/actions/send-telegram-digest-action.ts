"use server";

import { assertAuth } from "@/lib/auth";
import { getClubTelegramConfig } from "@/lib/club-telegram";

type TelegramSendInput = {
  text: string;
};

/**
 * Server Action для надсилання агрегованих медичних звітів у Telegram (п. 1.5.4, 1.5.6).
 *
 * Вимоги безпеки:
 * 1. Ключі та Chat ID беруться виключно з серверного сховища клубу / змінних середовища,
 *    без можливості передачі або заміни з клієнтського браузера.
 * 2. Доступно лише для авторизованого медичного/адміністративного персоналу.
 */
export async function sendTelegramDigestAction(input: TelegramSendInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { error: auth.error };

  const { botToken: token, chatId: chat } = await getClubTelegramConfig(auth.user.clubId);

  if (!token || !chat) {
    return {
      error:
        "Telegram-бот або Chat ID клубу не налаштовані. Додайте їх у Налаштуваннях клубу → Telegram або в серверних змінних середовища.",
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
