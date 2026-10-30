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

export const DEFAULT_DOCTOR_PHONE = "+380935623945";
export const DEFAULT_DOCTOR_TG_URL = "https://t.me/+380935623945";

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
    if (!message) {
      return { success: true };
    }

    const text = (
      message.text ||
      message.caption ||
      (message.voice ? "🎙️ [Голосове повідомлення від гравця]" : "") ||
      (message.photo ? "📷 [Фотографія від гравця]" : "")
    ).trim();

    if (!text) {
      return { success: true };
    }
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
      let playerName = tokenRecord ? `${(tokenRecord as any)?.players?.last_name || ""} ${(tokenRecord as any)?.players?.first_name || ""}`.trim() : "";

      // Перевірка в clubs.settings.telegram_tokens
      let matchedClubToken: any = null;
      let clubDataObj: any = null;
      try {
        const { data: c } = await supabase
          .from("clubs")
          .select("id, settings")
          .eq("id", DEFAULT_CLUB_ID)
          .maybeSingle();
        clubDataObj = c;
        const clubTokens = (c?.settings as any)?.telegram_tokens || {};
        if (clubTokens[rawToken.trim()]) {
          matchedClubToken = clubTokens[rawToken.trim()];
          if (!playerId) {
            playerId = matchedClubToken.playerId;
            playerName = matchedClubToken.playerName || "";
          }
        }
      } catch {}

      if (!playerId) {
        // Fallback до in-memory
        const memToken = memoryTelegramTokens.get(tokenHash);
        if (!memToken) {
          const failMsg =
            "❌ Недійсний або прострочений токен прив'язки. Будь ласка, зверніться до медичного штабу клубу.";
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
      } else if (tokenRecord) {
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

      // Збереження прив'язки в clubs.settings для 100% надійності на Vercel
      try {
        const { data: latestClub } = await supabase
          .from("clubs")
          .select("id, settings")
          .eq("id", DEFAULT_CLUB_ID)
          .maybeSingle();

        if (latestClub) {
          const s = (latestClub.settings as any) || {};
          const tBindings = s.telegram_bindings || {};
          tBindings[playerId!] = {
            chatId,
            username,
            boundAt: nowIso,
            status: "active",
          };
          const tTokens = s.telegram_tokens || {};
          if (tTokens[rawToken.trim()]) {
            tTokens[rawToken.trim()].used = true;
            tTokens[rawToken.trim()].usedAt = nowIso;
          }
          await supabase
            .from("clubs")
            .update({
              settings: {
                ...s,
                telegram_bindings: tBindings,
                telegram_tokens: tTokens,
              },
            })
            .eq("id", latestClub.id);
        }
      } catch {}

      // Збереження прив'язки в таблицю
      try {
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
      } catch {}

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
        `✅ *Привіт, ${playerName || "гравець"}!*\n\n` +
        `Твій акаунт успішно підключено до медичного штабу ФК «Чорноморець» (U-19).\n\n` +
        `Тут ти отримуватимеш персональні вказівки лікаря, рекомендації за результатами ранкової анкети та оперативний зв'язок.\n` +
        `Щоб відписатися будь-коли, надішліть команду /stop.`;

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

    // 4. Вільне повідомлення / відповідь гравця лікарю (симптоми, самопочуття, коментар)
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const today = nowIso.split("T")[0];

    let boundPlayerId: string | null = null;
    let boundPlayerName = "";

    // 4a. Пошук у clubs.settings.telegram_bindings
    const { data: club } = await supabase
      .from("clubs")
      .select("id, settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const clubSettings = (club?.settings as any) || {};
    const tBindings = clubSettings.telegram_bindings || {};
    for (const [pId, b] of Object.entries(tBindings)) {
      if ((b as any)?.chatId === chatId && (b as any)?.status === "active") {
        boundPlayerId = pId;
        break;
      }
    }

    // 4b. Пошук у таблиці player_telegram_bindings
    if (!boundPlayerId) {
      try {
        const { data: bRow } = await supabase
          .from("player_telegram_bindings")
          .select("player_id, players ( first_name, last_name )")
          .eq("telegram_chat_id", chatId)
          .eq("status", "active")
          .maybeSingle();
        if (bRow?.player_id) {
          boundPlayerId = bRow.player_id;
          boundPlayerName = `${(bRow as any)?.players?.first_name || ""} ${(bRow as any)?.players?.last_name || ""}`.trim();
        }
      } catch {}
    }

    // 4c. Пошук в in-memory
    if (!boundPlayerId) {
      for (const b of memoryTelegramBindings.values()) {
        if (b.telegram_chat_id === chatId && b.status === "active") {
          boundPlayerId = b.player_id;
          break;
        }
      }
    }

    if (!boundPlayerId) {
      const notBoundMsg =
        "ℹ️ Ваш акаунт Telegram ще не прив'язано до медичної картки гравця.\n\n" +
        "Будь ласка, зверніться до лікаря клубу або відскануйте персональний QR-код для прив'язки.";
      await reply(notBoundMsg);
      return { success: true, replyText: notBoundMsg };
    }

    // Зберігаємо відповідь гравця в медичну картку (wellness_entries_store)
    const store = clubSettings.wellness_entries_store || {};
    const entryKey = `${boundPlayerId}_${today}`;
    const currEntry = store[entryKey] || {};
    const rec = currEntry.doctor_recommendation || {};

    const replyItem = {
      text,
      receivedAt: nowIso,
      source: "telegram" as const,
      username: username ? `@${username}` : null,
    };

    const existingReplies = Array.isArray(rec.replies) ? rec.replies : [];
    existingReplies.push(replyItem);

    currEntry.doctor_recommendation = {
      ...rec,
      playerReply: replyItem,
      replies: existingReplies,
    };
    store[entryKey] = currEntry;

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...clubSettings,
          wellness_entries_store: store,
        },
      })
      .eq("id", club?.id || DEFAULT_CLUB_ID);

    try {
      await logAudit({
        action: "receive_telegram_player_reply",
        entity: "wellness_entries",
        playerId: boundPlayerId,
        meta: {
          textLength: text.length,
          source: "telegram",
          chatId,
        },
      });
    } catch {}

    // Підтвердження гравцю з прямим переходом на контакт лікаря
    const ackMsg =
      `✅ *Вашу відповідь отримано та збережено в медичній картці!*\n\n` +
      `💬 _«${text}»_\n\n` +
      `👨‍⚕️ Лікар бачить ваше повідомлення в системі.\n` +
      `📞 *Прямий контакт лікаря:* \`${DEFAULT_DOCTOR_PHONE}\`\n\n` +
      `Якщо потрібна термінова консультація або посилився біль, напишіть лікарю особисто за кнопкою нижче:`;

    if (botToken) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: ackMsg,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💬 Написати лікарю в Telegram",
                    url: DEFAULT_DOCTOR_TG_URL,
                  },
                ],
              ],
            },
          }),
        });
      } catch {}
    }

    return { success: true, replyText: ackMsg };
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

/**
 * Отримання статусу Telegram-прив'язки гравця для модального вікна лікаря
 */
export async function getPlayerTelegramBindingAction(playerId: string): Promise<{
  isBound: boolean;
  username?: string | null;
  boundAt?: string | null;
}> {
  if (!playerId) return { isBound: false };
  try {
    const supabase = createAdminClient();
    // 1. clubs.settings
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const bindings = (club?.settings as any)?.telegram_bindings || {};
    if (bindings[playerId] && bindings[playerId].status === "active") {
      return {
        isBound: true,
        username: bindings[playerId].username || null,
        boundAt: bindings[playerId].boundAt || null,
      };
    }

    // 2. player_telegram_bindings table
    const { data: b } = await supabase
      .from("player_telegram_bindings")
      .select("telegram_username, created_at, status")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle();

    if (b) {
      return {
        isBound: true,
        username: b.telegram_username || null,
        boundAt: b.created_at || null,
      };
    }

    return { isBound: false };
  } catch {
    return { isBound: false };
  }
}

/**
 * Відправка персональної рекомендації / вказівки лікаря гравцю
 * Зберігається в анкету + надсилається в Telegram ботом, якщо прив'язано
 */
export async function sendDoctorRecommendationAction(params: {
  playerId: string;
  date: string;
  recommendation: string;
  templateTitle?: string;
  doctorName?: string;
}): Promise<{
  success: boolean;
  sentToTelegram: boolean;
  isBound: boolean;
  error?: string;
}> {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, sentToTelegram: false, isBound: false, error: auth.error };
    }
    const user = auth.user;
    const { playerId, date, recommendation, templateTitle, doctorName } = params;

    if (!playerId || !date || !recommendation.trim()) {
      return { success: false, sentToTelegram: false, isBound: false, error: "Заповніть текст рекомендації" };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const docName = doctorName || (user as any)?.name || user.email || "Медичний штаб";

    // 1. Шукаємо Telegram Chat ID
    let chatId: string | null = null;
    let isBound = false;

    const { data: club } = await supabase
      .from("clubs")
      .select("id, settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const clubSettings = (club?.settings as any) || {};
    const bindings = clubSettings.telegram_bindings || {};
    if (bindings[playerId] && bindings[playerId].status === "active") {
      chatId = bindings[playerId].chatId;
      isBound = true;
    }

    if (!chatId) {
      try {
        const { data: b } = await supabase
          .from("player_telegram_bindings")
          .select("telegram_chat_id")
          .eq("player_id", playerId)
          .eq("status", "active")
          .maybeSingle();
        if (b?.telegram_chat_id) {
          chatId = b.telegram_chat_id;
          isBound = true;
        }
      } catch {}
    }

    // 2. Якщо є Telegram - відправляємо повідомлення
    let sentToTelegram = false;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (chatId && botToken) {
      try {
        const messageText =
          `👨‍⚕️ *Рекомендація медичного штабу на ${date}:*\n\n` +
          `${recommendation.trim()}\n\n` +
          `_Лікар: ${docName}_\n` +
          `📞 *Контакт лікаря:* \`${DEFAULT_DOCTOR_PHONE}\`\n\n` +
          `💬 _Натисніть кнопку нижче, щоб одразу написати лікарю особисто, або просто відповідайте на це повідомлення._`;

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "💬 Написати лікарю в Telegram",
                    url: DEFAULT_DOCTOR_TG_URL,
                  },
                ],
              ],
            },
          }),
        });
        const tgData = await tgRes.json();
        sentToTelegram = Boolean(tgData.ok);
      } catch {}
    }

    // 3. Зберігаємо в clubs.settings.wellness_entries_store
    const store = clubSettings.wellness_entries_store || {};
    const key = `${playerId}_${date}`;
    const currEntry = store[key] || {};
    currEntry.doctor_recommendation = {
      text: recommendation.trim(),
      template: templateTitle || null,
      doctor: docName,
      doctorPhone: DEFAULT_DOCTOR_PHONE,
      sentAt: nowIso,
      sentToTelegram,
      playerReply: currEntry.doctor_recommendation?.playerReply || null,
      replies: currEntry.doctor_recommendation?.replies || [],
    };
    store[key] = currEntry;

    // 4. Оновлюємо статус перегляду «Взято до уваги»
    const acks = clubSettings.wellness_acknowledgements || {};
    acks[key] = {
      acknowledged: true,
      reviewed_by_role: "doctor",
      reviewed_by_name: docName,
      reviewed_at: nowIso,
    };

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...clubSettings,
          wellness_entries_store: store,
          wellness_acknowledgements: acks,
        },
      })
      .eq("id", club?.id || DEFAULT_CLUB_ID);

    return {
      success: true,
      sentToTelegram,
      isBound,
    };
  } catch (err: any) {
    return {
      success: false,
      sentToTelegram: false,
      isBound: false,
      error: err?.message || "Помилка збереження та відправки рекомендації",
    };
  }
}


/**
 * Отримання рекомендації лікаря та відповідей гравця для вказаної дати
 */
export async function getPlayerDoctorRecommendationAction(params: {
  playerId: string;
  date: string;
}): Promise<{
  success: boolean;
  recommendation?: any;
  error?: string;
}> {
  try {
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const store = (club?.settings as any)?.wellness_entries_store || {};
    const key = `${params.playerId}_${params.date}`;
    const rec = store[key]?.doctor_recommendation || null;

    return {
      success: true,
      recommendation: rec,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message,
    };
  }
}
