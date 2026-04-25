import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PlayerSearch from "@/components/players/PlayerSearch";
import { POSITION_LABELS, TEAM_CATEGORY_UA } from "@/lib/constants";

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

  function playerStatus(player: any): "ok" | "warn" | "danger" {
    const active = (player.injuries ?? []).filter(
      (i: any) => i.status === "active" || i.status === "rehabilitation"
    );
    if (active.length === 0) return "ok";
    const maxVas = Math.max(...active.map((i: any) => i.vas_score ?? 0));
    if (maxVas >= 7) return "danger";
    if (maxVas >= 4) return "warn";
    return "ok";
  }

  function statusLabel(s: "ok" | "warn" | "danger"): string {
    if (s === "ok") return "Готовий";
    if (s === "warn") return "Обмежений";
    return "Травмований";
  }

  function renderTeamGroup(label: string, teamList: any[]) {
    if (teamList.length === 0) return null;
    return (
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {label}
        </h2>
        {teamList.map((team: any) => (
          <div key={team.id} className="mb-6">
            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              {team.name}
              <span className="text-xs font-normal text-slate-500">
                ({(team.players ?? []).length} гравців)
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(team.players ?? [])
                .sort((a: any, b: any) => a.last_name.localeCompare(b.last_name, "uk"))
                .map((player: any) => {
                  const status = playerStatus(player);
                  return (
                    <Link key={player.id} href={`/players/${player.id}`}>
                      <Card interactive accent={status === "ok" ? null : status}>
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-bold text-white">
                              {player.last_name} {player.first_name.charAt(0)}.
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {POSITION_LABELS[player.position] ?? player.position} · {calcAge(player.date_of_birth)} р.
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
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-blue-900/15">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Реєстр гравців</h1>
            {searchQuery && (
              <p className="text-xs text-slate-500 mt-1">
                Знайдено: {totalFiltered} гравців
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PlayerSearch />
            <Link
              href="/players/new"
              className="bg-brand-blue hover:bg-brand-blue-light text-white font-bold py-2.5 px-5 rounded-lg text-sm transition-colors shadow-glow-sm hover:shadow-glow whitespace-nowrap"
            >
              + Додати
            </Link>
          </div>
        </div>

        {renderTeamGroup(TEAM_CATEGORY_UA.youth, youth)}
        {renderTeamGroup(TEAM_CATEGORY_UA.academy, academy)}

        {totalFiltered === 0 && (
          <Card>
            <p className="text-slate-500 text-center py-8">
              {searchQuery
                ? `Гравців з прізвищем «${q}» не знайдено`
                : "Гравців ще не додано. Натисніть «+ Додати» щоб почати."
              }
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
