// src/app/[locale]/page.tsx  (або src/components/DoctorDashboard.tsx)
// Головний дашборд Медичного штабу ФК Чорноморець
//
// Залежності:
//   - @supabase/ssr  (вже є у проєкті)
//   - next-intl      (вже є у проєкті)
//   - lucide-react   (npm i lucide-react)
//
// Підключення: замінити src/app/[locale]/page.tsx на цей файл
// або імпортувати як <DoctorDashboard /> у page.tsx

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import {
  FirstAidKit,
  Activity,
  CheckCircle,
  Calendar,
  Brain,
  Stethoscope,
  Plus,
  ChevronRight,
  Circle,
} from "lucide-react";

// ─── Типи ────────────────────────────────────────────────────────────────────

type StatCard = {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  accent: "red" | "amber" | "green" | "blue";
  href: string;
};

type TriagePlayer = {
  initials: string;
  name: string;
  team: string;
  injury: string;
  vas: number;
  zone: "red" | "amber";
  playerId: string;
};

type RehabPlayer = {
  name: string;
  injury: string;
  weekCurrent: number;
  weekTotal: number;
  progressPct: number;
  playerId: string;
};

type MatchGroup = {
  group: string;
  opponent: string;
  date: string;
  ready: number;
  total: number;
};

// ─── Конфіг кольорів ─────────────────────────────────────────────────────────

const ACCENT = {
  red:   { border: "border-l-red-500",   text: "text-red-400",   bg: "bg-red-500/10",   badge: "bg-red-500/10 text-red-400 border-red-500/25" },
  amber: { border: "border-l-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", badge: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  green: { border: "border-l-green-500", text: "text-green-400", bg: "bg-green-500/10", badge: "bg-green-500/10 text-green-400 border-green-500/25" },
  blue:  { border: "border-l-blue-500",  text: "text-blue-400",  bg: "bg-blue-500/10",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/25" },
};

// ─── Мок-дані (замінити на реальні Supabase-запити) ──────────────────────────

const MOCK_TRIAGE: TriagePlayer[] = [
  { initials: "ІО", name: "Іванов О.", team: "U19", injury: "Розрив ПКС · ліве коліно", vas: 8, zone: "red",   playerId: "player-1" },
  { initials: "ПМ", name: "Петров М.", team: "Академія", injury: "Мікронадрив задньої пов.", vas: 5, zone: "amber", playerId: "player-2" },
  { initials: "СВ", name: "Сидоренко В.", team: "U21", injury: "Розтягнення зв'язок · щиколотка", vas: 4, zone: "amber", playerId: "player-3" },
];

const MOCK_REHAB: RehabPlayer[] = [
  { name: "Мороз С.",  injury: "М'яз стегна",  weekCurrent: 3, weekTotal: 4,  progressPct: 75, playerId: "player-4" },
  { name: "Бондар Р.", injury: "Щиколотка",    weekCurrent: 2, weekTotal: 6,  progressPct: 33, playerId: "player-5" },
  { name: "Ткач В.",   injury: "Поперек",      weekCurrent: 1, weekTotal: 3,  progressPct: 20, playerId: "player-6" },
];

const MOCK_MATCHES: MatchGroup[] = [
  { group: "Основний склад", opponent: "Шахтар",       date: "24 тра · 19:00", ready: 22, total: 33 },
  { group: "U-21",           opponent: "Динамо U21",   date: "25 тра · 12:00", ready: 18, total: 22 },
  { group: "U-19",           opponent: "Олімпік U19",  date: "26 тра · 11:00", ready: 16, total: 20 },
];

// ─── Утиліти ─────────────────────────────────────────────────────────────────

function todayUk(): string {
  return new Date().toLocaleDateString("uk-UA", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
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
      className={`
        bg-slate-900/80 border border-blue-900/25 border-l-[3px] ${c.border}
        rounded-lg p-2.5 cursor-pointer transition-colors
        hover:border-blue-500/40 block
      `}
    >
      <div className={`text-sm mb-1 ${c.text} opacity-60`}>{icon}</div>
      <div className={`text-[22px] font-medium leading-none ${c.text}`}>{value}</div>
      <div className="text-[9px] text-slate-600 mt-1">{label}</div>
    </Link>
  );
}

function TriageCard({ player, locale }: { player: TriagePlayer; locale: string }) {
  const c = ACCENT[player.zone];
  return (
    <Link
      href={`/${locale}/players/${player.playerId}`}
      className="
        bg-slate-900/80 border border-blue-900/20 rounded-lg
        p-2 flex items-center gap-2 cursor-pointer
        transition-colors hover:border-blue-500/40
      "
    >
      <div className={`w-7 h-7 rounded-[5px] flex-shrink-0 flex items-center justify-center text-[10px] font-medium ${c.bg} ${c.text}`}>
        {player.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-200 truncate">{player.name}</div>
        <div className="text-[10px] text-slate-600 truncate">{player.team} · {player.injury}</div>
      </div>
      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 ${c.badge}`}>
        ВАШ {player.vas}/10
      </span>
      <ChevronRight size={12} className="text-slate-700 flex-shrink-0" />
    </Link>
  );
}

function RehabRow({ player, locale }: { player: RehabPlayer; locale: string }) {
  return (
    <Link
      href={`/${locale}/players/${player.playerId}?tab=rehab`}
      className="
        bg-slate-900/80 border border-blue-900/15 rounded-lg
        p-2 flex items-center gap-3 cursor-pointer
        transition-colors hover:border-blue-500/35
      "
    >
      <div className="flex-1">
        <div className="text-[12px] font-medium text-slate-300">{player.name}</div>
        <div className="text-[10px] text-slate-600">{player.injury} · тиж {player.weekCurrent}/{player.weekTotal}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-16 h-1 bg-blue-900/20 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${progressColor(player.progressPct)}`}
            style={{ width: `${player.progressPct}%` }}
          />
        </div>
        <span className={`text-[10px] min-w-[26px] text-right ${progressTextColor(player.progressPct)}`}>
          {player.progressPct}%
        </span>
      </div>
    </Link>
  );
}

function MatchCard({ match, locale }: { match: MatchGroup; locale: string }) {
  return (
    <Link
      href={`/${locale}/availability`}
      className="
        bg-slate-900/80 border border-blue-900/20 rounded-lg
        p-2 cursor-pointer transition-colors hover:border-blue-500/40 block
      "
    >
      <div className="text-[9px] text-blue-500 font-medium uppercase tracking-wider mb-1">{match.group}</div>
      <div className="text-[11px] font-medium text-slate-200 mb-1 leading-tight">
        Чорноморець — {match.opponent}
      </div>
      <div className="text-[10px] text-blue-400">{match.date}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">
        Готові: <span className="text-green-400 font-medium">{match.ready}/{match.total}</span>
      </div>
    </Link>
  );
}

// ─── Головний компонент ───────────────────────────────────────────────────────

export default async function DoctorDashboard({
  params,
}: {
  params: { locale: string };
}) {
  const locale = params?.locale ?? "uk";
  const supabase = await createClient();

  // ── Реальні дані зі статистикою ──
  const [
    { count: activeInjuries },
    { count: onRehab },
    { count: cleared },
    { count: examsThisWeek },
  ] = await Promise.all([
    supabase
      .from("injuries")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("injuries")
      .select("*", { count: "exact", head: true })
      .eq("status", "rehabilitation"),
    supabase
      .from("injuries")
      .select("*", { count: "exact", head: true })
      .eq("status", "closed")
      .gte("actual_return_date", new Date().toISOString().split("T")[0]),
    // Замінити на реальну таблицю оглядів, коли з'явиться
    supabase
      .from("injuries")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const STAT_CARDS: StatCard[] = [
    { icon: <FirstAidKit size={14} />, value: activeInjuries ?? 4,  label: "Активні травми",    accent: "red",   href: `/${locale}/injuries` },
    { icon: <Activity     size={14} />, value: onRehab      ?? 7,  label: "На реабілітації",   accent: "amber", href: `/${locale}/injuries?status=rehabilitation` },
    { icon: <CheckCircle  size={14} />, value: cleared       ?? 22, label: "Готові до матчу",   accent: "green", href: `/${locale}/availability` },
    { icon: <Calendar     size={14} />, value: examsThisWeek ?? 12, label: "Огляди на тижні",  accent: "blue",  href: `/${locale}/exams` },
  ];

  return (
    // Зовнішня обгортка — смугастий фон команди
    <div className="relative min-h-screen overflow-hidden" style={{
      background: "repeating-linear-gradient(90deg, #060C1E 0px, #060C1E 60px, #0D2550 60px, #0D2550 120px)",
    }}>
      {/* Темний оверлей поверх смуг */}
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* ── Привітання ── */}
        <div className="pt-5 pb-3 border-b border-blue-900/15 mb-0">
          <p className="text-[10px] text-slate-600 mb-1 capitalize">{todayUk()}</p>
          <h1 className="text-[18px] font-medium text-slate-200">
            Добрий день, <span className="text-blue-400">Лікарю</span>
          </h1>
        </div>

        {/* ── Статистика ── */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Загальна статистика</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {STAT_CARDS.map((card) => (
              <StatCardItem key={card.label} {...card} />
            ))}
          </div>
        </section>

        {/* ── Тріаж ── */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Тріаж · Червона та Жовта зони</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {MOCK_TRIAGE.map((p) => (
              <TriageCard key={p.playerId} player={p} locale={locale} />
            ))}
          </div>
        </section>

        {/* ── Готовність до матчу ── */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Готовність до матчу</SectionLabel>
          <div className="bg-slate-900/80 border border-blue-900/20 rounded-lg p-3">
            <div className="flex gap-2 mb-2">
              {[
                { val: 4,  label: "Не готові",     color: "text-red-400",   bg: "bg-red-500/8",   border: "border-red-500/20" },
                { val: 7,  label: "Під питанням",  color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/20" },
                { val: 22, label: "Готові",         color: "text-green-400", bg: "bg-green-500/8", border: "border-green-500/20" },
              ].map(({ val, label, color, bg, border }) => (
                <div key={label} className={`flex-1 text-center py-1.5 rounded border ${bg} ${border}`}>
                  <div className={`text-base font-medium ${color}`}>{val}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-red-500"   style={{ width: "12%" }} />
              <div className="bg-amber-500" style={{ width: "21%" }} />
              <div className="bg-green-500 flex-1" />
            </div>
          </div>
        </section>

        {/* ── Реабілітація ── */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Реабілітація · Прогрес</SectionLabel>
          <div className="flex flex-col gap-1.5">
            {MOCK_REHAB.map((p) => (
              <RehabRow key={p.playerId} player={p} locale={locale} />
            ))}
          </div>
        </section>

        {/* ── Матчі по групах ── */}
        <section className="py-3 border-b border-blue-900/10">
          <SectionLabel>Найближчі матчі · По групах</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {MOCK_MATCHES.map((m) => (
              <MatchCard key={m.group} match={m} locale={locale} />
            ))}
          </div>
        </section>

        {/* ── Швидкі дії ── */}
        <section className="pt-3">
          <SectionLabel>Швидкі дії</SectionLabel>
          <div className="flex gap-2">
            <Link
              href={`/${locale}/injuries/new`}
              className="
                flex-1 flex items-center justify-center gap-1.5
                bg-blue-600 hover:bg-blue-700 text-white
                text-[11px] font-medium py-2.5 rounded-lg transition-colors
              "
            >
              <Plus size={13} />Фіксувати травму
            </Link>
            <Link
              href={`/${locale}/exams/new`}
              className="
                flex-1 flex items-center justify-center gap-1.5
                bg-blue-500/12 hover:bg-blue-500/20 text-blue-400
                border border-blue-500/28 text-[11px] font-medium
                py-2.5 rounded-lg transition-colors
              "
            >
              <Stethoscope size={13} />Новий огляд
            </Link>
            <Link
              href={`/${locale}/reports`}
              className="
                flex-1 flex items-center justify-center gap-1.5
                bg-violet-500/12 hover:bg-violet-500/20 text-violet-400
                border border-violet-500/28 text-[11px] font-medium
                py-2.5 rounded-lg transition-colors
              "
            >
              <Brain size={13} />AI Звіт
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
