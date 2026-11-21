"use server";

import crypto from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  assertTeamStaff,
  assertDoctor,
  assertPlayerAccess,
  isCoach,
  isDoctor,
} from "@/lib/auth";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";
import { getPlayerConsentSummary } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { sendClubMessage } from "@/lib/messaging-adapter";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { getClubMedicalTelegramConfig } from "@/lib/medical-telegram";
import {
  sendMorningWellnessRemindersInternal,
  sendPostSessionRemindersInternal,
} from "@/lib/telegram-reminders-server";
import {
  generateTelegramBindingToken,
  hashTokenSha256,
  buildTelegramDeepLink,
  checkTelegramEligibility,
  unlinkPlayerTelegramInMemory,
  formatCoachWeeklyReport,
  memoryTelegramTokens,
  memoryTelegramBindings,
  TELEGRAM_TOKEN_EXPIRATION_SECONDS,
} from "@/lib/telegram-auth";
import {
  type CoachWeeklyTelegramSummary,
  type PlayerTelegramBinding,
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

    const access = await assertPlayerAccess(user, playerId, { allowCoach: true });
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Отримуємо дані гравця у межах клубу користувача
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, team_id, club_id, teams ( name )")
      .eq("id", playerId)
      .eq("club_id", user.clubId)
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

    // 3. Відкликаємо старі невикористані токени гравця в цьому клубі
    await supabase
      .from("player_telegram_tokens")
      .update({ used_at: nowIso })
      .eq("player_id", playerId)
      .eq("club_id", user.clubId)
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

    const { error: insErr } = await supabase.from("player_telegram_tokens").insert({
      player_id: playerId,
      club_id: user.clubId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: user.id,
    });

    if (insErr) {
      memoryTelegramTokens.set(tokenHash, {
        id: crypto.randomUUID(),
        player_id: playerId,
        club_id: user.clubId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_by: user.id,
        created_at: nowIso,
      });
    }

    await logAudit({
      action: "issue_telegram_binding_token",
      entity: "player_telegram_tokens",
      playerId: playerId,
      userId: user.id,
      clubId: user.clubId,
      meta: {
        expires_in_hours: 48,
      },
    });

    const { botUsername } = await getClubTelegramConfig(user.clubId);
    if (!botUsername) {
      return {
        success: false,
        error:
          "Telegram-бот для цього клубу ще не налаштовано. Додайте токен та username бота в Налаштуваннях клубу.",
      };
    }
    const deepLink = buildTelegramDeepLink(rawToken, botUsername);
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

    const access = await assertPlayerAccess(user, playerId, { allowCoach: true });
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    await supabase
      .from("player_telegram_bindings")
      .update({ status: "unlinked", unlinked_at: nowIso })
      .eq("player_id", playerId)
      .eq("club_id", user.clubId)
      .eq("status", "active");

    unlinkPlayerTelegramInMemory(playerId);

    await logAudit({
      action: "unlink_player_telegram",
      entity: "player_telegram_bindings",
      playerId: playerId,
      userId: user.id,
      clubId: user.clubId,
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
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, isBound: false, error: auth.error };
    }
    const user = auth.user;

    const access = await assertPlayerAccess(user, playerId, { allowCoach: true });
    if ("error" in access) {
      return { success: false, isBound: false, error: access.error };
    }

    const supabase = createAdminClient();

    const { data: player } = await supabase
      .from("players")
      .select("id, date_of_birth")
      .eq("id", playerId)
      .eq("club_id", user.clubId)
      .maybeSingle();

    const consentSummary = await getPlayerConsentSummary(playerId);
    const eligibility = checkTelegramEligibility({
      id: playerId,
      date_of_birth: player?.date_of_birth,
      hasParentConsent:
        !consentSummary.isMinor ||
        Boolean(consentSummary.scopes["data_processing"]?.status === "granted"),
    });

    const { data: binding } = await supabase
      .from("player_telegram_bindings")
      .select("*")
      .eq("player_id", playerId)
      .eq("club_id", user.clubId)
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

    for (const mem of memoryTelegramBindings.values()) {
      if (mem.player_id === playerId && mem.club_id === user.clubId && mem.status === "active") {
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
 * 2. Ранкове нагадування «Заповни анкету самопочуття» зі штабного інтерфейсу.
 * Повністю закрито через assertTeamStaff (isCron не приймається від клієнта).
 */
export async function sendMorningWellnessRemindersAction(options?: {
  teamId?: string;
  baseUrl?: string;
}): Promise<{
  success: boolean;
  sentCount?: number;
  skippedCount?: number;
  unboundCount?: number;
  totalPlayers?: number;
  message?: string;
  error?: string;
}> {
  const auth = await assertTeamStaff(options?.teamId);
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }
  const user = auth.user;

  if (isCoach(user.role) && !options?.teamId) {
    const coachTeams = user.teamIds && user.teamIds.length > 0
      ? user.teamIds
      : (user.teamId ? [user.teamId] : []);
    if (coachTeams.length === 0) {
      return { success: false, error: "Тренеру не призначено жодної команди." };
    }
    let sentCount = 0;
    let skippedCount = 0;
    let unboundCount = 0;
    let totalPlayers = 0;
    for (const tid of coachTeams) {
      const res = await sendMorningWellnessRemindersInternal({
        clubId: user.clubId,
        teamId: tid,
        baseUrl: options?.baseUrl,
      });
      if (res.success) {
        sentCount += res.sentCount || 0;
        skippedCount += res.skippedCount || 0;
        unboundCount += res.unboundCount || 0;
        totalPlayers += res.totalPlayers || 0;
      }
    }
    return {
      success: true,
      sentCount,
      skippedCount,
      unboundCount,
      totalPlayers,
      message: `📢 Надіслано нагадування ${sentCount} гравцям! (${skippedCount} вже заповнили анкету${unboundCount > 0 ? `, у ${unboundCount} Telegram ще не прив'язано` : ""}).`,
    };
  }

  return sendMorningWellnessRemindersInternal({
    clubId: user.clubId,
    teamId: options?.teamId,
    baseUrl: options?.baseUrl,
  });
}

/**
 * 2б. Відправка сповіщень футболістам у Telegram після збереження тренування або матчу.
 */
export async function sendPostSessionRemindersAction(options: {
  teamId: string;
  date?: string;
  sessionType?: string;
  defaultMinutes?: number;
  playerIds?: string[];
  baseUrl?: string;
}) {
  const auth = await assertTeamStaff(options.teamId);
  if ("error" in auth) {
    return {
      success: false,
      sentCount: 0,
      skippedCount: 0,
      unboundCount: 0,
      totalPlayers: 0,
      error: auth.error,
    };
  }

  return sendPostSessionRemindersInternal({
    ...options,
    clubId: auth.user.clubId,
  });
}

/**
 * 3. Тижневий звіт тренеру (Telegram і PDF) (п. 8.7.3).
 */
export async function generateCoachWeeklyTelegramReportAction(
  teamId: string,
  options?: {
    sendToTelegram?: boolean;
    customCoachChatId?: string;
    date?: string;
  }
) {
  try {
    const auth = await assertTeamStaff(teamId);
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const user = auth.user;

    const supabase = createAdminClient();
    const clubId = user.clubId;
    const timezone = await getClubTimezone(clubId);
    const anchorDate = options?.date || getClubDate(timezone);
    const anchorDateObj = new Date(anchorDate);
    const weekAgo = new Date(anchorDateObj);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekStartStr = weekAgo.toISOString().split("T")[0];
    const weekEndStr = anchorDate;

    const { data: team } = await supabase
      .from("teams")
      .select("id, name, players(id)")
      .eq("id", teamId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!team) {
      return { success: false, error: "Команду не знайдено у вашому клубі" };
    }

    const teamName = team.name || "Команда";
    const teamPlayerIds = (team.players || []).map((p: any) => p.id);
    const totalPlayers = teamPlayerIds.length || 18;

    const entriesMap = new Map<
      string,
      {
        player_id: string;
        date: string;
        fatigue: number;
        soreness: number;
        pain_vas: number;
        illness: boolean;
        readiness_status?: string;
      }
    >();

    if (teamPlayerIds.length > 0) {
      try {
        const { data: weData, error: weErr } = await supabase
          .from("wellness_entries")
          .select("player_id, date, fatigue, soreness, pain, pain_vas, illness, readiness_status")
          .eq("club_id", clubId)
          .in("player_id", teamPlayerIds)
          .gte("date", weekStartStr)
          .lte("date", weekEndStr);

        if (!weErr && weData) {
          for (const e of weData) {
            if (e.player_id && e.date) {
              entriesMap.set(`${e.player_id}_${e.date}`, {
                player_id: e.player_id,
                date: e.date,
                fatigue: e.fatigue || 3,
                soreness: e.soreness || 3,
                pain_vas: e.pain_vas || (e.pain ? 4 : 0),
                illness: Boolean(e.illness),
                readiness_status: e.readiness_status,
              });
            }
          }
        }
      } catch {}

      try {
        const { data: wsData, error: wsErr } = await supabase
          .from("wellness_surveys")
          .select("player_id, date, fatigue_level, muscle_soreness, readiness_status, notes")
          .eq("club_id", clubId)
          .in("player_id", teamPlayerIds)
          .gte("date", weekStartStr)
          .lte("date", weekEndStr);

        if (!wsErr && wsData) {
          for (const s of wsData) {
            if (!s.player_id || !s.date) continue;
            const key = `${s.player_id}_${s.date}`;
            if (!entriesMap.has(key)) {
              let extra: any = {};
              if (s.notes && typeof s.notes === "string" && s.notes.startsWith("{")) {
                try {
                  extra = JSON.parse(s.notes);
                } catch {}
              }
              entriesMap.set(key, {
                player_id: s.player_id,
                date: s.date,
                fatigue: s.fatigue_level || 3,
                soreness: s.muscle_soreness || 3,
                pain_vas: extra.pain_vas ?? (extra.pain ? 4 : 0),
                illness: Boolean(extra.illness),
                readiness_status: s.readiness_status,
              });
            }
          }
        }
      } catch {}

      try {
        const { data: clubData } = await supabase
          .from("clubs")
          .select("settings")
          .eq("id", clubId)
          .maybeSingle();

        const store = (clubData as any)?.settings?.wellness_entries_store || {};
        for (const v of Object.values(store)) {
          const val = v as any;
          if (
            val &&
            val.player_id &&
            val.date &&
            teamPlayerIds.includes(val.player_id) &&
            val.date >= weekStartStr &&
            val.date <= weekEndStr
          ) {
            const key = `${val.player_id}_${val.date}`;
            if (!entriesMap.has(key)) {
              entriesMap.set(key, {
                player_id: val.player_id,
                date: val.date,
                fatigue: val.fatigue || 3,
                soreness: val.soreness || 3,
                pain_vas: val.pain_vas ?? (val.pain ? 4 : 0),
                illness: Boolean(val.illness),
                readiness_status: val.readiness_status,
              });
            }
          }
        }
      } catch {}
    }

    const relevantEntries = Array.from(entriesMap.values());
    const totalSurveysExpected = totalPlayers * 7;
    const completedSurveysCount = relevantEntries.length;
    const compliancePct =
      totalSurveysExpected > 0
        ? Math.min(100, Math.round((completedSurveysCount / totalSurveysExpected) * 100))
        : 0;

    let yellowFlagsCount = 0;
    let redFlagsCount = 0;
    let sumFatigue = 0;
    let sumSoreness = 0;

    for (const e of relevantEntries) {
      sumFatigue += e.fatigue || 3;
      sumSoreness += e.soreness || 3;

      if (e.readiness_status === "risk" || (e.pain_vas && e.pain_vas >= 7) || e.illness) {
        redFlagsCount++;
      } else if (
        e.readiness_status === "warning" ||
        (e.pain_vas && e.pain_vas >= 4) ||
        e.fatigue <= 2 ||
        e.soreness <= 2
      ) {
        yellowFlagsCount++;
      }
    }

    const count = relevantEntries.length;
    const averageFatigueScore = count > 0 ? sumFatigue / count : 0;
    const averageSorenessScore = count > 0 ? sumSoreness / count : 0;

    let overallWorkloadDescription = "Оптимальне навантаження";
    if (count === 0) {
      overallWorkloadDescription = "Немає даних заповнення анкет";
    } else if (averageFatigueScore < 2.5 || averageSorenessScore < 2.5) {
      overallWorkloadDescription = "Підвищене навантаження (висока втома команди)";
    } else if (averageFatigueScore > 4.0 && averageSorenessScore > 4.0) {
      overallWorkloadDescription = "Відновлювальний стан / свіжість";
    }

    const todayEntries = relevantEntries.filter((e) => e.date === weekEndStr);
    const todayAttentionPlayers = new Set(
      todayEntries
        .filter(
          (e) =>
            e.readiness_status === "risk" ||
            e.readiness_status === "warning" ||
            e.illness ||
            (e.pain_vas && e.pain_vas >= 4) ||
            e.fatigue <= 2 ||
            e.soreness <= 2
        )
        .map((e) => e.player_id)
    );
    const requiresAttentionCount =
      todayAttentionPlayers.size > 0
        ? todayAttentionPlayers.size
        : Math.ceil((yellowFlagsCount + redFlagsCount) / 7);

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
      requiresAttentionCount,
      appReadinessUrl,
    };

    const messageText = formatCoachWeeklyReport(summary);

    let sentToTelegram = false;
    if (options?.sendToTelegram) {
      const coachChat =
        (isDoctor(user.role) ? options.customCoachChatId : undefined) ||
        process.env.TELEGRAM_COACH_CHAT_ID ||
        process.env.TELEGRAM_CHAT_ID;

      if (coachChat) {
        const sendRes = await sendClubMessage({
          clubId,
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
    const auth = await assertTeamStaff();
    if ("error" in auth) return { isBound: false };

    const access = await assertPlayerAccess(auth.user, playerId, { allowCoach: true });
    if ("error" in access) return { isBound: false };

    const clubId = auth.user.clubId;
    const supabase = createAdminClient();

    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const bindings = (club?.settings as any)?.telegram_bindings || {};
    if (bindings[playerId] && bindings[playerId].status === "active") {
      return {
        isBound: true,
        username: bindings[playerId].username || null,
        boundAt: bindings[playerId].boundAt || null,
      };
    }

    const { data: b } = await supabase
      .from("player_telegram_bindings")
      .select("telegram_username, created_at, status")
      .eq("player_id", playerId)
      .eq("club_id", clubId)
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
 * Відправка персональної рекомендації / вказівки лікаря гравцю (тільки лікар або адмін).
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
    const auth = await assertDoctor();
    if ("error" in auth) {
      return { success: false, sentToTelegram: false, isBound: false, error: auth.error };
    }
    const user = auth.user;
    const { playerId, date, recommendation, templateTitle, doctorName } = params;

    if (!playerId || !date || !recommendation.trim()) {
      return { success: false, sentToTelegram: false, isBound: false, error: "Заповніть текст рекомендації" };
    }

    const access = await assertPlayerAccess(user, playerId, { allowCoach: false });
    if ("error" in access) {
      return { success: false, sentToTelegram: false, isBound: false, error: access.error };
    }

    const clubId = user.clubId;
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const rawDoctor = doctorName || (user as any)?.name || user.fullName;
    const docDisplayName = rawDoctor && !rawDoctor.includes("@") ? rawDoctor.trim() : "Медичний штаб";

    let chatId: string | null = null;
    let isBound = false;

    const { data: club } = await supabase
      .from("clubs")
      .select("id, settings")
      .eq("id", clubId)
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
          .eq("club_id", clubId)
          .eq("status", "active")
          .maybeSingle();
        if (b?.telegram_chat_id) {
          chatId = b.telegram_chat_id;
          isBound = true;
        }
      } catch {}
    }

    let sentToTelegram = false;
    const medTg = await getClubMedicalTelegramConfig(clubId);
    const botToken = medTg.botToken;
    if (chatId && botToken) {
      try {
        const contactBlock =
          (medTg.doctorPhone ? `📞 *Телефон лікаря:* \`${medTg.doctorPhone}\`\n` : "") +
          (medTg.doctorTelegramUrl
            ? `💬 *Telegram лікаря:* [Натисніть для зв'язку](${medTg.doctorTelegramUrl})\n`
            : "");

        const messageText =
          `👨‍⚕️ *Рекомендація медичного штабу на ${date}:*\n\n` +
          `${recommendation.trim()}\n\n` +
          `👨‍⚕️ *Лікар:* ${docDisplayName}\n` +
          `${contactBlock}\n` +
          `Будь на зв’язку та дотримуйся рекомендацій!\n` +
          `_(Ви також можете відповісти текстом прямо сюди в чат-бот — лікар побачить вашу відповідь у медичній картці)_`;

        const payload: Record<string, any> = {
          chat_id: chatId,
          text: messageText,
          parse_mode: "Markdown",
        };
        if (medTg.doctorTelegramUrl) {
          payload.reply_markup = {
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

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const tgData = await tgRes.json();
        sentToTelegram = Boolean(tgData.ok);
      } catch {}
    }

    const store = clubSettings.wellness_entries_store || {};
    const key = `${playerId}_${date}`;
    const currEntry = store[key] || {};
    const existingRec = currEntry.doctor_recommendation || {};

    const sentHistory = Array.isArray(existingRec.sentHistory)
      ? [...existingRec.sentHistory]
      : existingRec.text
      ? [
          {
            text: existingRec.text,
            sentAt: existingRec.sentAt || nowIso,
            sentToTelegram: Boolean(existingRec.sentToTelegram),
            doctor: existingRec.doctor || docDisplayName,
          },
        ]
      : [];

    sentHistory.push({
      text: recommendation.trim(),
      sentAt: nowIso,
      sentToTelegram,
      doctor: docDisplayName,
    });

    currEntry.doctor_recommendation = {
      text: recommendation.trim(),
      template: templateTitle || null,
      doctor: docDisplayName,
      doctorPhone: medTg.doctorPhone || null,
      sentAt: nowIso,
      sentToTelegram,
      playerReply: existingRec.playerReply || null,
      replies: existingRec.replies || [],
      sentHistory,
    };
    store[key] = currEntry;

    const acks = clubSettings.wellness_acknowledgements || {};
    acks[key] = {
      acknowledged: true,
      reviewed_by_role: "doctor",
      reviewed_by_name: docDisplayName,
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
      .eq("id", clubId);

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
 * Отримання рекомендації лікаря та відповідей гравця для вказаної дати (тільки лікар або адмін).
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
    const auth = await assertDoctor();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    const access = await assertPlayerAccess(auth.user, params.playerId, { allowCoach: false });
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const clubId = auth.user.clubId;
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const store = (club?.settings as any)?.wellness_entries_store || {};
    const key = `${params.playerId}_${params.date}`;
    let rec = store[key]?.doctor_recommendation ? { ...store[key].doctor_recommendation } : null;

    const kyivDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
    const todayKey = `${params.playerId}_${kyivDate}`;
    const todayRec = store[todayKey]?.doctor_recommendation;

    if (!rec && todayRec) {
      rec = { ...todayRec };
    } else if (rec && todayRec && todayKey !== key) {
      const allReplies = [
        ...(Array.isArray(rec.replies) ? rec.replies : rec.playerReply ? [rec.playerReply] : []),
        ...(Array.isArray(todayRec.replies) ? todayRec.replies : todayRec.playerReply ? [todayRec.playerReply] : []),
      ];
      const seen = new Set<string>();
      const dedupedReplies: any[] = [];
      for (const r of allReplies) {
        const idKey = `${r.receivedAt}_${r.text}`;
        if (!seen.has(idKey)) {
          seen.add(idKey);
          dedupedReplies.push(r);
        }
      }
      rec.replies = dedupedReplies;
      if (todayRec.playerReply) {
        rec.playerReply = todayRec.playerReply;
      }
    }

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
