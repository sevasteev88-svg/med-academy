import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Image from "next/image";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { LOCATION_UA, POSITION_LABELS, TEAM_CATEGORY_UA } from "@/lib/constants";

function daysUntil(d: string) { return Math.floor((new Date(d).getTime() - Date.now()) / 86400000); }

function playerStatus(player: any): "ok" | "warn" | "danger" {
  const active = (player.injuries ?? []).filter((i: any) => i.status === "active" || i.status === "rehabilitation");
  if (active.length === 0) return "ok";
  const maxVas = Math.max(...active.map((i: any) => i.vas_score ?? 0));
  if (maxVas >= 7) return "danger";
  if (maxVas >= 4) return "warn";
  return "ok";
}

const statusLabel: Record<string, string> = { ok: "Готовий", warn: "Обмежений", danger: "Травмований" };

export default async function CoachDashboard() {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, category, sort_order, players ( id, first_name, last_name, position, injuries ( id, status, vas_score, location, expected_return_date ) )")
    .order("sort_order", { ascending: true });

  const allPlayers = (teams ?? []).flatMap((t: any) => (t.players ?? []).map((p: any) => ({ ...p, teamName: t.name })));
  const totalOk = allPlayers.filter((p: any) => playerStatus(p) === "ok").length;
  const totalWarn = allPlayers.filter((p: any) => playerStatus(p) === "warn").length;
  const totalDanger = allPlayers.filter((p: any) => playerStatus(p) === "danger").length;

  // Очікувані повернення
  const injured = allPlayers.filter((p: any) => {
    const active = (p.injuries ?? []).find((i: any) => (i.status === "active" || i.status === "rehabilitation") && i.expected_return_date);
    return !!active;
  }).map((p: any) => {
    const inj = (p.injuries ?? []).find((i: any) => (i.status === "active" || i.status === "rehabilitation") && i.expected_return_date);
    return { ...p, expectedReturn: inj.expected_return_date, injLocation: inj.location };
  }).sort((a: any, b: any) => new Date(a.expectedReturn).getTime() - new Date(b.expectedReturn).getTime());

  const youth = (teams ?? []).filter((t: any) => t.category === "youth");
  const academy = (teams ?? []).filter((t: any) => t.category === "academy");

  function renderTeam(team: any) {
    const players = (team.players ?? []).sort((a: any, b: any) => a.last_name.localeCompare(b.last_name, "uk"));
    const ok = players.filter((p: any) => playerStatus(p) === "ok").length;
    return (
      <div key={team.id} className="mb-5">
        <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
          {team.name} <span className="text-xs font-normal text-slate-500">{ok}/{players.length} доступних</span>
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {players.map((p: any) => {
            const s = playerStatus(p);
            return (
              <div key={p.id} className={`rounded-lg p-2 text-center ${s === "ok" ? "bg-status-ok/[0.06]" : s === "warn" ? "bg-status-warn/[0.06]" : "bg-status-danger/[0.06]"}`}>
                <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${s === "ok" ? "bg-status-ok" : s === "warn" ? "bg-status-warn" : "bg-status-danger"}`} />
                <div className="text-[11px] font-bold text-white truncate">{p.last_name}</div>
                <div className="text-[9px] text-slate-500">{POSITION_LABELS[p.position] ?? p.position}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center gap-4 pb-5 border-b border-blue-900/15">
          <Image src="/logo-chr.png" alt="ФК Чорноморець" width={40} height={40} className="rounded-full" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Доступність складу</h1>
            <p className="text-xs text-slate-500">ФК «Чорноморець» · Панель тренера</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-status-ok" /><div><div className="text-2xl font-extrabold font-mono text-status-ok">{totalOk}</div><div className="text-[10px] text-slate-500 uppercase">Готових</div></div></div></Card>
          <Card><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-status-warn" /><div><div className="text-2xl font-extrabold font-mono text-status-warn">{totalWarn}</div><div className="text-[10px] text-slate-500 uppercase">Обмежених</div></div></div></Card>
          <Card><div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-status-danger" /><div><div className="text-2xl font-extrabold font-mono text-status-danger">{totalDanger}</div><div className="text-[10px] text-slate-500 uppercase">Травмованих</div></div></div></Card>
        </div>

        {injured.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Очікувані повернення</h2>
            <div className="space-y-2">
              {injured.map((p: any) => {
                const days = daysUntil(p.expectedReturn);
                const isOverdue = days < 0;
                return (
                  <Card key={p.id}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-semibold text-white">{p.last_name} {p.first_name}</div>
                        <div className="text-xs text-slate-500">{p.teamName} · {POSITION_LABELS[p.position]} · {LOCATION_UA[p.injLocation] ?? p.injLocation}</div>
                      </div>
                      <Badge variant={isOverdue ? "danger" : days <= 3 ? "warn" : "neutral"}>
                        {isOverdue ? `Прострочено ${Math.abs(days)} дн.` : days === 0 ? "Сьогодні" : `Через ${days} дн.`}
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {youth.length > 0 && <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{TEAM_CATEGORY_UA.youth}</h2>{youth.map(renderTeam)}</section>}
        {academy.length > 0 && <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{TEAM_CATEGORY_UA.academy}</h2>{academy.map(renderTeam)}</section>}
      </div>
    </div>
  );
}
