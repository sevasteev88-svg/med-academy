import { createClient } from "@/utils/supabase/server";
import Card from "@/components/ui/Card";
import { INJURY_TYPE_UA, LOCATION_UA, SEVERITY_UA, MECHANISM_UA, POSITION_LABELS, TEAM_CATEGORY_UA } from "@/lib/constants";

function daysSince(d:string){return Math.floor((Date.now()-new Date(d).getTime())/86400000);}
function calcDaysMissed(i:any):number{if(i.actual_return_date)return Math.max(0,Math.floor((new Date(i.actual_return_date).getTime()-new Date(i.date_of_injury).getTime())/86400000));if(i.status==="active"||i.status==="rehabilitation")return daysSince(i.date_of_injury);return 0;}

export default async function StatisticsPage() {
  const supabase = await createClient();
  const { data: allInjuries } = await supabase.from("injuries").select("*, players!inner ( first_name, last_name, position, teams!inner ( id, name, category ) )").order("date_of_injury", { ascending: false });
  const { data: teams } = await supabase.from("teams").select("id, name, category, sort_order, players ( id )").order("sort_order", { ascending: true });
  const injuries = allInjuries ?? [];
  const totalInjuries = injuries.length;
  const totalDaysMissed = injuries.reduce((s,i) => s + calcDaysMissed(i), 0);
  const activeCount = injuries.filter(i => i.status === "active").length;
  const rehabCount = injuries.filter(i => i.status === "rehabilitation").length;
  const closedCount = injuries.filter(i => i.status === "closed").length;
  const avgDaysMissed = closedCount > 0 ? Math.round(injuries.filter(i=>i.status==="closed").reduce((s,i)=>s+calcDaysMissed(i),0)/closedCount) : 0;

  function buildRanking(key:string, labelMap:Record<string,string>) {
    const map:Record<string,{count:number;days:number}> = {};
    for (const inj of injuries) { const val=(inj as any)[key] as string; if(!map[val])map[val]={count:0,days:0}; map[val].count++; map[val].days+=calcDaysMissed(inj); }
    return Object.entries(map).map(([k,v])=>({name:labelMap[k]??k,count:v.count,days:v.days})).sort((a,b)=>b.count-a.count);
  }
  const byType=buildRanking("injury_type",INJURY_TYPE_UA); const byLocation=buildRanking("location",LOCATION_UA);
  const bySeverity=buildRanking("severity",SEVERITY_UA); const byMechanism=buildRanking("mechanism",MECHANISM_UA);

  const posByPos:Record<string,{count:number;days:number}> = {};
  for (const inj of injuries) { const pos=(inj as any).players.position; if(!posByPos[pos])posByPos[pos]={count:0,days:0}; posByPos[pos].count++; posByPos[pos].days+=calcDaysMissed(inj); }
  const byPosition = Object.entries(posByPos).map(([k,v])=>({name:POSITION_LABELS[k]??k,count:v.count,days:v.days})).sort((a,b)=>b.count-a.count);

  const teamStats:Record<string,{name:string;category:string;totalPlayers:number;injuries:number;days:number}> = {};
  for (const team of (teams??[])) { teamStats[team.id]={name:team.name,category:team.category,totalPlayers:(team.players??[]).length,injuries:0,days:0}; }
  for (const inj of injuries) { const tid=(inj as any).players.teams.id; if(teamStats[tid]){teamStats[tid].injuries++;teamStats[tid].days+=calcDaysMissed(inj);} }
  const byTeam = Object.values(teamStats).sort((a,b)=>b.injuries-a.injuries);

  const playerDays:Record<string,{name:string;team:string;days:number;count:number}> = {};
  for (const inj of injuries) { const pid=(inj as any).players.last_name+" "+(inj as any).players.first_name; if(!playerDays[pid])playerDays[pid]={name:pid,team:(inj as any).players.teams.name,days:0,count:0}; playerDays[pid].days+=calcDaysMissed(inj); playerDays[pid].count++; }
  const topMissed = Object.values(playerDays).sort((a,b)=>b.days-a.days).slice(0,5);
  // ── Класифікатор: грейди MLG-R (живі дані) ──
  const muscularInjuries = injuries.filter((i: any) => i.injury_type === "muscular");
  const gradeMap: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0 };
  let gradedCount = 0;
  for (const inj of injuries) {
    if ((inj as any).mlgr_grade != null) {
      gradeMap[String((inj as any).mlgr_grade)] = (gradeMap[String((inj as any).mlgr_grade)] ?? 0) + 1;
      gradedCount++;
    }
  }
  const gradeRows = ["0", "1", "2", "3"].map((g) => ({ grade: g, count: gradeMap[g] ?? 0 }));

  // ── Рецидиви (заглушка поки немає даних) ──
  const reinjuryCount = injuries.filter((i: any) => (i.mlgr_reinjury ?? 0) > 0).length;

  // ── RTP прогноз vs факт (заглушка: потрібні закриті класифіковані травми) ──
  const closedClassified = injuries.filter(
    (i: any) => i.status === "closed" && i.is_classified
  );

  function RankingCard({title,items,colorClass}:{title:string;items:{name:string;count:number;days:number}[];colorClass:string}) {
    if(!items.length)return null; const max=Math.max(1,...items.map(i=>i.count));
    return (<Card><div className="text-xs text-slate-500 mb-3 font-semibold">{title}</div><div className="space-y-2">{items.map(item=>(<div key={item.name} className="flex justify-between items-center"><span className="text-sm text-slate-300 min-w-0 truncate">{item.name}</span><div className="flex items-center gap-2 shrink-0"><div className={`h-1.5 rounded-full ${colorClass}/30 w-16 overflow-hidden`}><div className={`h-full rounded-full ${colorClass}`} style={{width:`${(item.count/max)*100}%`}}/></div><span className="text-xs font-mono text-slate-400 w-8 text-right">{item.count}</span><span className="text-[10px] text-slate-600 w-14 text-right">{item.days} дн.</span></div></div>))}</div></Card>);
  }

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8"><div className="max-w-5xl mx-auto space-y-6">
      <header className="pb-5 border-b border-blue-900/15"><h1 className="text-lg font-bold text-white tracking-tight">📊 Статистика травм</h1><p className="text-xs text-slate-500 mt-1">Зведена аналітика за весь час</p></header>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Всього</div><div className="text-2xl font-extrabold font-mono text-white">{totalInjuries}</div></Card>
        <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Днів пропущено</div><div className="text-2xl font-extrabold font-mono text-status-danger">{totalDaysMissed}</div></Card>
        <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Активних</div><div className="text-2xl font-extrabold font-mono text-status-danger">{activeCount}</div></Card>
        <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Реабілітація</div><div className="text-2xl font-extrabold font-mono text-status-warn">{rehabCount}</div></Card>
        <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Сер. пропуск</div><div className="text-2xl font-extrabold font-mono text-white">{avgDaysMissed}</div></Card>
      </div>
      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">По командах</h2><div className="grid gap-3 md:grid-cols-2">{byTeam.map(t=>(<Card key={t.name}><div className="flex justify-between items-center"><div><div className="text-sm font-bold text-white">{t.name}</div><div className="text-xs text-slate-500">{t.totalPlayers} гравців · {TEAM_CATEGORY_UA[t.category]}</div></div><div className="text-right"><div className="text-lg font-extrabold font-mono text-white">{t.injuries}</div><div className="text-[10px] text-slate-500">{t.days} дн.</div></div></div></Card>))}</div></section>
      <div className="grid md:grid-cols-2 gap-3">
        <RankingCard title="По типу" items={byType} colorClass="bg-status-danger" />
        <RankingCard title="По локалізації" items={byLocation} colorClass="bg-status-warn" />
        <RankingCard title="По тяжкості" items={bySeverity} colorClass="bg-blue-500" />
        <RankingCard title="По позиції" items={byPosition} colorClass="bg-purple-500" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <RankingCard title="По механізму" items={byMechanism} colorClass="bg-cyan-500" />
        <Card><div className="text-xs text-slate-500 mb-3 font-semibold">Топ пропущених днів</div><div className="space-y-2">{topMissed.map((p,i)=>(<div key={p.name} className="flex justify-between items-center"><div className="flex items-center gap-2 min-w-0"><span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i===0?"bg-status-danger/20 text-status-danger":i===1?"bg-status-warn/20 text-status-warn":"bg-slate-800 text-slate-500"}`}>{i+1}</span><div className="min-w-0"><div className="text-sm text-white truncate">{p.name}</div><div className="text-[10px] text-slate-600">{p.team} · {p.count} травм</div></div></div><span className="text-sm font-mono font-bold text-status-danger shrink-0">{p.days} дн.</span></div>))}</div></Card>
      </div>
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Класифікатор м'язових травм</h2>
        <div className="grid md:grid-cols-3 gap-3">

          {/* Грейди MLG-R — живі дані */}
          <Card>
            <div className="text-xs text-slate-500 mb-3 font-semibold">Грейди MLG-R</div>
            {gradedCount === 0 ? (
              <p className="text-xs text-slate-600 py-2">Немає класифікованих травм</p>
            ) : (
              <div className="space-y-2">
                {gradeRows.map((r) => {
                  const max = Math.max(1, ...gradeRows.map((x) => x.count));
                  return (
                    <div key={r.grade} className="flex justify-between items-center">
                      <span className="text-sm text-slate-300">Grade {r.grade}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="h-1.5 rounded-full bg-blue-500/30 w-16 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono text-slate-400 w-6 text-right">{r.count}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="text-[10px] text-slate-600 pt-1">
                  Класифіковано: {gradedCount} з {muscularInjuries.length} м'язових
                </div>
              </div>
            )}
          </Card>

          {/* Рецидиви — заглушка поки немає даних */}
          <Card>
            <div className="text-xs text-slate-500 mb-3 font-semibold">Рецидиви</div>
            {reinjuryCount > 0 ? (
              <div>
                <div className="text-2xl font-extrabold font-mono text-status-danger">{reinjuryCount}</div>
                <div className="text-[10px] text-slate-600 mt-1">травм з рецидивом (MLG-R «R»)</div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 py-2">Дані накопичуються — рецидивів ще не зафіксовано</p>
            )}
          </Card>

          {/* RTP прогноз vs факт — заглушка */}
          <Card>
            <div className="text-xs text-slate-500 mb-3 font-semibold">Прогноз RTP vs факт</div>
            {closedClassified.length > 0 ? (
              <div className="space-y-2">
                {closedClassified.map((inj: any) => {
                  const fact = calcDaysMissed(inj);
                  const min = inj.rtp_min_days, max = inj.rtp_max_days;
                  const inRange = min != null && max != null && fact >= min && fact <= max;
                  return (
                    <div key={inj.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">
                        {(inj.players?.last_name ?? "")} {(inj.players?.first_name?.[0] ?? "")}.
                      </span>
                      <span className="font-mono text-slate-300">
                        {fact} дн. / ~{min}–{max}
                        <span className={inRange ? "text-status-ok ml-1" : "text-status-warn ml-1"}>
                          {inRange ? "✓" : "≠"}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-600 py-2">Дані накопичуються — потрібні закриті класифіковані травми</p>
            )}
          </Card>

        </div>
      </section>
      {totalInjuries===0&&<Card><p className="text-slate-500 text-center py-8">Статистика з'явиться після додавання даних.</p></Card>}
    </div></div>
  );
}
