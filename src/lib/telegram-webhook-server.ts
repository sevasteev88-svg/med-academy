import crypto from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { getClubMedicalTelegramConfig } from "@/lib/medical-telegram";
import {
  hashTokenSha256,
  checkTelegramEligibility,
  unlinkTelegramByChatIdInMemory,
  memoryTelegramTokens,
  memoryTelegramBindings,
} from "@/lib/telegram-auth";
import {
  type TelegramWebhookUpdate,
  type CoachTelegramBinding,
} from "@/types/telegram";
import {
  processCoachCallbackQuery,
  processCoachTextMessage,
  sendCoachMainMenu,
} from "@/lib/coach-telegram-bot";
import {
  memoryCoachTokens,
  memoryCoachBindings,
} from "@/lib/coach-telegram-state";

/**
 * Серверний обробник вхідного Telegram Webhook від бота (не є Server Action):
 * - /start <token> — одноразова прив'язка гравця або тренера
 * - /stop або /unbind — відписка в один клік
 * - /status — перевірка статусу
 * - вільне текстове повідомлення — відповідь лікарю або повідомлення тренера
 */
export async function processTelegramWebhookUpdate(
  update: TelegramWebhookUpdate,
  overrideClubId?: string
): Promise<{ success: boolean; replyText?: string; error?: string }> {
  try {
    const supabase = createAdminClient();
    const scopedClubId = overrideClubId || DEFAULT_CLUB_ID;

    // 0. ОБРОБКА ІНЛАЙН-КНОПОК ТРЕНЕРА (callback_query)
    if (update.callback_query) {
      const cb = update.callback_query;
      const cbChatId = String(cb.message?.chat.id || cb.from.id);
      let coachBinding: CoachTelegramBinding | null = null;
      try {
        const { data } = await supabase
          .from("coach_telegram_bindings")
          .select("*")
          .eq("club_id", scopedClubId)
          .eq("telegram_chat_id", cbChatId)
          .eq("status", "active")
          .maybeSingle();
        if (data) coachBinding = data as CoachTelegramBinding;
      } catch {}

      if (!coachBinding) {
        for (const b of memoryCoachBindings.values()) {
          if (
            b.telegram_chat_id === cbChatId &&
            b.club_id === scopedClubId &&
            b.status === "active"
          ) {
            coachBinding = b;
            break;
          }
        }
      }

      if (coachBinding || (cb.data && (cb.data.startsWith("coach_") || cb.data.startsWith("cstep_")))) {
        await processCoachCallbackQuery(
          cb,
          coachBinding ||
            ({
              coach_user_id: "",
              club_id: scopedClubId,
              telegram_chat_id: cbChatId,
              status: "active",
            } as any)
        );
        return { success: true };
      }

      return { success: true };
    }

    const message = update.message;
    if (!message) {
      return { success: true };
    }

    const text = (
      message.text ||
      message.caption ||
      (message.voice ? "🎙️ [Голосове повідомлення]" : "") ||
      (message.photo ? "📷 [Фотографія]" : "")
    ).trim();

    if (!text) {
      return { success: true };
    }
    const chatId = String(message.chat.id);
    const username = message.from?.username || message.chat.username || null;
    const { botToken } = await getClubTelegramConfig(overrideClubId);

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
            signal: AbortSignal.timeout(15000),
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
          "👋 Вітаємо в системі спортивного та медичного моніторингу!\n\n" +
          "Для прив'язки вашого акаунту відскануйте персональний QR-код або перейдіть за персональним посиланням.";
        await reply(helpMsg);
        return { success: true, replyText: helpMsg };
      }

      // ПРИВ'ЯЗКА ТРЕНЕРА (/start coach_<token>)
      if (rawToken.startsWith("coach_")) {
        const actualCoachToken = rawToken.replace(/^coach_/, "");
        const tokenHash = hashTokenSha256(actualCoachToken);
        const nowIso = new Date().toISOString();

        let coachUserId: string | null = null;
        let clubId: string = overrideClubId || DEFAULT_CLUB_ID;

        try {
          const { data: tokRec } = await supabase
            .from("coach_telegram_tokens")
            .select("*")
            .eq("token_hash", tokenHash)
            .maybeSingle();

          if (tokRec) {
            if (tokRec.used_at) {
              await reply("⚠️ Цей одноразовий токен прив'язки тренера вже був використаний.");
              return { success: false, replyText: "Token already used" };
            }
            if (new Date() > new Date(tokRec.expires_at)) {
              await reply("⏳ Термін дії токена минув. Зверніться до адміністратора клубу.");
              return { success: false, replyText: "Token expired" };
            }
            if (overrideClubId && tokRec.club_id && tokRec.club_id !== overrideClubId) {
              await reply("❌ Це посилання належить іншому клубу. Відкрийте бота вашого клубу.");
              return { success: false, replyText: "Cross-club token mismatch" };
            }
            coachUserId = tokRec.coach_user_id;
            clubId = tokRec.club_id || overrideClubId || DEFAULT_CLUB_ID;

            await supabase
              .from("coach_telegram_tokens")
              .update({ used_at: nowIso })
              .eq("id", tokRec.id);
          }
        } catch {}

        if (!coachUserId) {
          const mem = memoryCoachTokens.get(tokenHash);
          if (mem) {
            if (mem.used_at) {
              await reply("⚠️ Цей одноразовий токен прив'язки тренера вже був використаний.");
              return { success: false, replyText: "Token already used" };
            }
            if (overrideClubId && mem.club_id && mem.club_id !== overrideClubId) {
              await reply("❌ Це посилання належить іншому клубу. Відкрийте бота вашого клубу.");
              return { success: false, replyText: "Cross-club token mismatch" };
            }
            coachUserId = mem.coach_user_id;
            clubId = mem.club_id;
            mem.used_at = nowIso;
          }
        }

        if (!coachUserId) {
          await reply("❌ Недійсний або прострочений токен тренера. Отримайте нове посилання в кабінеті клубу.");
          return { success: false, replyText: "Invalid coach token" };
        }

        const { data: coachProf } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", coachUserId)
          .maybeSingle();

        const coachName = coachProf?.full_name || "Тренер";

        const bindingRecord: CoachTelegramBinding = {
          id: crypto.randomUUID(),
          coach_user_id: coachUserId,
          club_id: clubId,
          telegram_chat_id: chatId,
          telegram_username: username,
          status: "active",
          morning_report_time: "09:00",
          receive_morning_report: true,
          created_at: nowIso,
          unlinked_at: null,
        };

        try {
          await supabase.from("coach_telegram_bindings").upsert(
            {
              coach_user_id: coachUserId,
              club_id: clubId,
              telegram_chat_id: chatId,
              telegram_username: username,
              status: "active",
              created_at: nowIso,
              unlinked_at: null,
            },
            { onConflict: "coach_user_id,telegram_chat_id" }
          );
        } catch {}

        memoryCoachBindings.set(`${clubId}:${chatId}`, bindingRecord);

        await sendCoachMainMenu(chatId, undefined, coachName, clubId);
        return { success: true };
      }

      // ПРИВ'ЯЗКА ФУТБОЛІСТА
      const tokenHash = hashTokenSha256(rawToken);
      const nowIso = new Date().toISOString();

      const { data: tokenRecord } = await supabase
        .from("player_telegram_tokens")
        .select("*, players ( id, first_name, last_name, date_of_birth, club_id )")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      let playerId = tokenRecord?.player_id;
      const playerDob = (tokenRecord as any)?.players?.date_of_birth;
      let playerName = tokenRecord
        ? `${(tokenRecord as any)?.players?.last_name || ""} ${(tokenRecord as any)?.players?.first_name || ""}`.trim()
        : "";

      const lookupClubId =
        overrideClubId ||
        tokenRecord?.club_id ||
        (tokenRecord as any)?.players?.club_id ||
        DEFAULT_CLUB_ID;

      // Перевірка в clubs.settings.telegram_tokens
      let matchedClubToken: any = null;
      try {
        const { data: c } = await supabase
          .from("clubs")
          .select("id, settings")
          .eq("id", lookupClubId)
          .maybeSingle();
        const clubTokens = (c?.settings as any)?.telegram_tokens || {};
        if (clubTokens[rawToken.trim()]) {
          matchedClubToken = clubTokens[rawToken.trim()];
          if (!playerId) {
            playerId = matchedClubToken.playerId;
            playerName = matchedClubToken.playerName || "";
          }
        }
      } catch {}

      let resolvedClubId =
        overrideClubId ||
        tokenRecord?.club_id ||
        (tokenRecord as any)?.players?.club_id ||
        DEFAULT_CLUB_ID;

      if (!playerId) {
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
        resolvedClubId = overrideClubId || memToken.club_id || resolvedClubId;
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

      await supabase
        .from("player_telegram_tokens")
        .update({ used_at: nowIso })
        .eq("token_hash", tokenHash);

      const mem = memoryTelegramTokens.get(tokenHash);
      if (mem) mem.used_at = nowIso;

      // Збереження прив'язки в clubs.settings
      try {
        const { data: latestClub } = await supabase
          .from("clubs")
          .select("id, settings")
          .eq("id", resolvedClubId)
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

      try {
        await supabase.from("player_telegram_bindings").upsert(
          {
            player_id: playerId,
            club_id: resolvedClubId,
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
        club_id: resolvedClubId,
        telegram_chat_id: chatId,
        telegram_username: username,
        status: "active",
        created_at: nowIso,
      });

      const successMsg =
        `✅ *Привіт, ${playerName || "гравець"}!*\n\n` +
        `Твій акаунт успішно підключено до медичного штабу клубу.\n\n` +
        `Тут ти отримуватимеш персональні вказівки лікаря, рекомендації за результатами ранкової анкети та оперативний зв'язок.\n` +
        `Щоб відписатися будь-коли, надішліть команду /stop.`;

      await reply(successMsg);
      return { success: true, replyText: successMsg };
    }

    // 2. Команда відписки: /stop або /unbind
    if (text === "/stop" || text === "/unbind") {
      const nowIso = new Date().toISOString();

      await supabase
        .from("player_telegram_bindings")
        .update({ status: "unlinked", unlinked_at: nowIso })
        .eq("club_id", scopedClubId)
        .eq("telegram_chat_id", chatId)
        .eq("status", "active");

      unlinkTelegramByChatIdInMemory(chatId);

      const unlinkedMsg =
        "🔕 *Прив'язку успішно скасовано.*\n\n" +
        "Ви більше не отримуватимете ранкові сповіщення. Щоб відновити прив'язку, відскануйте новий QR-код у вашому кабінеті.";

      await reply(unlinkedMsg);
      return { success: true, replyText: unlinkedMsg };
    }

    // 2.5. Перевірка чи повідомлення від підключеного ТРЕНЕРА
    let coachBinding: CoachTelegramBinding | null = null;
    try {
      const { data } = await supabase
        .from("coach_telegram_bindings")
        .select("*")
        .eq("club_id", scopedClubId)
        .eq("telegram_chat_id", chatId)
        .eq("status", "active")
        .maybeSingle();
      if (data) coachBinding = data as CoachTelegramBinding;
    } catch {}

    if (!coachBinding) {
      for (const b of memoryCoachBindings.values()) {
        if (
          b.telegram_chat_id === chatId &&
          b.club_id === scopedClubId &&
          b.status === "active"
        ) {
          coachBinding = b;
          break;
        }
      }
    }

    if (coachBinding) {
      await processCoachTextMessage(message, coachBinding);
      return { success: true };
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

    // 4. Вільне повідомлення / відповідь гравця лікарю
    const nowIso = new Date().toISOString();
    let boundPlayerId: string | null = null;
    let boundClubId: string = overrideClubId || DEFAULT_CLUB_ID;

    // 4a. Пошук у таблиці player_telegram_bindings (мультиклубний пріоритет)
    try {
      let bQuery = supabase
        .from("player_telegram_bindings")
        .select("player_id, club_id")
        .eq("telegram_chat_id", String(chatId).trim())
        .eq("status", "active");
      if (overrideClubId) {
        bQuery = bQuery.eq("club_id", overrideClubId);
      }
      const { data: bRow } = await bQuery.maybeSingle();
      if (bRow?.player_id) {
        boundPlayerId = bRow.player_id;
        if (bRow.club_id) boundClubId = bRow.club_id;
      }
    } catch {}

    // 4b. Пошук у clubs.settings.telegram_bindings
    const { data: club } = await supabase
      .from("clubs")
      .select("id, settings")
      .eq("id", boundClubId)
      .maybeSingle();

    const clubSettings = (club?.settings as any) || {};
    if (!boundPlayerId) {
      const tBindings = clubSettings.telegram_bindings || {};
      for (const [pId, b] of Object.entries(tBindings)) {
        if (
          String((b as any)?.chatId || "").trim() === String(chatId).trim() &&
          (b as any)?.status === "active"
        ) {
          boundPlayerId = pId;
          break;
        }
      }
    }

    // 4c. Пошук в in-memory
    if (!boundPlayerId) {
      for (const b of memoryTelegramBindings.values()) {
        if (String(b.telegram_chat_id).trim() === String(chatId).trim() && b.status === "active") {
          boundPlayerId = b.player_id;
          if (b.club_id) boundClubId = b.club_id;
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

    const kyivDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
    const store = clubSettings.wellness_entries_store || {};
    const todayKey = `${boundPlayerId}_${kyivDate}`;
    const todayEntry = store[todayKey] || {};
    const todayRec = todayEntry.doctor_recommendation || {};

    const replyItem = {
      text,
      receivedAt: nowIso,
      source: "telegram" as const,
      username: username ? `@${username}` : null,
    };

    const existingReplies = Array.isArray(todayRec.replies) ? [...todayRec.replies] : [];
    existingReplies.push(replyItem);

    todayEntry.doctor_recommendation = {
      ...todayRec,
      playerReply: replyItem,
      replies: existingReplies,
    };
    store[todayKey] = todayEntry;

    const otherKeys = Object.keys(store)
      .filter((k) => k.startsWith(`${boundPlayerId}_`) && k !== todayKey)
      .sort()
      .reverse();

    for (const ok of otherKeys) {
      const otherEntry = store[ok];
      if (
        otherEntry?.doctor_recommendation?.text ||
        (Array.isArray(otherEntry?.doctor_recommendation?.sentHistory) &&
          otherEntry.doctor_recommendation.sentHistory.length > 0)
      ) {
        const oRec = otherEntry.doctor_recommendation;
        const oReplies = Array.isArray(oRec.replies) ? [...oRec.replies] : [];
        oReplies.push(replyItem);
        store[ok] = {
          ...otherEntry,
          doctor_recommendation: {
            ...oRec,
            playerReply: replyItem,
            replies: oReplies,
          },
        };
        break;
      }
    }

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...clubSettings,
          wellness_entries_store: store,
        },
      })
      .eq("id", club?.id || boundClubId);

    try {
      await logAudit({
        action: "receive_telegram_player_reply",
        entity: "wellness_entries",
        playerId: boundPlayerId,
        clubId: club?.id || boundClubId,
        allowPublic: true,
        meta: {
          textLength: text.length,
          source: "telegram",
          chatId,
        },
      });
    } catch {}

    const medTg = await getClubMedicalTelegramConfig(club?.id || boundClubId);
    const contactLines =
      (medTg.doctorPhone ? `📞 *Телефон лікаря:* \`${medTg.doctorPhone}\`\n` : "") +
      (medTg.doctorTelegramUrl
        ? `💬 *Telegram лікаря:* [Натисніть для зв'язку](${medTg.doctorTelegramUrl})\n`
        : "");

    const ackMsg =
      `✅ *Вашу відповідь отримано та збережено в медичній картці!*\n\n` +
      `💬 _«${text}»_\n\n` +
      `👨‍⚕️ Лікар бачить ваше повідомлення в системі.\n` +
      (contactLines
        ? `${contactLines}\nЯкщо потрібна термінова консультація або посилився біль, зателефонуйте або напишіть лікарю в особисті повідомлення${medTg.doctorTelegramUrl ? " за кнопкою нижче" : ""}:`
        : "");

    if (botToken) {
      try {
        const bodyPayload: Record<string, any> = {
          chat_id: chatId,
          text: ackMsg,
          parse_mode: "Markdown",
        };
        if (medTg.doctorTelegramUrl) {
          bodyPayload.reply_markup = {
            inline_keyboard: [
              [
                {
                  text: "💬 Написати лікарю в Telegram",
                  url: medTg.doctorTelegramUrl,
                },
              ],
            ],
          };
        }

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          signal: AbortSignal.timeout(15000),
        });
      } catch {}
    }

    return { success: true, replyText: ackMsg };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
