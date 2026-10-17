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

  // 1. Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (teamsData || []).map((t) => t.name);

  // 2. Отримуємо статус доступності гравців через coach_player_availability_view
  let flattenedPlayers: any[] = [];

  const { data: viewData, error: viewError } = await supabase
    .from("coach_player_availability_view")
    .select("*")
    .order("team_sort_order", { ascending: true })
    .order("last_name", { ascending: true });

  if (!viewError && viewData && viewData.length > 0) {
    flattenedPlayers = viewData.map((row: any) => ({
      id: row.player_id,
      first_name: row.first_name,
      last_name: row.last_name,
      position: row.position,
      date_of_birth: row.date_of_birth,
      team_name: row.team_name,
      availability_status: row.availability_status,
      max_minutes: row.max_minutes,
      restriction_notes: row.restriction_notes,
      days_missed: row.days_missed,
      expected_return_date: row.expected_return_date,
      isScreened: true,
      injuries: [],
    }));
  } else {
    // Резервний фолбек (до застосування міграції)
    const { data: fallbackData } = await supabase
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
            date_of_injury,
            expected_return_date
          )
        )
      `)
      .order("sort_order", { ascending: true });

    flattenedPlayers = (fallbackData || []).flatMap((t) =>
      (t.players || []).map((p: any) => {
        const activeInjuries = (p.injuries || []).filter(
          (i: any) => i.status === "active" || i.status === "rehabilitation"
        );
        const hasActive = activeInjuries.some((i: any) => i.status === "active");
        const hasRehab = activeInjuries.some((i: any) => i.status === "rehabilitation");

        let status: "available" | "restricted" | "unavailable" = "available";
        let restrictionNotes = "Повний допуск без обмежень";
        let maxMinutes = 90;

        if (hasActive) {
          status = "unavailable";
          maxMinutes = 0;
          restrictionNotes = "Повний спокій / лазарет. Не допущений до матчу.";
        } else if (hasRehab) {
          status = "restricted";
          maxMinutes = 45;
          restrictionNotes = "Обмежений допуск: до 45 хвилин гри.";
        }

        const latestInj = activeInjuries[0];
        let daysMissed: number | null = null;
        if (latestInj?.date_of_injury) {
          const diffMs = Date.now() - new Date(latestInj.date_of_injury).getTime();
          daysMissed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }

        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          position: p.position,
          date_of_birth: p.date_of_birth,
          team_name: t.name,
          availability_status: status,
          max_minutes: maxMinutes,
          restriction_notes: restrictionNotes,
          days_missed: daysMissed,
          expected_return_date: latestInj?.expected_return_date ?? null,
          isScreened: true,
          injuries: [],
        };
      })
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <MatchdayProtocolClient players={flattenedPlayers} teams={teams} />
    </div>
  );
}
