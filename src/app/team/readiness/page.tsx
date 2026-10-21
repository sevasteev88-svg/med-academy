import Link from "next/link";
import { getTeamReadinessAction } from "@/actions/readiness-actions";
import CoachReadinessClient from "@/components/readiness/CoachReadinessClient";

export default async function TeamReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string; date?: string }>;
}) {
  const { teamId, date } = await searchParams;

  const result = await getTeamReadinessAction({
    teamId,
    date,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Хлібні крихти та навігація */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Link
                href="/coach-briefing"
                className="hover:text-sky-400 transition-colors"
              >
                ← Тактичний брифінг
              </Link>
              <span>/</span>
              <span className="text-slate-300">Готовність команди</span>
            </div>

            <div className="flex items-center gap-2.5 mt-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Готовність команди (Ранковий світлофор)
              </h1>
            </div>

            <p className="text-xs text-slate-400 mt-1">
              Індивідуальний аналіз відхилення від особистої норми гравця за 28 днів
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin/readiness-settings"
              className="px-3.5 py-2 rounded-xl bg-amber-950/30 border border-amber-500/30 hover:border-amber-500/60 text-xs font-bold text-amber-300 transition-all flex items-center gap-1.5"
            >
              <span>⚙️</span>
              <span>Пороги лікаря</span>
            </Link>
            <Link
              href="/team/qr-cards"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition-all"
            >
              📱 QR-картки
            </Link>
            <Link
              href="/coach-briefing"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition-all"
            >
              📋 Брифінг
            </Link>
          </div>
        </div>

        {result.error ? (
          <div className="p-6 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-sm">
            {result.error}
          </div>
        ) : (
          <CoachReadinessClient
            initialPlayers={result.players}
            teams={result.teams}
            currentTeamId={result.currentTeamId}
            currentDate={result.currentDate}
            userRole={result.userRole}
            config={result.config}
          />
        )}
      </div>
    </div>
  );
}
