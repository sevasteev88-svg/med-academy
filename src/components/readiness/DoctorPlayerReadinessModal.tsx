"use client";

import React, { useState } from "react";
import type { PlayerReadinessResult } from "@/lib/readiness";
import { WEARABLES_DISCLAIMER_TEXT } from "@/lib/wearables-constants";

export interface DoctorPlayerReadinessModalProps {
  player: PlayerReadinessResult;
  onClose: () => void;
  onAcknowledge?: (playerId: string, date: string) => void;
  isPendingAck?: boolean;
}

export function DoctorPlayerReadinessModal({
  player,
  onClose,
  onAcknowledge,
  isPendingAck,
}: DoctorPlayerReadinessModalProps) {
  const details = player.doctorDetails;
  const wearables = details?.wearables;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-5 sm:p-6 space-y-5 text-slate-100">
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tracking-tight">
                {player.playerName || "Гравець"}
              </span>
              {player.position && (
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  {player.position}
                </span>
              )}
              <span className="text-xs text-slate-400 font-mono">
                {player.date}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Детальний медичний звіт: анкета Hooper-Mackinnon + біометрія з носимих пристроїв
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* СТАТУС СВІТЛОФОРА ТА РЕКОМЕНДАЦІЯ */}
        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
              Статус готовності
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-bold text-white">
                {player.statusLabel}
              </span>
              <span className="text-xs text-slate-400">
                • {player.actionPrompt}
              </span>
            </div>
          </div>

          {onAcknowledge && (
            <div className="shrink-0">
              {player.isAcknowledged ? (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                  <span>✓</span>
                  <span>
                    Переглянуто ({player.reviewedByRole === "doctor" ? "лікар" : "штаб"})
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isPendingAck}
                  onClick={() => onAcknowledge(player.playerId, player.date)}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>👁️</span>
                  <span>{isPendingAck ? "Збереження..." : "Взято до уваги"}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 1. ВІДПОВІДІ АНКЕТИ (ВКЛЮЧНО З ПРИВАТНИМИ ПОЛЯМИ СТРЕСУ ТА КОМЕНТАРЕМ) */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <span>📋</span>
            <span>Відповіді щоденної анкети</span>
          </h4>

          {details ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Якість сну</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.sleepQuality} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.sleepHours ? `${details.sleepHours} год` : "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Бадьорість / Втома</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.fatigue} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.fatigue >= 4 ? "Свіжий" : details.fatigue <= 2 ? "Втомлений" : "Помірно"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">М&apos;язи / Крепатура</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.soreness} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.soreness <= 2 ? "Відчутний біль" : "Свіжі"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-300 font-bold block">Стрес</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-200">
                    тільки лікар
                  </span>
                </div>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.stress ?? "—"} / 5
                </span>
                <span className="text-[10px] text-slate-400">
                  {details.stress && details.stress <= 2 ? "Підвищений" : "Спокійний"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-500">
              Анкету сьогодні ще не заповнено
            </div>
          )}

          {/* Біль та стан здоров'я */}
          {details && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className={`p-3 rounded-xl border ${
                details.pain
                  ? "bg-rose-950/20 border-rose-500/40 text-rose-200"
                  : "bg-slate-950/60 border-slate-800 text-slate-300"
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  {details.pain ? "⚠️ Біль присутній" : "🍏 Скарг на біль немає"}
                </span>
                {details.pain && (
                  <div className="mt-1 text-xs">
                    <div>Шкала ВАШ: <strong className="text-white">{details.painVas ?? 0}/10</strong></div>
                    {details.painLocations && details.painLocations.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-slate-300">
                        Локалізація: {details.painLocations.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-xl border ${
                details.illness
                  ? "bg-rose-950/20 border-rose-500/40 text-rose-200"
                  : "bg-slate-950/60 border-slate-800 text-slate-300"
              }`}>
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  {details.illness ? "🤒 Ознаки захворювання" : "🍏 Соматично здоровий"}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {details.illness ? "Гравець повідомив про температуру / нездужання" : "Симптоми ГРВІ відсутні"}
                </span>
              </div>
            </div>
          )}

          {/* Коментар лікарю */}
          {details?.comment && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">
                💬 Особистий коментар гравця для лікаря (приховано для тренера):
              </span>
              <p className="text-xs text-white leading-relaxed italic">
                «{details.comment}»
              </p>
            </div>
          )}
        </div>

        {/* 2. БІОМЕТРІЯ З НОСИМИХ ПРИСТРОЇВ (8.8) */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span>⌚</span>
              <span>Дані з годинника (Wearables)</span>
              {wearables && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/30 font-medium">
                  {wearables.deviceType.toUpperCase()} • {wearables.hrvMetric.toUpperCase()}
                </span>
              )}
            </h4>

            {/* ОБОВ'ЯЗКОВА ПОЗНАЧКА «Дані внесені гравцем, не перевірені» */}
            <span className="text-[10px] font-medium text-amber-400/90 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
              ⚠️ {WEARABLES_DISCLAIMER_TEXT}
            </span>
          </div>

          {wearables ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Пульс спокою */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Пульс спокою (RHR)</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.restingHrBpm ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">уд/хв</span>
                  </div>
                  {wearables.restingHrZScore !== null && (
                    <span className={`text-[10px] font-mono font-bold block mt-1 ${
                      wearables.restingHrZScore >= 1.5
                        ? "text-rose-400"
                        : wearables.restingHrZScore <= -1.5
                        ? "text-sky-400"
                        : "text-emerald-400"
                    }`}>
                      Z: {wearables.restingHrZScore > 0 ? `+${wearables.restingHrZScore}` : wearables.restingHrZScore} SD
                    </span>
                  )}
                </div>

                {/* HRV */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">
                    HRV ({wearables.hrvMetric.toUpperCase()})
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.hrvMs ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">мс</span>
                  </div>
                  {wearables.hrvZScore !== null && (
                    <span className={`text-[10px] font-mono font-bold block mt-1 ${
                      wearables.hrvZScore <= -1.5
                        ? "text-rose-400"
                        : wearables.hrvZScore >= 1.5
                        ? "text-emerald-400"
                        : "text-emerald-400"
                    }`}>
                      Z: {wearables.hrvZScore > 0 ? `+${wearables.hrvZScore}` : wearables.hrvZScore} SD
                    </span>
                  )}
                </div>

                {/* Сон трекера */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Сон (трекер)</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.sleepDurationMin
                        ? `${Math.floor(wearables.sleepDurationMin / 60)}г ${wearables.sleepDurationMin % 60}хв`
                        : "—"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    {wearables.sleepDurationMin ? `${wearables.sleepDurationMin} хв` : "—"}
                  </span>
                </div>

                {/* Показник відновлення пристрою */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block truncate">
                    {wearables.deviceScoreName || "Індекс трекера"}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.deviceScore ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {wearables.deviceScore !== null ? "%" : ""}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 truncate">
                    {wearables.deviceScoreName || "Оцінка пристрою"}
                  </span>
                </div>
              </div>

              {/* Порівняння з особистою нормою */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Особиста норма (вікно 28 днів):</span>
                  <span className="text-[11px] font-mono text-sky-400">
                    {wearables.baselineStatus === "ready"
                      ? "Норма розрахована"
                      : "Збір базових даних (< 14 днів)"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Показники порівнюються <strong>виключно з особистою нормою гравця</strong> за тим самим
                  пристроєм ({wearables.deviceType}) та методикою ({wearables.hrvMetric.toUpperCase()}). З іншими гравцями чи пристроями не порівнюється.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center text-xs text-slate-500">
              Сьогодні гравець не вносив показники з годинника або відсутня згода батьків.
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}
