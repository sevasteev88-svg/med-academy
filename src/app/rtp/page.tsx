import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import RtpPipelineBoard, { type RtpPlayerInjury } from "@/components/rtp/RtpPipelineBoard";
import type { RtpPhaseNumber, RtpPhaseLog } from "@/types/rtp";
import type { PlayerPhoto } from "@/types/photo";

export const metadata = {
  title: "Return-to-Play (RTP) · Медичний штаб ФК «Чорноморець»",
  description: "Етапи повернення футболістів у гру за протоколами FIFA та Aspetar",
};

export default async function RtpPage() {
  const supabase = await createClient();

  // 1. Отримуємо команди
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (teamsData || []).map((t) => ({ id: t.id, name: t.name }));

  // 2. Отримуємо активні травми та травми на реабілітації
  const { data: injuriesData } = await supabase
    .from("injuries")
    .select(`
      id,
      player_id,
      diagnosis,
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

  // 3. Отримуємо логи RTP та фото гравців
  const [rtpLogsRes, photoLogsRes] = await Promise.all([
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[RTP_PHASE]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[PLAYER_PHOTO]%")
      .order("date", { ascending: false }),
  ]);

  // Словник останніх RTP етапів по injury_id
  const latestRtpByInjury: Record<string, RtpPhaseLog> = {};
  for (const log of rtpLogsRes.data || []) {
    try {
      const raw = log.note.replace("[RTP_PHASE] ", "");
      const parsed: RtpPhaseLog = JSON.parse(raw);
      if (parsed.injury_id && !latestRtpByInjury[parsed.injury_id]) {
        latestRtpByInjury[parsed.injury_id] = parsed;
      }
    } catch {}
  }

  // Словник фото
  const photoByPlayer: Record<string, string> = {};
  for (const log of photoLogsRes.data || []) {
    try {
      const raw = log.note.replace("[PLAYER_PHOTO] ", "");
      const parsed: PlayerPhoto = JSON.parse(raw);
      if (parsed.player_id && !photoByPlayer[parsed.player_id]) {
        photoByPlayer[parsed.player_id] = parsed.photo_url;
      }
    } catch {}
  }

  // Формуємо масив для клієнтської дошки
  const rtpInjuries: RtpPlayerInjury[] = (injuriesData || []).map((inj: any) => {
    const rtpLog = latestRtpByInjury[inj.id];
    const player = inj.players;

    // Default phase based on status if no explicit RTP log
    let defaultPhase: RtpPhaseNumber = inj.status === "rehabilitation" ? 4 : 1;
    const currentPhase = rtpLog?.phase || defaultPhase;

    const daysMissed = Math.floor(
      (Date.now() - new Date(inj.date_of_injury).getTime()) / 86400000
    );

    return {
      injuryId: inj.id,
      playerId: player.id,
      playerName: `${player.last_name} ${player.first_name}`.trim(),
      position: player.position,
      teamId: player.team_id,
      teamName: player.teams?.name || "Команда",
      photoUrl: photoByPlayer[player.id] || null,
      diagnosis: inj.diagnosis || "Діагноз не вказано",
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
