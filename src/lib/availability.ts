import { createClient } from "@/utils/supabase/server";
import {
  type PreSeasonScreening,
} from "../types/screening.ts";
import type { RtpPhaseLog } from "../types/rtp.ts";
import {
  calculatePlayerAvailability,
  type ClubAvailabilityReport,
  type PlayerAvailabilityItem,
  type TeamAvailabilitySummary,
  type AvailabilitySummary,
} from "./availability-rules";

// Ре-експортуємо всі типи, константи та правила
export * from "./availability-rules";

// ─── Серверна функція getPlayerAvailability(clubId, date) ─────────────────────

export async function getPlayerAvailability(
  clubId?: string | null,
  date?: string | Date
): Promise<ClubAvailabilityReport> {
  const supabase = await createClient();
  const targetDate = date ? new Date(date) : new Date();
  const dateStr = targetDate.toISOString().split("T")[0];

  // 1. Завантажуємо неархівних гравців та команди
  let playersQuery = supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      position,
      date_of_birth,
      team_id,
      club_id,
      archived_at,
      teams (
        id,
        name,
        category,
        sort_order
      ),
      injuries (
        id,
        status,
        injury_type,
        location,
        vas_score,
        date_of_injury,
        expected_return_date,
        description
      )
    `)
    .is("archived_at", null);

  if (clubId) {
    playersQuery = playersQuery.eq("club_id", clubId);
  }

  // 2. Паралельно отримуємо логи RTP та скринінгів
  const [playersRes, rtpLogsRes, screeningLogsRes] = await Promise.all([
    playersQuery,
    supabase
      .from("injury_logs")
      .select("injury_id, note, date, created_at")
      .like("note", "[RTP_PHASE]%")
      .order("created_at", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("note, date, created_at")
      .like("note", "[SCREENING]%")
      .order("created_at", { ascending: false }),
  ]);

  const rawPlayers = playersRes.data || [];

  // Парсимо останні RTP логи для кожної травми
  const latestRtpByInjury: Record<string, Partial<RtpPhaseLog>> = {};
  for (const log of rtpLogsRes.data || []) {
    try {
      const raw = log.note.replace("[RTP_PHASE] ", "");
      const parsed = JSON.parse(raw);
      if (parsed.injury_id && !latestRtpByInjury[parsed.injury_id]) {
        latestRtpByInjury[parsed.injury_id] = parsed;
      }
    } catch {}
  }

  // Парсимо останні скринінги для кожного гравця
  const latestScreeningsMap = new Map<string, PreSeasonScreening>();
  for (const log of screeningLogsRes.data || []) {
    try {
      const raw = log.note.replace("[SCREENING] ", "");
      const parsed = JSON.parse(raw) as PreSeasonScreening;
      if (parsed && parsed.player_id && !latestScreeningsMap.has(parsed.player_id)) {
        latestScreeningsMap.set(parsed.player_id, parsed);
      }
    } catch {}
  }

  // 3. Розрахунок доступності для кожного гравця (правило 5: дедуплікація)
  const playersMap = new Map<string, PlayerAvailabilityItem>();
  const byTeam: Record<string, TeamAvailabilitySummary> = {};

  for (const p of rawPlayers) {
    const screening = latestScreeningsMap.get(p.id) || null;
    const availability = calculatePlayerAvailability(
      {
        ...(p as any),
        screening,
      },
      {
        date: targetDate,
        rtpLogsByInjury: latestRtpByInjury,
      }
    );

    playersMap.set(availability.id, availability);

    // Групування по командах
    const teamId = availability.team_id || "unassigned";
    const teamName = availability.team_name || "Без команди";

    if (!byTeam[teamId]) {
      byTeam[teamId] = {
        teamId,
        teamName,
        category: availability.team_category,
        total: 0,
        available: 0,
        restricted: 0,
        unavailable: 0,
        players: [],
      };
    }

    byTeam[teamId].total += 1;
    if (availability.status === "available") byTeam[teamId].available += 1;
    else if (availability.status === "restricted") byTeam[teamId].restricted += 1;
    else byTeam[teamId].unavailable += 1;

    byTeam[teamId].players.push(availability);
  }

  const players = Array.from(playersMap.values()).sort((a, b) =>
    a.last_name.localeCompare(b.last_name, "uk")
  );

  const summary: AvailabilitySummary = {
    total: players.length,
    available: players.filter((p) => p.status === "available").length,
    restricted: players.filter((p) => p.status === "restricted").length,
    unavailable: players.filter((p) => p.status === "unavailable").length,
  };

  return {
    date: dateStr,
    summary,
    byTeam,
    players,
  };
}
