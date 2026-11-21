import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { loadClubPlayerPhotos } from "@/lib/player-photos";
import Link from "next/link";
import RtpPipelineBoard, { type RtpPlayerInjury } from "@/components/rtp/RtpPipelineBoard";
import type { RtpPhaseNumber, RtpPhaseLog } from "@/types/rtp";

export const metadata = {
  title: "Return-to-Play (RTP) · Медичний штаб",
  description: "Етапи повернення футболістів у гру за протоколами FIFA та Aspetar",
};

export default async function RtpPage() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  const clubId = user?.clubId ?? null;

  let teamsQuery = supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  let injuriesQuery = supabase
    .from("injuries")
    .select(`
      id,
      player_id,
      description,
      injury_type,
      location,
      date_of_injury,
      expected_return_date,
      status,
      players!inner (
        id,
        first_name,
        last_name,
        position,
        team_id,
        teams!inner (
          id,
          name
        )
      )
    `)
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  let rtpLogsQuery = supabase
    .from("injury_logs")
    .select("*")
    .like("note", "[RTP_PHASE]%")
    .order("created_at", { ascending: false });

  if (clubId) {
    teamsQuery = teamsQuery.eq("club_id", clubId);
    injuriesQuery = injuriesQuery.eq("club_id", clubId);
    rtpLogsQuery = rtpLogsQuery.eq("club_id", clubId);
  }

  // 1-3. Отримуємо команди, травми та логи RTP
  const [{ data: teamsData }, { data: injuriesData }, rtpLogsRes] = await Promise.all([
    teamsQuery,
    injuriesQuery,
    rtpLogsQuery,
  ]);

  const teams = (teamsData || []).map((t) => ({ id: t.id, name: t.name }));

  const rtpPlayerIds = Array.from(
    new Set((injuriesData || []).map((inj: any) => inj.player_id).filter(Boolean))
  );
  const photoByPlayer =
    rtpPlayerIds.length > 0 ? await loadClubPlayerPhotos(clubId, rtpPlayerIds) : {};

  // Словник останніх RTP етапів по injury_id (вибираємо найновіший за міткою часу)
  const latestRtpByInjury: Record<string, RtpPhaseLog> = {};
  for (const log of rtpLogsRes.data || []) {
    try {
      const raw = log.note.replace("[RTP_PHASE] ", "");
      const parsed: RtpPhaseLog = JSON.parse(raw);
      if (parsed.injury_id) {
        const existing = latestRtpByInjury[parsed.injury_id];
        const logTime = new Date(parsed.updated_at || log.created_at || log.date).getTime();
        const existingTime = existing ? new Date(existing.updated_at || 0).getTime() : 0;
        if (!existing || logTime > existingTime) {
          latestRtpByInjury[parsed.injury_id] = parsed;
        }
      }
    } catch {}
  }

  // Формуємо масив для клієнтської дошки
  const rtpInjuries: RtpPlayerInjury[] = (injuriesData || []).map((inj: any) => {
    const rtpLog = latestRtpByInjury[inj.id];
    const player = inj.players;

    // Спершу перевіряємо лог RTP, потім тег [RTP_PHASE:X] у описі травми, потім статус
    const descMatch = inj.description?.match(/\[RTP_PHASE:(\d)\]/);
    const phaseFromDesc = descMatch ? (Number(descMatch[1]) as RtpPhaseNumber) : null;

    let defaultPhase: RtpPhaseNumber = inj.status === "rehabilitation" ? 4 : 1;
    const currentPhase = rtpLog?.phase || phaseFromDesc || defaultPhase;

    const daysMissed = Math.floor(
      (Date.now() - new Date(inj.date_of_injury).getTime()) / 86400000
    );

    const cleanDiagnosis = (inj.description || inj.injury_type || "Діагноз не вказано")
      .replace(/\[RTP_PHASE:\d\]\s*/g, "")
      .trim();

    return {
      injuryId: inj.id,
      playerId: player.id,
      playerName: `${player.last_name} ${player.first_name}`.trim(),
      position: player.position,
      teamId: player.team_id,
      teamName: player.teams?.name || "Команда",
      photoUrl: photoByPlayer[player.id] || null,
      diagnosis: cleanDiagnosis,
      location: inj.location,
      dateOfInjury: inj.date_of_injury,
      expectedReturnDate: inj.expected_return_date || null,
      status: inj.status,
      currentPhase,
      targetDate: rtpLog?.target_date || inj.expected_return_date || "",
      doctorNote: rtpLog?.doctor_note || "",
      criteriaMet: rtpLog?.criteria_met || [],
      daysMissed: Math.max(0, daysMissed),
    };
  });

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between pb-2 border-b border-sky-500/15">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-slate-400 hover:text-sky-300 text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <span>←</span> Дашборд
            </Link>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-slate-300 text-xs font-mono font-bold">Return-to-Play</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/coach-briefing"
              className="text-xs text-sky-400 hover:text-white px-3 py-1.5 rounded-xl border border-sky-500/25 bg-slate-900/60 transition-colors flex items-center gap-1"
            >
              <span>🛡️</span> Брифінг тренера
            </Link>
          </div>
        </div>

        {/* Header Hero */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Графік Return-to-Play (RTP Pipeline)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Клінічний 5-етапний контроль відновлення травмованих гравців за міжнародними стандартами FIFA & Aspetar
            </p>
          </div>
        </div>

        {/* Interactive Kanban Board */}
        <RtpPipelineBoard initialInjuries={rtpInjuries} teams={teams} />
      </div>
    </div>
  );
}
