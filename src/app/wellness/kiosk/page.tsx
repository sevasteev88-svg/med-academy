import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import KioskWellnessClient from "@/components/wellness/KioskWellnessClient";
import type { WellnessSurvey } from "@/types/wellness";

export const metadata = {
  title: "Планшетний режим (Kiosk) · Велнес Академії",
  description: "Швидкий чекін стану гравців у роздягальні",
};

export default async function KioskWellnessPage() {
  await assertAuth();
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, teams(name)")
    .order("last_name");

  const today = new Date().toISOString().split("T")[0];

  // Fetch today surveys
  let surveysMap: Record<string, WellnessSurvey> = {};

  const { data: directSurveys } = await supabase
    .from("wellness_surveys")
    .select("*")
    .eq("date", today);

  if (directSurveys && directSurveys.length > 0) {
    directSurveys.forEach((s: any) => {
      surveysMap[s.player_id] = s;
    });
  } else {
    // Fallback: injury_logs
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("*")
      .eq("date", today)
      .like("note", "[WELLNESS]%");

    if (logs) {
      logs.forEach((l) => {
        try {
          const raw = l.note.replace("[WELLNESS] ", "");
          const parsed = JSON.parse(raw);
          if (parsed && parsed.player_id) {
            surveysMap[parsed.player_id] = parsed;
          }
        } catch {}
      });
    }
  }

  const flattenedPlayers = (players || []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position || "—",
    team_name: p.teams?.name || "Академія",
  }));

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 sm:p-6 max-w-7xl mx-auto">
      <KioskWellnessClient players={flattenedPlayers} todaySurveys={surveysMap} />
    </div>
  );
}
