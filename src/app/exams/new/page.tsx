// src/app/exams/new/page.tsx
// Список травмованих гравців для вибору нового огляду

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

// ── Скільки днів тому був останній огляд ────────────────────────────────────
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function LastExamBadge({ days }: { days: number | null }) {
  if (days === null)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
        без огляду
      </span>
    );
  if (days === 0)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
        сьогодні
      </span>
    );
  if (days <= 3)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
        {days} дн. тому
      </span>
    );
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
      {days} дн. тому
    </span>
  );
}

// ── Аватар ───────────────────────────────────────────────────────────────────
function Avatar({
  initials,
  zone,
}: {
  initials: string;
  zone: "red" | "amber" | "blue";
}) {
  const cls = {
    red: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
    amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    blue: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  }[zone];
  return (
    <div
      className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold ${cls}`}
    >
      {initials}
    </div>
  );
}

// ── Головна сторінка ─────────────────────────────────────────────────────────
export default async function ExamsNewPage() {
  const supabase = await createClient();

  // Всі активні та реабілітаційні травми з даними гравця
  const { data: injuries } = await supabase
    .from("injuries")
    .select(
      `
      id,
      location,
      injury_type,
      status,
      date_of_injury,
      description,
      players (
        id,
        first_name,
        last_name,
        teams ( name )
      )
    `
    )
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  // Останній лог огляду для кожної травми
  const injuryIds = (injuries ?? []).map((i) => i.id);
  const { data: lastLogs } = await supabase
    .from("injury_logs")
    .select("injury_id, date")
    .in("injury_id", injuryIds)
    .order("date", { ascending: false });

  // Мапи: injury_id → остання дата огляду
  const lastLogMap: Record<string, string> = {};
  (lastLogs ?? []).forEach((l) => {
    if (!lastLogMap[l.injury_id]) lastLogMap[l.injury_id] = l.date;
  });

  const active = (injuries ?? []).filter((i) => i.status === "active");
  const rehab = (injuries ?? []).filter((i) => i.status === "rehabilitation");

  function initials(p: any) {
    if (!p) return "??";
    return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
  }

  function fullName(p: any) {
    if (!p) return "—";
    return `${p.last_name} ${p.first_name}`;
  }

  function injuryDays(dateStr: string) {
    return Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 86400000
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">

        {/* Topbar */}
        <div className="flex items-center gap-3 pb-3 border-b border-sky-500/15">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-sky-500/20 flex items-center justify-center text-sky-400 hover:bg-sky-500/20 hover:text-white transition-all flex-shrink-0"
          >
            ←
          </Link>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">
              Новий огляд
            </div>
            <div className="text-[11px] text-slate-400">
              Оберіть травмованого гравця для проведення огляду
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/25 font-medium flex items-center gap-1.5">
            <Users size={12} />
            {(injuries ?? []).length} гравців
          </span>
        </div>

        {/* Червона зона */}
        {active.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-rose-400">
                Червона зона · Гострі травми
              </span>
              <div className="flex-1 h-px bg-rose-500/20" />
            </div>
            <div className="flex flex-col gap-2">
              {active.map((inj) => {
                const p = inj.players as any;
                const days = daysSince(lastLogMap[inj.id] ?? null);
                return (
                  <Link
                    key={inj.id}
                    href={`/exams/new/${inj.id}`}
                    className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 hover:border-sky-500/40 shadow-sm hover:shadow-[0_4px_20px_rgba(14,165,233,0.15)] flex items-center gap-3 transition-all group"
                  >
                    <Avatar initials={initials(p)} zone="red" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                          {fullName(p)}
                        </span>
                        <LastExamBadge days={days} />
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {p?.teams?.name ?? "—"} · <span className="text-slate-300">{inj.location}</span> ·{" "}
                        <span className="font-mono text-rose-300">{injuryDays(inj.date_of_injury)} дн. травми</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-slate-600 group-hover:text-sky-400 transition-colors flex-shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Жовта зона */}
        {rehab.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] flex-shrink-0" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400">
                Жовта зона · Реабілітація
              </span>
              <div className="flex-1 h-px bg-amber-500/20" />
            </div>
            <div className="flex flex-col gap-2">
              {rehab.map((inj) => {
                const p = inj.players as any;
                const days = daysSince(lastLogMap[inj.id] ?? null);
                return (
                  <Link
                    key={inj.id}
                    href={`/exams/new/${inj.id}`}
                    className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 hover:border-amber-500/40 shadow-sm hover:shadow-[0_4px_20px_rgba(245,158,11,0.15)] flex items-center gap-3 transition-all group"
                  >
                    <Avatar initials={initials(p)} zone="amber" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                          {fullName(p)}
                        </span>
                        <LastExamBadge days={days} />
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {p?.teams?.name ?? "—"} · <span className="text-slate-300">{inj.location}</span> ·{" "}
                        <span className="font-mono text-amber-300">{injuryDays(inj.date_of_injury)} дн. травми</span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-slate-600 group-hover:text-amber-400 transition-colors flex-shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {(injuries ?? []).length === 0 && (
          <div className="p-8 rounded-2xl bg-slate-900/40 border border-emerald-500/20 text-center text-slate-400 text-xs">
            <span className="text-2xl block mb-2">🟢</span>
            Травмованих гравців наразі немає. Всі гравці в строю!
          </div>
        )}
      </div>
    </div>
  );
}
