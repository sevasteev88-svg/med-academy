import { createClient } from "@/utils/supabase/server";
import CoachBriefingClient, { BriefingPlayer } from "@/components/coach/CoachBriefingClient";

export default async function CoachBriefingPage() {
  const supabase = await createClient();

  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  const { data: playersData } = await supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      position,
      team_id,
      teams ( id, name, category ),
      injuries (
        id,
        status,
        description,
        location,
        injury_type,
        vas_score
      ),
      maturation_assessments (
        risk_zone,
        growth_phase
      )
    `);

  const teams = (teamsData ?? []).map((t) => ({ id: t.id, name: t.name }));

  const briefingPlayers: BriefingPlayer[] = (playersData ?? []).map((p: any) => {
    const activeInjuries = (p.injuries ?? []).filter((i: any) => i.status === "active" || i.status === "rehabilitation");
    const hasActive = activeInjuries.some((i: any) => i.status === "active");
    const hasRehab = activeInjuries.some((i: any) => i.status === "rehabilitation");

    let status: "available" | "restricted" | "unavailable" = "available";
    let restrictionNotes = "";
    let maxMinutes: number | undefined = undefined;
    let injurySummary = "";

    if (hasActive) {
      status = "unavailable";
      const inj = activeInjuries.find((i: any) => i.status === "active");
      injurySummary = inj?.description || inj?.injury_type || "Активна травма";
    } else if (hasRehab) {
      status = "restricted";
      const inj = activeInjuries.find((i: any) => i.status === "rehabilitation");
      injurySummary = inj?.description || inj?.injury_type || "Фаза реабілітації";
      maxMinutes = 45;
      restrictionNotes = "Обмеження до 45 хвилин. Уникати контактних ударів по ушкодженій кінцівці.";
    } else {
      const latestMat = (p.maturation_assessments ?? [])[0];
      if (latestMat?.risk_zone === "red") {
        status = "restricted";
        maxMinutes = 60;
        restrictionNotes = "Піковий ріст (PHV). Знизити ударне осьове навантаження.";
      }
    }

    return {
      id: p.id,
      name: (p.last_name + " " + p.first_name).trim(),
      position: p.position,
      team_id: p.team_id,
      team_name: p.teams?.name ?? "—",
      category: p.teams?.category ?? "academy",
      status,
      restriction_notes: restrictionNotes,
      max_minutes: maxMinutes,
      injury_summary: injurySummary,
    };
  });

  return <CoachBriefingClient teams={teams} players={briefingPlayers} />;
}
