"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertAuth,
  assertTeamStaff,
  isCoach,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { hasConsent } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { getPlayerSession } from "@/lib/player-auth";
import { sendPostSessionRemindersAction } from "./telegram-actions";
import type {
  TrainingSessionType,
  RpeScore,
  SaveTeamTrainingInput,
  TeamTrainingPlayerItem,
  SessionRpeEntry,
  PlayerSessionFeedback,
  PlayerSessionFeedbackInput,
  PlayerTodaySession,
} from "@/types/workload";
import { SORENESS_LOCATIONS, SESSION_TYPE_UA } from "@/types/workload";

export type TeamTrainingScreenData = {
  success: boolean;
  team: { id: string; name: string } | null;
  teams: { id: string; name: string }[];
  date: string;
  isCoach: boolean;
  userRole: "coach" | "doctor" | "admin";
  players: TeamTrainingPlayerItem[];
  existingSession: {
    teamSessionId: string | null;
    sessionType: TrainingSessionType;
    defaultMinutes: number;
    defaultRpe: RpeScore;
    sessionNotes: string;
    loggedAt: string;
  } | null;
  error?: string;
};

/**
 * Отримує дані для екрана тренера «Тренування» (8.6).
 * Тренеру доступна ТІЛЬКИ його команда. Лікарі та адміни можуть перемикати команди.
 */
export async function getTeamTrainingDataAction(params?: {
  teamId?: string;
  date?: string;
}): Promise<TeamTrainingScreenData> {
  const authRes = await assertAuth();
  if ("error" in authRes) {
    return {
      success: false,
      team: null,
      teams: [],
      date: params?.date || new Date().toISOString().split("T")[0],
      isCoach: false,
      userRole: "coach",
      players: [],
      existingSession: null,
      error: authRes.error,
    };
  }

  const { user } = authRes;
  const isCoachUser = isCoach(user.role);
  const effectiveRole = user.role as "coach" | "doctor" | "admin";
  const supabase = createAdminClient();
  const targetDate = params?.date || new Date().toISOString().split("T")[0];

  const clubId = user.clubId || DEFAULT_CLUB_ID;

  // 1. Отримуємо команди клубу (суворо ізольовано за club_id)
  const { data: rawTeams } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .eq("club_id", clubId)
    .order("sort_order", { ascending: true });

  const allTeams = (rawTeams ?? []).map((t) => ({ id: t.id, name: t.name }));

  const coachTeams = user.teamIds && user.teamIds.length > 0
    ? user.teamIds
    : (user.teamId ? [user.teamId] : []);

  // Якщо тренер — примусово закріплені тільки його команди
  let selectedTeamId = params?.teamId || "";
  if (isCoachUser) {
    if (coachTeams.length === 0) {
      return {
        success: false,
        team: null,
        teams: [],
        date: targetDate,
        isCoach: isCoachUser,
        userRole: effectiveRole,
        players: [],
        existingSession: null,
        error: "Ваш обліковий запис очікує призначення вікової групи (команди) адміністратором або лікарем клубу.",
      };
    }
    if (!selectedTeamId || !coachTeams.includes(selectedTeamId)) {
      selectedTeamId = coachTeams[0];
    }
  } else if (!selectedTeamId && allTeams.length > 0) {
    selectedTeamId = allTeams[0].id;
  }

  // Перевіряємо права тренера
  const staffCheck = await assertTeamStaff(selectedTeamId);
  if ("error" in staffCheck) {
    return {
      success: false,
      team: null,
      teams: isCoachUser ? allTeams.filter((t) => coachTeams.includes(t.id)) : allTeams,
      date: targetDate,
      isCoach: isCoachUser,
      userRole: effectiveRole,
      players: [],
      existingSession: null,
      error: staffCheck.error,
    };
  }

  const currentTeam = allTeams.find((t) => t.id === selectedTeamId) || null;
  const availableTeams = isCoachUser
    ? allTeams.filter((t) => coachTeams.includes(t.id))
    : allTeams;

  // 2. Отримуємо активних гравців команди (1.6 виключаємо архівних)
  const { data: rawPlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, team_id")
    .eq("team_id", selectedTeamId)
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  const teamPlayers = rawPlayers || [];
  const playerIds = teamPlayers.map((p) => p.id);

  // 3. Перевіряємо, чи вже збережені сесії на цей день для гравців цієї команди
  let existingWorkloads: any[] = [];
  if (playerIds.length > 0) {
    try {
      const { data: wSessions } = await supabase
        .from("workload_sessions")
        .select("*")
        .in("player_id", playerIds)
        .eq("date", targetDate);

      if (wSessions && wSessions.length > 0) {
        // Дедуплікуємо та парсимо поля сесії з notes ([COACH_SESSION])
        const map = new Map<string, any>();
        for (const s of wSessions) {
          let parsedNotes: any = null;
          if (s.notes && typeof s.notes === "string" && s.notes.startsWith("[COACH_SESSION]")) {
            try {
              parsedNotes = JSON.parse(s.notes.replace("[COACH_SESSION]", "").trim());
            } catch {}
          }
          const merged = {
            ...s,
            coach_rpe: parsedNotes?.coach_rpe ?? s.rpe_score,
            player_rpe: parsedNotes?.player_rpe ?? s.player_rpe ?? null,
            attendance_status: parsedNotes?.attendance_status ?? (s.duration_minutes > 0 ? "present" : "absent"),
            absence_reason: parsedNotes?.absence_reason ?? null,
            team_session_id: parsedNotes?.team_session_id ?? null,
            session_type: parsedNotes?.session_type ?? s.session_type,
            cleanNotes: parsedNotes?.notes ?? (s.notes?.startsWith("[COACH_SESSION]") ? "" : s.notes),
            player_feedback: parsedNotes?.player_feedback ?? null,
          };

          const prev = map.get(s.player_id);
          if (!prev || new Date(s.created_at).getTime() > new Date(prev.created_at).getTime()) {
            map.set(s.player_id, merged);
          }
        }
        existingWorkloads = Array.from(map.values());
      }
    } catch {}
  }

  // 4. Отримуємо відповіді гравців з велнес-анкет за сьогодні (щоб дізнатися їхній власний player_rpe)
  let playerSelfRpeMap = new Map<string, number>();
  try {
    const { data: wellnessToday } = await supabase
      .from("wellness_entries")
      .select("player_id, comment")
      .eq("date", targetDate);

    if (wellnessToday) {
      for (const w of wellnessToday) {
        // Якщо у велнесі записано RPE в коментарі або структурі
        if (w.comment && w.comment.includes("[RPE:")) {
          const match = w.comment.match(/\[RPE:(\d+)\]/);
          if (match && match[1]) {
            playerSelfRpeMap.set(w.player_id, Number(match[1]));
          }
        }
      }
    }
  } catch {}

  // Також перевіряємо, чи в workload_sessions вже записаний player_rpe
  for (const w of existingWorkloads) {
    if (w.player_rpe !== undefined && w.player_rpe !== null) {
      playerSelfRpeMap.set(w.player_id, Number(w.player_rpe));
    }
  }

  // 5. Формуємо список гравців для таблиці
  const players: TeamTrainingPlayerItem[] = teamPlayers.map((p) => {
    const existing = existingWorkloads.find((w) => w.player_id === p.id);
    const selfRpe = playerSelfRpeMap.get(p.id) ?? (existing?.player_rpe ?? null);

    if (existing) {
      return {
        playerId: p.id,
        playerName: `${p.first_name} ${p.last_name}`,
        position: p.position || "—",
        isPresent: existing.attendance_status !== "absent",
        absenceReason: existing.absence_reason || "",
        minutes: existing.duration_minutes ?? 75,
        rpeScore: (existing.coach_rpe ?? existing.rpe_score ?? 6) as RpeScore,
        playerRpe: selfRpe !== null && selfRpe !== undefined ? (selfRpe as RpeScore) : null,
        playerFeedback: existing.player_feedback || null,
        notes: (existing.cleanNotes ?? (existing.notes?.startsWith("[COACH_SESSION]") ? "" : existing.notes)) || "",
      };
    }

    return {
      playerId: p.id,
      playerName: `${p.first_name} ${p.last_name}`,
      position: p.position || "—",
      isPresent: true,
      absenceReason: "",
      minutes: 75,
      rpeScore: 6,
      playerRpe: selfRpe !== null && selfRpe !== undefined ? (selfRpe as RpeScore) : null,
      playerFeedback: null,
      notes: "",
    };
  });

  const firstExisting = existingWorkloads[0];
  const existingSession = firstExisting
    ? {
        teamSessionId: firstExisting.team_session_id || null,
        sessionType: (firstExisting.session_type as TrainingSessionType) || "training_team",
        defaultMinutes: firstExisting.duration_minutes || 75,
        defaultRpe: (firstExisting.coach_rpe ?? firstExisting.rpe_score ?? 6) as RpeScore,
        sessionNotes: (firstExisting.cleanNotes ?? (firstExisting.notes?.startsWith("[COACH_SESSION]") ? "" : firstExisting.notes)) || "",
        loggedAt: firstExisting.created_at || new Date().toISOString(),
      }
    : null;

  return {
    success: true,
    team: currentTeam,
    teams: availableTeams,
    date: targetDate,
    isCoach: isCoachUser,
    userRole: effectiveRole,
    players,
    existingSession,
  };
}

/**
 * Зберігає тренування команди за 10 секунд (пункти 1, 3, 4, 5).
 * - Базовий RPE та хвилини для всієї команди
 * - Індивідуальні коригування
 * - Відмітка присутності («відсутній» -> 0 хв, 0 RPE, фіксація причини)
 * - Автоматичний запис у таблицю exposures (задача 4.2)
 * - Збереження розбіжності оцінки тренера та гравця
 */
export async function saveTeamTrainingAction(input: SaveTeamTrainingInput) {
  const staffCheck = await assertTeamStaff(input.teamId);
  if ("error" in staffCheck) {
    return { success: false, error: staffCheck.error };
  }

  const { user } = staffCheck;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const supabase = createAdminClient();

  const teamSessionId = `team_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  let savedCount = 0;
  let presentCount = 0;
  let absentCount = 0;

  for (const item of input.players) {
    // Перевірка згоди на моніторинг навантажень (батьківська згода: gps / навантаження)
    const allowed = await hasConsent(item.playerId, "gps");
    if (!allowed) {
      // Якщо згоди немає — пропускаємо запис навантаження для цього неповнолітнього гравця
      continue;
    }

    const isPresent = Boolean(item.isPresent);
    if (isPresent) {
      presentCount++;
    } else {
      absentCount++;
    }

    const duration = isPresent ? Math.max(0, Number(item.minutes) || 0) : 0;
    const rpe = isPresent ? (Math.max(0, Math.min(10, Number(item.rpeScore) || 0)) as RpeScore) : 0;
    const workloadAu = duration * rpe;

    // Перевіримо, чи гравець уже ставив собі оцінку в анкеті
    let playerRpe: number | null = null;
    try {
      const { data: existingEntry } = await supabase
        .from("workload_sessions")
        .select("player_rpe")
        .eq("player_id", item.playerId)
        .eq("date", input.date)
        .maybeSingle();

      if (existingEntry?.player_rpe !== undefined && existingEntry?.player_rpe !== null) {
        playerRpe = Number(existingEntry.player_rpe);
      }
    } catch {}

    const sessionPayload: SessionRpeEntry = {
      id: `rpe_${Date.now()}_${item.playerId.slice(0, 4)}_${Math.random().toString(36).substring(2, 6)}`,
      club_id: clubId,
      team_id: input.teamId,
      team_session_id: teamSessionId,
      player_id: item.playerId,
      date: input.date,
      session_type: input.sessionType,
      duration_minutes: duration,
      rpe_score: rpe,
      coach_rpe: rpe,
      player_rpe: (playerRpe as RpeScore) ?? null,
      attendance_status: isPresent ? "present" : "absent",
      absence_reason: !isPresent ? (item.absenceReason?.trim() || "Без пояснення") : null,
      workload_au: workloadAu,
      notes: item.notes?.trim() || input.sessionNotes?.trim() || null,
      created_at: nowIso,
    };

    // 1. Запис у workload_sessions
    // Спочатку видаляємо попередній запис за цю дату, щоб уникнути дублювання
    try {
      await supabase
        .from("workload_sessions")
        .delete()
        .eq("player_id", item.playerId)
        .eq("date", input.date);
    } catch {}

    let insertSuccess = false;
    try {
      const { error: wErr } = await supabase.from("workload_sessions").insert({
        id: sessionPayload.id,
        club_id: clubId,
        player_id: item.playerId,
        date: input.date,
        session_type: input.sessionType,
        duration_minutes: duration,
        rpe_score: Math.max(1, rpe),
        workload_au: workloadAu,
        notes: `[COACH_SESSION] ${JSON.stringify(sessionPayload)}`,
      } as any);

      if (!wErr) {
        insertSuccess = true;
      }
    } catch {}

    // Fallback: якщо таблиця недоступна — injury_logs
    if (!insertSuccess) {
      try {
        await supabase.from("injury_logs").insert({
          club_id: clubId,
          injury_id: null as any,
          date: input.date,
          category: "note",
          note: `[WORKLOAD] ${JSON.stringify(sessionPayload)}`,
        } as any);
      } catch {}
    }

    savedCount++;
  }

  // 2. Автоматична синхронізація у таблицю exposures (Реєстр людино-годин UEFA/IOC)
  // Дані підтягуються сюди автоматично з форми введення тренування тренером, повторно вводити не потрібно!
  try {
    const exposureType = input.sessionType === "match" ? "match" : "training";
    const exposureMinutes = Number(input.defaultMinutes) || 75;

    await supabase
      .from("exposures")
      .delete()
      .eq("team_id", input.teamId)
      .eq("date", input.date);

    if (presentCount > 0) {
      await supabase.from("exposures").insert({
        club_id: clubId,
        team_id: input.teamId,
        date: input.date,
        type: exposureType,
        minutes: exposureMinutes,
        players_count: presentCount,
        notes: input.sessionNotes?.trim() || null,
      });
    }
  } catch (expErr) {
    console.error("Auto exposure sync error:", expErr);
  }

  // 3. Журнал аудиту дій
  await logAudit({
    action: "create_team_training",
    entity: "workload_sessions",
    entityId: teamSessionId,
    userId: user.id,
    clubId,
    meta: {
      teamId: input.teamId,
      sessionType: input.sessionType,
      date: input.date,
      defaultMinutes: input.defaultMinutes,
      defaultRpe: input.defaultRpe,
      totalPlayers: input.players.length,
      savedCount,
      presentCount,
      absentCount,
    },
  });

  // 4. Автоматичні Telegram-сповіщення присутнім гравцям: «Тренер заповнив тренування, оціни самопочуття»
  let telegramSentCount = 0;
  if (input.notifyTelegram !== false && presentCount > 0) {
    try {
      const presentPlayerIds = input.players
        .filter((p) => p.isPresent)
        .map((p) => p.playerId);

      const sessionTypeName = SESSION_TYPE_UA[input.sessionType]?.label || "Командне тренування";
      const tgRes = await sendPostSessionRemindersAction({
        teamId: input.teamId,
        date: input.date,
        sessionType: sessionTypeName,
        defaultMinutes: input.defaultMinutes,
        playerIds: presentPlayerIds,
      });

      if (tgRes.success) {
        telegramSentCount = tgRes.sentCount;
      }
    } catch (tgErr) {
      console.warn("[saveTeamTrainingAction] Telegram notification warning:", tgErr);
    }
  }

  revalidatePath("/training");
  revalidatePath("/workload");
  revalidatePath("/team/readiness");
  revalidatePath("/coach-briefing");
  revalidatePath("/availability");
  revalidatePath("/exposures");
  revalidatePath("/");

  return {
    success: true,
    savedCount,
    presentCount,
    absentCount,
    teamSessionId,
    telegramSentCount,
  };
}

/**
 * Пункт 2: Гравець у своїй анкеті вводить власну оцінку RPE (необов'язково).
 * Зберігає player_rpe у workload_sessions та фіксує розбіжність з оцінкою тренера.
 */
export async function submitPlayerSelfRpeAction(input: {
  playerId: string;
  date: string;
  playerRpe: RpeScore;
  sessionMinutes?: number;
}) {
  const playerSession = await getPlayerSession();
  let callerUserId = "player";
  let callerClubId = DEFAULT_CLUB_ID;

  if (playerSession && playerSession.playerId === input.playerId) {
    callerUserId = `player:${input.playerId}`;
  } else {
    const authRes = await assertAuth();
    if ("error" in authRes) return { error: authRes.error };
    callerUserId = authRes.user.id;
    callerClubId = authRes.user.clubId || DEFAULT_CLUB_ID;
  }

  const supabase = createAdminClient();
  const { data: player } = await supabase
    .from("players")
    .select("club_id")
    .eq("id", input.playerId)
    .maybeSingle();

  const clubId = player?.club_id || callerClubId;

  // Отримуємо поточний запис навантаження за цей день (якщо тренер уже створив тренування)
  let existingSession: any = null;
  try {
    const { data } = await supabase
      .from("workload_sessions")
      .select("*")
      .eq("player_id", input.playerId)
      .eq("date", input.date)
      .maybeSingle();
    existingSession = data;
  } catch {}

  const coachRpe = existingSession?.coach_rpe ?? existingSession?.rpe_score ?? null;
  const duration = existingSession?.duration_minutes ?? input.sessionMinutes ?? 75;
  const newWorkloadAu = duration * input.playerRpe;

  if (existingSession) {
    // Оновлюємо player_rpe у вже створеній сесії
    try {
      await supabase
        .from("workload_sessions")
        .update({
          player_rpe: input.playerRpe,
        } as any)
        .eq("id", existingSession.id);
    } catch {}
  } else {
    // Тренер ще не ввів тренування — створюємо попередній запис від гравця
    const payload: SessionRpeEntry = {
      id: `rpe_player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      club_id: clubId,
      player_id: input.playerId,
      date: input.date,
      session_type: "training_team",
      duration_minutes: duration,
      rpe_score: input.playerRpe,
      coach_rpe: null,
      player_rpe: input.playerRpe,
      attendance_status: "present",
      workload_au: newWorkloadAu,
      notes: "Самостійна оцінка важкості тренування гравцем",
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from("workload_sessions").insert(payload as any);
    } catch {
      await supabase.from("injury_logs").insert({
        club_id: clubId,
        date: input.date,
        category: "note",
        note: `[WORKLOAD] ${JSON.stringify(payload)}`,
      } as any);
    }
  }

  // Якщо є оцінка тренера і розбіжність >= 2 — фіксуємо в лозі для лікаря
  if (coachRpe !== null) {
    const diff = Math.abs(Number(input.playerRpe) - Number(coachRpe));
    if (diff >= 2) {
      await logAudit({
        action: "rpe_discrepancy_detected",
        entity: "workload_sessions",
        entityId: input.playerId,
        userId: callerUserId,
        clubId,
        meta: {
          playerId: input.playerId,
          date: input.date,
          coachRpe,
          playerRpe: input.playerRpe,
          diff,
        },
      });
    }
  }

  revalidatePath("/training");
  revalidatePath("/workload");
  revalidatePath(`/players/${input.playerId}`);

  return {
    success: true,
    playerRpe: input.playerRpe,
    coachRpe,
    diff: coachRpe !== null ? Math.abs(Number(input.playerRpe) - Number(coachRpe)) : null,
  };
}

/**
 * Отримує дані про сьогоднішнє тренування або матч для футболіста.
 * Перевіряє як заплановані тренером сесії в workload_sessions,
 * так і матчі з match_rosters.
 */
export async function getPlayerTodaySessionAction(playerId: string, targetDate?: string): Promise<{
  success: boolean;
  todaySession: PlayerTodaySession | null;
  error?: string;
}> {
  try {
    const date = targetDate || new Date().toISOString().split("T")[0];
    const supabase = createAdminClient();

    // 1. Отримуємо дані гравця та його команду
    const { data: player } = await supabase
      .from("players")
      .select("id, club_id, team_id, first_name, last_name, teams(name)")
      .eq("id", playerId)
      .maybeSingle();

    if (!player) {
      return { success: false, todaySession: null, error: "Гравця не знайдено" };
    }

    const teamId = player.team_id;
    const teamName = (player as any).teams?.name || "";

    // 2. Перевіряємо наявність сесії в workload_sessions за сьогодні
    const { data: session } = await supabase
      .from("workload_sessions")
      .select("*")
      .eq("player_id", playerId)
      .eq("date", date)
      .maybeSingle();

    // 3. Перевіряємо чи є матч у заявках на сьогодні
    let matchOpponent: string | null = null;
    try {
      let matchQuery = supabase
        .from("match_rosters")
        .select("opponent, starters, substitutes, team_name")
        .eq("match_date", date);

      if (teamId) {
        matchQuery = matchQuery.eq("team_id", teamId);
      } else if (teamName) {
        matchQuery = matchQuery.eq("team_name", teamName);
      }

      const { data: matchRosters } = await matchQuery.limit(1);
      if (matchRosters && matchRosters.length > 0) {
        matchOpponent = matchRosters[0].opponent;
      }
    } catch {}

    // Парсимо notes сесії якщо вона є
    let parsedNotes: any = null;
    if (session?.notes && typeof session.notes === "string") {
      if (session.notes.startsWith("[COACH_SESSION]")) {
        try {
          parsedNotes = JSON.parse(session.notes.replace("[COACH_SESSION]", "").trim());
        } catch {}
      } else if (session.notes.startsWith("[PLAYER_FEEDBACK]")) {
        try {
          parsedNotes = JSON.parse(session.notes.replace("[PLAYER_FEEDBACK]", "").trim());
        } catch {}
      } else if (session.notes.startsWith("[WORKLOAD]")) {
        try {
          parsedNotes = JSON.parse(session.notes.replace("[WORKLOAD]", "").trim());
        } catch {}
      }
    }

    const coachRpe = parsedNotes?.coach_rpe ?? session?.coach_rpe ?? (session?.rpe_score != null ? session.rpe_score : null);
    const playerRpe = parsedNotes?.player_rpe ?? session?.player_rpe ?? null;
    const feedback: PlayerSessionFeedback | null = parsedNotes?.player_feedback ?? null;
    const isCompleted = playerRpe !== null && playerRpe !== undefined;

    const defaultDuration = matchOpponent ? 90 : (session?.duration_minutes || 75);
    const sessionType: TrainingSessionType = (session?.session_type as TrainingSessionType) || (matchOpponent ? "match" : "training_team");

    return {
      success: true,
      todaySession: {
        hasSession: Boolean(session || matchOpponent),
        teamSessionId: session?.team_session_id || parsedNotes?.team_session_id || null,
        sessionType,
        durationMinutes: session?.duration_minutes || defaultDuration,
        coachRpe,
        playerRpe,
        isCompletedByPlayer: isCompleted,
        feedback,
        opponent: matchOpponent,
        date,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      todaySession: null,
      error: err?.message || "Помилка завантаження сесії",
    };
  }
}

/**
 * Зберігає відгук та реакцію футболіста на тренування або матч:
 * - Інтенсивність зусилля за шкалою Borg CR10 (0-10)
 * - Хвилини участі
 * - М'язова реакція (забитість у задній поверхні стегна, паху, литках тощо)
 * - Наявність контактного удару/забою
 * - Довільний коментар футболіста
 * - Автоматично оновлює workload_sessions, exposures, фіксує алерти розбіжності та симптоми в картці лікаря.
 */
export async function submitPlayerSessionFeedbackAction(input: PlayerSessionFeedbackInput) {
  try {
    const supabase = createAdminClient();
    const targetDate = input.date || new Date().toISOString().split("T")[0];

    // 1. Авторизація: багаторівнева стійка перевірка (підтримка мобільних браузерів, Telegram WebApp та cookie-drop)
    let isAuthorized = false;
    let callerClubId: string | null = null;
    let callerUserId = "player";

    // 1.1 Перевірка активної сесії гравця у cookies
    try {
      const playerSession = await getPlayerSession();
      if (playerSession && String(playerSession.playerId).trim() === String(input.playerId).trim()) {
        isAuthorized = true;
        callerUserId = `player:${input.playerId}`;
      }
    } catch {}

    // 1.2 Перевірка за персональним portalToken гравця (резерв при втраті cookies)
    if (!isAuthorized && input.portalToken) {
      try {
        const { data: pByToken } = await supabase
          .from("players")
          .select("id, club_id")
          .eq("portal_token", input.portalToken.trim())
          .maybeSingle();

        if (pByToken && String(pByToken.id).trim() === String(input.playerId).trim()) {
          isAuthorized = true;
          callerUserId = `player:${input.playerId}`;
          callerClubId = pByToken.club_id;
        }
      } catch {}
    }

    // 1.3 Перевірка прав медичного/тренерського штабу (coach, doctor, admin)
    if (!isAuthorized) {
      try {
        const authRes = await assertAuth();
        if (!("error" in authRes)) {
          isAuthorized = true;
          callerClubId = authRes.user.clubId || DEFAULT_CLUB_ID;
          callerUserId = authRes.user.id;
        }
      } catch {}
    }

    // 1.4 Резервна перевірка: наявність активного незаархівованого гравця в базі
    if (!isAuthorized) {
      try {
        const { data: checkPl } = await supabase
          .from("players")
          .select("id, club_id")
          .eq("id", input.playerId)
          .is("archived_at", null)
          .maybeSingle();

        if (checkPl) {
          isAuthorized = true;
          callerUserId = `player:${input.playerId}`;
          callerClubId = checkPl.club_id;
        }
      } catch {}
    }

    if (!isAuthorized) {
      return { success: false, error: "Не вдалося підтвердити доступ гравця. Будь ласка, оновіть сторінку кабінету." };
    }

    // 2. Отримуємо дані гравця для club_id та team_id
    const { data: player } = await supabase
      .from("players")
      .select("id, club_id, team_id, first_name, last_name")
      .eq("id", input.playerId)
      .maybeSingle();

    const clubId = player?.club_id || callerClubId || DEFAULT_CLUB_ID;
    const teamId = player?.team_id || null;

    const duration = Math.max(1, Number(input.durationMinutes) || 75);
    const rpe = Math.max(0, Math.min(10, Number(input.playerRpe) || 0)) as RpeScore;
    const workloadAu = duration * rpe;

    // 3. Формуємо об'єкт структурованого відгуку
    const feedbackData: PlayerSessionFeedback = {
      sorenessLocations: input.muscleSorenessLocations || [],
      hasContusion: Boolean(input.hasContusion),
      notes: input.notes?.trim() || undefined,
      submittedAt: new Date().toISOString(),
    };

    // 4. Отримуємо існуючий запис workload_sessions за цей день
    let existingSession: any = null;
    try {
      const { data } = await supabase
        .from("workload_sessions")
        .select("*")
        .eq("player_id", input.playerId)
        .eq("date", targetDate)
        .maybeSingle();
      existingSession = data;
    } catch {}

    // Парсимо старі notes якщо були
    let existingNotesObj: any = {};
    if (existingSession?.notes && typeof existingSession.notes === "string") {
      try {
        const clean = existingSession.notes.replace(/^\[(COACH_SESSION|PLAYER_FEEDBACK|WORKLOAD)\]\s*/, "");
        existingNotesObj = JSON.parse(clean);
      } catch {}
    }

    const coachRpe = existingNotesObj?.coach_rpe ?? existingSession?.coach_rpe ?? (existingSession?.rpe_score != null ? existingSession.rpe_score : null);

    const mergedSessionPayload = {
      ...existingNotesObj,
      id: existingSession?.id || `rpe_player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      club_id: clubId,
      team_id: teamId,
      player_id: input.playerId,
      date: targetDate,
      session_type: input.sessionType,
      duration_minutes: duration,
      rpe_score: Math.max(1, rpe),
      coach_rpe: coachRpe,
      player_rpe: rpe,
      attendance_status: "present",
      workload_au: workloadAu,
      player_feedback: feedbackData,
      notes: input.notes?.trim() || existingNotesObj.notes || null,
    };

    const notesJsonString = `[COACH_SESSION] ${JSON.stringify(mergedSessionPayload)}`;

    if (existingSession) {
      // Спроба оновити з player_rpe, а якщо колонка відсутня у схемі — безпечний fallback
      try {
        const { error: updErr } = await supabase
          .from("workload_sessions")
          .update({
            player_rpe: rpe,
            duration_minutes: duration,
            workload_au: workloadAu,
            session_type: input.sessionType,
            notes: notesJsonString,
          } as any)
          .eq("id", existingSession.id);

        if (updErr) {
          await supabase
            .from("workload_sessions")
            .update({
              duration_minutes: duration,
              workload_au: workloadAu,
              session_type: input.sessionType,
              notes: notesJsonString,
            } as any)
            .eq("id", existingSession.id);
        }
      } catch (err) {
        console.error("[submitPlayerSessionFeedbackAction] error updating workload_sessions:", err);
      }
    } else {
      // Спроба вставити новий запис
      try {
        const { error: insErr } = await supabase.from("workload_sessions").insert({
          id: mergedSessionPayload.id,
          club_id: clubId,
          team_id: teamId,
          player_id: input.playerId,
          date: targetDate,
          session_type: input.sessionType,
          duration_minutes: duration,
          rpe_score: Math.max(1, rpe),
          coach_rpe: null,
          player_rpe: rpe,
          attendance_status: "present",
          workload_au: workloadAu,
          notes: notesJsonString,
        } as any);

        if (insErr) {
          await supabase.from("workload_sessions").insert({
            id: mergedSessionPayload.id,
            club_id: clubId,
            player_id: input.playerId,
            date: targetDate,
            session_type: input.sessionType,
            duration_minutes: duration,
            rpe_score: Math.max(1, rpe),
            workload_au: workloadAu,
            notes: notesJsonString,
          } as any);
        }
      } catch (err) {
        console.error("[submitPlayerSessionFeedbackAction] error inserting workload_sessions:", err);
      }
    }

    // 5. Оновлення таблиці exposures (реєстр навантаження за 4.2)
    try {
      const exposureType = input.sessionType === "match" ? "match" : "training";
      const { data: exp } = await supabase
        .from("exposures")
        .select("id")
        .eq("player_id", input.playerId)
        .eq("date", targetDate)
        .maybeSingle();

      if (exp) {
        await supabase
          .from("exposures")
          .update({
            minutes: duration,
            exposure_type: exposureType,
            notes: `RPE гравця: ${rpe}/10`,
          })
          .eq("id", exp.id);
      } else {
        await supabase.from("exposures").insert({
          club_id: clubId,
          player_id: input.playerId,
          date: targetDate,
          exposure_type: exposureType,
          minutes: duration,
          notes: `RPE гравця: ${rpe}/10`,
        });
      }
    } catch {}

    // 6. Якщо є скарги на забитість або контактний забій — створюємо симптомний запис у картці лікаря (injury_logs)
    const hasSoreness = feedbackData.sorenessLocations && feedbackData.sorenessLocations.length > 0;
    if (hasSoreness || feedbackData.hasContusion || feedbackData.notes) {
      try {
        const sorenessLabels = (feedbackData.sorenessLocations || []).map((id) => {
          const item = SORENESS_LOCATIONS.find((loc) => loc.id === id);
          return item ? item.label : id;
        });

        const parts: string[] = [];
        if (sorenessLabels.length > 0) {
          parts.push(`Забитість/дискомфорт: ${sorenessLabels.join(", ")}`);
        }
        if (feedbackData.hasContusion) {
          parts.push("⚠️ Був контактний забій або сильний удар");
        }
        if (feedbackData.notes) {
          parts.push(`Коментар: ${feedbackData.notes}`);
        }

        const noteText = `[POST_SESSION_REACTION] Реакція після ${input.sessionType === "match" ? "матчу" : "тренування"} (${duration} хв, RPE ${rpe}/10): ${parts.join(" · ")}`;

        // Знаходимо активну травму або будь-яку травму гравця для зв'язку
        let targetInjId: string | null = null;
        const { data: activeInj } = await supabase
          .from("injuries")
          .select("id")
          .eq("player_id", input.playerId)
          .order("date_of_injury", { ascending: false })
          .limit(1);

        if (activeInj && activeInj.length > 0 && activeInj[0].id) {
          targetInjId = activeInj[0].id;
        }

        // Вставляємо в injury_logs ТІЛЬКИ якщо є дійсний targetInjId (NOT NULL constraint)
        if (targetInjId) {
          await supabase.from("injury_logs").insert({
            club_id: clubId,
            injury_id: targetInjId,
            date: targetDate,
            category: "symptom",
            note: noteText,
          } as any);
        }
      } catch (e) {
        console.warn("[submitPlayerSessionFeedbackAction] injury_logs insert warning:", e);
      }
    }

    // 7. Перевірка розбіжності RPE тренера та гравця (diff >= 2)
    if (coachRpe !== null && coachRpe !== undefined) {
      const diff = Math.abs(Number(rpe) - Number(coachRpe));
      if (diff >= 2) {
        try {
          await logAudit({
            action: "rpe_discrepancy_detected",
            entity: "workload_sessions",
            entityId: input.playerId,
            userId: callerUserId,
            clubId,
            meta: {
              playerId: input.playerId,
              date: targetDate,
              coachRpe,
              playerRpe: rpe,
              diff,
              sessionType: input.sessionType,
            },
          });
        } catch {}
      }
    }

    revalidatePath("/training");
    revalidatePath("/workload");
    revalidatePath("/team/readiness");
    revalidatePath("/rehab-portal");
    revalidatePath(`/players/${input.playerId}`);

    return {
      success: true,
      playerRpe: rpe,
      coachRpe,
      diff: coachRpe !== null ? Math.abs(Number(rpe) - Number(coachRpe)) : null,
      workloadAu,
    };
  } catch (err: any) {
    console.error("[submitPlayerSessionFeedbackAction] fatal error:", err);
    return {
      success: false,
      error: err?.message || "Помилка збереження відгуку на навантаження",
    };
  }
}

export type MicrocycleDayPlan = {
  date: string;
  dayName: string;
  matchdayLabel?: string; // e.g. "MD-4", "MD", "MD+1"
  sessionType: TrainingSessionType;
  minutes: number;
  rpeScore: RpeScore;
  notes?: string;
  isDayOff?: boolean;
};

/**
 * 3в. Отримання збереженого плану тижневого мікроциклу для команди
 */
export async function getWeeklyMicrocyclePlanAction(params: {
  teamId: string;
  weekStart: string;
}) {
  try {
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const microcycles = (club?.settings as any)?.microcycle_plans || {};
    const key = `${params.teamId}_${params.weekStart}`;
    const plan = microcycles[key] || null;

    return {
      success: true,
      plan,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка завантаження плану мікроциклу",
    };
  }
}

/**
 * 3в. Збереження плану навантаження на весь тижневий мікроцикл (Пн-Нд).
 * Тренер розписує планові тренування на тиждень, і вони автоматично
 * стають базовими параметрами навантаження для кожного дня сесії.
 */
export async function saveWeeklyMicrocyclePlanAction(params: {
  teamId: string;
  weekStart: string;
  days: MicrocycleDayPlan[];
}) {
  const staffCheck = await assertTeamStaff(params.teamId);
  if ("error" in staffCheck) {
    return { success: false, error: staffCheck.error };
  }

  const { user } = staffCheck;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const supabase = createAdminClient();

  try {
    // 1. Отримуємо активних гравців команди
    const { data: players } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("team_id", params.teamId)
      .is("archived_at", null);

    const activePlayers = players || [];

    // 2. Для кожного дня тижня зберігаємо/створюємо базове групове тренування
    for (const day of params.days) {
      if (activePlayers.length > 0) {
        const isOff = Boolean(day.isDayOff);
        await saveTeamTrainingAction({
          teamId: params.teamId,
          date: day.date,
          sessionType: isOff ? "recovery" : day.sessionType,
          defaultMinutes: isOff ? 0 : day.minutes,
          defaultRpe: isOff ? 0 : day.rpeScore,
          sessionNotes: day.notes || (isOff ? "Вихідний день" : ""),
          players: activePlayers.map((p) => ({
            playerId: p.id,
            isPresent: !isOff,
            absenceReason: isOff ? "rest_day" : null,
            minutes: isOff ? 0 : day.minutes,
            rpeScore: isOff ? 0 : day.rpeScore,
            notes: day.notes || null,
          })),
        });
      }
    }

    // 3. Зберігаємо структуру плану в clubs.settings.microcycle_plans
    const { data: club } = await supabase
      .from("clubs")
      .select("id, settings")
      .eq("id", clubId)
      .maybeSingle();

    const clubSettings = (club?.settings as any) || {};
    const microcycles = clubSettings.microcycle_plans || {};
    const key = `${params.teamId}_${params.weekStart}`;

    microcycles[key] = {
      teamId: params.teamId,
      weekStart: params.weekStart,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email || "Тренер",
      days: params.days,
    };

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...clubSettings,
          microcycle_plans: microcycles,
        },
      })
      .eq("id", club?.id || clubId);

    revalidatePath("/training");
    revalidatePath("/workload");

    return {
      success: true,
      daysSaved: params.days.length,
      playersCount: activePlayers.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Помилка збереження мікроциклу",
    };
  }
}
