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
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="border-b border-sky-500/15 pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>💧</span> Монітор гідратації та швидкості потовиділення (Sweat Rate)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Контроль зневоднення під час тренувань для запобігання м'язовим судомам та зниження ризику травм
          </p>
        </header>

        <HydrationClient players={players} recentSessions={sessions} />
      </div>
    </div>
  );
}
