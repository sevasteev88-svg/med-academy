import { createClient } from "@/utils/supabase/server";
import { getPlayerAvailability } from "@/lib/availability";
import AvailabilityClient from "@/components/availability/AvailabilityClient";

export default async function AvailabilityPage() {
  const supabase = await createClient();

  const [teamsRes, availabilityReport] = await Promise.all([
    supabase
      .from("teams")
      .select(`
        id,
        name,
        category,
        sort_order,
        players (
          id,
          first_name,
          last_name,
          position,
          archived_at,
          injuries (
            id,
            status,
            vas_score,
            location,
            injury_type,
            date_of_injury,
            expected_return_date,
            description
          ),
          maturation_assessments (
            risk_zone,
            growth_phase,
            consensus_offset,
            created_at
          )
        )
      `)
      .order("sort_order", { ascending: true }),
    getPlayerAvailability(),
  ]);

  const availabilityMap = new Map(
    availabilityReport.players.map((p) => [p.id, p])
  );

  // 1.6 Приховуємо архівних гравців із моніторингу доступності та збагачуємо єдиним статусом
  const activeTeams = (teamsRes.data ?? []).map((t: any) => ({
    ...t,
    players: (t.players ?? [])
      .filter((p: any) => !p.archived_at)
      .map((p: any) => {
        const avail = availabilityMap.get(p.id);
        return {
          ...p,
          status: avail?.status ?? "available",
          legacyStatus: avail?.legacyStatus ?? "ok",
          max_minutes: avail?.max_minutes ?? 90,
          restriction_notes: avail?.restriction_notes ?? "",
          injury_summary: avail?.injury_summary ?? "",
          hasValidScreening: avail?.hasValidScreening ?? false,
        };
      }),
  }));

  return (
    <AvailabilityClient
      teams={activeTeams as any}
      summary={availabilityReport.summary}
    />
  );
}
