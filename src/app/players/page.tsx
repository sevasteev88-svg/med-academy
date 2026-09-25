import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PlayerSearch from "@/components/players/PlayerSearch";
import { POSITION_LABELS, TEAM_CATEGORY_UA } from "@/lib/constants";
import { playerStatus } from "@/lib/player-status";

function calcAge(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select(`
      id, name, category, sort_order,
      players (
        id, first_name, last_name, date_of_birth, position,
        injuries ( id, status, vas_score )
      )
    `)
    .order("sort_order", { ascending: true });

  // Фільтр пошуку
  const searchQuery = q?.toLowerCase() ?? "";

  function filterPlayers(teamList: any[]) {
    if (!searchQuery) return teamList;
    return teamList.map((team: any) => ({
      ...team,
      players: (team.players ?? []).filter((p: any) =>
        p.last_name.toLowerCase().includes(searchQuery) ||
        p.first_name.toLowerCase().includes(searchQuery)
      ),
    })).filter((team: any) => team.players.length > 0);
  }

  const youth = filterPlayers((teams ?? []).filter((t: any) => t.category === "youth"));
  const academy = filterPlayers((teams ?? []).filter((t: any) => t.category === "academy"));
  const totalFiltered = [...youth, ...academy].reduce((s, t: any) => s + (t.players?.length ?? 0), 0);

  

  function statusLabel(s: "ok" | "warn" | "danger"): string {
    if (s === "ok") return "Готовий";
    if (s === "warn") return "Обмежений";
    return "Травмований";
  }

  function renderTeamGroup(label: string, teamList: any[]) {
    if (teamList.length === 0) return null;
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono font-bold text-sky-400 tracking-wider">
            {label}
          </span>
          <div className="flex-1 h-px bg-sky-500/15" />
        </div>

        {teamList.map((team: any) => (
          <div key={team.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚽</span> {team.name}
              </h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-2.5 py-0.5 rounded-full border border-slate-800">
                {(team.players ?? []).length} гравців
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(team.players ?? [])
                .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name, "uk"))
                .map((player: any) => {
                  const status = playerStatus(player);
                  const initials = `${player.last_name?.[0] ?? ""}${player.first_name?.[0] ?? ""}`;
                  return (
                    <Link key={player.id} href={`/players/${player.id}`} className="group block">
                      <Card interactive accent={status === "ok" ? null : status} className="p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Аватар з ініціалами */}
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-sky-500/20 group-hover:border-sky-400/50 flex items-center justify-center font-bold font-mono text-xs text-sky-300 shrink-0 shadow-inner">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-white text-sm truncate group-hover:text-sky-300 transition-colors">
                                {player.last_name} {player.first_name}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <span className="font-mono text-slate-300 px-1.5 py-0.2 rounded bg-slate-800/80 text-[10px] font-semibold border border-slate-700/60">
                                  {POSITION_LABELS[player.position] ?? player.position}
                                </span>
                                <span>·</span>
                                <span>{calcAge(player.date_of_birth)} р.</span>
                              </div>
                            </div>
                          </div>
                          <Badge variant={status}>{statusLabel(status)}</Badge>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-sky-500/15">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">👥</span>
              <h1 className="text-2xl font-black text-white tracking-tight">Реєстр футболістів</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              База гравців Академії та молодіжного складу ФК «Чорноморець»
              {searchQuery && (
                <span className="text-sky-400 ml-1">· Знайдено: {totalFiltered}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-initial">
              <PlayerSearch />
            </div>
            <Link
              href="/players/new"
              className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-lg shadow-sky-600/20 active:scale-95 whitespace-nowrap flex items-center gap-1.5"
            >
              <span>+</span> Додати гравця
            </Link>
          </div>
        </div>

        {renderTeamGroup(TEAM_CATEGORY_UA.youth, youth)}
        {renderTeamGroup(TEAM_CATEGORY_UA.academy, academy)}

        {totalFiltered === 0 && (
          <Card className="text-center py-12">
            <span className="text-3xl block mb-2">🔍</span>
            <p className="text-sm font-semibold text-slate-300">
              {searchQuery
                ? `Гравців з прізвищем «${q}» не знайдено`
                : "Гравців ще не додано. Натисніть «+ Додати гравця» щоб почати."
              }
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
