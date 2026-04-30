import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import Image from "next/image";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { LOCATION_UA, SEVERITY_UA } from "@/lib/constants";

function vasVariant(vas: number): "ok"|"warn"|"danger" { if(vas>=7)return"danger";if(vas>=4)return"warn";return"ok"; }
function daysSince(d: string) { return Math.floor((Date.now()-new Date(d).getTime())/86400000); }
function daysUntil(d: string) { return Math.floor((new Date(d).getTime()-Date.now())/86400000); }

export default async function DoctorDashboard() {
  const supabase = await createClient();
  const { error: dbError } = await supabase.from("teams").select("id").limit(1);
  const isDbConnected = !dbError;
  const { data: activeInjuries } = await supabase.from("injuries").select(`id, injury_type, location, severity, vas_score, status, date_of_injury, expected_return_date, players!inner ( id, first_name, last_name, teams!inner ( name ) )`).in("status", ["active", "rehabilitation"]).order("vas_score", { ascending: false });

  type Patient = { id: string; playerId: string; firstName: string; lastName: string; teamName: string; location: string; severity: string; vasScore: number; status: string; dateOfInjury: string; expectedReturn: string | null };
  const patients: Patient[] = (activeInjuries ?? []).map((inj: any) => ({ id: inj.id, playerId: inj.players.id, firstName: inj.players.first_name, lastName: inj.players.last_name, teamName: inj.players.teams.name, location: inj.location, severity: inj.severity, vasScore: inj.vas_score, status: inj.status, dateOfInjury: inj.date_of_injury, expectedReturn: inj.expected_return_date }));
  const { count: totalPlayers } = await supabase.from("players").select("id", { count: "exact", head: true });
  const useMock = patients.length === 0;
  const displayPatients: Patient[] = useMock ? [
    { id: "m1", playerId: "", firstName: "Олександр", lastName: "Іванов", teamName: "U19", location: "knee", severity: "severe", vasScore: 7, status: "active", dateOfInjury: "2026-04-10", expectedReturn: "2026-05-15" },
    { id: "m2", playerId: "", firstName: "Максим", lastName: "Петров", teamName: "U17", location: "thigh", severity: "moderate", vasScore: 4, status: "rehabilitation", dateOfInjury: "2026-04-15", expectedReturn: "2026-04-28" },
  ] : patients;
  const totalActive = displayPatients.filter(p => p.status === "active").length;
  const totalRehab = displayPatients.filter(p => p.status === "rehabilitation").length;
  const redZone = displayPatients.filter(p => p.vasScore >= 7).length;
  const upcomingReturns = displayPatients.filter(p => p.expectedReturn).sort((a, b) => new Date(a.expectedReturn!).getTime() - new Date(b.expectedReturn!).getTime()).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Шапка з лого та фоном */}
        <header className="relative overflow-hidden rounded-xl border border-blue-900/15">
          <div className="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center opacity-[0.07]" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />

          <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5">
            <div className="flex items-center gap-4">
              <Image src="/logo-chr.png" alt="ФК Чорноморець" width={48} height={48} className="rounded-full ring-2 ring-brand-blue/30" />
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Медичний штаб</h1>
                <p className="text-xs text-slate-500">ФК «Чорноморець» · Панель лікаря</p>
              </div>
            </div>
            <div className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-2 border ${isDbConnected ? "bg-status-ok/[0.08] text-status-ok border-status-ok/15" : "bg-status-danger/[0.08] text-status-danger border-status-danger/15"}`}>
              <span className={`w-[7px] h-[7px] rounded-full animate-pulse-dot ${isDbConnected ? "bg-status-ok" : "bg-status-danger"}`} />
              {isDbConnected ? "БД підключена" : "Помилка БД"}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Активні травми" value={totalActive} color="text-status-danger" />
          <StatCard label="Реабілітація" value={totalRehab} color="text-status-warn" />
          <StatCard label="Червона зона" value={redZone} color="text-status-danger" />
          <StatCard label="Всього гравців" value={totalPlayers ?? 0} color="text-white" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/injuries/new" className="bg-brand-blue hover:bg-brand-blue-light text-white font-bold py-2.5 px-5 rounded-lg text-sm transition-colors shadow-glow-sm hover:shadow-glow">+ Фіксація травми</Link>
          <Link href="/players/new" className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors">+ Додати гравця</Link>
          <Link href="/reports/weekly" className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors">📋 Звіт за тиждень</Link>
          <Link href="/reports/patterns" className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors">🔍 Аналіз патернів</Link>
          <Link href="/growth" className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors">📈 Моніторинг росту</Link>
          <Link href="/growth/new" className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors">📏 Новий вимір</Link>
        </div>

        {upcomingReturns.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 mb-3">Найближчі повернення</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {upcomingReturns.map(p => { const days = daysUntil(p.expectedReturn!); const isOverdue = days < 0; return (
                <Link key={p.id+"-ret"} href={p.id.startsWith("m") ? "#" : `/injuries/${p.id}`}><Card interactive><div className="flex justify-between items-center"><div><div className="text-sm font-semibold text-white">{p.lastName} {p.firstName.charAt(0)}.</div><div className="text-xs text-slate-500">{p.teamName} · {LOCATION_UA[p.location] ?? p.location}</div></div><Badge variant={isOverdue ? "danger" : days <= 3 ? "warn" : "neutral"}>{isOverdue ? `Прострочено ${Math.abs(days)} дн.` : days === 0 ? "Сьогодні" : `Через ${days} дн.`}</Badge></div></Card></Link>
              ); })}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-slate-500">Тріаж — активні пацієнти</h2>{useMock && <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded">Демо-дані</span>}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {displayPatients.map(p => { const card = (<Card interactive accent={p.vasScore >= 7 ? "danger" : "warn"}><div className="flex justify-between items-start gap-3"><div className="min-w-0"><div className="font-bold text-white text-[15px]">{p.lastName} {p.firstName.charAt(0)}.</div><div className="text-xs text-slate-500 mt-0.5">{p.teamName} · {LOCATION_UA[p.location] ?? p.location} · {SEVERITY_UA[p.severity] ?? p.severity}</div><div className="text-[11px] text-slate-600 mt-1 font-mono">{daysSince(p.dateOfInjury)} дн. з моменту травми</div></div><div className="flex flex-col items-end gap-1.5 shrink-0"><Badge variant={vasVariant(p.vasScore)}>ВАШ {p.vasScore}/10</Badge><Badge variant={p.status === "active" ? "danger" : "warn"}>{p.status === "active" ? "Гостра" : "Реабілітація"}</Badge></div></div></Card>); return p.id.startsWith("m") ? <div key={p.id}>{card}</div> : <Link key={p.id} href={`/injuries/${p.id}`}>{card}</Link>; })}
          </div>
        </section>
      </div>
    </div>
  );
}
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return <Card><div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">{label}</div><div className={`text-2xl font-extrabold font-mono ${color}`}>{value}</div></Card>;
}
