import { createClient } from "@/utils/supabase/server";
import CoachBriefingClient, { BriefingPlayer } from "@/components/coach/CoachBriefingClient";

export default async function CoachBriefingPage() {
  const supabase = await createClient();

  // 1. Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (teamsData ?? []).map((t) => ({ id: t.id, name: t.name }));

  // 2. Отримуємо безпечні дані доступності з coach_player_availability_view (без клінічних діагнозів)
  const { data: viewData, error: viewError } = await supabase
    .from("coach_player_availability_view")
    .select("*")
    .order("team_sort_order", { ascending: true });

  let briefingPlayers: BriefingPlayer[] = [];

  if (!viewError && viewData && viewData.length > 0) {
    briefingPlayers = viewData.map((row: any) => ({
      id: row.player_id,
      name: `${row.last_name} ${row.first_name}`.trim(),
      position: row.position,
      team_id: row.team_id,
      team_name: row.team_name ?? "—",
      category: row.team_category ?? "academy",
      status: row.availability_status as "available" | "restricted" | "unavailable",
      restriction_notes: row.restriction_notes,
      max_minutes: row.max_minutes,
      injury_summary:
        row.availability_status === "unavailable"
          ? "Лазарет / відновлювальний період"
          : row.availability_status === "restricted"
          ? row.restriction_notes || "Обмежене тренувальне навантаження"
          : "Повний допуск до тренувань",
    }));
  } else {
    // Резервний фолбек (до застосування міграції з представленням у тестовій базі)
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
          status
        )
      `);

    briefingPlayers = (playersData ?? []).map((p: any) => {
      const activeInjuries = (p.injuries ?? []).filter(
        (i: any) => i.status === "active" || i.status === "rehabilitation"
      );
      const hasActive = activeInjuries.some((i: any) => i.status === "active");
      const hasRehab = activeInjuries.some((i: any) => i.status === "rehabilitation");

      let status: "available" | "restricted" | "unavailable" = "available";
      let restrictionNotes = "Повний допуск без обмежень";
      let maxMinutes = 90;
      let injurySummary = "Повний допуск до тренувань";

      if (hasActive) {
        status = "unavailable";
        maxMinutes = 0;
        restrictionNotes = "Повний спокій / лазарет. Не допущений до занять.";
        injurySummary = "Лазарет / медичне відновлення";
      } else if (hasRehab) {
        status = "restricted";
        maxMinutes = 45;
        restrictionNotes = "Реабілітаційний режим: ліміт 45 хв, безконтактні вправи.";
        injurySummary = "Обмеження до 45 хв (реабілітація)";
      }

      return {
        id: p.id,
        name: `${p.last_name} ${p.first_name}`.trim(),
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
  }

  return <CoachBriefingClient teams={teams} players={briefingPlayers} />;
}
