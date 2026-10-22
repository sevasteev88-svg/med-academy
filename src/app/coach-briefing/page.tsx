import { createClient } from "@/utils/supabase/server";
import { getPlayerAvailability } from "@/lib/availability";
import CoachBriefingClient, { BriefingPlayer } from "@/components/coach/CoachBriefingClient";

export default async function CoachBriefingPage() {
  const supabase = await createClient();

  // 1. Отримуємо команди клубу для фільтрів
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (teamsData ?? []).map((t) => ({ id: t.id, name: t.name }));

  // 2. Єдине джерело доступності гравців
  const availabilityReport = await getPlayerAvailability();

  const briefingPlayers: BriefingPlayer[] = availabilityReport.players.map((p) => ({
    id: p.id,
    name: p.fullName,
    position: p.position,
    team_id: p.team_id || "",
    team_name: p.team_name ?? "—",
    category: p.team_category ?? "academy",
    status: p.status,
    restriction_notes: p.restriction_notes,
    max_minutes: p.max_minutes,
    injury_summary: p.injury_summary,
  }));

  return <CoachBriefingClient teams={teams} players={briefingPlayers} />;
}
