"use client";

import React, { useState } from "react";
import {
  type PlayerTodaySession,
  SESSION_TYPE_UA,
  BORG_CR10_SCALE,
  SORENESS_LOCATIONS,
} from "@/types/workload";
import PostSessionFeedbackModal from "./PostSessionFeedbackModal";

interface Props {
  playerId: string;
  portalToken?: string;
  initialTodaySession?: PlayerTodaySession | null;
}

export default function PlayerPostSessionCard({
  playerId,
  portalToken,
  initialTodaySession,
}: Props) {
  const [todaySession, setTodaySession] = useState<PlayerTodaySession | null>(
    initialTodaySession || null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isCompleted = Boolean(
    todaySession?.isCompletedByPlayer &&
      todaySession.playerRpe !== null &&
      todaySession.playerRpe !== undefined
  );

  const sessionType = todaySession?.sessionType || "training_team";
  const typeInfo = SESSION_TYPE_UA[sessionType] || { label: "Тренування", icon: "🏃" };
  const rpeMeta =
    todaySession?.playerRpe !== null && todaySession?.playerRpe !== undefined
      ? BORG_CR10_SCALE[todaySession.playerRpe]
      : null;

  const sorenessCount = todaySession?.feedback?.sorenessLocations?.length || 0;
  const hasContusion = Boolean(todaySession?.feedback?.hasContusion);

  return (
    <>
      <div
        className={`rounded-3xl p-4 sm:p-5 border transition-all ${
          isCompleted
            ? "bg-slate-900/90 border-slate-700/80 shadow-md"
            : todaySession?.hasSession
            ? "bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30"
            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border ${
                isCompleted
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-500/20 border-amber-500/40 text-amber-300"
              }`}
            >
              {todaySession?.opponent ? "⚽" : typeInfo.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {todaySession?.opponent
                    ? `Матч проти «${todaySession.opponent}»`
                    : typeInfo.label}
                </span>
                {isCompleted ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <span>✓</span> Оцінено
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    Очікує оцінки
                  </span>
                )}
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                {isCompleted && todaySession
                  ? `Реакція: ${todaySession.playerRpe}/10 · ${todaySession.durationMinutes} хв`
                  : "Оціни навантаження після гри / тренування"}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold transition-all shrink-0 active:scale-95 border ${
              isCompleted
                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
            }`}
          >
            {isCompleted ? "✏️ Змінити" : "⚡ Оцінити"}
          </button>
        </div>

        {/* Completed details view */}
        {isCompleted && todaySession ? (
          <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="font-mono font-bold px-2 py-0.5 rounded-lg border text-xs"
                style={{
                  backgroundColor: `${rpeMeta?.color}20`,
                  borderColor: `${rpeMeta?.color}40`,
                  color: rpeMeta?.color,
                }}
              >
                {rpeMeta?.label || `${todaySession.playerRpe}/10`}
              </span>
              <span className="font-mono text-slate-400">
                {todaySession.durationMinutes * (todaySession.playerRpe || 0)} AU
              </span>

              {sorenessCount > 0 ? (
                <div className="flex items-center gap-1">
                  {todaySession.feedback?.sorenessLocations?.map((locId) => {
                    const item = SORENESS_LOCATIONS.find((l) => l.id === locId);
                    return (
                      <span
                        key={locId}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-orange-950/60 border border-orange-500/30 text-orange-300 flex items-center gap-1"
                      >
                        <span>{item?.icon || "🦵"}</span>
                        <span>{item?.label?.split(" ")[0] || locId}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                  ✨ М'язи в нормі
                </span>
              )}

              {hasContusion && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/60 border border-rose-500/40 text-rose-300 font-bold flex items-center gap-1">
                  🩹 Був забій
                </span>
              )}
            </div>

            {todaySession.feedback?.notes && (
              <div className="w-full text-[11px] text-slate-400 italic bg-slate-950/50 p-2 rounded-xl border border-slate-800/60 mt-1">
                «{todaySession.feedback.notes}»
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 text-xs text-slate-400 leading-relaxed">
            {todaySession?.hasSession ? (
              <span>
                Тренер зафіксував {todaySession.durationMinutes} хв навантаження.
                Вкажи, як воно відчувалося для тебе, та чи є втома чи спазми в ногах.
              </span>
            ) : (
              <span>
                Мав сьогодні тренування чи гру? Вкажи хвилини та оціни важкість (0–10),
                щоб медичний штаб врахував твоє навантаження та готовність.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      <PostSessionFeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        playerId={playerId}
        portalToken={portalToken}
        initialSession={todaySession}
        onSaved={(updated) => setTodaySession(updated)}
      />
    </>
  );
}
