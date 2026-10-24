"use server";

import QRCode from "qrcode";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertTeamStaff, assertAuth, DEFAULT_CLUB_ID } from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { sendClubMessage } from "@/lib/messaging-adapter";
import {
  generateTelegramBindingToken,
  hashTokenSha256,
  buildTelegramDeepLink,
  checkTelegramEligibility,
  processTokenBindingInMemory,
  unlinkPlayerTelegramInMemory,
  unlinkTelegramByChatIdInMemory,
  formatMorningWellnessReminder,
  formatCoachWeeklyReport,
  memoryTelegramTokens,
  memoryTelegramBindings,
  TELEGRAM_TOKEN_EXPIRATION_SECONDS,
} from "@/lib/telegram-auth";
import type {
  TelegramWebhookUpdate,
  CoachWeeklyTelegramSummary,
  PlayerTelegramBinding,
} from "@/types/telegram";

/**
 * 1. Генерація deep-link та QR-коду для прив'язки гравця до Telegram-бота (п. 8.7.1 & 8.7.5).
 * - 128-бітний одноразовий токен, у базі лише SHA-256 хэш.
 * - Перевірка неповнолітніх (< 18 років): заборонено без згоди батьків.
 */
export async function createTelegramBindingLinkAction(playerId: string) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const user = auth.user;

    if (!playerId) {
      return { success: false, error: "Не вказано ID гравця" };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Отримуємо дані гравця
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, team_id, teams ( name )")
      .eq("id", playerId)
      .maybeSingle();

    if (pErr || !player) {
      return { success: false, error: "Гравця не знайдено" };
    }

    // 2. Вимога 5: Для гравців молодше 18 років прив'язка допустима тільки при згоді батьків
    const consentSummary = await getPlayerConsentSummary(player.id);
    const eligibility = checkTelegramEligibility({
      id: player.id,
      date_of_birth: player.date_of_birth,
      hasParentConsent:
        !consentSummary.isMinor ||
        Boolean(consentSummary.scopes["data_processing"]?.status === "granted"),
    });

    if (!eligibility.eligible) {
      return {
        success: false,
        error: eligibility.reason,
        eligibility,
      };
    }

    // 3. Відкликаємо старі невикористані токени гравця
    await supabase
      .from("player_telegram_tokens")
      .update({ used_at: nowIso })
      .eq("player_id", playerId)
      .is("used_at", null);

    for (const tok of memoryTelegramTokens.values()) {
      if (tok.player_id === playerId && !tok.used_at) {
        tok.used_at = nowIso;
      }
    }

    // 4. Генерація нового 128-бітного токена
    const rawToken = generateTelegramBindingToken();
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(
      Date.now() + TELEGRAM_TOKEN_EXPIRATION_SECONDS * 1000
    ).toISOString();

    // Запис у БД
    const { error: insErr } = await supabase.from("player_telegram_tokens").insert({
      player_id: playerId,
      club_id: user.clubId || DEFAULT_CLUB_ID,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: user.id,
    });

    if (insErr) {
      // In-memory fallback
      memoryTelegramTokens.set(tokenHash, {
        id: crypto.randomUUID(),
        player_id: playerId,
        club_id: user.clubId || DEFAULT_CLUB_ID,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_by: user.id,
        created_at: nowIso,
      });
    }

    // Лог аудиту (без відкритого токена)
    await logAudit({
      action: "issue_telegram_binding_token",
      entity: "player_telegram_tokens",
      playerId: playerId,
      userId: user.id,
      meta: {
        expires_in_hours: 48,
      },
    });

    const deepLink = buildTelegramDeepLink(rawToken);
    const qrDataUrl = await QRCode.toDataURL(deepLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });

    return {
      success: true,
      rawToken,
      deepLink,
      qrDataUrl,
      expiresAt,
      eligibility,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка формування посилання прив'язки Telegram",
    };
  }
}

/**
 * 4. Відписка, зміна або відкликання прив'язки одним натисканням (п. 8.7.4).
 */
export async function unlinkPlayerTelegramAction(playerId: string) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const user = auth.user;

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    await supabase
      .from("player_telegram_bindings")
      .update({ status: "unlinked", unlinked_at: nowIso })
      .eq("player_id", playerId)
      .eq("status", "active");

    unlinkPlayerTelegramInMemory(playerId);

    await logAudit({
      action: "unlink_player_telegram",
      entity: "player_telegram_bindings",
      playerId: playerId,
      userId: user.id,
    });

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка скасування прив'язки Telegram",
    };
  }
}

/**
 * Отримання поточного статусу прив'язки гравця до Telegram
 */
export async function getPlayerTelegramStatusAction(playerId: string): Promise<{
  success: boolean;
  isBound: boolean;
  binding?: PlayerTelegramBinding | null;
  eligibility?: any;
  error?: string;
}> {
  try {
    const supabase = createAdminClient();

    // Перевірка згоди
    const { data: player } = await supabase
      .from("players")
      .select("id, date_of_birth")
      .eq("id", playerId)
      .maybeSingle();

    const consentSummary = await getPlayerConsentSummary(playerId);
    const eligibility = checkTelegramEligibility({
      id: playerId,
      date_of_birth: player?.date_of_birth,
      hasParentConsent:
        !consentSummary.isMinor ||
        Boolean(consentSummary.scopes["data_processing"]?.status === "granted"),
    });

    // Перевірка в БД
    const { data: binding } = await supabase
      .from("player_telegram_bindings")
      .select("*")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle();

    if (binding) {
      return {
        success: true,
        isBound: true,
        binding: binding as PlayerTelegramBinding,
        eligibility,
      };
    }

    // Перевірка в in-memory fallback
    for (const mem of memoryTelegramBindings.values()) {
      if (mem.player_id === playerId && mem.status === "active") {
        return {
          success: true,
          isBound: true,
          binding: mem,
          eligibility,
        };
      }
    }

    return {
      success: true,
      isBound: false,
      binding: null,
      eligibility,
    };
  } catch (err: any) {
    return {
      success: false,
      isBound: false,
      error: err?.message || "Помилка отримання статусу прив'язки",
    };
  }
}

/**
 * Обробка вхідного Telegram Webhook від бота:
 * Підтримує команди:
 * - /start <token> — одноразова прив'язка
 * - /stop або /unbind — відписка в один клік
 * - /status — перевірка статусу
 */
export async function processTelegramWebhookUpdateAction(
  update: TelegramWebhookUpdate
): Promise<{ success: boolean; replyText?: string; error?: string }> {
  try {
    const message = update.message;
    if (!message || !message.text) {
      return { success: true };
    }

    const text = message.text.trim();
    const chatId = String(message.chat.id);
    const username = message.from?.username || message.chat.username || null;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Функція відправки відповіді у Telegram
    async function reply(replyMsg: string) {
      if (botToken) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyMsg,
              parse_mode: "Markdown",
            }),
          });
        } catch {}
      }
    }

    // 1. Команда прив'язки: /start <token>
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const rawToken = parts[1];

      if (!rawToken) {
        const helpMsg =
          "👋 Вітаємо в системі медичного контролю та моніторингу навантаження!\n\n" +
          "Для прив'язки вашого акаунту відскануйте персональний QR-код у медичній картці або перейдіть за посиланням, наданим лікарем.";
        await reply(helpMsg);
        return { success: true, replyText: helpMsg };
      }

      const tokenHash = hashTokenSha256(rawToken);
      const supabase = createAdminClient();
      const nowIso = new Date().toISOString();

      // Шукаємо токен у БД
      const { data: tokenRecord, error: tErr } = await supabase
        .from("player_telegram_tokens")
        .select("*, players ( id, first_name, last_name, date_of_birth )")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      let playerId = tokenRecord?.player_id;
      let playerDob = (tokenRecord as any)?.players?.date_of_birth;

      if (!tokenRecord || tErr) {
        // Fallback до in-memory
        const memToken = memoryTelegramTokens.get(tokenHash);
        if (!memToken) {
          const failMsg =
            "❌ Недійсний або прострочений токен прив'язки. Будь ласка, згенеруйте новий QR-код у додатку.";
          await reply(failMsg);
          return { success: false, replyText: failMsg };
        }
        if (memToken.used_at) {
          const usedMsg = "⚠️ Цей одноразовий токен вже був використаний.";
          await reply(usedMsg);
          return { success: false, replyText: usedMsg };
        }
        if (new Date() > new Date(memToken.expires_at)) {
          const expMsg = "⏳ Термін дії токена минув.";
          await reply(expMsg);
          return { success: false, replyText: expMsg };
        }
        playerId = memToken.player_id;
      } else {
        if (tokenRecord.used_at) {
          const usedMsg = "⚠️ Цей одноразовий токен вже був використаний.";
          await reply(usedMsg);
          return { success: false, replyText: usedMsg };
        }
        if (new Date() > new Date(tokenRecord.expires_at)) {
          const expMsg = "⏳ Термін дії токена минув.";
          await reply(expMsg);
          return { success: false, replyText: expMsg };
        }
      }

      // Перевірка згоди батьків для неповнолітніх (Вимога 5)
      const consentSummary = await getPlayerConsentSummary(playerId!);
      const eligibility = checkTelegramEligibility({
        id: playerId!,
        date_of_birth: playerDob,
        hasParentConsent:
          !consentSummary.isMinor ||
          Boolean(consentSummary.scopes["data_processing"]?.status === "granted"),
      });

      if (!eligibility.eligible) {
        const consentErr = `⛔ ${eligibility.reason}`;
        await reply(consentErr);
        return { success: false, replyText: consentErr };
      }

      // Одноразове маркування токена
      await supabase
        .from("player_telegram_tokens")
        .update({ used_at: nowIso })
        .eq("token_hash", tokenHash);

      const mem = memoryTelegramTokens.get(tokenHash);
      if (mem) mem.used_at = nowIso;

      // Збереження прив'язки
      await supabase.from("player_telegram_bindings").upsert(
        {
          player_id: playerId,
          club_id: tokenRecord?.club_id || DEFAULT_CLUB_ID,
          telegram_chat_id: chatId,
          telegram_username: username,
          status: "active",
          created_at: nowIso,
          unlinked_at: null,
        },
        { onConflict: "player_id,telegram_chat_id" }
      );

      memoryTelegramBindings.set(`${playerId}:${chatId}`, {
        id: crypto.randomUUID(),
        player_id: playerId!,
        club_id: tokenRecord?.club_id || DEFAULT_CLUB_ID,
        telegram_chat_id: chatId,
        telegram_username: username,
        status: "active",
        created_at: nowIso,
      });

      const successMsg =
        "✅ *Акаунт успішно прив'язано до медичного бота клубу!*\n\n" +
        "Тепер щоранку ви отримуватимете нагадування із посиланням на коротку анкету самопочуття.\n" +
        "Щоб відписатися будь-коли, надішліть команду /stop.";

      await reply(successMsg);
      return { success: true, replyText: successMsg };
    }

    // 2. Команда відписки: /stop або /unbind (Вимога 4)
    if (text === "/stop" || text === "/unbind") {
      const supabase = createAdminClient();
      const nowIso = new Date().toISOString();

      await supabase
        .from("player_telegram_bindings")
        .update({ status: "unlinked", unlinked_at: nowIso })
        .eq("telegram_chat_id", chatId)
        .eq("status", "active");

      unlinkTelegramByChatIdInMemory(chatId);

      const unlinkedMsg =
        "🔕 *Прив'язку успішно скасовано.*\n\n" +
        "Ви більше не отримуватимете ранкові сповіщення. Щоб відновити прив'язку, відскануйте новий QR-код у вашому кабінеті.";

      await reply(unlinkedMsg);
      return { success: true, replyText: unlinkedMsg };
    }

    // 3. Команда статусу: /status
    if (text === "/status") {
      let active = false;
      for (const b of memoryTelegramBindings.values()) {
        if (b.telegram_chat_id === chatId && b.status === "active") {
          active = true;
          break;
        }
      }
      const statusMsg = active
        ? "🟢 Ваш Telegram успішно підключено до системи клубу."
        : "⚪ У вас немає активної прив'язки до гравця.";
      await reply(statusMsg);
      return { success: true, replyText: statusMsg };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * 2. Утреннее напоминание «Заповни анкету самопочуття» со ссылкой на PWA (п. 8.7.2).
 * У повідомленні суворо НЕМАЄ медичних даних і прізвищ інших гравців.
 */
export async function sendMorningWellnessRemindersAction(options?: {
  teamId?: string;
  baseUrl?: string;
}) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    const supabase = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const baseUrl =
      options?.baseUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://med.fc-chornomorets.com";

    // 1. Отримуємо активні прив'язки
    let query = supabase
      .from("player_telegram_bindings")
      .select("id, player_id, telegram_chat_id, players!inner(id, first_name, last_name, team_id)")
      .eq("status", "active");

    if (options?.teamId) {
      query = query.eq("players.team_id", options.teamId);
    }

    const { data: bindings } = await query;
    const activeBindings: Array<{
      player_id: string;
      telegram_chat_id: string;
      first_name?: string;
    }> = [];

    if (bindings && bindings.length > 0) {
      for (const b of bindings as any[]) {
        activeBindings.push({
          player_id: b.player_id,
          telegram_chat_id: b.telegram_chat_id,
          first_name: b.players?.first_name,
        });
      }
    } else {
      // In-memory fallback
      for (const b of memoryTelegramBindings.values()) {
        if (b.status === "active") {
          activeBindings.push({
            player_id: b.player_id,
            telegram_chat_id: b.telegram_chat_id,
          });
        }
      }
    }

    if (activeBindings.length === 0) {
      return {
        success: true,
        sentCount: 0,
        skippedCount: 0,
        message: "Немає активних підключених гравців для нагадування",
      };
    }

    // 2. Отримуємо список тих, хто вже заповнив сьогодні анкету
    const { data: todayEntries } = await supabase
      .from("wellness_entries")
      .select("player_id")
      .eq("date", today);

    const filledPlayerIds = new Set((todayEntries || []).map((e: any) => e.player_id));

    let sentCount = 0;
    let skippedCount = 0;

    for (const b of activeBindings) {
      if (filledPlayerIds.has(b.player_id)) {
        skippedCount++;
        continue;
      }

      const reminderText = formatMorningWellnessReminder({
        playerName: b.first_name,
        wellnessUrl: `${baseUrl}/wellness`,
      });

      await sendClubMessage({
        channel: "telegram",
        recipient: b.telegram_chat_id,
        text: reminderText,
      });

      sentCount++;
    }

    return {
      success: true,
      sentCount,
      skippedCount,
      totalTargets: activeBindings.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка відправки ранкових нагадувань",
    };
  }
}

/**
 * 3. Недельный отчёт тренеру (Telegram и PDF) (п. 8.7.3).
 * Процент заповнення, кількість жовтих і червоних флажків (тільки лічильники, без імен),
 * загальне навантаження. Список «потребують уваги» тільки в додатку.
 */
export async function generateCoachWeeklyTelegramReportAction(
  teamId: string,
  options?: {
    sendToTelegram?: boolean;
    customCoachChatId?: string;
  }
) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    const supabase = createAdminClient();
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekStartStr = weekAgo.toISOString().split("T")[0];
    const weekEndStr = now.toISOString().split("T")[0];

    // Отримуємо команду та гравців
    const { data: team } = await supabase
      .from("teams")
      .select("id, name, players(id)")
      .eq("id", teamId)
      .maybeSingle();

    const teamName = team?.name || "Команда";
    const teamPlayerIds = (team?.players || []).map((p: any) => p.id);
    const totalPlayers = teamPlayerIds.length || 18;

    // Отримуємо анкети за 7 днів
    const { data: weekEntries } = await supabase
      .from("wellness_entries")
      .select("player_id, date, fatigue, soreness, pain, pain_vas, illness")
      .gte("date", weekStartStr)
      .lte("date", weekEndStr);

    const relevantEntries = (weekEntries || []).filter((e: any) =>
      teamPlayerIds.length > 0 ? teamPlayerIds.includes(e.player_id) : true
    );

    const totalSurveysExpected = totalPlayers * 7;
    const completedSurveysCount = relevantEntries.length;
    const compliancePct =
      totalSurveysExpected > 0
        ? Math.min(100, Math.round((completedSurveysCount / totalSurveysExpected) * 100))
        : 0;

    // Розрахунок лічильників прапорців (БЕЗ імен!)
    let yellowFlagsCount = 0;
    let redFlagsCount = 0;
    let sumFatigue = 0;
    let sumSoreness = 0;

    for (const e of relevantEntries) {
      sumFatigue += e.fatigue || 3;
      sumSoreness += e.soreness || 3;

      if (e.pain_vas >= 7 || e.illness) {
        redFlagsCount++;
      } else if (e.pain_vas >= 4 || e.fatigue <= 2 || e.soreness <= 2) {
        yellowFlagsCount++;
      }
    }

    const count = relevantEntries.length || 1;
    const averageFatigueScore = sumFatigue / count;
    const averageSorenessScore = sumSoreness / count;

    let overallWorkloadDescription = "Оптимальне навантаження";
    if (averageFatigueScore < 2.5 || averageSorenessScore < 2.5) {
      overallWorkloadDescription = "Підвищене навантаження (висока втома команди)";
    } else if (averageFatigueScore > 4.0 && averageSorenessScore > 4.0) {
      overallWorkloadDescription = "Відновлювальний стан / свіжість";
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://med.fc-chornomorets.com";
    const appReadinessUrl = `${baseUrl}/team/readiness?teamId=${teamId}`;

    const summary: CoachWeeklyTelegramSummary = {
      teamId,
      teamName,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      compliancePct,
      completedSurveysCount,
      totalSurveysExpected,
      yellowFlagsCount,
      redFlagsCount,
      averageFatigueScore,
      averageSorenessScore,
      overallWorkloadDescription,
      requiresAttentionCount: Math.ceil((yellowFlagsCount + redFlagsCount) / 7),
      appReadinessUrl,
    };

    const messageText = formatCoachWeeklyReport(summary);

    let sentToTelegram = false;
    if (options?.sendToTelegram) {
      const coachChat =
        options.customCoachChatId ||
        process.env.TELEGRAM_COACH_CHAT_ID ||
        process.env.TELEGRAM_CHAT_ID;

      if (coachChat) {
        const sendRes = await sendClubMessage({
          channel: "telegram",
          recipient: coachChat,
          text: messageText,
        });
        sentToTelegram = sendRes.success;
      }
    }

    return {
      success: true,
      summary,
      messageText,
      sentToTelegram,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка формування тижневого звіту",
    };
  }
}
