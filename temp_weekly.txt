import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { INJURY_TYPE_UA, LOCATION_UA, SEVERITY_UA, STATUS_UA, TEAM_CATEGORY_UA } from "@/lib/constants";

function vasVariant(v: number): "ok"|"warn"|"danger" { if(v>=7)return"danger";if(v>=4)return"warn";return"ok"; }

export default async function WeeklyReportPage() {
  const supabase = await createClient();
  const now = new Date(); const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split("T")[0]; const todayStr = now.toISOString().split("T")[0];

  const { data: teams } = await supabase.from("teams").select("id, name, category, sort_order, players ( id, first_name, last_name, position, injuries ( id, status, vas_score ) )").order("sort_order", { ascending: true });
  const { data: newInjuries } = await supabase.from("injuries").select("*, players!inner ( first_name, last_name, teams!inner ( name ) )").gte("date_of_injury", weekAgoStr).order("date_of_injury", { ascending: false });
  const { data: closedInjuries } = await supabase.from("injuries").select("*, players!inner ( first_name, last_name, teams!inner ( name ) )").eq("status", "closed").gte("actual_return_date", weekAgoStr).order("actual_return_date", { ascending: false });
  const { data: activeInjuries } = await supabase.from("injuries").select("*, players!inner ( first_name, last_name, teams!inner ( name ) )").in("status", ["active", "rehabilitation"]).order("vas_score", { ascending: false });
  const { data: weekExams } = await supabase.from("injury_examinations").select("id").gte("date", weekAgoStr);
  const { data: weekLogs } = await supabase.from("injury_logs").select("id").gte("date", weekAgoStr);

  const allPlayers = (teams??[]).flatMap((t:any) => t.players??[]);
  function playerStatus(p:any):"ok"|"warn"|"danger" { const a=(p.injuries??[]).filter((i:any)=>i.status==="active"||i.status==="rehabilitation"); if(!a.length)return"ok"; const m=Math.max(...a.map((i:any)=>i.vas_score??0)); if(m>=7)return"danger";if(m>=4)return"warn";return"ok"; }
  const totalOk = allPlayers.filter((p:any) => playerStatus(p)==="ok").length;
  const totalWarn = allPlayers.filter((p:any) => playerStatus(p)==="warn").length;
  const totalDanger = allPlayers.filter((p:any) => playerStatus(p)==="danger").length;
  const reportDate = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
  const weekStart = weekAgo.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8"><div className="max-w-4xl mx-auto space-y-6">
      <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Дашборд</Link>
      <div className="border-b border-blue-900/15 pb-5"><h1 className="text-lg font-bold text-white tracking-tight">📋 Тижневий звіт</h1><p className="text-xs text-slate-500 mt-1">Період: {weekStart} — {reportDate}</p></div>

      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Доступність складу</h2>
        <div className="grid grid-cols-4 gap-3">
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Всього</div><div className="text-2xl font-extrabold font-mono text-white">{allPlayers.length}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Готових</div><div className="text-2xl font-extrabold font-mono text-status-ok">{totalOk}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Обмежених</div><div className="text-2xl font-extrabold font-mono text-status-warn">{totalWarn}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Травмованих</div><div className="text-2xl font-extrabold font-mono text-status-danger">{totalDanger}</div></Card>
        </div>
        <div className="mt-3 space-y-2">{(teams??[]).map((team:any)=>{const players=team.players??[];const ok=players.filter((p:any)=>playerStatus(p)==="ok").length;const pct=players.length>0?Math.round((ok/players.length)*100):100;return(<Card key={team.id}><div className="flex justify-between items-center"><div className="text-sm font-semibold text-white">{team.name}</div><div className="flex items-center gap-3"><div className="h-1.5 rounded-full bg-surface-raised w-24 overflow-hidden"><div className="h-full rounded-full bg-status-ok transition-all" style={{width:`${pct}%`}}/></div><span className="text-xs font-mono text-slate-400">{ok}/{players.length}</span></div></div></Card>);})}</div>
      </section>

      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Нові травми ({(newInjuries??[]).length})</h2>
        {(newInjuries??[]).length===0?<Card><p className="text-status-ok text-sm text-center py-3">Нових травм не зафіксовано ✓</p></Card>:
        <div className="space-y-2">{(newInjuries??[]).map((inj:any)=>(<Link key={inj.id} href={`/injuries/${inj.id}`}><Card interactive accent={inj.vas_score>=7?"danger":"warn"}><div className="flex justify-between items-start gap-3"><div><div className="font-bold text-white text-sm">{inj.players.last_name} {inj.players.first_name}</div><div className="text-xs text-slate-500 mt-0.5">{inj.players.teams.name} · {INJURY_TYPE_UA[inj.injury_type]} — {LOCATION_UA[inj.location]} · {SEVERITY_UA[inj.severity]}</div></div><Badge variant={vasVariant(inj.vas_score)}>ВАШ {inj.vas_score}/10</Badge></div></Card></Link>))}</div>}
      </section>

      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Повернулися ({(closedInjuries??[]).length})</h2>
        {(closedInjuries??[]).length===0?<Card><p className="text-slate-500 text-sm text-center py-3">Повернень не було</p></Card>:
        <div className="space-y-2">{(closedInjuries??[]).map((inj:any)=>(<Card key={inj.id}><div className="flex justify-between items-center"><div><div className="text-sm font-semibold text-white">{inj.players.last_name} {inj.players.first_name}</div><div className="text-xs text-slate-500">{inj.players.teams.name} · {INJURY_TYPE_UA[inj.injury_type]}{inj.days_missed!=null&&<> · {inj.days_missed} дн.</>}</div></div><Badge variant="ok">Повернувся</Badge></div></Card>))}</div>}
      </section>

      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Активні травми ({(activeInjuries??[]).length})</h2>
        {(activeInjuries??[]).length===0?<Card><p className="text-status-ok text-sm text-center py-3">Активних травм немає ✓</p></Card>:
        <div className="space-y-2">{(activeInjuries??[]).map((inj:any)=>(<Link key={inj.id} href={`/injuries/${inj.id}`}><Card interactive accent={inj.vas_score>=7?"danger":"warn"}><div className="flex justify-between items-start gap-3"><div><div className="text-sm font-semibold text-white">{inj.players.last_name} {inj.players.first_name}</div><div className="text-xs text-slate-500 mt-0.5">{inj.players.teams.name} · {INJURY_TYPE_UA[inj.injury_type]} — {LOCATION_UA[inj.location]}</div>{inj.expected_return_date&&<div className="text-xs text-slate-600 mt-0.5">Повернення: {new Date(inj.expected_return_date).toLocaleDateString("uk-UA")}</div>}</div><div className="flex flex-col items-end gap-1"><Badge variant={vasVariant(inj.vas_score)}>ВАШ {inj.vas_score}/10</Badge><Badge variant={inj.status==="active"?"danger":"warn"}>{STATUS_UA[inj.status]}</Badge></div></div></Card></Link>))}</div>}
      </section>

      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Активність за тиждень</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Оглядів</div><div className="text-2xl font-extrabold font-mono text-white">{(weekExams??[]).length}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Записів</div><div className="text-2xl font-extrabold font-mono text-white">{(weekLogs??[]).length}</div></Card>
        </div>
      </section>

      <div className="text-center text-xs text-slate-600 pt-4 border-t border-blue-900/15">ФК «Чорноморець» · Медичний штаб · {reportDate}</div>
    </div></div>
  );
}
