/**
 * /exams/upcoming/page.tsx
 * Заплановані огляди: прострочені + сьогодні + найближчі 7 днів.
 * Лише для лікаря.
 */

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { LOCATION_UA, INJURY_TYPE_UA } from "@/lib/constants";

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

function shortName(p: any): string {
  if (!p) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

function initials(p: any): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

// Групуємо дату відносно сьогодні: "Прострочено" / "Сьогодні" / "Завтра" / людська дата
function groupLabel(dateStr: string, todayStr: string): string {
  const diffDays = Math.floor(
    (new Date(dateStr).getTime() - new Date(todayStr).getTime()) / 86400000
  );
  if (diffDays < 0) return "Прострочено";
  if (diffDays === 0) return "Сьогодні";
  if (diffDays === 1) return "Завтра";
  return new Date(dateStr).toLocaleDateString("uk-UA", {
    weekday: "long", day: "numeric", month: "long",
  });
}

export default async function UpcomingExamsPage() {
  const supabase = await createClient();

  const todayStr = new Date().toISOString().split("T")[0];
  const weekAheadStr = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  // Активні/реабілітаційні травми з датою наступного огляду ≤ сьогодні+7
  // (включно з простроченими — next_exam_date у минулому)
  const { data: injuries } = await supabase
    .from("injuries")
    .select(`
      id, location, injury_type, vas_score, next_exam_date, status,
      players ( first_name, last_name, teams ( name ) )
    `)
    .in("status", ["active", "rehabilitation"])
    .not("next_exam_date", "is", null)
    .lte("next_exam_date", weekAheadStr)
    .order("next_exam_date", { ascending: true });

  const rows = injuries ?? [];

  // Групуємо по мітці дати, зберігаючи порядок (прострочено найперше — вже відсортовано)
  const groups: { label: string; items: any[] }[] = [];
  for (const inj of rows) {
    const label = groupLabel(inj.next_exam_date, todayStr);
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push(inj);
  }

  const overdueCount = rows.filter((i) => i.next_exam_date < todayStr).length;
  const todayCount = rows.filter((i) => i.next_exam_date === todayStr).length;

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="flex items-center justify-between border-b border-blue-900/15 pb-4">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Заплановані огляди</h1>
            <p className="text-xs text-slate-500 mt-1">
              Сьогодні + наступні 7 днів
              {overdueCount > 0 && <span className="text-status-danger"> · {overdueCount} прострочено</span>}
              {todayCount > 0 && <span className="text-status-warn"> · {todayCount} сьогодні</span>}
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-500 hover:text-white transition-colors">
            ← Дашборд
          </Link>
        </div>

        {rows.length === 0 && (
          <div className="bg-surface border border-blue-900/18 rounded-xl p-8 text-center">
            <p className="text-slate-500 text-sm">
              На найближчі 7 днів оглядів не заплановано.
            </p>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.label}>
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
              group.label === "Прострочено" ? "text-status-danger" : "text-slate-500"
            }`}>
              {group.label} <span className="text-slate-600 normal-case font-normal">({group.items.length})</span>
            </h2>
            <div className="space-y-2">
              {group.items.map((inj: any) => {
                const p = inj.players;
                const isOverdue = group.label === "Прострочено";
                return (
                  <Link
                    key={inj.id}
                    href={`/injuries/${inj.id}`}
                    className={`flex items-center gap-3 bg-surface border rounded-xl p-3 transition-colors hover:border-blue-500/40 ${
                      isOverdue ? "border-status-danger/30" : "border-blue-900/18"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-medium ${
                      isOverdue ? "bg-status-danger/15 text-status-danger" : "bg-brand-blue/15 text-brand-blue"
                    }`}>
                      {initials(p)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{shortName(p)}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {p?.teams?.name ?? "—"} · {INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type} · {LOCATION_UA[inj.location] ?? inj.location}
                      </div>
                    </div>
                    <div className={`text-xs font-medium flex-shrink-0 ${isOverdue ? "text-status-danger" : "text-slate-400"}`}>
                      {fmtDate(inj.next_exam_date)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}
