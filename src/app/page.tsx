// src/app/page.tsx
// Головний дашборд Медичного штабу ФК «Чорноморець»
// Реальні дані: статистика, тріаж, реабілітація. Без локалі.

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import {
  Bandage, Activity, CheckCircle, Calendar,
  Brain, Stethoscope, Plus, ChevronRight,
} from "lucide-react";
import { LOCATION_UA, INJURY_TYPE_UA } from "@/lib/constants";

// ─── Типи ────────────────────────────────────────────────────────────────────
type StatCard = {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  accent: "red" | "amber" | "green" | "blue";
  href: string;
};

// ─── Конфіг кольорів ─────────────────────────────────────────────────────────
const ACCENT = {
  red:   { border: "border-l-red-500",   text: "text-red-400",   bg: "bg-red-500/10",   badge: "bg-red-500/10 text-red-400 border-red-500/25" },
  amber: { border: "border-l-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", badge: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  green: { border: "border-l-green-500", text: "text-green-400", bg: "bg-green-500/10", badge: "bg-green-500/10 text-green-400 border-green-500/25" },
  blue:  { border: "border-l-blue-500",  text: "text-blue-400",  bg: "bg-blue-500/10",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
};

// ─── Утиліти ─────────────────────────────────────────────────────────────────
function todayUk(): string {
  return new Date().toLocaleDateString("uk-UA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function vasZone(vas: number | null): "red" | "amber" | "green" {
  if (vas == null) return "green";
  if (vas >= 7) return "red";
  if (vas >= 4) return "amber";
  return "green";
}
// Зона ризику росту (PHV) — остання оцінка. Повертаємо лише yellow/red.
function growthZone(player: any): "yellow" | "red" | null {
  const assessments = player?.maturation_assessments ?? [];
  if (assessments.length === 0) return null;
  const latest = [...assessments].sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  if (latest.risk_zone === "red") return "red";
  if (latest.risk_zone === "yellow") return "yellow";
  return null;
}

function initials(p: any): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

function shortName(p: any): string {
  if (!p) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

function progressColor(pct: number): string {
  if (pct >= 66) return "bg-blue-500";
  if (pct >= 33) return "bg-amber-500";
  return "bg-red-500";
}

function progressTextColor(pct: number): string {
  if (pct >= 66) return "text-blue-400";
  if (pct >= 33) return "text-amber-400";
  return "text-red-400";
}

// ─── Підкомпоненти ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-blue-900/30" />
    </div>
  );
}

function StatCardItem({ icon, value, label, accent, href }: StatCard) {
  const c = ACCENT[accent];
  return (
    <Link
      href={href}
      className={`bg-slate-900/80 border border-blue-900/25 border-l-[3px] ${c.border} rounded-lg p-2.5 cursor-pointer transition-colors hover:border-blue-500/40 block`}
    >
      <div className={`text-sm mb-1 ${c.text} opacity-60`}>{icon}</div>
      <div className={`text-[22px] font-medium leading-none ${c.text}`}>{value}</div>
      <div className="text-[9px] text-slate-600 mt-1">{label}</div>
    </Link>
  );
}

// ─── Головний компонент ───────────────────────────────────────────────────────
export default async function Home() {
  const supabase = await createClient();
  const todayStr = new Date().toISOString().split("T")[0];
  const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // ── Статистика (лічильники) ──
  const [
    { count: activeInjuries },
    { count: onRehab },
    { count: examsThisWeek },
  ] = await Promise.all([
    supabase.from("injuries").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("injuries").select("*", { count: "exact", head: true }).eq("status", "rehabilitation"),
    supabase.from("injury_examinations").select("*", { count: "exact", head: true }).gte("date", weekAgoStr),
  ]);

  // ── Всі гравці (для підрахунку готових) ──
  const { count: totalPlayers } = await supabase
    .from("players").select("*", { count: "exact", head: true });

  // Готові = всього гравців − ті, у кого є активна/реабілітаційна травма
  const { data: injuredPlayerIds } = await supabase
    .from("injuries")
    .select("player_id")
    .in("status", ["active", "rehabilitation"]);
  const uniqueInjured = new Set((injuredPlayerIds ?? []).map((i) => i.player_id)).size;
  const readyCount = Math.max((totalPlayers ?? 0) - uniqueInjured, 0);

  const STAT_CARDS: StatCard[] = [
    { icon: <Bandage     size={14} />, value: activeInjuries ?? 0,  label: "Активні травми",  accent: "red",   href: "/injuries" },
    { icon: <Activity    size={14} />, value: onRehab        ?? 0,  label: "На реабілітації", accent: "amber", href: "/injuries" },
    { icon: <CheckCircle size={14} />, value: readyCount,           label: "Готові до матчу", accent: "green", href: "/availability" },
    { icon: <Calendar    size={14} />, value: examsThisWeek  ?? 0,  label: "Огляди на тижні", accent: "blue",  href: "/injuries" },
  ];

  // ── Тріаж: активні + реабілітація, сортування за ВАШ ──
  const { data: triageInjuries } = await supabase
    .from("injuries")
    .select(`
      id, location, injury_type, vas_score, status,
      players ( first_name, last_name, teams ( name ), maturation_assessments ( risk_zone, created_at ) )
    `)
    .in("status", ["active", "rehabilitation"])
    .order("vas_score", { ascending: false, nullsFirst: false })
    .limit(5);

  // ── Реабілітація: фази з прогресом ──
  const { data: rehabInjuries } = await supabase
    .from("injuries")
    .select(`
      id, location, injury_type,
      players ( first_name, last_name ),
      rehab_phases ( id, status, sort_order )
    `)
    .eq("status", "rehabilitation")
    .limit(5);

  // Рахуємо прогрес реабілітації по фазах
  const rehabRows = (rehabInjuries ?? []).map((inj: any) => {
    const phases = inj.rehab_phases ?? [];
    const total = phases.length;
    const done = phases.filter((p: any) => p.status === "completed").length;
    const inProgress = phases.filter((p: any) => p.status === "in_progress").length;
    const pct = total > 0 ? Math.round(((done + inProgress * 0.5) / total) * 100) : 0;
    const currentPhase = done + (inProgress > 0 ? 1 : 0);
    return {
      id: inj.id,
      name: shortName(inj.players),
      injury: LOCATION_UA[inj.location] ?? inj.location,
      weekCurrent: currentPhase,
      weekTotal: total,
      progressPct: pct,
    };
  });

  return (
    <div className="relative min-h-screen overflow-hidden" style={{
      background: "repeating-linear-gradient(90deg, #060C1E 0px, #060C1E 60px, #0D2550 60px, #0D2550 120px)",
    }}>
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Привітання */}
        <div className="pt-5 pb-3 border-b border-blue-900/15 mb-0">
          <p className="text-[10px] text-slate-600 mb-1 capitalize">{todayUk()}</p>
          <h1 className="text-[18px] font-medium text-slate-200">
            Добрий день, <span className="text-blue-400">Лікарю</span>
          </h1>
        </div>

        {/* Статистика */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Загальна статистика</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {STAT_CARDS.map((card) => (
              <StatCardItem key={card.label} {...card} />
            ))}
          </div>
        </section>

        {/* Тріаж — реальні дані */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Тріаж · Червона та Жовта зони</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {(triageInjuries ?? []).length === 0 && (
              <p className="text-[11px] text-slate-600 py-2">Активних травм немає 🟢</p>
            )}
            {(triageInjuries ?? []).map((inj: any) => {
              const zone = vasZone(inj.vas_score);
              const c = ACCENT[zone];
              const p = inj.players;
              const gZone = growthZone(p);
              return (
                <Link
                  key={inj.id}
                  href={`/injuries/${inj.id}`}
                  className="bg-slate-900/80 border border-blue-900/20 rounded-lg p-2 flex items-center gap-2 cursor-pointer transition-colors hover:border-blue-500/40"
                >
                  <div className={`w-7 h-7 rounded-[5px] flex-shrink-0 flex items-center justify-center text-[10px] font-medium ${c.bg} ${c.text}`}>
                    {initials(p)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-slate-200 truncate">{shortName(p)}</div>
                    <div className="text-[10px] text-slate-600 truncate">
                      {p?.teams?.name ?? "—"} · {INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type} · {LOCATION_UA[inj.location] ?? inj.location}
                    </div>
                  </div>
                  {gZone && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${gZone === "red" ? "bg-red-500/10 text-red-400 border-red-500/25" : "bg-amber-500/10 text-amber-400 border-amber-500/25"}`}>
                      PHV: {gZone === "red" ? "червона" : "жовта"}
                    </span>
                  )}
                  {inj.vas_score != null && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${c.badge}`}>
                      ВАШ {inj.vas_score}/10
                    </span>
                  )}
                  <ChevronRight size={12} className="text-slate-700 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Готовність до матчу — реальний підрахунок */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Готовність складу</SectionLabel>
          <div className="bg-slate-900/80 border border-blue-900/20 rounded-lg p-3">
            <div className="flex gap-2 mb-2">
              <div className="flex-1 text-center py-1.5 rounded border bg-red-500/8 border-red-500/20">
                <div className="text-base font-medium text-red-400">{activeInjuries ?? 0}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Травмовані</div>
              </div>
              <div className="flex-1 text-center py-1.5 rounded border bg-amber-500/8 border-amber-500/20">
                <div className="text-base font-medium text-amber-400">{onRehab ?? 0}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Реабілітація</div>
              </div>
              <div className="flex-1 text-center py-1.5 rounded border bg-green-500/8 border-green-500/20">
                <div className="text-base font-medium text-green-400">{readyCount}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Готові</div>
              </div>
            </div>
            {(totalPlayers ?? 0) > 0 && (
              <div className="h-1.5 rounded-full overflow-hidden flex bg-slate-800">
                <div className="bg-red-500"   style={{ width: `${((activeInjuries ?? 0) / (totalPlayers ?? 1)) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${((onRehab ?? 0) / (totalPlayers ?? 1)) * 100}%` }} />
                <div className="bg-green-500 flex-1" />
              </div>
            )}
          </div>
        </section>

        {/* Реабілітація — реальний прогрес фаз */}
        {rehabRows.length > 0 && (
          <section className="py-3 border-b border-blue-900/10">
            <SectionLabel>Реабілітація · Прогрес</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {rehabRows.map((r) => (
                <Link
                  key={r.id}
                  href={`/injuries/${r.id}`}
                  className="bg-slate-900/80 border border-blue-900/15 rounded-lg p-2 flex items-center gap-3 cursor-pointer transition-colors hover:border-blue-500/35"
                >
                  <div className="flex-1">
                    <div className="text-[12px] font-medium text-slate-300">{r.name}</div>
                    <div className="text-[10px] text-slate-600">
                      {r.injury}{r.weekTotal > 0 && <> · фаза {r.weekCurrent}/{r.weekTotal}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-1 bg-blue-900/20 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${progressColor(r.progressPct)}`} style={{ width: `${r.progressPct}%` }} />
                    </div>
                    <span className={`text-[10px] min-w-[26px] text-right ${progressTextColor(r.progressPct)}`}>
                      {r.progressPct}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Швидкі дії */}
        <section className="pt-3">
          <SectionLabel>Швидкі дії</SectionLabel>
          <div className="flex gap-2">
            <Link href="/injuries/new"
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium py-2.5 rounded-lg transition-colors">
              <Plus size={13} />Фіксувати травму
            </Link>
            <Link href="/exams/new"
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/12 hover:bg-blue-500/20 text-blue-400 border border-blue-500/28 text-[11px] font-medium py-2.5 rounded-lg transition-colors">
              <Stethoscope size={13} />Новий огляд
            </Link>
            <Link href="/reports/weekly"
              className="flex-1 flex items-center justify-center gap-1.5 bg-violet-500/12 hover:bg-violet-500/20 text-violet-400 border border-violet-500/28 text-[11px] font-medium py-2.5 rounded-lg transition-colors">
              <Brain size={13} />AI Звіт
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
