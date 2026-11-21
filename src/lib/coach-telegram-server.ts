import { createAdminClient } from "@/utils/supabase/admin";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";
import { memoryCoachSessions } from "@/lib/coach-telegram-state";
import type { CoachTelegramSessionDraft } from "@/types/telegram";
import type { RpeScore } from "@/types/workload";

/**
 * Внутрішня серверна функція відправки ранкового світлофора (Morning Digest) тренеру.
 * Використовується cron-джобом, Telegram-ботом та серверним екшеном після перевірки прав.
 */
export async function sendCoachMorningDigestInternal(params: {
  coachUserId: string;
  chatId?: string;
  targetDate?: string;
  clubId?: string;
}) {
  const supabase = createAdminClient();

  try {
    // 1. Отримуємо членство тренера та прив'язку
    let memberQuery = supabase
      .from("club_members")
      .select("club_id, role, team_id")
      .eq("user_id", params.coachUserId);
    if (params.clubId) {
      memberQuery = memberQuery.eq("club_id", params.clubId);
    }
    const { data: coachClubMember } = await memberQuery.limit(1).maybeSingle();

    if (!coachClubMember?.club_id) {
      return { success: false, error: "Тренер не прив'язаний до жодного клубу" };
    }
    const clubId = coachClubMember.club_id;
    const timezone = await getClubTimezone(clubId);
    const dateStr = params.targetDate || getClubDate(timezone);

    let chatId = params.chatId;
    if (!chatId) {
      const { data: binding } = await supabase
        .from("coach_telegram_bindings")
        .select("telegram_chat_id")
        .eq("coach_user_id", params.coachUserId)
        .eq("club_id", clubId)
        .eq("status", "active")
        .maybeSingle();

      chatId = binding?.telegram_chat_id;
    }

    if (!chatId) {
      return { success: false, error: "Тренер не підключений до Telegram" };
    }

    // 2. Знаходимо команди, призначені тренеру в межах його клубу
    const { data: assignments } = await supabase
      .from("coach_team_assignments")
      .select("team_id, teams ( id, name, club_id )")
      .eq("coach_user_id", params.coachUserId)
      .eq("club_id", clubId);

    let assignedTeams: { id: string; name: string }[] = [];
    if (assignments && assignments.length > 0) {
      assignedTeams = assignments
        .filter((a: any) => a.teams && a.teams.club_id === clubId)
        .map((a: any) => ({ id: a.teams.id, name: a.teams.name }));
    } else if (coachClubMember.team_id) {
      const { data: memberTeam } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", coachClubMember.team_id)
        .eq("club_id", clubId)
        .maybeSingle();

      if (memberTeam) {
        assignedTeams = [{ id: memberTeam.id, name: memberTeam.name }];
      }
    }

    if (assignedTeams.length === 0) {
      return { success: false, error: "Тренеру не призначено жодної команди." };
    }

    const { botToken } = await getClubTelegramConfig(clubId);
    if (!botToken) {
      return { success: false, error: "TELEGRAM_BOT_TOKEN не налаштовано" };
    }

    // 3. Формуємо зведення для кожної команди
    for (const team of assignedTeams) {
      const { data: players } = await supabase
        .from("players")
        .select("id, first_name, last_name, archived_at")
        .eq("club_id", clubId)
        .eq("team_id", team.id)
        .is("archived_at", null)
        .order("last_name", { ascending: true });

      const teamPlayers = players || [];
      const playerIds = teamPlayers.map((p) => p.id);

      const [weRes, wsRes, teamClubRes] = await Promise.all([
        playerIds.length > 0
          ? supabase
              .from("wellness_entries")
              .select("*")
              .in("player_id", playerIds)
              .eq("date", dateStr)
          : Promise.resolve({ data: [] as any[] }),
        playerIds.length > 0
          ? supabase
              .from("wellness_surveys")
              .select("*")
              .in("player_id", playerIds)
              .eq("date", dateStr)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("clubs")
          .select("settings")
          .eq("id", clubId)
          .maybeSingle(),
      ]);

      const wellnessMap = new Map<string, any>();
      (weRes.data || []).forEach((w: any) => wellnessMap.set(w.player_id, w));

      for (const s of wsRes.data || []) {
        if (!wellnessMap.has(s.player_id)) {
          let extra: any = {};
          if (s.notes && typeof s.notes === "string" && s.notes.startsWith("{")) {
            try {
              extra = JSON.parse(s.notes);
            } catch {}
          }
          wellnessMap.set(s.player_id, {
            player_id: s.player_id,
            date: s.date,
            sleep_quality: s.sleep_quality,
            fatigue: s.fatigue_level,
            soreness: s.muscle_soreness,
            stress: s.stress_level,
            sleep_hours: extra.sleep_hours ?? null,
            pain: Boolean(extra.pain),
            pain_vas: extra.pain_vas ?? null,
            illness: Boolean(extra.illness),
            comment: extra.comment || (s.notes?.startsWith("{") ? null : s.notes),
          });
        }
      }

      const storedMap = ((teamClubRes.data as any)?.settings?.wellness_entries_store || {}) as Record<string, any>;
      for (const entry of Object.values(storedMap)) {
        if (
          entry?.date === dateStr &&
          entry?.player_id &&
          playerIds.includes(entry.player_id) &&
          !wellnessMap.has(entry.player_id)
        ) {
          wellnessMap.set(entry.player_id, entry);
        }
      }

      const redGroup: { name: string; note: string }[] = [];
      const yellowGroup: { name: string; note: string }[] = [];
      const greenGroup: string[] = [];
      const pendingGroup: string[] = [];

      for (const p of teamPlayers) {
        const pName = `${p.last_name} ${p.first_name ? p.first_name[0] + "." : ""}`.trim();
        const w = wellnessMap.get(p.id);

        if (!w) {
          pendingGroup.push(pName);
          continue;
        }

        const painVas = Number(w.pain_vas ?? w.soreness_score ?? w.pain_score ?? 0);
        const hasPain = Boolean(w.pain) || painVas > 0;
        const isIll = Boolean(w.illness);
        const sleepHours = w.sleep_hours != null ? Number(w.sleep_hours) : null;
        const fatigue = w.fatigue != null ? Number(w.fatigue) : null;
        const soreness = w.soreness != null ? Number(w.soreness) : null;
        const sleepQuality = w.sleep_quality != null ? Number(w.sleep_quality) : null;

        if ((hasPain && painVas >= 5) || isIll || (sleepHours !== null && sleepHours <= 5) || w.has_injury_alert) {
          const reasons: string[] = [];
          if (hasPain && painVas >= 5) reasons.push(`біль ВАШ ${painVas}/10`);
          if (isIll) reasons.push("нездужання");
          if (sleepHours !== null && sleepHours <= 5) reasons.push(`сон ${sleepHours} год`);
          redGroup.push({
            name: pName,
            note: reasons.length > 0 ? reasons.join(", ") : "потребує уваги лікаря",
          });
        } else if (
          (hasPain && painVas >= 3) ||
          (fatigue !== null && fatigue <= 2) ||
          (soreness !== null && soreness <= 2) ||
          (sleepQuality !== null && sleepQuality <= 2)
        ) {
          const notes: string[] = [];
          if (hasPain && painVas >= 3) notes.push(`біль ${painVas}/10`);
          if (fatigue !== null && fatigue <= 2) notes.push("підвищена втома");
          if (soreness !== null && soreness <= 2) notes.push("крепатура");
          yellowGroup.push({
            name: pName,
            note: notes.length > 0 ? notes.join(", ") : "легкий дискомфорт",
          });
        } else {
          greenGroup.push(pName);
        }
      }

      let message = `📋 *Ранковий стан команди: ${team.name}*\n`;
      message += `📅 Дата: *${dateStr}*\n\n`;

      if (redGroup.length > 0) {
        message += `🔴 *ОБМЕЖЕННЯ / РИЗИК ТРАВМИ (${redGroup.length}):*\n`;
        redGroup.forEach((item) => {
          message += `• *${item.name}* — ${item.note}\n`;
        });
        message += `_Рекомендація: консультація лікаря або індивідуальна робота._\n\n`;
      } else {
        message += `🔴 *Обмеження / біль:* немає 🎉\n\n`;
      }

      if (yellowGroup.length > 0) {
        message += `🟡 *Підвищена втома (${yellowGroup.length}):*\n`;
        yellowGroup.forEach((item) => {
          message += `• *${item.name}* (${item.note})\n`;
        });
        message += `\n`;
      }

      message += `🟢 *Готові до повного навантаження:* ${greenGroup.length} із ${teamPlayers.length}\n`;

      if (pendingGroup.length > 0) {
        message += `⚪ *Ще не заповнили анкету (${pendingGroup.length}):*\n`;
        message += `_${pendingGroup.slice(0, 8).join(", ")}${pendingGroup.length > 8 ? ` та ще ${pendingGroup.length - 8}` : ""}_\n`;
      }

      const inlineKeyboard: any[][] = [
        [
          { text: "🔄 Оновити дані", callback_data: `coach_refresh_digest:${team.id}` },
          { text: "⏱️ Записати тренування", callback_data: `coach_start_training:${team.id}` },
        ],
      ];

      if (pendingGroup.length > 0) {
        inlineKeyboard.push([
          { text: `📣 Нагадати не заповнившим (${pendingGroup.length})`, callback_data: `coach_remind_wellness:${team.id}` },
        ]);
      }

      inlineKeyboard.push([
        { text: "🏠 Головне меню", callback_data: "coach_main_menu" },
      ]);

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
        signal: AbortSignal.timeout(15000),
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка відправки ранкового дайджесту" };
  }
}

/**
 * Обробка покрокового збереження тренування в БД (workload_sessions + exposures)
 */
export async function finalizeCoachTrainingSession(
  coachUserId: string,
  chatId: string,
  draft: CoachTelegramSessionDraft,
  explicitClubId?: string
) {
  const supabase = createAdminClient();
  let memberQuery = supabase
    .from("club_members")
    .select("club_id, role, team_id")
    .eq("user_id", coachUserId);
  if (explicitClubId) {
    memberQuery = memberQuery.eq("club_id", explicitClubId);
  }
  const { data: coachClubMember } = await memberQuery.limit(1).maybeSingle();

  const clubId = coachClubMember?.club_id;
  const { botToken } = await getClubTelegramConfig(clubId);

  try {
    if (!clubId) {
      throw new Error("Користувача не знайдено у штабі клубу");
    }

    const timezone = await getClubTimezone(clubId);
    const targetDate = draft.date || getClubDate(timezone);
    const duration = draft.duration_minutes || 90;
    const rpe = (draft.rpe_score ?? 5) as RpeScore;
    const sessionType = draft.session_type || "training_team";

    const teamId = draft.team_id || coachClubMember.team_id;
    if (!teamId) {
      throw new Error("Не знайдено команду тренера");
    }

    const { data: teamRow } = await supabase
      .from("teams")
      .select("id, club_id")
      .eq("id", teamId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!teamRow) {
      throw new Error("Команда не належить вашому клубу");
    }

    if (coachClubMember.role === "coach") {
      const [assignmentsRes, profileRes] = await Promise.all([
        supabase
          .from("coach_team_assignments")
          .select("team_id")
          .eq("coach_user_id", coachUserId)
          .eq("club_id", clubId),
        supabase
          .from("profiles")
          .select("team_id")
          .eq("id", coachUserId)
          .maybeSingle(),
      ]);
      const allowedTeams = new Set(
        [
          ...(assignmentsRes.data || []).map((a: any) => a.team_id),
          coachClubMember.team_id,
          profileRes.data?.team_id,
        ].filter(Boolean)
      );
      if (!allowedTeams.has(teamId)) {
        throw new Error("Недостатньо прав доступу до цієї команди");
      }
    }

    const { data: players } = await supabase
      .from("players")
      .select("id, first_name, last_name, club_id")
      .eq("club_id", clubId)
      .eq("team_id", teamId)
      .is("archived_at", null);

    const teamPlayers = players || [];
    const teamSessionId = `tg_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const notesSummary = [
      draft.surface ? `Покриття: ${draft.surface}` : null,
      draft.incident === "injury" ? "⚠️ Зафіксовано травму на тренуванні" : "Без травм",
      draft.notes ? `Коментар тренера: ${draft.notes}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const workloadRows = teamPlayers.map((player) => ({
      club_id: clubId,
      player_id: player.id,
      team_id: teamId,
      date: targetDate,
      duration_minutes: duration,
      rpe_score: rpe,
      coach_rpe: rpe,
      session_type: sessionType,
      team_session_id: teamSessionId,
      attendance_status: "present",
      notes: notesSummary,
    }));

    const exposureRows = teamPlayers.map((player) => ({
      club_id: clubId,
      player_id: player.id,
      team_id: teamId,
      date: targetDate,
      type: sessionType === "match" ? "match" : "training",
      exposure_type: sessionType === "match" ? "match" : "training",
      minutes: duration,
      workload_session_id: teamSessionId,
      notes: notesSummary,
    }));

    if (teamPlayers.length > 0) {
      await Promise.all([
        supabase.from("workload_sessions").insert(workloadRows),
        supabase.from("exposures").insert(exposureRows),
      ]);
    }

    await resetCoachSession(coachUserId, chatId);

    if (botToken) {
      const typeLabels: Record<string, string> = {
        training_team: "🏃 Командне тренування",
        match: "⚽ Офіційний матч",
        gym_strength: "🏋️ Силовий зал",
        recovery: "🧘 Відновлювальне заняття",
        individual_rehab: "🩹 Реабілітація",
      };

      const successText =
        `✅ *Тренування успішно зафіксовано!*\n\n` +
        `📌 *Тип:* ${typeLabels[sessionType] || sessionType}\n` +
        `⏱️ *Тривалість:* ${duration} хв\n` +
        `⚡ *Навантаження (RPE):* ${rpe}/10 (Об'єм: ${duration * rpe} AU)\n` +
        `👥 *Гравців у складі:* ${teamPlayers.length}\n` +
        (draft.surface ? `🌱 *Покриття:* ${draft.surface}\n` : "") +
        (draft.notes ? `📝 *Замітка:* ${draft.notes}\n` : "") +
        `\n_Дані автоматично синхронізовано з кабінетом аналітики та лікаря клубу._`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: successText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📋 Переглянути стан команди", callback_data: `coach_refresh_digest:${teamId}` }],
              [{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }],
            ],
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    }

    return { success: true, teamSessionId, playersCount: teamPlayers.length };
  } catch (err: any) {
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `❌ Не вдалося зберегти тренування: ${err?.message || "Помилка"}. Будь ласка, спробуйте знову.`,
          reply_markup: {
            inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    }
    return { success: false, error: err?.message };
  }
}

export async function getCoachSession(coachUserId: string, chatId: string) {
  const supabase = createAdminClient();
  try {
    const { data } = await supabase
      .from("coach_telegram_sessions")
      .select("*")
      .eq("coach_user_id", coachUserId)
      .maybeSingle();

    if (data) {
      return {
        current_step: data.current_step,
        session_draft: (data.session_draft || {}) as CoachTelegramSessionDraft,
      };
    }
  } catch {}

  const mem = memoryCoachSessions.get(chatId);
  return mem || { current_step: "idle", session_draft: {} };
}

export async function updateCoachSession(
  coachUserId: string,
  chatId: string,
  step: string,
  draftUpdates: Partial<CoachTelegramSessionDraft>
) {
  const supabase = createAdminClient();
  const current = await getCoachSession(coachUserId, chatId);
  const updatedDraft = { ...current.session_draft, ...draftUpdates };

  try {
    await supabase.from("coach_telegram_sessions").upsert(
      {
        coach_user_id: coachUserId,
        telegram_chat_id: chatId,
        current_step: step,
        session_draft: updatedDraft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_chat_id" }
    );
  } catch {}

  memoryCoachSessions.set(chatId, {
    current_step: step,
    session_draft: updatedDraft,
  });

  return { current_step: step, session_draft: updatedDraft };
}

export async function resetCoachSession(coachUserId: string, chatId: string) {
  const supabase = createAdminClient();
  try {
    await supabase
      .from("coach_telegram_sessions")
      .delete()
      .eq("telegram_chat_id", chatId);
  } catch {}

  memoryCoachSessions.delete(chatId);
}
