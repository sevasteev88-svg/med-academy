import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import WorkloadClient from "@/components/workload/WorkloadClient";
import type {
  PlayerWorkloadSummary,
  SessionRpeEntry,
  RpeScore,
} from "@/types/workload";
import { calculateAcwr } from "@/types/workload";

export const metadata = {
  title: "Моніторинг навантажень (Session-RPE & ACWR) · ФК «Чорноморець»",
  description: "Контроль тренувального навантаження, коефіцієнт ACWR за Тімом Габбеттом",
};

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ playerId?: string }>;
}) {
  await assertAuth();
  const { playerId } = await searchParams;
  const supabase = await createClient();

  // 1. Fetch players (1.6 виключаємо архівних гравців)
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, teams(name)")
    .is("archived_at", null)
    .order("last_name");

  // 2. Fetch recent workload sessions
  let workloadEntries: SessionRpeEntry[] = [];

  const { data: directSessions } = await supabase
    .from("workload_sessions")
    .select("*")
    .order("date", { ascending: false })
    .limit(300);

  if (directSessions && directSessions.length > 0) {
    workloadEntries = directSessions as any;
  } else {
    // Fallback: читаємо з injury_logs [WORKLOAD]
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[WORKLOAD]%")
      .order("date", { ascending: false })
      .limit(300);

    if (logs) {
      workloadEntries = logs
        .map((l) => {
          try {
            const rawJson = l.note.replace("[WORKLOAD] ", "");
            return JSON.parse(rawJson) as SessionRpeEntry;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as SessionRpeEntry[];
    }
  }

  // 3. Розрахунок ACWR для кожного гравця
  const now = new Date();
  const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const d28Ago = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const summaries: PlayerWorkloadSummary[] = (players || []).map((p: any) => {
    const pSessions = workloadEntries.filter((e) => e.player_id === p.id);

    const acuteSessions = pSessions.filter((e) => e.date >= d7Ago && (e as any).attendance_status !== "absent");
    const chronicSessions = pSessions.filter((e) => e.date >= d28Ago && (e as any).attendance_status !== "absent");

    const acuteLoad = acuteSessions.reduce((sum, s) => sum + (s.workload_au || 0), 0);
    const chronicLoad = chronicSessions.reduce((sum, s) => sum + (s.workload_au || 0), 0);
    const weeklyChronic = Math.round(chronicLoad > 0 ? chronicLoad / 4 : 0);

    // Розрахунок періоду моніторингу (задача 3.1: мінімум >= 28 днів даних для ACWR)
    let daysMonitored = 0;
    if (pSessions.length > 0) {
      const dates = pSessions.map((s) => s.date).sort();
      const earliest = new Date(dates[0]).getTime();
      const todayMs = now.getTime();
      // Кількість днів від першого зареєстрованого тренування до сьогодні
      const daysSpan = Math.floor((todayMs - earliest) / (1000 * 60 * 60 * 24)) + 1;
      // Якщо спан менше 28 днів, у гравця об'єктивно ще немає повного 28-денного вікна
      daysMonitored = daysSpan;
    }

    const acwrCalc = calculateAcwr(acuteLoad, chronicLoad, {
      chronicSessionsCount: chronicSessions.length,
      daysMonitored,
    });
    const lastSession = pSessions[0];

    let rpeDiscrepancy: { coachRpe: number; playerRpe: number; diff: number } | null = null;
    if (
      lastSession &&
      (lastSession as any).coach_rpe !== undefined &&
      (lastSession as any).coach_rpe !== null &&
      (lastSession as any).player_rpe !== undefined &&
      (lastSession as any).player_rpe !== null
    ) {
      const diff = Number((lastSession as any).player_rpe) - Number((lastSession as any).coach_rpe);
      rpeDiscrepancy = {
        coachRpe: Number((lastSession as any).coach_rpe),
        playerRpe: Number((lastSession as any).player_rpe),
        diff,
      };
    }

    return {
      playerId: p.id,
      playerName: `${p.first_name} ${p.last_name}`,
      teamName: p.teams?.name || "Академія",
      position: p.position || "—",
      acuteLoad,
      chronicLoad,
      weeklyChronicAverage: weeklyChronic,
      acwr: acwrCalc.acwr,
      riskZone: acwrCalc.riskZone,
      isInsufficientData: acwrCalc.isInsufficientData,
      recentSessionsCount: pSessions.length,
      lastSessionDate: lastSession ? lastSession.date : null,
      lastSessionRpe: lastSession ? ((lastSession as any).coach_rpe ?? lastSession.rpe_score) : null,
      lastSessionWorkload: lastSession ? lastSession.workload_au : null,
      attendanceStatus: (lastSession as any)?.attendance_status || "present",
      rpeDiscrepancy,
    };
  });

  // Доповнюємо recentEntries іменами гравців для історії
  const enrichedEntries = workloadEntries.slice(0, 50).map((entry) => {
    const p = (players || []).find((x: any) => x.id === entry.player_id) as any;
    return {
      ...entry,
      playerName: p ? `${p.first_name} ${p.last_name}` : entry.player_id,
      teamName: p?.teams?.name || "",
    };
  });

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-sky-500/15 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>⏱️</span> Моніторинг навантажень (Session-RPE & ACWR)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Контроль гострого до хронічного навантаження (Gabbett ACWR) для моніторингу навантаження та оптимізації відновлення
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <a
              href="/training"
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95"
            >
              <span>⏱️</span>
              <span>Ввести тренування (10 с)</span>
            </a>
            <a
              href="/wellness"
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-sky-400 border border-sky-500/25 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
            >
              <span>⚡</span>
              <span>Велнес</span>
            </a>
            <a
              href="/availability"
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-emerald-400 border border-emerald-500/25 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
            >
              <span>🟢</span>
              <span>Доступність</span>
            </a>
          </div>
        </header>

        <Suspense fallback={<div className="text-center py-12 text-slate-500 text-sm">Завантаження даних навантаження...</div>}>
          <WorkloadClient
            players={(players || []).map((p: any) => ({
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              position: p.position,
              teams: Array.isArray(p.teams) ? p.teams[0] ?? null : p.teams ?? null,
            }))}
            summaries={summaries}
            recentEntries={enrichedEntries}
            defaultPlayerId={playerId}
          />
        </Suspense>
      </div>
    </div>
  );
}
