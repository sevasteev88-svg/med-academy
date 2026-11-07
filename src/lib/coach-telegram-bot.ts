import { createAdminClient } from "@/utils/supabase/admin";
import {
  sendCoachMorningDigestAction,
  getCoachSession,
  updateCoachSession,
  resetCoachSession,
  finalizeCoachTrainingSession,
} from "@/actions/coach-telegram-actions";
import type { CoachTelegramBinding } from "@/types/telegram";
import type { TrainingSessionType, RpeScore } from "@/types/workload";

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * Допоміжна функція для надсилання або редагування повідомлення з кнопками
 */
async function sendOrEditMessage(params: {
  chatId: string;
  messageId?: number;
  text: string;
  replyMarkup?: any;
}) {
  const token = botToken();
  if (!token) return;

  if (params.messageId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: params.chatId,
          message_id: params.messageId,
          text: params.text,
          parse_mode: "Markdown",
          reply_markup: params.replyMarkup,
        }),
      });
      if (res.ok) return;
    } catch {}
  }

  // Якщо редагування не спрацювало або не було messageId — відправляємо нове повідомлення
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        parse_mode: "Markdown",
        reply_markup: params.replyMarkup,
      }),
    });
  } catch {}
}

async function answerCallback(callbackQueryId: string, text?: string) {
  const token = botToken();
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || "",
      }),
    });
  } catch {}
}

/**
 * 1. Головне меню тренера
 */
export async function sendCoachMainMenu(
  chatId: string,
  messageId?: number,
  coachName?: string
) {
  const greeting = coachName ? `Вітаємо, *${coachName}*!` : "👋 Вітаємо в кабінеті тренера!";
  const text =
    `${greeting}\n\n` +
    `Тут ви можете за 15 секунд дізнатися стан команди перед виходом на поле та внести навантаження після заняття.\n\n` +
    `Оберіть дію:`;

  const inlineKeyboard = [
    [
      { text: "📋 Стан команди (Світлофор)", callback_data: "coach_action_digest" },
    ],
    [
      { text: "⏱️ Записати тренування", callback_data: "coach_action_start_training" },
    ],
    [
      { text: "⚙️ Довідка та налаштування", callback_data: "coach_action_help" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 1. Вибір типу заняття
 */
async function renderStepSelectType(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  teamId?: string
) {
  await updateCoachSession(coachUserId, chatId, "select_type", {
    team_id: teamId,
    date: new Date().toISOString().split("T")[0],
  });

  const text =
    `⚽ *Запис навантаження команди (Крок 1 із 5)*\n\n` +
    `Яке заняття проводилося сьогодні?`;

  const inlineKeyboard = [
    [
      { text: "🏃 Командне тренування", callback_data: "cstep_type:training_team" },
      { text: "⚽ Офіційний матч", callback_data: "cstep_type:match" },
    ],
    [
      { text: "🏋️ Силовий зал", callback_data: "cstep_type:gym_strength" },
      { text: "🧘 Відновлення / Відпочинок", callback_data: "cstep_type:recovery" },
    ],
    [
      { text: "❌ Скасувати", callback_data: "coach_main_menu" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 2. Тривалість (Длительность)
 */
async function renderStepSelectDuration(
  coachUserId: string,
  chatId: string,
  messageId?: number
) {
  await updateCoachSession(coachUserId, chatId, "select_duration", {});

  const text =
    `⏱️ *Тривалість заняття (Крок 2 із 5)*\n\n` +
    `Скільки хвилин тривало тренування?\n` +
    `_Оберіть кнопку або напишіть кількість хвилин цифрою в чат:_`;

  const inlineKeyboard = [
    [
      { text: "45 хв", callback_data: "cstep_dur:45" },
      { text: "60 хв", callback_data: "cstep_dur:60" },
      { text: "75 хв", callback_data: "cstep_dur:75" },
    ],
    [
      { text: "90 хв", callback_data: "cstep_dur:90" },
      { text: "105 хв", callback_data: "cstep_dur:105" },
      { text: "120 хв", callback_data: "cstep_dur:120" },
    ],
    [
      { text: "✏️ Ввести інше число", callback_data: "cstep_dur:custom" },
      { text: "❌ Скасувати", callback_data: "coach_main_menu" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 3. Інтенсивність (RPE 0-10)
 */
async function renderStepSelectRpe(
  coachUserId: string,
  chatId: string,
  messageId?: number
) {
  await updateCoachSession(coachUserId, chatId, "select_rpe", {});

  const text =
    `⚡ *Інтенсивність навантаження (Крок 3 із 5)*\n\n` +
    `Як ви оцінюєте загальне навантаження команди сьогодні?`;

  const inlineKeyboard = [
    [
      { text: "🟢 Легке (RPE 2-3)", callback_data: "cstep_rpe:3" },
      { text: "🟡 Помірне / Середнє (RPE 4-5)", callback_data: "cstep_rpe:5" },
    ],
    [
      { text: "🟠 Важке / Інтенсивне (RPE 6-7)", callback_data: "cstep_rpe:7" },
      { text: "🔴 Максимальне (RPE 8-10)", callback_data: "cstep_rpe:9" },
    ],
    [
      { text: "❌ Скасувати", callback_data: "coach_main_menu" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 4. Покриття поля
 */
async function renderStepSelectSurface(
  coachUserId: string,
  chatId: string,
  messageId?: number
) {
  await updateCoachSession(coachUserId, chatId, "select_surface", {});

  const text =
    `🌱 *Покриття поля (Крок 4 із 5)*\n\n` +
    `На якому полі або покритті проходило тренування?\n` +
    `_(Ця інформація допомагає лікарям аналізувати ризик ушкодження зв'язок і м'язів)_`;

  const inlineKeyboard = [
    [
      { text: "🌿 Натуральний газон", callback_data: "cstep_surface:Натуральний газон" },
      { text: "🟩 Штучне поле (синтетика)", callback_data: "cstep_surface:Штучне поле" },
    ],
    [
      { text: "🏟 Манеж / Зал", callback_data: "cstep_surface:Манеж/Зал" },
      { text: "🏋️ Тренажерний зал", callback_data: "cstep_surface:Тренажерний зал" },
    ],
    [
      { text: "➡️ Пропустити", callback_data: "cstep_surface:Не вказано" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 5. Фіксація інцидентів / травм
 */
async function renderStepCheckInjuries(
  coachUserId: string,
  chatId: string,
  messageId?: number
) {
  await updateCoachSession(coachUserId, chatId, "check_injuries", {});

  const text =
    `🏥 *Стан здоров'я та інциденти (Крок 5 із 5)*\n\n` +
    `Чи були на занятті травми, ушкодження або дострокові заміни?`;

  const inlineKeyboard = [
    [
      { text: "✅ Все добре, без травм", callback_data: "cstep_inj:none" },
    ],
    [
      { text: "⚠️ Була травма / Гравець зійшов", callback_data: "cstep_inj:injury" },
    ],
    [
      { text: "❌ Скасувати", callback_data: "coach_main_menu" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * КРОК 6. Завершення та замітка
 */
async function renderStepFinalize(
  coachUserId: string,
  chatId: string,
  messageId?: number
) {
  await updateCoachSession(coachUserId, chatId, "finalize_notes", {});

  const session = await getCoachSession(coachUserId, chatId);
  const draft = session.session_draft;

  const text =
    `📝 *Підтвердження тренування*\n\n` +
    `• *Тривалість:* ${draft.duration_minutes || 90} хв\n` +
    `• *Навантаження:* ${draft.rpe_score || 5}/10\n` +
    `• *Покриття:* ${draft.surface || "Не вказано"}\n` +
    `• *Інциденти:* ${draft.incident === "injury" ? "⚠️ Зафіксовано травму" : "Без травм"}\n\n` +
    `Ви можете прямо зараз *надиктувати коротке голосове повідомлення* або написати коментар текстом у чат.\n` +
    `Або натисніть кнопку для збереження:`;

  const inlineKeyboard = [
    [
      { text: "💾 Зберегти дані", callback_data: "cstep_save_now" },
    ],
    [
      { text: "❌ Скасувати", callback_data: "coach_main_menu" },
    ],
  ];

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * ОСНОВНИЙ ОБРОБНИК INLINE КНОПОК ТРЕНЕРА (callback_query)
 */
export async function processCoachCallbackQuery(
  callbackQuery: NonNullable<import("@/types/telegram").TelegramWebhookUpdate["callback_query"]>,
  coachBinding: CoachTelegramBinding
) {
  const chatId = String(callbackQuery.message?.chat.id || coachBinding.telegram_chat_id);
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data || "";
  const coachUserId = coachBinding.coach_user_id;

  await answerCallback(callbackQuery.id);

  if (data === "coach_main_menu") {
    await resetCoachSession(coachUserId, chatId);
    await sendCoachMainMenu(chatId, messageId);
    return;
  }

  if (data === "coach_action_digest" || data.startsWith("coach_refresh_digest")) {
    await sendCoachMorningDigestAction({
      coachUserId,
      chatId,
    });
    return;
  }

  if (data === "coach_action_help") {
    const helpText =
      `ℹ️ *Довідка для тренера*\n\n` +
      `• *Ранковий звіт:* Бот щоранку надсилає вам список команди у форматі світлофора (хто готовий, хто з дискомфортом, кого поберегти).\n` +
      `• *Запис заняття:* Після тренування натисніть «Записати тренування» та оберіть відповіді кнопками. Це займає 15 секунд.\n` +
      `• *Голосові нотатки:* Ви можете надиктувати аудіоповідомлення до тренування — бот збереже його для медичного штабу.\n\n` +
      `Якщо у вас виникли запитання — зверніться до адміністратора клубу.`;

    await sendOrEditMessage({
      chatId,
      messageId,
      text: helpText,
      replyMarkup: {
        inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
      },
    });
    return;
  }

  if (data === "coach_action_start_training" || data.startsWith("coach_start_training")) {
    const parts = data.split(":");
    const teamId = parts[1];
    await renderStepSelectType(coachUserId, chatId, messageId, teamId);
    return;
  }

  // Обробка вибору типу
  if (data.startsWith("cstep_type:")) {
    const sessionType = data.split(":")[1] as TrainingSessionType;
    await updateCoachSession(coachUserId, chatId, "select_duration", { session_type: sessionType });
    await renderStepSelectDuration(coachUserId, chatId, messageId);
    return;
  }

  // Обробка тривалості
  if (data.startsWith("cstep_dur:")) {
    const val = data.split(":")[1];
    if (val === "custom") {
      await updateCoachSession(coachUserId, chatId, "awaiting_custom_duration", {});
      await sendOrEditMessage({
        chatId,
        messageId,
        text: `✏️ *Введіть тривалість тренування*\n\nНапишіть кількість хвилин одним числом у чат (наприклад: *85* або *110*):`,
        replyMarkup: {
          inline_keyboard: [[{ text: "❌ Скасувати", callback_data: "coach_main_menu" }]],
        },
      });
      return;
    }

    const minutes = parseInt(val, 10) || 90;
    await updateCoachSession(coachUserId, chatId, "select_rpe", { duration_minutes: minutes });
    await renderStepSelectRpe(coachUserId, chatId, messageId);
    return;
  }

  // Обробка RPE
  if (data.startsWith("cstep_rpe:")) {
    const rpe = parseInt(data.split(":")[1], 10) || 5;
    await updateCoachSession(coachUserId, chatId, "select_surface", { rpe_score: rpe });
    await renderStepSelectSurface(coachUserId, chatId, messageId);
    return;
  }

  // Обробка покриття
  if (data.startsWith("cstep_surface:")) {
    const surface = data.split(":")[1];
    await updateCoachSession(coachUserId, chatId, "check_injuries", { surface: surface as any });
    await renderStepCheckInjuries(coachUserId, chatId, messageId);
    return;
  }

  // Обробка інцидентів
  if (data.startsWith("cstep_inj:")) {
    const inj = data.split(":")[1] as "none" | "injury";
    await updateCoachSession(coachUserId, chatId, "finalize_notes", { incident: inj });
    await renderStepFinalize(coachUserId, chatId, messageId);
    return;
  }

  // Збереження
  if (data === "cstep_save_now") {
    const session = await getCoachSession(coachUserId, chatId);
    await finalizeCoachTrainingSession(coachUserId, chatId, session.session_draft);
    return;
  }
}

/**
 * ОСНОВНИЙ ОБРОБНИК ТЕКСТОВИХ ТА ГОЛОСОВИХ ПОВІДОМЛЕНЬ ТРЕНЕРА
 */
export async function processCoachTextMessage(
  message: NonNullable<import("@/types/telegram").TelegramWebhookUpdate["message"]>,
  coachBinding: CoachTelegramBinding
) {
  const chatId = String(message.chat.id);
  const text = (message.text || message.caption || "").trim();
  const coachUserId = coachBinding.coach_user_id;

  // 1. Команди
  if (text === "/start" || text === "/menu") {
    await resetCoachSession(coachUserId, chatId);
    await sendCoachMainMenu(chatId);
    return;
  }

  if (text === "/status" || text.toLowerCase() === "статус" || text.toLowerCase().includes("світлофор")) {
    await sendCoachMorningDigestAction({ coachUserId, chatId });
    return;
  }

  if (text === "/training" || text.toLowerCase() === "тренування") {
    await renderStepSelectType(coachUserId, chatId);
    return;
  }

  // 2. Перевірка поточного стану покрокового вводу
  const session = await getCoachSession(coachUserId, chatId);

  // Якщо тренер вводить тривалість числом вручну
  if (session.current_step === "awaiting_custom_duration" || session.current_step === "select_duration") {
    const parsedMinutes = parseInt(text, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes > 0 && parsedMinutes <= 300) {
      await updateCoachSession(coachUserId, chatId, "select_rpe", { duration_minutes: parsedMinutes });
      await renderStepSelectRpe(coachUserId, chatId);
      return;
    }
  }

  // Якщо тренер залишає текстовий коментар або надіслав голосове повідомлення
  if (session.current_step === "finalize_notes") {
    let noteText = text;

    // Якщо це голосове повідомлення
    if (message.voice) {
      noteText = "🎙️ [Голосова замітка тренера прийнята]";
    }

    await updateCoachSession(coachUserId, chatId, "idle", { notes: noteText });
    const finalSession = await getCoachSession(coachUserId, chatId);
    await finalizeCoachTrainingSession(coachUserId, chatId, finalSession.session_draft);
    return;
  }

  // Якщо повідомлення поза кроками — показуємо головне меню
  await sendCoachMainMenu(chatId);
}
