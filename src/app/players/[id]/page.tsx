import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PeriodSelector from "@/components/players/PeriodSelector";
import AnthropometrySection from "@/components/players/AnthropometrySection";
import DeleteButton from "@/components/ui/DeleteButton";
import { deletePlayerAction } from "@/actions/delete-player-action";
import { POSITION_LABELS, POSITION_FULL, DOMINANT_UA, LOCATION_UA, SEVERITY_UA, INJURY_TYPE_UA, STATUS_UA } from "@/lib/constants";

function calcAge(dob: string) { return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)); }
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function vasVariant(v: number): "ok"|"warn"|"danger" { if(v>=7)return"danger";if(v>=4)return"warn";return"ok"; }
function statusVariant(s: string): "ok"|"warn"|"danger"|"neutral" { if(s==="active")return"danger";if(s==="rehabilitation")return"warn";return"neutral"; }
function calcDaysMissed(inj: any): number { if(inj.actual_return_date)return Math.max(0,Math.floor((new Date(inj.actual_return_date).getTime()-new Date(inj.date_of_injury).getTime())/86400000)); if(inj.status==="active"||inj.status==="rehabilitation")return daysSince(inj.date_of_injury); return 0; }

export default async function PlayerDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{from?:string;to?:string}> }) {
  const { id } = await params; const { from, to } = await searchParams;
  const supabase = await createClient();
  const { data: player, error } = await supabase.from("players").select("*, teams ( name, category )").eq("id", id).single();
  if (error || !player) return notFound();
  let query = supabase.from("injuries").select("*").eq("player_id", id).order("date_of_injury", { ascending: false });
  if (from) query = query.gte("date_of_injury", from); if (to) query = query.lte("date_of_injury", to);
  const { data: injuries } = await query; const injuryList = injuries ?? [];
  const { data: anthroData } = await supabase.from("anthropometry_logs").select("*").eq("player_id", id).order("date", { ascending: false });
  const measurements = anthroData ?? [];
  // Остання оцінка матурації (для блоку PHV)
  const { data: matData } = await supabase
    .from("maturation_assessments")
    .select("growth_phase, risk_zone, consensus_offset, age_at_measurement, created_at")
    .eq("player_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const maturation = matData?.[0] ?? null;
  const totalInjuries = injuryList.length;
  const totalDaysMissed = injuryList.reduce((s,i) => s + calcDaysMissed(i), 0);
  const activeCount = injuryList.filter(i => i.status === "active").length;
  const rehabCount = injuryList.filter(i => i.status === "rehabilitation").length;
  const closedCount = injuryList.filter(i => i.status === "closed").length;
  const daysByType: Record<string,number> = {}; const daysByLocation: Record<string,number> = {};
  for (const inj of injuryList) { const d = calcDaysMissed(inj); daysByType[inj.injury_type] = (daysByType[inj.injury_type]??0)+d; daysByLocation[inj.location] = (daysByLocation[inj.location]??0)+d; }
  const activeInjuries = injuryList.filter(i => i.status === "active" || i.status === "rehabilitation");
  const periodLabel = from ? `${from}${to ? ` — ${to}` : " — сьогодні"}` : "За весь час";
  const handleDelete = deletePlayerAction.bind(null, id);

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8"><div className="max-w-4xl mx-auto space-y-6">
      <Link href="/players" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Реєстр гравців</Link>
      <Card>
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div><h1 className="text-xl font-bold text-white">{player.last_name} {player.first_name}</h1>
            <div className="text-sm text-slate-400 mt-1 space-y-0.5">
              <div>{player.teams.name} · {POSITION_FULL[player.position] ?? player.position} ({POSITION_LABELS[player.position]})</div>
              <div>{new Date(player.date_of_birth).toLocaleDateString("uk-UA")} · {calcAge(player.date_of_birth)} років</div>
              <div>Ведуча нога: {DOMINANT_UA[player.dominant_leg]} · Рука: {DOMINANT_UA[player.dominant_arm]}</div>
            </div></div>
          <div className="flex flex-col items-end gap-2">{activeInjuries.length === 0 ? <Badge variant="ok">Готовий до гри</Badge> : activeInjuries.map((inj:any) => <Badge key={inj.id} variant={vasVariant(inj.vas_score)}>ВАШ {inj.vas_score}/10</Badge>)}</div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-900/15 flex flex-wrap gap-2">
          <Link href={`/injuries/new?player=${id}`} className="bg-brand-blue hover:bg-brand-blue-light text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors shadow-glow-sm">+ Фіксувати травму</Link>
          <Link href={`/players/${id}/edit`} className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2 px-4 rounded-lg text-xs transition-colors">✏️ Редагувати</Link>
          <DeleteButton onDelete={handleDelete} itemName="гравця" />
        </div>
      </Card>
       <AnthropometrySection playerId={id} measurements={measurements} maturation={maturation} dateOfBirth={player.date_of_birth} />
      <section><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Період аналізу травм</h2><PeriodSelector /></section>
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Статистика травм <span className="text-slate-600 normal-case tracking-normal ml-2 font-normal">({periodLabel})</span></h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Всього травм</div><div className="text-2xl font-extrabold font-mono text-white">{totalInjuries}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Днів пропущено</div><div className="text-2xl font-extrabold font-mono text-status-danger">{totalDaysMissed}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Активних / Реаб.</div><div className="text-2xl font-extrabold font-mono text-status-warn">{activeCount} / {rehabCount}</div></Card>
          <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Закритих</div><div className="text-2xl font-extrabold font-mono text-status-ok">{closedCount}</div></Card>
        </div>
        {totalInjuries > 0 && (<div className="grid md:grid-cols-2 gap-3">
          <Card><div className="text-xs text-slate-500 mb-3 font-semibold">По типу</div><div className="space-y-2">{Object.entries(daysByType).sort(([,a],[,b])=>b-a).map(([t,d])=>(<div key={t} className="flex justify-between items-center"><span className="text-sm text-slate-300">{INJURY_TYPE_UA[t]??t}</span><div className="flex items-center gap-2"><div className="h-1.5 rounded-full bg-status-danger/30 w-20 overflow-hidden"><div className="h-full rounded-full bg-status-danger" style={{width:`${Math.min(100,(d/Math.max(totalDaysMissed,1))*100)}%`}}/></div><span className="text-xs font-mono text-slate-400 w-12 text-right">{d} дн.</span></div></div>))}</div></Card>
          <Card><div className="text-xs text-slate-500 mb-3 font-semibold">По локалізації</div><div className="space-y-2">{Object.entries(daysByLocation).sort(([,a],[,b])=>b-a).map(([l,d])=>(<div key={l} className="flex justify-between items-center"><span className="text-sm text-slate-300">{LOCATION_UA[l]??l}</span><div className="flex items-center gap-2"><div className="h-1.5 rounded-full bg-status-warn/30 w-20 overflow-hidden"><div className="h-full rounded-full bg-status-warn" style={{width:`${Math.min(100,(d/Math.max(totalDaysMissed,1))*100)}%`}}/></div><span className="text-xs font-mono text-slate-400 w-12 text-right">{d} дн.</span></div></div>))}</div></Card>
        </div>)}
      </section>
      <section>
        <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Історія травм</h2><span className="text-xs text-slate-600">{totalInjuries} записів</span></div>
        {totalInjuries === 0 ? <Card><p className="text-slate-500 text-center py-6">{from ? "За обраний період травм не зафіксовано" : "Травм не зафіксовано"}</p></Card> : (
          <div className="space-y-3">{injuryList.map((inj:any)=>{const missed=calcDaysMissed(inj);return(<Link key={inj.id} href={`/injuries/${inj.id}`}><Card interactive accent={statusVariant(inj.status)==="neutral"?null:(statusVariant(inj.status) as "danger"|"warn")}><div className="flex justify-between items-start gap-3"><div><div className="font-bold text-white text-sm">{INJURY_TYPE_UA[inj.injury_type]??inj.injury_type} — {LOCATION_UA[inj.location]??inj.location}</div><div className="text-xs text-slate-500 mt-1">{SEVERITY_UA[inj.severity]} · {new Date(inj.date_of_injury).toLocaleDateString("uk-UA")} · <span className="text-status-danger font-semibold">{missed} дн.</span></div>{inj.description && <div className="text-xs text-slate-600 mt-1">{inj.description}</div>}</div><div className="flex flex-col items-end gap-1.5 shrink-0"><Badge variant={vasVariant(inj.vas_score)}>ВАШ {inj.vas_score}/10</Badge><Badge variant={statusVariant(inj.status)}>{STATUS_UA[inj.status]??inj.status}</Badge></div></div></Card></Link>);})}</div>
        )}
      </section>
    </div></div>
  );
}
