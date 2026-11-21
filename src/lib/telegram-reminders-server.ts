import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { getClubDate } from "@/lib/club-timezone";
import { sendClubMessage } from "@/lib/messaging-adapter";
import {
  formatMorningWellnessReminder,
  formatPostSessionReminder,
  memoryTelegramBindings,
} from "@/lib/telegram-auth";

/**
 * Серверний внутрішній хелпер ранкових нагадувань «Заповни анкету самопочуття».
 * Викликається з cron-роуту, Telegram-бота або авторизованого Server Action.
 */
export async function sendMorningWellnessRemindersInternal(options?: {
  clubId?: string;
  teamId?: string;
  baseUrl?: string;
}) {
  try {
    const supabase = createAdminClient();
    const baseUrl =
      options?.baseUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://med.fc-chornomorets.com";

    // Визначаємо clubId: явний, або з команди teamId, або фолбэк для legacy-крона
    let resolvedClubId = options?.clubId || "";
    if (!resolvedClubId && options?.teamId) {
      const { data: teamRow } = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", options.teamId)
        .maybeSingle();
      if (teamRow?.club_id) {
        resolvedClubId = teamRow.club_id;
      }
    }
    if (!resolvedClubId) {
      resolvedClubId = DEFAULT_CLUB_ID;
    }

    // 1–3. Паралельно отримуємо клубні налаштування, активних гравців та Telegram-прив'язки
    let playersQuery = supabase
      .from("players")
      .select("id, first_name, last_name, team_id, club_id")
      .eq("club_id", resolvedClubId)
      .is("archived_at", null);

    if (options?.teamId) {
      playersQuery = playersQuery.eq("team_id", options.teamId);
    }

    const [clubRes, teamPlayersRes, tableBindingsRes] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, settings")
        .eq("id", resolvedClubId)
        .maybeSingle(),
      playersQuery,
      supabase
        .from("player_telegram_bindings")
        .select("player_id, telegram_chat_id, status")
        .eq("club_id", resolvedClubId)
        .eq("status", "active"),
    ]);

    const club = clubRes.data;
    const clubSettings = (club?.settings as any) || {};
    const clubBindings = clubSettings.telegram_bindings || {};
    const store = clubSettings.wellness_entries_store || {};
    const today = getClubDate(clubSettings.timezone || "Europe/Kyiv");

    const playersList = teamPlayersRes.data || [];
    const totalPlayers = playersList.length;
    const playerIds = playersList.map((p) => p.id);

    const tableBindingsMap = new Map<string, string>();
    for (const b of tableBindingsRes.data || []) {
      if (b.player_id && b.telegram_chat_id) {
        tableBindingsMap.set(b.player_id, b.telegram_chat_id);
      }
    }

    // 4. Отримуємо список тих, хто вже заповнив сьогодні анкету (паралельно з обох таблиць та JSON-store)
    const filledPlayerIds = new Set<string>();

    if (playerIds.length > 0) {
      const [todayEntriesRes, todaySurveysRes] = await Promise.all([
        (async () => {
          try {
            return await supabase
              .from("wellness_entries")
              .select("player_id")
              .eq("date", today)
              .in("player_id", playerIds);
          } catch {
            return { data: [] as any[] };
          }
        })(),
        (async () => {
          try {
            return await supabase
              .from("wellness_surveys")
              .select("player_id")
              .eq("date", today)
              .in("player_id", playerIds);
          } catch {
            return { data: [] as any[] };
          }
        })(),
      ]);

      for (const e of todayEntriesRes.data || []) {
        if (e.player_id) filledPlayerIds.add(e.player_id);
      }
      for (const s of todaySurveysRes.data || []) {
        if (s.player_id) filledPlayerIds.add(s.player_id);
      }
    }

    for (const k of Object.keys(store)) {
      if (k.endsWith(`_${today}`)) {
        const pId = k.slice(0, k.indexOf(`_${today}`));
        if (pId) filledPlayerIds.add(pId);
      }
    }

    // 5. Визначаємо активні прив'язки для кожного гравця команди
    const activeBindings: Array<{
      player_id: string;
      telegram_chat_id: string;
      first_name?: string;
    }> = [];

    let unboundCount = 0;

    for (const p of playersList) {
      const fromClub = clubBindings[p.id];
      let chatId = fromClub?.status === "active" ? fromClub.chatId : null;

      if (!chatId) {
        chatId = tableBindingsMap.get(p.id) || null;
      }

      if (!chatId) {
        const mem = memoryTelegramBindings.get(p.id);
        if (mem && mem.status === "active") {
          chatId = mem.telegram_chat_id;
        }
      }

      if (chatId) {
        activeBindings.push({
          player_id: p.id,
          telegram_chat_id: String(chatId),
          first_name: p.first_name,
        });
      } else {
        unboundCount++;
      }
    }

    if (activeBindings.length === 0) {
      return {
        success: true,
        sentCount: 0,
        skippedCount: 0,
        unboundCount: totalPlayers,
        totalPlayers,
        message: `⚠️ Усі ${totalPlayers} гравців команди ще не підключили Telegram-бота (не перейшли за QR/лінком бота і не натиснули /start). Спочатку гравці мають підключити бот.`,
      };
    }

    const toSend = activeBindings.filter((b) => !filledPlayerIds.has(b.player_id));
    const skippedCount = activeBindings.length - toSend.length;
    let sentCount = 0;

    const CHUNK_SIZE = 5;
    for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map((b) => {
          const reminderText = formatMorningWellnessReminder({
            playerName: b.first_name,
            wellnessUrl: `${baseUrl}/wellness`,
          });
          return sendClubMessage({
            clubId: resolvedClubId,
            channel: "telegram",
            recipient: b.telegram_chat_id,
            text: reminderText,
          });
        })
      );
      for (const res of settled) {
        if (res.status === "fulfilled" && res.value.success) {
          sentCount++;
        }
      }
    }

    let resultMsg = "";
    if (sentCount > 0) {
      resultMsg = `📢 Надіслано нагадування ${sentCount} гравцям! (${skippedCount} вже заповнили анкету${unboundCount > 0 ? `, у ${unboundCount} Telegram ще не прив'язано` : ""}).`;
    } else if (skippedCount > 0) {
      resultMsg = `✓ Усі ${skippedCount} підключені гравці вже заповнили анкету сьогодні!${unboundCount > 0 ? ` (у решти ${unboundCount} Telegram ще не прив'язано)` : ""}`;
    } else {
      resultMsg = `Немає гравців для відправки (усі ${unboundCount} ще не підключили бот).`;
    }

    return {
      success: true,
      sentCount,
      skippedCount,
      unboundCount,
      totalPlayers,
      message: resultMsg,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка відправки нагадувань",
    };
  }
}

/**
 * Серверний внутрішній хелпер сповіщень футболістам після збереження тренування або матчу.
 */
export async function sendPostSessionRemindersInternal(options: {
  clubId?: string;
  teamId: string;
  date?: string;
  sessionType?: string;
  defaultMinutes?: number;
  playerIds?: string[];
  baseUrl?: string;
}) {
  try {
    const supabase = createAdminClient();
    const baseUrl =
      options.baseUrl ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://med-academy-alpha.vercel.app";

    let resolvedClubId = options.clubId || "";
    if (!resolvedClubId && options.teamId) {
      const { data: teamRow } = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", options.teamId)
        .maybeSingle();
      if (teamRow?.club_id) {
        resolvedClubId = teamRow.club_id;
      }
    }
    if (!resolvedClubId) {
      resolvedClubId = DEFAULT_CLUB_ID;
    }

    // 1–3. Паралельно отримуємо клубні налаштування, гравців команди та активні прив'язки Telegram
    let playersQuery = supabase
      .from("players")
      .select("id, first_name, last_name, team_id, portal_token")
      .eq("club_id", resolvedClubId)
      .eq("team_id", options.teamId)
      .is("archived_at", null);

    if (options.playerIds && options.playerIds.length > 0) {
      playersQuery = playersQuery.in("id", options.playerIds);
    }

    const [clubRes, playersRes, tableBindingsRes] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, name, settings")
        .eq("id", resolvedClubId)
        .maybeSingle(),
      playersQuery,
      supabase
        .from("player_telegram_bindings")
        .select("player_id, telegram_chat_id, status")
        .eq("club_id", resolvedClubId)
        .eq("status", "active"),
    ]);

    const club = clubRes.data;
    const clubSettings = (club?.settings as any) || {};
    const clubBindings = clubSettings.telegram_bindings || {};
    const clubName = club?.name || "Академія";
    const today = options.date || getClubDate(clubSettings.timezone || "Europe/Kyiv");

    const playersList = playersRes.data || [];

    const tableBindingsMap = new Map<string, string>();
    for (const b of tableBindingsRes.data || []) {
      if (b.player_id && b.telegram_chat_id) {
        tableBindingsMap.set(b.player_id, b.telegram_chat_id);
      }
    }

    // 4. Отримуємо список тих, хто вже оцінив це тренування
    const alreadyEvaluated = new Set<string>();
    if (playersList.length > 0) {
      try {
        const { data: wSessions } = await supabase
          .from("workload_sessions")
          .select("player_id, player_rpe")
          .eq("date", today)
          .in(
            "player_id",
            playersList.map((p) => p.id)
          );

        for (const w of wSessions || []) {
          if (w.player_rpe !== null && w.player_rpe !== undefined) {
            alreadyEvaluated.add(w.player_id);
          }
        }
      } catch {}
    }

    let sentCount = 0;
    let skippedCount = 0;
    let unboundCount = 0;

    const sessionTypeTitle = options.sessionType || "Командне тренування";
    const duration = options.defaultMinutes || 75;
    const toSend: Array<{ player: (typeof playersList)[number]; chatId: string }> = [];

    for (const p of playersList) {
      if (alreadyEvaluated.has(p.id)) {
        skippedCount++;
        continue;
      }

      let chatId =
        clubBindings[p.id]?.status === "active"
          ? clubBindings[p.id].chatId
          : null;
      if (!chatId) {
        chatId = tableBindingsMap.get(p.id) || null;
      }
      if (!chatId) {
        const mem = memoryTelegramBindings.get(p.id);
        if (mem && mem.status === "active") {
          chatId = mem.telegram_chat_id;
        }
      }

      if (!chatId) {
        unboundCount++;
        continue;
      }

      toSend.push({ player: p, chatId: String(chatId) });
    }

    const CHUNK_SIZE = 5;
    for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + CHUNK_SIZE);
      const settled = await Promise.allSettled(
        chunk.map(({ player: p, chatId }) => {
          const portalUrl = p.portal_token
            ? `${baseUrl}/rehab-portal?token=${p.portal_token}`
            : `${baseUrl}/rehab-portal`;

          const msgText = formatPostSessionReminder({
            playerName: p.first_name,
            clubName,
            sessionType: sessionTypeTitle,
            durationMinutes: duration,
            date: today,
            portalUrl,
          });

          return sendClubMessage({
            clubId: club?.id || resolvedClubId,
            channel: "telegram",
            recipient: chatId,
            text: msgText,
          });
        })
      );
      for (const res of settled) {
        if (res.status === "fulfilled" && res.value.success) {
          sentCount++;
        }
      }
    }

    return {
      success: true,
      sentCount,
      skippedCount,
      unboundCount,
      totalPlayers: playersList.length,
    };
  } catch (err: any) {
    return {
      success: false,
      sentCount: 0,
      skippedCount: 0,
      unboundCount: 0,
      totalPlayers: 0,
      error: err?.message || "Помилка відправки Telegram-сповіщень",
    };
  }
}
