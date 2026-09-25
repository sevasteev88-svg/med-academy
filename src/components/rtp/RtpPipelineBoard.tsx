"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { RTP_PHASES, type RtpPhaseNumber, type RtpPhaseLog } from "@/types/rtp";
import { saveRtpPhaseAction } from "@/actions/save-rtp-phase-action";
import { LOCATION_UA, POSITION_LABELS } from "@/lib/constants";

export interface RtpPlayerInjury {
  injuryId: string;
  playerId: string;
  playerName: string;
  position: string;
  teamId: string;
  teamName: string;
  photoUrl: string | null;
  diagnosis: string;
  location: string;
  dateOfInjury: string;
  expectedReturnDate: string | null;
  status: "active" | "rehabilitation";
  currentPhase: RtpPhaseNumber;
  targetDate: string;
  doctorNote?: string;
  criteriaMet?: string[];
  daysMissed: number;
}

export default function RtpPipelineBoard({
  initialInjuries,
  teams,
}: {
  initialInjuries: RtpPlayerInjury[];
  teams: { id: string; name: string }[];
}) {
  const [injuries, setInjuries] = useState<RtpPlayerInjury[]>(initialInjuries);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [activeModalInjury, setActiveModalInjury] = useState<RtpPlayerInjury | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal editing state
  const [editPhase, setEditPhase] = useState<RtpPhaseNumber>(1);
  const [editTargetDate, setEditTargetDate] = useState<string>("");
  const [editDoctorNote, setEditDoctorNote] = useState<string>("");
  const [editCriteria, setEditCriteria] = useState<string[]>([]);
  const [closeInjuryCheck, setCloseInjuryCheck] = useState<boolean>(false);

  const filtered = injuries.filter((inj) => {
    if (selectedTeam !== "all" && inj.teamId !== selectedTeam) return false;
    return true;
  });

  const openUpdateModal = (inj: RtpPlayerInjury) => {
    setActiveModalInjury(inj);
    setEditPhase(inj.currentPhase);
    setEditTargetDate(inj.targetDate || inj.expectedReturnDate || "");
    setEditDoctorNote(inj.doctorNote || "");
    setEditCriteria(inj.criteriaMet || []);
    setCloseInjuryCheck(false);
  };

  const handleSaveModal = () => {
    if (!activeModalInjury) return;

    startTransition(async () => {
      const res = await saveRtpPhaseAction({
        injuryId: activeModalInjury.injuryId,
        playerId: activeModalInjury.playerId,
        phase: editPhase,
        targetDate: editTargetDate,
        doctorNote: editDoctorNote,
        criteriaMet: editCriteria,
        closeInjury: closeInjuryCheck,
      });

      if (!res.error) {
        setInjuries((prev) =>
          prev
            .map((item) => {
              if (item.injuryId === activeModalInjury.injuryId) {
                if (editPhase === 5 && closeInjuryCheck) return null;
                return {
                  ...item,
                  currentPhase: editPhase,
                  targetDate: editTargetDate,
                  expectedReturnDate: editTargetDate,
                  doctorNote: editDoctorNote,
                  criteriaMet: editCriteria,
                  status: editPhase >= 4 ? "rehabilitation" : "active",
                };
              }
              return item;
            })
            .filter(Boolean) as RtpPlayerInjury[]
        );
        setActiveModalInjury(null);
      } else {
        alert(res.error);
      }
    });
  };

  // Helper for countdown
  const getCountdownLabel = (targetDateStr: string | null) => {
    if (!targetDateStr) return { text: "Дата не вказана", color: "text-slate-500", days: 0 };
    const diffDays = Math.ceil(
      (new Date(targetDateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    );
    if (diffDays < 0) {
      return { text: `Прострочено на ${Math.abs(diffDays)} дн.`, color: "text-rose-400 font-bold", days: diffDays };
    }
    if (diffDays === 0) {
      return { text: "Повернення сьогодні!", color: "text-emerald-400 font-bold animate-pulse", days: 0 };
    }
    return { text: `Залишилось ${diffDays} дн.`, color: "text-sky-300 font-semibold", days: diffDays };
  };

  // Phase grouping
  const phasesList: RtpPhaseNumber[] = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-sky-500/15 backdrop-blur-md shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-semibold">Фільтр команди:</span>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-slate-950/80 border border-sky-500/25 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
          >
            <option value="all">Усі команди ({injuries.length} гравців)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-sky-500/20">
            <span className="text-slate-400">На етапах відновлення:</span>
            <span className="font-mono font-bold text-sky-400">{filtered.length}</span>
          </div>
          <Link
            href="/injuries/new"
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs transition-all shadow-md shadow-sky-600/20 active:scale-95 flex items-center gap-1.5"
          >
            <span>+</span> Фіксувати травму
          </Link>
        </div>
      </div>

      {/* 5-Column Interactive Kanban Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 items-start">
        {phasesList.map((phaseNum) => {
          const cfg = RTP_PHASES[phaseNum];
          const phasePlayers = filtered.filter((i) => i.currentPhase === phaseNum);

          return (
            <div
              key={phaseNum}
              className={`rounded-2xl border ${cfg.borderClass} ${cfg.bgClass} backdrop-blur-md p-3.5 flex flex-col min-h-[480px] shadow-lg shadow-black/20 transition-all`}
            >
              {/* Column Header */}
              <div className="pb-3 border-b border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
                    {cfg.shortTitle}
                  </span>
                  <span className="text-xs font-mono font-bold text-white bg-slate-900/80 px-2 py-0.5 rounded-lg border border-white/10">
                    {phasePlayers.length}
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white leading-tight mt-1">{cfg.title}</h4>
                <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">{cfg.tagline}</p>
              </div>

              {/* Player Cards inside Phase */}
              <div className="flex-1 py-3 space-y-2.5 overflow-y-auto max-h-[600px] custom-scrollbar">
                {phasePlayers.length === 0 ? (
                  <div className="h-32 border border-dashed border-white/10 rounded-xl flex items-center justify-center p-3 text-center">
                    <span className="text-[11px] text-slate-500">Немає гравців на цьому етапі</span>
                  </div>
                ) : (
                  phasePlayers.map((inj) => {
                    const countdown = getCountdownLabel(inj.targetDate || inj.expectedReturnDate);

                    return (
                      <div
                        key={inj.injuryId}
                        className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-sky-500/20 hover:border-sky-400 transition-all shadow-md group relative"
                      >
                        {/* Player Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {inj.photoUrl ? (
                              <img
                                src={inj.photoUrl}
                                alt={inj.playerName}
                                className="w-8 h-8 rounded-full object-cover border border-sky-500/30"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-sky-500/30 flex items-center justify-center text-[10px] font-bold text-sky-400">
                                {inj.playerName.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              <Link
                                href={`/players/${inj.playerId}`}
                                className="text-xs font-bold text-white hover:text-sky-300 transition-colors block leading-tight"
                              >
                                {inj.playerName}
                              </Link>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                <span className="font-mono text-sky-400 font-semibold">
                                  {POSITION_LABELS[inj.position] || inj.position}
                                </span>
                                <span>·</span>
                                <span className="truncate max-w-[90px]">{inj.teamName}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => openUpdateModal(inj)}
                            className="p-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/30 text-sky-400 hover:text-white text-[11px] transition-colors"
                            title="Змінити етап RTP"
                          >
                            ✏️
                          </button>
                        </div>

                        {/* Injury details */}
                        <div className="space-y-1.5 text-[11px] bg-slate-950/50 p-2 rounded-lg border border-white/5 mb-2">
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="font-medium text-slate-400">Травма:</span>
                            <span className="font-semibold text-rose-300 truncate max-w-[120px]">
                              {LOCATION_UA[inj.location] || inj.location}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-1 italic">
                            {inj.diagnosis || "Діагноз уточнюється"}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                            <span className="text-slate-400">На лікарняному:</span>
                            <span className="font-mono font-semibold text-amber-300">
                              {inj.daysMissed} дн.
                            </span>
                          </div>
                        </div>

                        {/* Return countdown */}
                        <div className="flex items-center justify-between text-[10px] pt-1">
                          <span className="text-slate-500">Допуск до гри:</span>
                          <span className={`font-mono ${countdown.color}`}>{countdown.text}</span>
                        </div>

                        {/* Progress Bar (Phases 1-5) */}
                        <div className="mt-2 pt-2 border-t border-white/5">
                          <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1">
                            <span>Прогрес RTP</span>
                            <span className="font-mono font-bold text-sky-400">
                              {phaseNum * 20}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((step) => (
                              <div
                                key={step}
                                className={`flex-1 h-full rounded-full transition-all ${
                                  step <= phaseNum ? "bg-gradient-to-r from-sky-400 to-emerald-400" : "bg-slate-800"
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Links */}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <Link
                            href={`/injuries/${inj.injuryId}`}
                            className="hover:text-sky-300 transition-colors flex items-center gap-1"
                          >
                            <span>🩹</span> Картка травми
                          </Link>
                          <button
                            onClick={() => openUpdateModal(inj)}
                            className="text-sky-400 hover:text-sky-300 font-semibold"
                          >
                            Оновити етап →
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Phase Modal */}
      {activeModalInjury && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-sky-500/30 p-6 space-y-4 shadow-2xl shadow-sky-950/50">
            <div className="flex items-center justify-between pb-3 border-b border-sky-500/15">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⏱️</span> Оновлення етапу Return-to-Play
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Гравець: <span className="text-sky-300 font-semibold">{activeModalInjury.playerName}</span> ·{" "}
                  {activeModalInjury.diagnosis}
                </p>
              </div>
              <button
                onClick={() => setActiveModalInjury(null)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Select Phase */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Клінічна фаза повернення:</label>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
                {phasesList.map((p) => {
                  const cfg = RTP_PHASES[p];
                  const isSel = editPhase === p;

                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditPhase(p)}
                      className={`p-2 rounded-xl border text-center transition-all text-xs ${
                        isSel
                          ? "bg-sky-500 text-white font-bold border-sky-400 shadow-md shadow-sky-500/30"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-sm font-mono">{p}</div>
                      <div className="text-[10px] leading-tight truncate">{cfg.shortTitle.split(". ")[1]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phase Description */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-sky-500/20 text-xs space-y-1.5">
              <div className="text-sky-300 font-bold">{RTP_PHASES[editPhase].title}</div>
              <p className="text-slate-300 text-[11px]">
                <strong className="text-emerald-400">Дозволено:</strong> {RTP_PHASES[editPhase].allowedActivity}
              </p>
              <p className="text-slate-300 text-[11px]">
                <strong className="text-rose-400">Заборонено:</strong> {RTP_PHASES[editPhase].prohibitedActivity}
              </p>
            </div>

            {/* Target Return Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Цільова дата повного повернення до гри (Clearance Date):
              </label>
              <input
                type="date"
                value={editTargetDate}
                onChange={(e) => setEditTargetDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
              />
            </div>

            {/* Doctor Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Клінічна нотатка лікаря / фізіотерапевта:
              </label>
              <textarea
                value={editDoctorNote}
                onChange={(e) => setEditDoctorNote(e.target.value)}
                placeholder="Динаміка болю, результати динамометрії, переносимість бігового навантаження..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400 resize-none"
              />
            </div>

            {/* Option to Close Injury if Phase 5 */}
            {editPhase === 5 && (
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={closeInjuryCheck}
                  onChange={(e) => setCloseInjuryCheck(e.target.checked)}
                  className="rounded border-emerald-500 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-xs text-emerald-300 font-semibold">
                  Закрити травму (зняти футболіста з лікарняного та перевести у 100% готові)
                </span>
              </label>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-sky-500/15">
              <button
                type="button"
                onClick={() => setActiveModalInjury(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={isPending}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-600/30 active:scale-95 disabled:opacity-50"
              >
                {isPending ? "Збереження..." : "Зберегти етап RTP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
