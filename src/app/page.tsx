// src/app/page.tsx
// Головний дашборд Медичного штабу ФК «Чорноморець»
// Реальні дані: статистика, тріаж, реабілітація. Без локалі.

import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import {
  Bandage, Activity, CheckCircle, Calendar,
  Brain, Stethoscope, Plus, ChevronRight,
} from "lucide-react";
import { LOCATION_UA, INJURY_TYPE_UA, formatPosition, formatInjuryType, formatLocation } from "@/lib/constants";
import RiskAlertsCenter from "@/components/alerts/RiskAlertsCenter";
import { getRiskAlerts } from "@/lib/get-risk-alerts";
import { getPlayerAvailability } from "@/lib/availability";
import { calculateExposureMetrics, INSUFFICIENT_EXPOSURE_DATA_MSG } from "@/lib/exposure-calculator";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";

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
  if (vas != null && vas >= 7) return "red";
  if (vas != null && vas >= 4) return "amber";
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
// Короткий код класифікації (пріоритет: MLG-R → BAMIC → Munich)
function classCode(inj: any): string | null {
  if (!inj?.is_classified) return null;
  return inj.mlgr_code || inj.bamic_code || inj.munich_type || null;
}

// RTP-прогноз у вигляді "~21–28 дн." (якщо розрахований)
function rtpLabel(inj: any): string | null {
  const min = inj?.rtp_min_days;
  const max = inj?.rtp_max_days;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `~${min}–${max} дн.`;
  return `~${min ?? max} дн.`;
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
  const user = await getCurrentUser();
  const todayStr = new Date().toISOString().split("T")[0];
  const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const weekAheadStr = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  let clubName = "Академія";
  if (user?.clubId) {
    const { data: club } = await supabase.from("clubs").select("name").eq("id", user.clubId).maybeSingle();
    if (club?.name) clubName = club.name;
  }

  // ── Статистика (лічильники та доступність через єдине джерело) ──
  const [
    { count: activeInjuries },
    { count: onRehab },
    { count: scheduledExamsCount },
    { count: examsPastWeekCount },
    alerts,
    availability,
    { data: allInjuriesForExposure },
    { data: allExposures },
  ] = await Promise.all([
    supabase.from("injuries").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("injuries").select("*", { count: "exact", head: true }).eq("status", "rehabilitation"),
    supabase
      .from("injuries")
      .select("*", { count: "exact", head: true })
      .in("status", ["active", "rehabilitation"])
      .not("next_exam_date", "is", null)
      .lte("next_exam_date", weekAheadStr),
    supabase.from("injury_examinations").select("*", { count: "exact", head: true }).gte("date", weekAgoStr),
    getRiskAlerts(),
    getPlayerAvailability(),
    supabase.from("injuries").select("id, activity_type, date_of_injury"),
    supabase.from("exposures").select("id, team_id, date, type, minutes, players_count"),
  ]);

  // Розрахунок метрик експозиції та захворюваності (травми на 1000 годин)
  const exposureMetrics = calculateExposureMetrics(
    allExposures ?? [],
    (allInjuriesForExposure ?? []).map((i: any) => ({
      date_of_injury: i.date_of_injury,
      activity_type: i.activity_type ?? "training",
    }))
  );

  // Єдине джерело правди для готових до матчу гравців
  const readyCount = availability.summary.available;
  const totalPlayers = availability.summary.total;
  const isCoach = user?.role === "coach";

  const STAT_CARDS: StatCard[] = isCoach
    ? [
        { icon: <CheckCircle size={14} />, value: readyCount, label: "Готові до матчу", accent: "green", href: "/availability" },
        { icon: <Activity size={14} />, value: onRehab ?? 0, label: "На реабілітації", accent: "amber", href: "/rtp" },
        { icon: <Activity size={14} />, value: totalPlayers, label: "Всього у складі", accent: "blue", href: "/coach-briefing" },
        { icon: <Calendar size={14} />, value: "Сесія", label: "Внести тренування", accent: "blue", href: "/training" },
      ]
    : [
        { icon: <Bandage size={14} />, value: activeInjuries ?? 0, label: "Активні травми", accent: "red", href: "/injuries" },
        { icon: <Activity size={14} />, value: onRehab ?? 0, label: "На реабілітації", accent: "amber", href: "/rtp" },
        { icon: <CheckCircle size={14} />, value: readyCount, label: "Готові до матчу", accent: "green", href: "/availability" },
        {
          icon: <Calendar size={14} />,
          value: scheduledExamsCount ?? 0,
          label: (examsPastWeekCount ?? 0) > 0 ? `Заплановано (${examsPastWeekCount} пров.)` : "Заплановані огляди",
          accent: (scheduledExamsCount ?? 0) > 0 ? "amber" : "blue",
          href: (scheduledExamsCount ?? 0) === 0 && (examsPastWeekCount ?? 0) > 0 ? "/exams/upcoming?tab=past" : "/exams/upcoming",
        },
      ];

  const displayAlerts = isCoach ? alerts.filter((a: any) => a.type !== "pharmacy") : alerts;

  // ── Тріаж: активні + реабілітація, динамічний ВАШ із ранкового світлофора ──
  const timezone = await getClubTimezone(user?.clubId || undefined);
  const todayClubDate = getClubDate(timezone);
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayClubDate = getClubDate(timezone, yesterdayObj);

  const { data: rawTriageInjuries } = await supabase
    .from("injuries")
    .select(`
      id, player_id, location, injury_type, vas_score, status,
      is_classified, mlgr_code, bamic_code, munich_type, rtp_min_days, rtp_max_days, rtp_risk,
      players ( id, first_name, last_name, position, teams ( name ), maturation_assessments ( risk_zone, created_at ) )
    `)
    .in("status", ["active", "rehabilitation"]);

  const injuredPlayerIds = Array.from(
    new Set(
      (rawTriageInjuries ?? [])
        .map((inj: any) => inj.player_id || inj.players?.id)
        .filter(Boolean)
    )
  );

  let wellnessList: Array<{ player_id: string; date: string; pain?: boolean | null; pain_vas?: number | null }> = [];
  if (injuredPlayerIds.length > 0) {
    try {
      const { data: weData } = await supabase
        .from("wellness_entries")
        .select("player_id, date, pain, pain_vas")
        .in("player_id", injuredPlayerIds)
        .gte("date", yesterdayClubDate)
        .lte("date", todayClubDate);
      if (weData) wellnessList.push(...weData);
    } catch {}

    try {
      const { data: wsData } = await supabase
        .from("wellness_surveys")
        .select("player_id, date, notes")
        .in("player_id", injuredPlayerIds)
        .gte("date", yesterdayClubDate)
        .lte("date", todayClubDate);
      if (wsData) {
        for (const s of wsData) {
          let extra: any = {};
          if (s.notes && typeof s.notes === "string" && s.notes.startsWith("{")) {
            try { extra = JSON.parse(s.notes); } catch {}
          }
          wellnessList.push({
            player_id: s.player_id,
            date: s.date,
            pain: extra.pain ?? false,
            pain_vas: extra.pain_vas ?? null,
          });
        }
      }
    } catch {}

    try {
      if (user?.clubId) {
        const { data: clubSettingsData } = await supabase
          .from("clubs")
          .select("settings")
          .eq("id", user.clubId)
          .maybeSingle();
        const store = (clubSettingsData as any)?.settings?.wellness_entries_store || {};
        for (const [, val] of Object.entries(store)) {
          const entry = val as any;
          if (injuredPlayerIds.includes(entry.player_id) && (entry.date === todayClubDate || entry.date === yesterdayClubDate)) {
            wellnessList.push({
              player_id: entry.player_id,
              date: entry.date,
              pain: entry.pain ?? false,
              pain_vas: entry.pain_vas ?? null,
            });
          }
        }
      }
    } catch {}
  }

  // Обчислюємо динамічний ВАШ:
  // 1. Сьогоднішня анкета (якщо заповнив: з болем -> ВАШ, без болю/не вказано -> 0)
  // 2. Якщо сьогодні ще не заповнив -> беремо вчорашню анкету з приміткою
  // 3. Якщо і вчора не було анкети -> базовий ВАШ із огляду/картки травми з приміткою
  const triageInjuries = (rawTriageInjuries ?? [])
    .map((inj: any) => {
      const pid = inj.player_id || inj.players?.id;
      const todayEntry = wellnessList.find((w) => w.player_id === pid && w.date === todayClubDate);
      const yesterdayEntry = wellnessList.find((w) => w.player_id === pid && w.date === yesterdayClubDate);

      let dynamicVas: number = 0;
      let vasSource: "today" | "yesterday" | "card" = "card";

      if (todayEntry) {
        vasSource = "today";
        if (todayEntry.pain && todayEntry.pain_vas != null) {
          dynamicVas = Number(todayEntry.pain_vas);
        } else {
          dynamicVas = 0;
        }
      } else if (yesterdayEntry) {
        vasSource = "yesterday";
        if (yesterdayEntry.pain && yesterdayEntry.pain_vas != null) {
          dynamicVas = Number(yesterdayEntry.pain_vas);
        } else {
          dynamicVas = 0;
        }
      } else {
        vasSource = "card";
        dynamicVas = inj.vas_score ?? 0;
      }

      return {
        ...inj,
        dynamicVas,
        vasSource,
      };
    })
    .sort((a: any, b: any) => {
      if (b.dynamicVas !== a.dynamicVas) {
        return b.dynamicVas - a.dynamicVas;
      }
      const sourceRank = { today: 3, yesterday: 2, card: 1 };
      return (sourceRank[b.vasSource as keyof typeof sourceRank] || 0) - (sourceRank[a.vasSource as keyof typeof sourceRank] || 0);
    })
    .slice(0, 5);

  // ── Реабілітація: фази з прогресом (RTP Clearance + RTP Phases) ──
  const [{ data: rehabInjuries }, { data: rtpClearanceLogs }] = await Promise.all([
    supabase
      .from("injuries")
      .select(`
        id, location, injury_type,
        players ( first_name, last_name )
      `)
      .eq("status", "rehabilitation")
      .limit(5),
    supabase
      .from("injury_logs")
      .select("injury_id, note, created_at")
      .like("note", "[RTP_CLEARANCE]%")
      .order("created_at", { ascending: false }),
  ]);

  // Словник останнього прогресу допуску по травмах
  const clearanceByInjury: Record<string, { pct: number; passed: number; total: number }> = {};
  for (const log of rtpClearanceLogs ?? []) {
    if (log.injury_id && !clearanceByInjury[log.injury_id]) {
      try {
        const jsonStr = log.note.replace("[RTP_CLEARANCE] ", "");
        const parsed = JSON.parse(jsonStr);
        if (parsed.clearancePercentage != null) {
          clearanceByInjury[log.injury_id] = {
            pct: parsed.clearancePercentage,
            passed: parsed.passedCriteria ?? 0,
            total: parsed.totalCriteria ?? 9,
          };
        }
      } catch {}
    }
  }

  // Рахуємо прогрес реабілітації
  const rehabRows = (rehabInjuries ?? []).map((inj: any) => {
    const clr = clearanceByInjury[inj.id];
    const pct = clr ? clr.pct : 0;
    return {
      id: inj.id,
      name: shortName(inj.players),
      injury: LOCATION_UA[inj.location] ?? inj.location,
      subtitle: clr ? `${clr.passed}/${clr.total} критеріїв` : "Етап 1: Мобілізація",
      progressPct: pct,
    };
  });

  return (
    <div className="relative min-h-screen text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-sky-500/15 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs uppercase tracking-wider text-slate-400 font-mono capitalize">{todayUk()}</p>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
              {isCoach ? "Тренерський Штаб" : "Медичний Штаб"}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">{clubName}</span>
            </h1>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isCoach ? (
              <>
                <Link
                  href="/training"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-lg shadow-sky-600/20 active:scale-95 transition-all"
                >
                  ⏱️ Внести тренування
                </Link>
                <Link
                  href="/team/readiness"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-sky-300 bg-slate-900/80 hover:bg-slate-800 border border-sky-500/25 active:scale-95 transition-all"
                >
                  🚦 Готовність команди
                </Link>
                <Link
                  href="/coach-briefing"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/25 active:scale-95 transition-all"
                >
                  🛡️ Брифінг тренера
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/injuries/new"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-lg shadow-sky-600/20 active:scale-95 transition-all"
                >
                  <Plus size={15} /> Фіксувати травму
                </Link>
                <Link
                  href="/exams/new"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-sky-300 bg-slate-900/80 hover:bg-slate-800 border border-sky-500/25 active:scale-95 transition-all"
                >
                  <Stethoscope size={15} /> Новий огляд
                </Link>
                <Link
                  href="/coach-briefing"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/25 active:scale-95 transition-all"
                >
                  🛡️ Брифінг тренера
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Сповіщення для тренера без призначених команд */}
        {isCoach && (!user?.teamIds || user.teamIds.length === 0) && (
          <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-200 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-white">Очікування призначення вікової групи</h3>
              <p className="text-xs text-amber-300/90 leading-relaxed">
                Ваш акаунт успішно створено з роллю «Тренер». Доступ до реєстру гравців, тренувань та світлофора готовності буде активовано після того, як адміністратор або головний лікар клубу закріпить за вами відповідну команду в системі.
              </p>
            </div>
          </div>
        )}

        {/* 4 Top KPI Cards */}
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {STAT_CARDS.map((card) => {
              const c = ACCENT[card.accent];
              return (
                <Link
                  key={card.label}
                  href={card.href}
                  className="group relative bg-slate-900/60 backdrop-blur-md border border-sky-500/15 hover:border-sky-400/40 rounded-2xl p-4 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/10 block overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 group-hover:text-slate-300 transition-colors">
                      {card.label}
                    </span>
                    <div className={`p-1.5 rounded-lg ${c.bg} ${c.text}`}>
                      {card.icon}
                    </div>
                  </div>
                  <div className="text-3xl font-black font-mono text-white group-hover:scale-105 transition-transform origin-left">
                    {card.value}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Центр Оперативних Ризиків та Сповіщень */}
        <section>
          <RiskAlertsCenter alerts={displayAlerts} standaloneWidget={true} />
        </section>

        {/* Two Column Grid: Triage & Squad Readiness */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Triage Active Cases (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-sky-500/15">
              <div className="flex items-center gap-2">
                <span className="text-base">🚨</span>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {isCoach ? "Гравці з обмеженнями та травмами" : "Клінічний Тріаж (Гостра фаза та рецидиви)"}
                </h3>
              </div>
              <Link
                href={isCoach ? "/coach-briefing" : "/injuries"}
                className="text-xs text-sky-400 hover:text-sky-300 transition flex items-center gap-1 font-semibold"
              >
                {isCoach ? "Брифінг тренера" : "Всі травми"} <ChevronRight size={13} />
              </Link>
            </div>

            <div className="space-y-2.5">
              {(triageInjuries ?? []).length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-sky-500/10 text-xs text-slate-400">
                  <span className="text-2xl block mb-2">🟢</span>
                  Всі гравці в строю! Активних гострих травм немає.
                </div>
              ) : (
                (triageInjuries ?? []).map((inj: any) => {
                  const zone = vasZone(inj.dynamicVas);
                  const c = ACCENT[zone];
                  const p = inj.players;
                  const gZone = growthZone(p);
                  return (
                    <Link
                      key={inj.id}
                      href={isCoach ? "/coach-briefing" : `/injuries/${inj.id}`}
                      className="group bg-slate-900/60 backdrop-blur-md border border-sky-500/15 hover:border-sky-400/40 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-all hover:shadow-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-black font-mono border ${c.bg} ${c.text} ${c.border}`}>
                          {initials(p)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{shortName(p)}</span>
                            {p?.position && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20 font-semibold">
                                {formatPosition(p.position)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {p?.teams?.name ?? "—"} · {formatInjuryType(inj.injury_type)} ({formatLocation(inj.location)})
                          </div>
                          {classCode(inj) && (
                            <div className="text-[11px] text-sky-400 truncate mt-0.5 font-mono">
                              {classCode(inj)}{rtpLabel(inj) && <span className="text-slate-400 font-sans"> · RTP {rtpLabel(inj)}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {gZone && (
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${gZone === "red" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30"}`}>
                            PHV {gZone}
                          </span>
                        )}
                        <div className="flex flex-col items-end">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${c.badge}`}>
                            VAS {inj.dynamicVas}/10
                          </span>
                          {inj.vasSource === "yesterday" && (
                            <span className="text-[9px] text-amber-400 font-medium tracking-tight mt-0.5">
                              вчора · сьогодні ще немає
                            </span>
                          )}
                          {inj.vasSource === "card" && (
                            <span className="text-[9px] text-slate-500 font-medium tracking-tight mt-0.5">
                              огляд · сьогодні ще немає
                            </span>
                          )}
                          {inj.vasSource === "today" && (
                            <span className="text-[9px] text-emerald-400 font-medium tracking-tight mt-0.5">
                              сьогодні (ранок)
                            </span>
                          )}
                        </div>
                        <ChevronRight size={14} className="text-slate-500 group-hover:text-white transition-colors" />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Readiness & Rehab (5 cols) */}
          <div className="lg:col-span-5 space-y-6">

            {/* Squad Readiness Card */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>📊</span> Бойова готовність
                </h3>
                <span className="text-xs font-mono font-bold text-sky-400">
                  {readyCount} / {totalPlayers ?? 0} гравців
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-900/40">
                  <div className="text-xl font-bold font-mono text-red-400">{activeInjuries ?? 0}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Лазарет</div>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-900/40">
                  <div className="text-xl font-bold font-mono text-amber-400">{onRehab ?? 0}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Реабілітація</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-900/40">
                  <div className="text-xl font-bold font-mono text-emerald-400">{readyCount}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">100% Готові</div>
                </div>
              </div>

              {(totalPlayers ?? 0) > 0 && (
                <div className="h-2 rounded-full overflow-hidden flex bg-slate-800 p-0.5 gap-0.5">
                  <div className="bg-red-500 rounded-l-full" style={{ width: `${((activeInjuries ?? 0) / (totalPlayers ?? 1)) * 100}%` }} />
                  <div className="bg-amber-500" style={{ width: `${((onRehab ?? 0) / (totalPlayers ?? 1)) * 100}%` }} />
                  <div className="bg-emerald-500 rounded-r-full flex-1" />
                </div>
              )}
            </div>

            {/* Exposure & Injury Incidence Rate Card (Задача 4.2) */}
            <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span>⏱️</span> Травматизм на 1000 годин
                </h3>
                <Link
                  href="/exposures"
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition flex items-center gap-1"
                >
                  Експозиція <ChevronRight size={13} />
                </Link>
              </div>

              {exposureMetrics.hasSufficientData && exposureMetrics.overallIncidence != null ? (
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black font-mono text-white">
                        {exposureMetrics.overallIncidence.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400 ml-1.5 font-sans">
                        травм / 1000 год
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-sky-400 font-semibold">
                      {exposureMetrics.totalExposureHours.toFixed(0)} год експозиції
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                        Тренування
                      </div>
                      <div className="text-sm font-bold font-mono text-sky-300 mt-0.5">
                        {exposureMetrics.trainingIncidence != null
                          ? `${exposureMetrics.trainingIncidence.toFixed(1)} / 1000 год`
                          : "—"}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        {exposureMetrics.trainingExposureHours.toFixed(0)} год ({exposureMetrics.trainingInjuries} травм)
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                        Матчі
                      </div>
                      <div className="text-sm font-bold font-mono text-emerald-300 mt-0.5">
                        {exposureMetrics.matchIncidence != null
                          ? `${exposureMetrics.matchIncidence.toFixed(1)} / 1000 год`
                          : "—"}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">
                        {exposureMetrics.matchExposureHours.toFixed(0)} год ({exposureMetrics.matchInjuries} травм)
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center space-y-2">
                  <div className="text-xs font-semibold text-slate-400">
                    {INSUFFICIENT_EXPOSURE_DATA_MSG}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Внесіть хвилини тренувань та матчів команди для точного епідеміологічного підрахунку
                  </p>
                  <Link
                    href="/exposures"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition"
                  >
                    + Ввести експозицію
                  </Link>
                </div>
              )}
            </div>

            {/* Rehabilitation Phase Tracker */}
            {rehabRows.length > 0 && (
              <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡</span> Прогрес повернення (RTP)
                  </h3>
                  <Link href="/availability" className="text-xs text-sky-400 hover:text-sky-300">
                    Деталі
                  </Link>
                </div>

                <div className="space-y-2">
                  {rehabRows.map((r) => (
                    <Link
                      key={r.id}
                      href={`/injuries/${r.id}`}
                      className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-sky-500/30 transition flex items-center justify-between gap-3 block"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{r.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.injury} · <span className="text-sky-400 font-mono">{r.subtitle}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progressColor(r.progressPct)}`} style={{ width: `${r.progressPct}%` }} />
                        </div>
                        <span className={`text-xs font-mono font-bold ${progressTextColor(r.progressPct)}`}>
                          {r.progressPct}%
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
