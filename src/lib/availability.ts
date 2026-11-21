import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { getClubDate } from "@/lib/club-timezone";
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

const getPlayerAvailabilityCached = cache(
  async (clubId: string | null, dateStr: string): Promise<ClubAvailabilityReport> => {
    const supabase = await createClient();
    const targetDate = new Date(dateStr);

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

    // 2. Паралельно отримуємо логи RTP та скринінгів (зі скоупом club_id)
    let rtpQuery = supabase
      .from("injury_logs")
      .select("injury_id, note, date, created_at")
      .like("note", "[RTP_PHASE]%")
      .order("created_at", { ascending: false })
      .limit(500);

    if (clubId) {
      rtpQuery = rtpQuery.eq("club_id", clubId);
    }

    let screeningsQuery = supabase
      .from("player_screenings")
      .select("id, player_id, date, season, examiner_doctor, overall_status, valid_until, cardio_clearance, restrictions_notes, data, created_at")
      .order("date", { ascending: false })
      .limit(500);

    if (clubId) {
      screeningsQuery = screeningsQuery.eq("club_id", clubId);
    }

    const [playersRes, rtpLogsRes, screeningLogsRes] = await Promise.all([
      playersQuery,
      rtpQuery,
      screeningsQuery,
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

    // Отримуємо останні скринінги для кожного гравця з player_screenings
    const latestScreeningsMap = new Map<string, PreSeasonScreening>();
    for (const row of (screeningLogsRes.data || []) as any[]) {
      if (row.player_id && !latestScreeningsMap.has(row.player_id)) {
        latestScreeningsMap.set(row.player_id, {
          ...((row.data as PreSeasonScreening) || {}),
          id: row.data?.id || row.id,
          player_id: row.player_id,
          date: row.date,
          season: row.season ?? row.data?.season,
          examiner_doctor: row.examiner_doctor ?? row.data?.examiner_doctor,
          overall_status: row.overall_status ?? row.data?.overall_status,
          valid_until: row.valid_until ?? row.data?.valid_until,
          cardio_clearance: row.cardio_clearance ?? row.data?.cardio_clearance,
          restrictions_notes: row.restrictions_notes ?? row.data?.restrictions_notes,
          created_at: row.created_at ?? row.data?.created_at,
        });
      }
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
);

export async function getPlayerAvailability(
  clubId?: string | null,
  date?: string | Date
): Promise<ClubAvailabilityReport> {
  const dateStr =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : getClubDate("Europe/Kyiv", date ? new Date(date) : new Date());

  return getPlayerAvailabilityCached(clubId || null, dateStr);
}
