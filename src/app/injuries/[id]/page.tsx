import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ExaminationForm from "@/components/injuries/ExaminationForm";
import ExaminationHistory from "@/components/injuries/ExaminationHistory";
import RehabTracker from "@/components/injuries/RehabTracker";
import InjuryJournal from "@/components/injuries/InjuryJournal";
import DeleteButton from "@/components/ui/DeleteButton";
import { deleteInjuryAction } from "@/actions/delete-injury-action";
import { INJURY_TYPE_UA, LOCATION_UA, SIDE_UA, SEVERITY_UA, MECHANISM_UA, STATUS_UA } from "@/lib/constants";

function vasVariant(v: number): "ok"|"warn"|"danger" { if(v>=7)return"danger";if(v>=4)return"warn";return"ok"; }
function daysSince(d: string) { return Math.floor((Date.now()-new Date(d).getTime())/86400000); }

export default async function InjuryDetailPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: injury, error } = await supabase.from("injuries").select("*, players!inner ( id, first_name, last_name, teams!inner ( name ) )").eq("id", id).single();
  if (error || !injury) return notFound();
  const { data: logs } = await supabase.from("injury_logs").select("*").eq("injury_id", id).order("date", { ascending: false });
  const { data: exams } = await supabase.from("injury_examinations").select("*").eq("injury_id", id).order("date", { ascending: false });
  const { data: phases } = await supabase.from("rehab_phases").select("*").eq("injury_id", id).order("sort_order", { ascending: true });
  const daysActive = injury.actual_return_date ? Math.floor((new Date(injury.actual_return_date).getTime()-new Date(injury.date_of_injury).getTime())/86400000) : daysSince(injury.date_of_injury);
  const handleDelete = deleteInjuryAction.bind(null, id, injury.players.id);

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8"><div className="max-w-3xl mx-auto space-y-6">
      <div className="flex gap-3 text-sm">
        <Link href="/" className="text-slate-500 hover:text-slate-300 transition-colors">Дашборд</Link><span className="text-slate-700">/</span>
        <Link href={`/players/${injury.players.id}`} className="text-slate-500 hover:text-slate-300 transition-colors">{injury.players.last_name} {injury.players.first_name}</Link>
      </div>
      <Card>
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div><h1 className="text-xl font-bold text-white">{INJURY_TYPE_UA[injury.injury_type]??injury.injury_type} — {LOCATION_UA[injury.location]??injury.location}</h1><div className="text-sm text-slate-400 mt-1">{injury.players.last_name} {injury.players.first_name} · {injury.players.teams.name}</div></div>
          <div className="flex flex-col items-end gap-1.5"><Badge variant={vasVariant(injury.vas_score)}>ВАШ {injury.vas_score}/10</Badge><Badge variant={injury.status==="active"?"danger":injury.status==="rehabilitation"?"warn":"ok"}>{STATUS_UA[injury.status]}</Badge></div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-900/15 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Тяжкість</div><div className="text-white font-semibold mt-0.5">{SEVERITY_UA[injury.severity]}</div></div>
          <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Сторона</div><div className="text-white font-semibold mt-0.5">{SIDE_UA[injury.side]}</div></div>
          <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Механізм</div><div className="text-white font-semibold mt-0.5">{MECHANISM_UA[injury.mechanism]}</div></div>
          <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Днів пропуску</div><div className="text-status-danger font-extrabold font-mono text-lg mt-0.5">{daysActive}</div></div>
        </div>
        <div className="mt-4 pt-4 border-t border-blue-900/15 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Дата травми</div><div className="text-white mt-0.5">{new Date(injury.date_of_injury).toLocaleDateString("uk-UA")}</div></div>
          {injury.expected_return_date && <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Очікуване повернення</div><div className="text-white mt-0.5">{new Date(injury.expected_return_date).toLocaleDateString("uk-UA")}</div></div>}
          {injury.actual_return_date && <div><div className="text-[10px] text-slate-600 uppercase tracking-wider">Фактичне повернення</div><div className="text-status-ok font-semibold mt-0.5">{new Date(injury.actual_return_date).toLocaleDateString("uk-UA")}</div></div>}
        </div>
        {injury.description && <div className="mt-4 pt-4 border-t border-blue-900/15"><div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Опис</div><p className="text-sm text-slate-300">{injury.description}</p></div>}
        <div className="mt-4 pt-4 border-t border-blue-900/15 flex flex-wrap gap-2">
          <Link href={`/injuries/${id}/edit`} className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2 px-4 rounded-lg text-xs transition-colors">✏️ Редагувати</Link>
          <DeleteButton onDelete={handleDelete} itemName="травму" />
        </div>
      </Card>
      {injury.status !== "closed" && <ExaminationForm injuryId={id} currentVas={injury.vas_score} />}
      <ExaminationHistory exams={exams ?? []} />
      <RehabTracker injuryId={id} phases={phases ?? []} injuryStatus={injury.status} />
      <InjuryJournal injuryId={id} logs={logs ?? []} currentStatus={injury.status} />
    </div></div>
  );
}
