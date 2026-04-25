import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { POSITION_LABELS, TEAM_CATEGORY_UA } from "@/lib/constants";

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

const statusConfig = {
  ok:     { bg: "bg-status-ok",     label: "Готовий",      ring: "" },
  warn:   { bg: "bg-status-warn",   label: "Обмежений",   ring: "ring-2 ring-status-warn/30" },
  danger: { bg: "bg-status-danger", label: "Травмований",  ring: "ring-2 ring-status-danger/30" },
};

export default async function AvailabilityPage() {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select(`
      id, name, category, sort_order,
      players (
        id, first_name, last_name, position,
        injuries ( id, status, vas_score, location )
      )
    `)
    .order("sort_order", { ascending: true });

  const youth = (teams ?? []).filter((t: any) => t.category === "youth");
  const academy = (teams ?? []).filter((t: any) => t.category === "academy");

  // Загальна статистика
  const allPlayers = (teams ?? []).flatMap((t: any) => t.players ?? []);
  const totalOk = allPlayers.filter((p: any) => playerStatus(p) === "ok").length;
  const totalWarn = allPlayers.filter((p: any) => playerStatus(p) === "warn").length;
  const totalDanger = allPlayers.filter((p: any) => playerStatus(p) === "danger").length;

  function renderTeam(team: any) {
    const players = (team.players ?? []).sort((a: any, b: any) =>
      a.last_name.localeCompare(b.last_name, "uk")
    );
    const ok = players.filter((p: any) => playerStatus(p) === "ok").length;
    const total = players.length;

    return (
      <div key={team.id}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-bold text-white">{team.name}</h3>
          <span className="text-xs text-slate-500">
            {ok}/{total} доступних
          </span>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {players.map((player: any) => {
            const status = playerStatus(player);
            const cfg = statusConfig[status];
            const activeInjury = (player.injuries ?? []).find(
              (i: any) => i.status === "active" || i.status === "rehabilitation"
            );

            return (
              <Link key={player.id} href={`/players/${player.id}`}>
                <div
                  className={`
                    rounded-lg p-2 text-center transition-all cursor-pointer
                    hover:scale-105 ${cfg.ring}
                    ${status === "ok" ? "bg-status-ok/[0.08]" : status === "warn" ? "bg-status-warn/[0.08]" : "bg-status-danger/[0.08]"}
                  `}
                >
                  {/* Кружок статусу */}
                  <div className={`w-8 h-8 mx-auto rounded-full ${cfg.bg}/20 flex items-center justify-center mb-1`}>
                    <div className={`w-3 h-3 rounded-full ${cfg.bg}`} />
                  </div>
                  <div className="text-[11px] font-bold text-white truncate">
                    {player.last_name}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {POSITION_LABELS[player.position] ?? player.position}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="pb-5 border-b border-blue-900/15">
          <h1 className="text-lg font-bold text-white tracking-tight">Доступність гравців</h1>
          <p className="text-xs text-slate-500 mt-1">Огляд готовності до тренувань та матчів</p>
        </header>

        {/* Зведена */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-status-ok" />
              <div>
                <div className="text-2xl font-extrabold font-mono text-status-ok">{totalOk}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Готових</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-status-warn" />
              <div>
                <div className="text-2xl font-extrabold font-mono text-status-warn">{totalWarn}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Обмежених</div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-status-danger" />
              <div>
                <div className="text-2xl font-extrabold font-mono text-status-danger">{totalDanger}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Травмованих</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Легенда */}
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-status-ok" /> Готовий</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-status-warn" /> Обмежений (ВАШ 4-6)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-status-danger" /> Травмований (ВАШ 7+)</span>
        </div>

        {/* Молодіжка */}
        {youth.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{TEAM_CATEGORY_UA.youth}</h2>
            {youth.map(renderTeam)}
          </section>
        )}

        {/* Академія */}
        {academy.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{TEAM_CATEGORY_UA.academy}</h2>
            {academy.map(renderTeam)}
          </section>
        )}
      </div>
    </div>
  );
}
