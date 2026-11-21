import { createAdminClient } from "@/utils/supabase/admin";
import {
  sendCoachMorningDigestInternal as sendCoachMorningDigestAction,
  getCoachSession,
  updateCoachSession,
  resetCoachSession,
  finalizeCoachTrainingSession,
} from "@/lib/coach-telegram-server";
import { sendMorningWellnessRemindersInternal } from "@/lib/telegram-reminders-server";
import type { CoachTelegramBinding } from "@/types/telegram";
import type { TrainingSessionType, RpeScore } from "@/types/workload";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { getClubDate } from "@/lib/club-timezone";

async function resolveCoachBotToken(
  chatId: string,
  clubId?: string | null
): Promise<string> {
  if (clubId) {
    try {
      const { botToken } = await getClubTelegramConfig(clubId);
      return botToken;
    } catch {
      return "";
    }
  }
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("coach_telegram_bindings")
      .select("club_id")
      .eq("telegram_chat_id", chatId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { botToken } = await getClubTelegramConfig(data?.club_id);
    return botToken;
  } catch {
    return process.env.TELEGRAM_BOT_TOKEN || "";
  }
}

function getPublicAppUrl(): string {
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  const vercelUrl = process.env.VERCEL_URL || "";

  // На Vercel ігноруємо випадковий localhost у NEXT_PUBLIC_APP_URL
  const isLocal = (u: string) => u.includes("localhost") || u.includes("127.0.0.1");
  const raw =
    (envAppUrl && !(process.env.VERCEL && isLocal(envAppUrl)) ? envAppUrl : "") ||
    vercelProd ||
    vercelUrl ||
    envAppUrl;

  if (!raw) return "";
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

/**
 * Допоміжна функція для надсилання або редагування повідомлення з кнопками
 */
async function sendOrEditMessage(params: {
  chatId: string;
  messageId?: number;
  text: string;
  replyMarkup?: any;
  clubId?: string | null;
}) {
  const token = await resolveCoachBotToken(params.chatId, params.clubId);
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
        signal: AbortSignal.timeout(15000),
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
      signal: AbortSignal.timeout(15000),
    });
  } catch {}
}

async function answerCallback(
  callbackQueryId: string,
  text?: string,
  chatId?: string,
  clubId?: string | null
) {
  const token =
    clubId || chatId
      ? await resolveCoachBotToken(chatId || "", clubId)
      : process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || "",
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {}
}

/**
 * 1. Головне меню тренера
 */
export async function sendCoachMainMenu(
  chatId: string,
  messageId?: number,
  coachName?: string,
  clubId?: string | null
) {
  const greeting = coachName ? `Вітаємо, *${coachName}*!` : "👋 Вітаємо в кабінеті тренера!";
  const text =
    `${greeting}\n\n` +
    `Оберіть зручний формат роботи — прямо кнопками в чаті або у візуальному Міні-додатку:`;

  const appUrl = getPublicAppUrl();
  const inlineKeyboard: any[][] = [];

  if (appUrl.startsWith("https://")) {
    const miniAppUrl = clubId
      ? `${appUrl}/tg-coach?clubId=${encodeURIComponent(clubId)}`
      : `${appUrl}/tg-coach`;
    inlineKeyboard.push([
      { text: "📱 Відкрити Міні-додаток", web_app: { url: miniAppUrl } },
    ]);
  }

  inlineKeyboard.push(
    [{ text: "📋 Стан команди (у чаті)", callback_data: "coach_action_digest" }],
    [{ text: "📣 Нагадати гравцям про анкету", callback_data: "coach_remind_wellness:all" }],
    [{ text: "⏱️ Записати тренування (у чаті)", callback_data: "coach_action_start_training" }],
    [{ text: "⚠️ Травма / Біль на полі", callback_data: "coach_action_report_injury" }],
    [
      { text: "🌐 Веб-кабінет (1 клік)", callback_data: "coach_action_magic_link" },
      { text: "⚙️ Режим роботи", callback_data: "coach_action_mode" },
    ],
    [{ text: "ℹ️ Довідка", callback_data: "coach_action_help" }]
  );

  await sendOrEditMessage({
    chatId,
    messageId,
    text,
    replyMarkup: { inline_keyboard: inlineKeyboard },
    clubId,
  });
}

/**
 * КРОК 1. Вибір типу заняття
 */
async function renderStepSelectType(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  teamId?: string,
  clubId?: string | null
) {
  await updateCoachSession(coachUserId, chatId, "select_type", {
    team_id: teamId,
    date: getClubDate(),
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
    clubId,
  });
}

/**
 * КРОК 2. Тривалість (Длительность)
 */
async function renderStepSelectDuration(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  clubId?: string | null
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
    clubId,
  });
}

/**
 * КРОК 3. Інтенсивність (RPE 0-10)
 */
async function renderStepSelectRpe(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  clubId?: string | null
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
    clubId,
  });
}

/**
 * КРОК 4. Покриття поля
 */
async function renderStepSelectSurface(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  clubId?: string | null
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
    clubId,
  });
}

/**
 * КРОК 5. Фіксація інцидентів / травм
 */
async function renderStepCheckInjuries(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  clubId?: string | null
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
    clubId,
  });
}

/**
 * КРОК 6. Завершення та замітка
 */
async function renderStepFinalize(
  coachUserId: string,
  chatId: string,
  messageId?: number,
  clubId?: string | null
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
    clubId,
  });
}

/**
 * ОСНОВНИЙ ОБРОБНИК INLINE КНОПОК ТРЕНЕРА (callback_query)
 */
export async function processCoachCallbackQuery(
  callbackQuery: NonNullable<import("@/types/telegram").TelegramWebhookUpdate["callback_query"]>,
  coachBinding: CoachTelegramBinding,
  overrideClubId?: string | null
) {
  const chatId = String(callbackQuery.message?.chat.id || coachBinding.telegram_chat_id);
  const messageId = callbackQuery.message?.message_id;
  const data = callbackQuery.data || "";
  const coachUserId = coachBinding.coach_user_id;
  const clubId = overrideClubId || coachBinding.club_id || undefined;

  await answerCallback(callbackQuery.id, undefined, chatId, clubId);

  if (data === "coach_main_menu") {
    await resetCoachSession(coachUserId, chatId);
    await sendCoachMainMenu(chatId, messageId, undefined, clubId);
    return;
  }

  if (data === "coach_action_digest" || data.startsWith("coach_refresh_digest")) {
    await sendCoachMorningDigestAction({
      coachUserId,
      chatId,
      clubId,
    });
    return;
  }

  if (data.startsWith("coach_remind_wellness:")) {
    const targetParam = data.split(":")[1] || "all";
    const supabase = createAdminClient();

    let assignQ = supabase
      .from("coach_team_assignments")
      .select("team_id")
      .eq("coach_user_id", coachUserId);
    let memberQ = supabase
      .from("club_members")
      .select("team_id")
      .eq("user_id", coachUserId);
    if (clubId) {
      assignQ = assignQ.eq("club_id", clubId);
      memberQ = memberQ.eq("club_id", clubId);
    }

    const [assignmentsRes, memberRes, profileRes] = await Promise.all([
      assignQ,
      memberQ.limit(1).maybeSingle(),
      supabase.from("profiles").select("team_id").eq("id", coachUserId).maybeSingle(),
    ]);

    const coachTeamIds = Array.from(
      new Set(
        [
          ...(assignmentsRes.data || []).map((a: any) => a.team_id),
          memberRes.data?.team_id,
          profileRes.data?.team_id,
        ].filter(Boolean)
      )
    ) as string[];

    const targetTeamIds =
      targetParam !== "all" && (coachTeamIds.length === 0 || coachTeamIds.includes(targetParam))
        ? [targetParam]
        : coachTeamIds;

    const appUrl = getPublicAppUrl();
    let totalSent = 0;
    let totalSkipped = 0;
    let totalUnbound = 0;
    let lastError = "";

    if (targetTeamIds.length === 0) {
      const res = await sendMorningWellnessRemindersInternal({
        clubId,
        baseUrl: appUrl || undefined,
      });
      totalSent += res.sentCount || 0;
      totalSkipped += res.skippedCount || 0;
      totalUnbound += res.unboundCount || 0;
      if (!res.success && res.error) lastError = res.error;
    } else {
      for (const tid of targetTeamIds) {
        const res = await sendMorningWellnessRemindersInternal({
          clubId,
          teamId: tid,
          baseUrl: appUrl || undefined,
        });
        totalSent += res.sentCount || 0;
        totalSkipped += res.skippedCount || 0;
        totalUnbound += res.unboundCount || 0;
        if (!res.success && res.error) lastError = res.error;
      }
    }

    const summaryText = lastError
      ? `❌ Не вдалося надіслати нагадування: ${lastError}`
      : `📣 *Нагадування гравцям оброблено!*\n\n` +
        `• Надіслано в Telegram: *${totalSent}*\n` +
        `• Вже заповнили сьогодні: *${totalSkipped}*\n` +
        `• Ще не підключили бота: *${totalUnbound}*`;

    await sendOrEditMessage({
      chatId,
      text: summaryText,
      replyMarkup: {
        inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
      },
      clubId,
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
      clubId,
    });
    return;
  }

  if (data === "coach_action_mode") {
    const session = await getCoachSession(coachUserId, chatId);
    const currentMode = (session.session_draft as any)?.preferred_mode || "chat";
    const text =
      `⚙️ *Оберіть зручний формат роботи*\n\n` +
      `Поточний режим: *${currentMode === "miniapp" ? "📱 Міні-додаток" : "💬 Чат кнопками"}*\n\n` +
      `• *💬 Чат кнопками* — ранкові звіти та опитування приходять прямо у переписку.\n` +
      `• *📱 Міні-додаток* — візуальний список команди та запис тренування в один екран всередині Telegram.`;

    await sendOrEditMessage({
      chatId,
      messageId,
      text,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: currentMode === "chat" ? "✅ 💬 Чат кнопками" : "💬 Чат кнопками", callback_data: "coach_set_mode:chat" },
            { text: currentMode === "miniapp" ? "✅ 📱 Міні-додаток" : "📱 Міні-додаток", callback_data: "coach_set_mode:miniapp" },
          ],
          [{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }],
        ],
      },
      clubId,
    });
    return;
  }

  if (data.startsWith("coach_set_mode:")) {
    const mode = data.split(":")[1] === "miniapp" ? "miniapp" : "chat";
    await updateCoachSession(coachUserId, chatId, "idle", { preferred_mode: mode } as any);
    await sendOrEditMessage({
      chatId,
      messageId,
      text: `✅ Збережено! Ваш основний режим: *${mode === "miniapp" ? "📱 Міні-додаток" : "💬 Чат кнопками"}*.`,
      replyMarkup: {
        inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
      },
      clubId,
    });
    return;
  }

  if (data === "coach_action_report_injury") {
    await updateCoachSession(coachUserId, chatId, "awaiting_injury_report", {});
    await sendOrEditMessage({
      chatId,
      messageId,
      text:
        `⚠️ *Повідомити лікаря про травму або біль*\n\n` +
        `Напишіть у чат одним повідомленням *прізвище гравця та що сталося* (або надішліть голосове повідомлення).\n\n` +
        `_Наприклад: «Іванов — забій правого гомілкостопу, зійшов на 35 хв»_`,
      replyMarkup: {
        inline_keyboard: [[{ text: "❌ Скасувати", callback_data: "coach_main_menu" }]],
      },
      clubId,
    });
    return;
  }

  if (data === "coach_action_magic_link") {
    const supabase = createAdminClient();
    const { data: userData } = await supabase.auth.admin.getUserById(coachUserId);
    const email = userData?.user?.email;
    const appUrl = getPublicAppUrl();

    if (!email) {
      await sendOrEditMessage({
        chatId,
        messageId,
        text: "❌ Не вдалося знайти email профілю для генерації посилання входу.",
        replyMarkup: {
          inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
        },
        clubId,
      });
      return;
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: appUrl ? { redirectTo: `${appUrl}/coach-briefing` } : undefined,
    });

    const hashedToken = linkData?.properties?.hashed_token;
    const directConfirmUrl =
      appUrl && hashedToken
        ? `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent("/coach-briefing")}`
        : linkData?.properties?.action_link;

    if (linkErr || !directConfirmUrl) {
      await sendOrEditMessage({
        chatId,
        messageId,
        text: "❌ Не вдалося згенерувати посилання входу. Спробуйте пізніше.",
        replyMarkup: {
          inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
        },
        clubId,
      });
      return;
    }

    await sendOrEditMessage({
      chatId,
      messageId,
      text:
        `🌐 *Вхід у веб-кабінет без пароля*\n\n` +
        `Натисніть кнопку нижче — кабінет відкриється вже авторизованим (посилання одноразове):`,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "🚀 Відкрити веб-кабінет", url: directConfirmUrl }],
          [{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }],
        ],
      },
      clubId,
    });
    return;
  }

  if (data === "coach_action_start_training" || data.startsWith("coach_start_training")) {
    const parts = data.split(":");
    const teamId = parts[1];
    await renderStepSelectType(coachUserId, chatId, messageId, teamId, clubId);
    return;
  }

  // Обробка вибору типу
  if (data.startsWith("cstep_type:")) {
    const sessionType = data.split(":")[1] as TrainingSessionType;
    await updateCoachSession(coachUserId, chatId, "select_duration", { session_type: sessionType });
    await renderStepSelectDuration(coachUserId, chatId, messageId, clubId);
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
        clubId,
      });
      return;
    }

    const minutes = parseInt(val, 10) || 90;
    await updateCoachSession(coachUserId, chatId, "select_rpe", { duration_minutes: minutes });
    await renderStepSelectRpe(coachUserId, chatId, messageId, clubId);
    return;
  }

  // Обробка RPE
  if (data.startsWith("cstep_rpe:")) {
    const rpe = parseInt(data.split(":")[1], 10) || 5;
    await updateCoachSession(coachUserId, chatId, "select_surface", { rpe_score: rpe });
    await renderStepSelectSurface(coachUserId, chatId, messageId, clubId);
    return;
  }

  // Обробка покриття
  if (data.startsWith("cstep_surface:")) {
    const surface = data.split(":")[1];
    await updateCoachSession(coachUserId, chatId, "check_injuries", { surface: surface as any });
    await renderStepCheckInjuries(coachUserId, chatId, messageId, clubId);
    return;
  }

  // Обробка інцидентів
  if (data.startsWith("cstep_inj:")) {
    const inj = data.split(":")[1] as "none" | "injury";
    await updateCoachSession(coachUserId, chatId, "finalize_notes", { incident: inj });
    await renderStepFinalize(coachUserId, chatId, messageId, clubId);
    return;
  }

  // Збереження
  if (data === "cstep_save_now") {
    const session = await getCoachSession(coachUserId, chatId);
    await finalizeCoachTrainingSession(coachUserId, chatId, session.session_draft, clubId);
    return;
  }
}

/**
 * ОСНОВНИЙ ОБРОБНИК ТЕКСТОВИХ ТА ГОЛОСОВИХ ПОВІДОМЛЕНЬ ТРЕНЕРА
 */
export async function processCoachTextMessage(
  message: NonNullable<import("@/types/telegram").TelegramWebhookUpdate["message"]>,
  coachBinding: CoachTelegramBinding,
  overrideClubId?: string | null
) {
  const chatId = String(message.chat.id);
  const text = (message.text || message.caption || "").trim();
  const coachUserId = coachBinding.coach_user_id;
  const clubId = overrideClubId || coachBinding.club_id || undefined;

  // 1. Команди
  if (text === "/start" || text === "/menu") {
    await resetCoachSession(coachUserId, chatId);
    await sendCoachMainMenu(chatId, undefined, undefined, clubId);
    return;
  }

  if (text === "/status" || text.toLowerCase() === "статус" || text.toLowerCase().includes("світлофор")) {
    await sendCoachMorningDigestAction({ coachUserId, chatId, clubId });
    return;
  }

  if (text === "/training" || text.toLowerCase() === "тренування") {
    await renderStepSelectType(coachUserId, chatId, undefined, undefined, clubId);
    return;
  }

  // 2. Перевірка поточного стану покрокового вводу
  const session = await getCoachSession(coachUserId, chatId);

  // Якщо тренер вводить тривалість числом вручну
  if (session.current_step === "awaiting_custom_duration" || session.current_step === "select_duration") {
    const parsedMinutes = parseInt(text, 10);
    if (!isNaN(parsedMinutes) && parsedMinutes > 0 && parsedMinutes <= 300) {
      await updateCoachSession(coachUserId, chatId, "select_rpe", { duration_minutes: parsedMinutes });
      await renderStepSelectRpe(coachUserId, chatId, undefined, clubId);
      return;
    }
  }

  // Якщо тренер надсилає звіт про травму на полі
  if (session.current_step === "awaiting_injury_report") {
    const reportText = message.voice
      ? "🎙️ [Голосове повідомлення тренера про інцидент на полі]"
      : text;

    const supabase = createAdminClient();
    try {
      await supabase.from("audit_logs").insert({
        club_id: clubId || coachBinding.club_id || null,
        user_id: coachUserId,
        action: "coach_field_injury_report",
        entity: "telegram_bot",
        meta: {
          type: "COACH_FIELD_REPORT",
          coach_user_id: coachUserId,
          summary: reportText,
          date: getClubDate(),
        },
      });
    } catch {}

    await resetCoachSession(coachUserId, chatId);
    await sendOrEditMessage({
      chatId,
      text:
        `✅ *Сигнал передано медичному штабу!*\n\n` +
        `📝 *Повідомлення:* ${reportText}`,
      replyMarkup: {
        inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
      },
      clubId,
    });
    return;
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
    await finalizeCoachTrainingSession(coachUserId, chatId, finalSession.session_draft, clubId);
    return;
  }

  // Якщо повідомлення поза кроками — показуємо головне меню
  await sendCoachMainMenu(chatId, undefined, undefined, clubId);
}
