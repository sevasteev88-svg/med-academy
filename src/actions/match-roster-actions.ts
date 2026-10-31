"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertAuth, DEFAULT_CLUB_ID } from "@/lib/auth";
import { canUserAccessTeam, isDoctorRole } from "@/lib/team-access";
import type { MatchdayRoster } from "@/types/roster";
import { revalidatePath } from "next/cache";

export type SaveRosterResult = {
  success?: boolean;
  roster?: MatchdayRoster;
  error?: string;
};

/**
 * Отримує збережену заявку на матч для вказаної команди та дати
 */
export async function getMatchdayRosterAction(
  teamName: string,
  matchDate?: string
): Promise<{ roster: MatchdayRoster | null; error?: string }> {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { roster: null, error: auth.error };
  }

  const { user } = auth;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();
  const date = matchDate || new Date().toISOString().split("T")[0];

  // Перевірка прав тренера: шукаємо команду за назвою для звірки teamId
  if (user.role === "coach") {
    const { data: teamData } = await admin
      .from("teams")
      .select("id, name")
      .eq("name", teamName)
      .maybeSingle();

    if (teamData && !canUserAccessTeam(user, teamData.id)) {
      return {
        roster: null,
        error: "У вас немає доступу до цієї вікової категорії (команди).",
      };
    }
  }

  // 1. Спробуємо прочитати з окремої таблиці match_rosters
  try {
    let query = admin
      .from("match_rosters")
      .select("*")
      .eq("club_id", clubId)
      .eq("team_name", teamName)
      .order("match_date", { ascending: false })
      .limit(1);

    if (matchDate) {
      query = query.eq("match_date", matchDate);
    }

    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      return {
        roster: {
          id: data.id,
          clubId: data.club_id,
          teamId: data.team_id,
          teamName: data.team_name,
          matchDate: data.match_date,
          opponent: data.opponent,
          location: data.location || undefined,
          formation: data.formation || "4-3-3",
          starters: Array.isArray(data.starters) ? data.starters : [],
          substitutes: Array.isArray(data.substitutes) ? data.substitutes : [],
          tacticalNotes: data.tactical_notes || undefined,
          updatedAt: data.updated_at,
          createdBy: data.created_by,
        },
      };
    }
  } catch (err: any) {
    // Таблиця може ще не існувати до накату міграції — продовжуємо до fallback
  }

  // 2. Fallback: збереження у налаштуваннях клубу (clubs.settings.matchday_rosters)
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const storedMap = (club as any)?.settings?.matchday_rosters;
    if (storedMap && typeof storedMap === "object") {
      const key = `${teamName}_${date}`;
      const found = storedMap[key] || storedMap[teamName];
      if (found) {
        return { roster: found };
      }
    }
  } catch {}

  return { roster: null };
}

/**
 * Зберігає заявку та розстановку на матч (Стартовий склад XI, Запасні, номери, тактичні нотатки)
 */
export async function saveMatchdayRosterAction(
  roster: MatchdayRoster
): Promise<SaveRosterResult> {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { user } = auth;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  // Перевірка доступу тренера
  if (user.role === "coach") {
    let targetTeamId = roster.teamId;
    if (!targetTeamId) {
      const { data: teamData } = await admin
        .from("teams")
        .select("id")
        .eq("name", roster.teamName)
        .maybeSingle();
      targetTeamId = teamData?.id;
    }

    if (targetTeamId && !canUserAccessTeam(user, targetTeamId)) {
      return {
        error: "У вас немає прав на зміну заявки для цієї команди.",
      };
    }
  }

  // Знаходимо team_id якщо не передано
  let resolvedTeamId = roster.teamId;
  if (!resolvedTeamId) {
    const { data: t } = await admin
      .from("teams")
      .select("id")
      .eq("name", roster.teamName)
      .maybeSingle();
    resolvedTeamId = t?.id;
  }

  const nowIso = new Date().toISOString();
  const matchDate = roster.matchDate || nowIso.split("T")[0];

  // 1. Спроба збереження в таблицю match_rosters
  try {
    // Перевіряємо чи є вже запис на цю дату для цієї команди
    const { data: existing } = await admin
      .from("match_rosters")
      .select("id")
      .eq("club_id", clubId)
      .eq("team_name", roster.teamName)
      .eq("match_date", matchDate)
      .maybeSingle();

    let savedData: any = null;

    if (existing?.id) {
      const { data, error } = await admin
        .from("match_rosters")
        .update({
          team_id: resolvedTeamId,
          opponent: roster.opponent,
          location: roster.location || null,
          formation: roster.formation || "4-3-3",
          starters: roster.starters,
          substitutes: roster.substitutes,
          tactical_notes: roster.tacticalNotes || null,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (!error && data) savedData = data;
    } else {
      const { data, error } = await admin
        .from("match_rosters")
        .insert({
          club_id: clubId,
          team_id: resolvedTeamId,
          team_name: roster.teamName,
          match_date: matchDate,
          opponent: roster.opponent,
          location: roster.location || null,
          formation: roster.formation || "4-3-3",
          starters: roster.starters,
          substitutes: roster.substitutes,
          tactical_notes: roster.tacticalNotes || null,
          created_by: user.id,
          updated_at: nowIso,
        })
        .select()
        .single();

      if (!error && data) savedData = data;
    }

    if (savedData) {
      revalidatePath("/reports/matchday");
      return {
        success: true,
        roster: {
          ...roster,
          id: savedData.id,
          updatedAt: savedData.updated_at,
        },
      };
    }
  } catch (err: any) {
    // Fallback якщо таблиці ще нема
  }

  // 2. Fallback: збереження у clubs.settings
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const currentSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const currentRosters = (currentSettings.matchday_rosters || {}) as Record<string, any>;

    const key = `${roster.teamName}_${matchDate}`;
    currentRosters[key] = {
      ...roster,
      updatedAt: nowIso,
      createdBy: user.id,
    };

    // Також зберігаємо як останній актуальний склад команди
    currentRosters[roster.teamName] = currentRosters[key];

    const { error: updateErr } = await admin
      .from("clubs")
      .update({
        settings: {
          ...currentSettings,
          matchday_rosters: currentRosters,
        },
      })
      .eq("id", clubId);

    if (updateErr) {
      return { error: `Не вдалося зберегти заявку: ${updateErr.message}` };
    }

    revalidatePath("/reports/matchday");
    return {
      success: true,
      roster: {
        ...roster,
        updatedAt: nowIso,
      },
    };
  } catch (err: any) {
    return { error: `Помилка збереження заявки: ${err?.message || "Невідома помилка"}` };
  }
}

export type PostMatchPlayerEntry = {
  playerId: string;
  playerName: string;
  minutesPlayed: number;
  rpeScore?: number;
  starter: boolean;
  notes?: string;
};

export type SavePostMatchReportInput = {
  teamId?: string;
  teamName: string;
  matchDate: string;
  opponent: string;
  matchRpe: number;
  score?: string;
  players: PostMatchPlayerEntry[];
  tacticalNotes?: string;
};

export type PostMatchReportResult = {
  success?: boolean;
  savedPlayersCount?: number;
  overexposureAlerts?: Array<{
    playerId: string;
    playerName: string;
    limitMinutes: number;
    playedMinutes: number;
  }>;
  error?: string;
};

/**
 * Пункт 2: Швидкий тренерський звіт після матчу (Post-Match Minute & RPE Logging)
 * - Фіксує зіграні хвилини кожного футболіста (старт, заміна, лава)
 * - Записує ігровий RPE матчу в workload_sessions
 * - Синхронізує матч-експозиції в exposures для UEFA Injury Incidence (1000 год)
 * - ВИЯВЛЯЄ ПЕРЕНАВАНТАЖЕННЯ (Overexposure Alert): якщо гравець з лімітом лікаря (45 хв)
 *   переграв свій ліміт -> сповіщає медичний штаб для позачергового огляду!
 */
export async function savePostMatchReportAction(
  input: SavePostMatchReportInput
): Promise<PostMatchReportResult> {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { user } = auth;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  // Перевірка прав тренера
  if (user.role === "coach") {
    let targetTeamId = input.teamId;
    if (!targetTeamId) {
      const { data: teamData } = await admin
        .from("teams")
        .select("id")
        .eq("name", input.teamName)
        .maybeSingle();
      targetTeamId = teamData?.id;
    }

    if (targetTeamId && !canUserAccessTeam(user, targetTeamId)) {
      return {
        error: "У вас немає доступу для внесення звіту по цій команді.",
      };
    }
  }

  // Отримуємо команду id
  let resolvedTeamId = input.teamId;
  if (!resolvedTeamId) {
    const { data: t } = await admin
      .from("teams")
      .select("id")
      .eq("name", input.teamName)
      .maybeSingle();
    resolvedTeamId = t?.id;
  }

  // Отримуємо поточні обмеження гравців клубу для виявлення перенавантажень
  const { getPlayerAvailability } = await import("@/lib/availability");
  const availabilityReport = await getPlayerAvailability(clubId);
  const playerLimitMap = new Map<string, { status: string; maxMinutes: number; notes: string }>();

  for (const p of availabilityReport.players) {
    if (p.status === "restricted" && p.max_minutes) {
      playerLimitMap.set(p.id, {
        status: p.status,
        maxMinutes: p.max_minutes,
        notes: p.restriction_notes || "",
      });
    }
  }

  const overexposureAlerts: Array<{
    playerId: string;
    playerName: string;
    limitMinutes: number;
    playedMinutes: number;
  }> = [];

  const nowIso = new Date().toISOString();
  let savedCount = 0;
  let playersWithMinutesCount = 0;

  for (const p of input.players) {
    const played = Math.max(0, Number(p.minutesPlayed) || 0);
    const rpe = Math.max(1, Math.min(10, Number(p.rpeScore) || Number(input.matchRpe) || 7));
    const workloadAu = played * rpe;

    if (played > 0) {
      playersWithMinutesCount++;
    }

    // Перевірка на Overexposure (перегравання ліміту лікаря)
    const limitInfo = playerLimitMap.get(p.playerId);
    if (limitInfo && played > limitInfo.maxMinutes) {
      overexposureAlerts.push({
        playerId: p.playerId,
        playerName: p.playerName,
        limitMinutes: limitInfo.maxMinutes,
        playedMinutes: played,
      });

      // Логуємо медичну пересторогу в injury_logs
      try {
        await admin.from("injury_logs").insert({
          club_id: clubId,
          date: input.matchDate,
          category: "alert",
          note: `[OVEREXPOSURE_ALERT] Гравець ${p.playerName} зіграв у матчі ${played} хв при лікарському ліміті ${limitInfo.maxMinutes} хв (${limitInfo.notes || "етап реабілітації"}). Матч проти ${input.opponent}. Рекомендовано позачерговий огляд лікаря та оцінку крепатури/болю ВАШ.`,
        });
      } catch {}
    }

    // 1. Запис у workload_sessions
    try {
      await admin
        .from("workload_sessions")
        .delete()
        .eq("player_id", p.playerId)
        .eq("date", input.matchDate);

      await admin.from("workload_sessions").insert({
        id: `match_workload_${Date.now()}_${p.playerId.slice(0, 4)}_${Math.random().toString(36).substring(2, 6)}`,
        club_id: clubId,
        player_id: p.playerId,
        team_id: resolvedTeamId,
        date: input.matchDate,
        session_type: "match",
        duration_minutes: played,
        rpe_score: rpe,
        coach_rpe: rpe,
        workload_au: workloadAu,
        attendance_status: played > 0 ? "present" : "absent",
        notes: `Матч проти ${input.opponent}${input.score ? ` (${input.score})` : ""}: зіграно ${played} хв${p.notes ? `. ${p.notes}` : ""}`,
      } as any);

      savedCount++;
    } catch {}
  }

  // 2. Запис у exposures для розрахунку incidence rate на 1000 матч-годин
  try {
    await admin
      .from("exposures")
      .delete()
      .eq("team_id", resolvedTeamId)
      .eq("date", input.matchDate);

    if (playersWithMinutesCount > 0) {
      await admin.from("exposures").insert({
        club_id: clubId,
        team_id: resolvedTeamId,
        date: input.matchDate,
        type: "match",
        minutes: 90,
        players_count: playersWithMinutesCount,
        notes: `Календарний матч: ${input.teamName} — ${input.opponent} (${input.score || "фінальний рахунок"}).`,
      });
    }
  } catch {}

  revalidatePath("/reports/matchday");
  revalidatePath("/training");
  revalidatePath("/workload");
  revalidatePath("/coach-briefing");
  revalidatePath("/availability");
  revalidatePath("/exposures");

  return {
    success: true,
    savedPlayersCount: savedCount,
    overexposureAlerts,
  };
}
