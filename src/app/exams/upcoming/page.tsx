import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import UpcomingExamsClient from "@/components/exams/UpcomingExamsClient";

export default async function UpcomingExamsPage() {
  const supabase = await createClient();

  const todayStr = new Date().toISOString().split("T")[0];
  const weekAheadStr = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  // Активні/реабілітаційні травми з датою огляду (включно з простроченими)
  const { data: injuries } = await supabase
    .from("injuries")
    .select(`
      id,
      location,
      injury_type,
      vas_score,
      next_exam_date,
      status,
      players (
        id,
        first_name,
        last_name,
        teams ( name )
      )
    `)
    .in("status", ["active", "rehabilitation"])
    .not("next_exam_date", "is", null)
    .lte("next_exam_date", weekAheadStr)
    .order("next_exam_date", { ascending: true });

  const rows = (injuries as any) ?? [];

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Заголовок */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-900/15 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Календар контрольних оглядів
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Моніторинг динаміки відновлення · Сьогодні:{" "}
              {new Date().toLocaleDateString("uk-UA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/exams/new"
              className="px-3.5 py-2 rounded-lg bg-surface border border-slate-700 hover:border-slate-500 text-xs font-semibold text-white transition-colors"
            >
              + Вибрати гравця для огляду
            </Link>
          </div>
        </div>

        {/* Клієнтський інтерактивний список */}
        <UpcomingExamsClient injuries={rows} todayStr={todayStr} />
      </div>
    </div>
  );
}

