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
import type {
  TrainingSessionType,
  RpeScore,
  SaveTeamTrainingInput,
  TeamTrainingPlayerItem,
  SessionRpeEntry,
} from "@/types/workload";

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

  // 1. Отримуємо команди клубу
  const { data: rawTeams } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const allTeams = (rawTeams ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Якщо тренер — примусово закріплена його команда
  let selectedTeamId = params?.teamId || "";
  if (isCoachUser) {
    selectedTeamId = user.teamId || allTeams[0]?.id || "";
  } else if (!selectedTeamId && allTeams.length > 0) {
    selectedTeamId = allTeams[0].id;
  }

  // Перевіряємо права тренера
  const staffCheck = await assertTeamStaff(selectedTeamId);
  if ("error" in staffCheck) {
    return {
      success: false,
      team: null,
      teams: isCoachUser ? allTeams.filter((t) => t.id === user.teamId) : allTeams,
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
    ? allTeams.filter((t) => t.id === selectedTeamId)
    : allTeams;

  // 2. Отримуємо активних гравців команди (1.6 виключаємо архівних)
  const { data: rawPlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, team_id")
    .eq("team_id", selectedTeamId)
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  const teamPlayers = rawPlayers || [];

  // 3. Перевіряємо, чи вже збережені сесії на цей день для цієї команди
  let existingWorkloads: any[] = [];
  try {
    const { data: wSessions } = await supabase
      .from("workload_sessions")
      .select("*")
      .eq("team_id", selectedTeamId)
      .eq("date", targetDate);

    if (wSessions && wSessions.length > 0) {
      existingWorkloads = wSessions;
    }
  } catch {}

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
        notes: existing.notes || "",
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
        sessionNotes: firstExisting.notes || "",
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
    let insertSuccess = false;
    try {
      const { error: wErr } = await supabase
        .from("workload_sessions")
        .upsert(sessionPayload as any, { onConflict: "player_id, date" });

      if (!wErr) {
        insertSuccess = true;
      }
    } catch {}

    // Fallback: якщо таблиця недоступна без колонок — прямий insert або injury_logs
    if (!insertSuccess) {
      try {
        await supabase.from("workload_sessions").insert({
          id: sessionPayload.id,
          club_id: clubId,
          player_id: item.playerId,
          date: input.date,
          session_type: input.sessionType,
          duration_minutes: duration,
          rpe_score: Math.max(1, rpe), // для старого check constraint >= 1
          workload_au: workloadAu,
          notes: `[COACH_SESSION] ${JSON.stringify(sessionPayload)}`,
        } as any);
        insertSuccess = true;
      } catch {
        await supabase.from("injury_logs").insert({
          club_id: clubId,
          injury_id: null as any,
          date: input.date,
          category: "note",
          note: `[WORKLOAD] ${JSON.stringify(sessionPayload)}`,
        } as any);
      }
    }

    // 2. Пункт 4: запис у таблицю exposures (задача 4.2: реєстр хвилин навантаження)
    try {
      await supabase.from("exposures").insert({
        club_id: clubId,
        player_id: item.playerId,
        date: input.date,
        exposure_type: input.sessionType === "match" ? "match" : "training",
        minutes: duration,
        workload_session_id: sessionPayload.id,
        notes: isPresent
          ? `RPE: ${rpe} (${workloadAu} AU)`
          : `Відсутній (${sessionPayload.absence_reason})`,
      } as any);
    } catch {}

    savedCount++;
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

  revalidatePath("/training");
  revalidatePath("/workload");
  revalidatePath("/team/readiness");
  revalidatePath("/coach-briefing");
  revalidatePath("/availability");
  revalidatePath("/");

  return {
    success: true,
    savedCount,
    presentCount,
    absentCount,
    teamSessionId,
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
  const authRes = await assertAuth();
  if ("error" in authRes) return { error: authRes.error };

  const supabase = createAdminClient();
  const clubId = authRes.user.clubId || DEFAULT_CLUB_ID;

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
        userId: authRes.user.id,
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
