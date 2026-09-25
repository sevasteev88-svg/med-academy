import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import HydrationClient from "@/components/hydration/HydrationClient";
import type { HydrationSession } from "@/types/hydration";

export const metadata = {
  title: "Монітор гідратації та Sweat Rate · ФК «Чорноморець»",
  description: "Контроль втрати ваги до/після тренування та розрахунок регідратації",
};

export default async function HydrationPage() {
  await assertAuth();
  const supabase = await createClient();

  const [playersRes, logsRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, position, teams(name)")
      .order("last_name"),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[HYDRATION]%")
      .order("date", { ascending: false })
      .limit(100),
  ]);

  const players = (playersRes.data || []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position || "—",
    team_name: p.teams?.name || "Академія",
  }));

  const sessions: HydrationSession[] = (logsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[HYDRATION] ", "");
        return JSON.parse(rawJson) as HydrationSession;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as HydrationSession[];

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b border-blue-900/20 pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <span>💧</span> Монітор гідратації та швидкості потовиділення (Sweat Rate)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Контроль зневоднення під час літніх/високоінтенсивних тренувань для запобігання м'язових судом та травм
        </p>
      </div>

      <HydrationClient players={players} recentSessions={sessions} />
    </div>
  );
}
