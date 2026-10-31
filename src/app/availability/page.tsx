import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerAvailability } from "@/lib/availability";
import AvailabilityClient from "@/components/availability/AvailabilityClient";

export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const isCoach = user?.role === "coach";
  const coachTeams = isCoach
    ? (user.teamIds && user.teamIds.length > 0 ? user.teamIds : (user.teamId ? [user.teamId] : []))
    : [];

  if (isCoach && coachTeams.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="p-8 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center space-y-3 max-w-md">
          <div className="text-4xl mb-2">⏳</div>
          <h2 className="text-lg font-bold text-white">Очікування призначення команди</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ваш профіль зареєстровано як тренер клубу. Для перегляду доступності гравців адміністратор або головний лікар клубу має закріпити за вами вікову групу (команду).
          </p>
        </div>
      </div>
    );
  }

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
      .eq("club_id", user?.clubId || DEFAULT_CLUB_ID)
      .order("sort_order", { ascending: true }),
    getPlayerAvailability(),
  ]);

  const availabilityMap = new Map(
    availabilityReport.players.map((p) => [p.id, p])
  );

  // 1.6 Приховуємо архівних гравців із моніторингу доступності та збагачуємо єдиним статусом
  let rawTeamsData = teamsRes.data ?? [];
  if (isCoach) {
    rawTeamsData = rawTeamsData.filter((t: any) => coachTeams.includes(t.id));
  }

  const activeTeams = rawTeamsData.map((t: any) => ({
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
