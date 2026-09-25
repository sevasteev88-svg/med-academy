import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import MatchdayProtocolClient from "@/components/reports/MatchdayProtocolClient";

export const metadata = {
  title: "Медичний протокол матчу (Matchday Protocol) · ФК «Чорноморець»",
  description: "Офіційний протокол допуску гравців до матчу (PDF-друк)",
};

export default async function MatchdayProtocolPage() {
  await assertAuth();
  const supabase = await createClient();

  const { data: teamsData } = await supabase
    .from("teams")
    .select(`
      id,
      name,
      players (
        id,
        first_name,
        last_name,
        position,
        date_of_birth,
        injuries (
          id,
          status,
          vas_score,
          location,
          injury_type,
          date_of_injury,
          expected_return_date
        )
      )
    `)
    .order("sort_order", { ascending: true });

  const teams = (teamsData || []).map((t) => t.name);

  const flattenedPlayers = (teamsData || []).flatMap((t) =>
    (t.players || []).map((p: any) => ({
      ...p,
      team_name: t.name,
      isScreened: true,
    }))
  );

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <MatchdayProtocolClient players={flattenedPlayers} teams={teams} />
    </div>
  );
}
