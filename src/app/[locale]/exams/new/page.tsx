// src/app/[locale]/exams/new/page.tsx
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
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
        без огляду
      </span>
    );
  if (days === 0)
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">
        сьогодні
      </span>
    );
  if (days <= 3)
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">
        {days} дн. тому
      </span>
    );
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">
      {days} дн. тому
    </span>
  );
}

function VasBadge({ vas }: { vas: number | null }) {
  if (!vas) return null;
  const cls =
    vas >= 7
      ? "bg-red-500/10 text-red-400 border-red-500/22"
      : vas >= 4
      ? "bg-amber-500/10 text-amber-400 border-amber-500/22"
      : "bg-blue-500/10 text-blue-400 border-blue-500/22";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${cls}`}>
      ВАШ {vas}/10
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
    red: "bg-red-500/14 text-red-400",
    amber: "bg-amber-500/14 text-amber-400",
    blue: "bg-blue-500/14 text-blue-400",
  }[zone];
  return (
    <div
      className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-medium ${cls}`}
    >
      {initials}
    </div>
  );
}

// ── Головна сторінка ─────────────────────────────────────────────────────────
export default async function ExamsNewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
    <div
      className="relative min-h-screen"
      style={{
        background:
          "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
      }}
    >
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15 mb-4">
          <Link
            href={`/${locale}`}
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            ←
          </Link>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-slate-200">
              Новий огляд
            </div>
            <div className="text-[10px] text-slate-600">
              Оберіть травмованого гравця
            </div>
          </div>
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/22 font-medium">
            <Users size={10} className="inline mr-1" />
            {(injuries ?? []).length} гравців
          </span>
        </div>

        {/* Червона зона */}
        {active.length > 0 && (
          <section className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-red-400">
                Червона зона · Гострі травми
              </span>
              <div className="flex-1 h-px bg-red-500/15" />
            </div>
            <div className="flex flex-col gap-1.5">
              {active.map((inj) => {
                const p = inj.players as any;
                const days = daysSince(lastLogMap[inj.id] ?? null);
                return (
                  <Link
                    key={inj.id}
                    href={`/${locale}/exams/new/${inj.id}`}
                    className="bg-slate-900/80 border border-blue-900/15 rounded-lg p-2.5 flex items-center gap-2.5 hover:border-blue-500/35 transition-colors group"
                  >
                    <Avatar initials={initials(p)} zone="red" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[12px] font-medium text-slate-200 truncate">
                          {fullName(p)}
                        </span>
                        <LastExamBadge days={days} />
                      </div>
                      <div className="text-[10px] text-slate-600 truncate">
                        {p?.teams?.name ?? "—"} · {inj.location} ·{" "}
                        {injuryDays(inj.date_of_injury)} дн. травми
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-slate-700 group-hover:text-blue-500 transition-colors flex-shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Жовта зона */}
        {rehab.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-amber-400">
                Жовта зона · Реабілітація
              </span>
              <div className="flex-1 h-px bg-amber-500/15" />
            </div>
            <div className="flex flex-col gap-1.5">
              {rehab.map((inj) => {
                const p = inj.players as any;
                const days = daysSince(lastLogMap[inj.id] ?? null);
                return (
                  <Link
                    key={inj.id}
                    href={`/${locale}/exams/new/${inj.id}`}
                    className="bg-slate-900/80 border border-blue-900/15 rounded-lg p-2.5 flex items-center gap-2.5 hover:border-blue-500/35 transition-colors group"
                  >
                    <Avatar initials={initials(p)} zone="amber" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[12px] font-medium text-slate-200 truncate">
                          {fullName(p)}
                        </span>
                        <LastExamBadge days={days} />
                      </div>
                      <div className="text-[10px] text-slate-600 truncate">
                        {p?.teams?.name ?? "—"} · {inj.location} ·{" "}
                        {injuryDays(inj.date_of_injury)} дн. травми
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-slate-700 group-hover:text-blue-500 transition-colors flex-shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {(injuries ?? []).length === 0 && (
          <div className="text-center py-16 text-slate-600 text-sm">
            Травмованих гравців немає 🟢
          </div>
        )}
      </div>
    </div>
  );
}
