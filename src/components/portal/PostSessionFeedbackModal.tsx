"use client";

import React, { useState, useTransition } from "react";
import {
  type TrainingSessionType,
  type RpeScore,
  type PlayerTodaySession,
  SESSION_TYPE_UA,
  BORG_CR10_SCALE,
  SORENESS_LOCATIONS,
} from "@/types/workload";
import { submitPlayerSessionFeedbackAction } from "@/actions/training-session-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerId: string;
  initialSession?: PlayerTodaySession | null;
  onSaved?: (updatedSession: PlayerTodaySession) => void;
}

export default function PostSessionFeedbackModal({
  isOpen,
  onClose,
  playerId,
  initialSession,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [sessionType, setSessionType] = useState<TrainingSessionType>(
    initialSession?.sessionType || "training_team"
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    initialSession?.durationMinutes || (initialSession?.opponent ? 90 : 75)
  );
  const [playerRpe, setPlayerRpe] = useState<RpeScore | null>(
    initialSession?.playerRpe !== undefined && initialSession?.playerRpe !== null
      ? (initialSession.playerRpe as RpeScore)
      : null
  );
  const [selectedSoreness, setSelectedSoreness] = useState<string[]>(
    initialSession?.feedback?.sorenessLocations || []
  );
  const [hasContusion, setHasContusion] = useState<boolean>(
    Boolean(initialSession?.feedback?.hasContusion)
  );
  const [notes, setNotes] = useState<string>(
    initialSession?.feedback?.notes || ""
  );

  if (!isOpen) return null;

  const toggleSoreness = (id: string) => {
    setSelectedSoreness((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const clearSoreness = () => {
    setSelectedSoreness([]);
  };

  const handleSave = () => {
    if (playerRpe === null) {
      setErrorMsg("Будь ласка, обери оцінку навантаження за шкалою 0–10");
      return;
    }
    if (durationMinutes <= 0) {
      setErrorMsg("Вкажи тривалість у хвилинах");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await submitPlayerSessionFeedbackAction({
          playerId,
          date: initialSession?.date || new Date().toISOString().split("T")[0],
          sessionType,
          durationMinutes,
          playerRpe,
          muscleSorenessLocations: selectedSoreness,
          hasContusion,
          notes: notes.trim() || undefined,
        });

        if (!res.success) {
          setErrorMsg(res.error || "Не вдалося зберегти відгук");
          return;
        }

        setSuccessMsg("Відгук надіслано штабу! Дані оновлено.");
        if (onSaved) {
          onSaved({
            hasSession: true,
            teamSessionId: initialSession?.teamSessionId,
            sessionType,
            durationMinutes,
            coachRpe: initialSession?.coachRpe,
            playerRpe,
            isCompletedByPlayer: true,
            feedback: {
              sorenessLocations: selectedSoreness,
              hasContusion,
              notes: notes.trim() || undefined,
              submittedAt: new Date().toISOString(),
            },
            opponent: initialSession?.opponent,
            date: initialSession?.date || new Date().toISOString().split("T")[0],
          });
        }

        setTimeout(() => {
          onClose();
        }, 1200);
      } catch (err: any) {
        setErrorMsg(err?.message || "Помилка зв'язку із сервером");
      }
    });
  };

  const currentRpeMeta = playerRpe !== null ? BORG_CR10_SCALE[playerRpe] : null;
  const calculatedWorkload = playerRpe !== null ? durationMinutes * playerRpe : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
              {sessionType === "match" ? "⚽" : "🏃"}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Реакція на навантаження
              </h2>
              <p className="text-xs text-slate-400">
                {initialSession?.opponent
                  ? `Матч проти: ${initialSession.opponent}`
                  : "Оціни зусилля та стан м'язів після гри / тренування"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-slate-200">
          {/* Error & Success Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
              <span>✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. Тип події */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              1. Що за заняття було?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {(
                [
                  "match",
                  "training_team",
                  "gym_strength",
                  "recovery",
                  "individual_rehab",
                ] as TrainingSessionType[]
              ).map((type) => {
                const isSelected = sessionType === type;
                const info = SESSION_TYPE_UA[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSessionType(type)}
                    className={`px-3 py-2 rounded-xl text-left border text-xs font-semibold flex items-center gap-2 transition-all ${
                      isSelected
                        ? "bg-amber-500/20 border-amber-500/60 text-white shadow-sm ring-1 ring-amber-500/40"
                        : "bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-base">{info.icon}</span>
                    <span className="truncate">{info.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Тривалість (Хвилини) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                2. Скільки хвилин провів на полі / тренуванні?
              </label>
              <span className="text-xs font-mono font-bold text-sky-400">
                {durationMinutes} хв
              </span>
            </div>
            {/* Quick Chips */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {[15, 30, 45, 60, 75, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(mins)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                    durationMinutes === mins
                      ? "bg-sky-500 text-slate-950 border-sky-400 shadow-sm"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {mins} хв
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="150"
                step="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full accent-sky-500 bg-slate-950 rounded-lg cursor-pointer h-2"
              />
              <input
                type="number"
                min="1"
                max="240"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-xs text-white"
              />
            </div>
          </div>

          {/* 3. Шкала зусилля (Borg CR10 / Session RPE 0-10) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                3. Як ти відчув навантаження? (Шкала 0–10)
              </label>
              {playerRpe !== null && (
                <span
                  className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg border"
                  style={{
                    backgroundColor: `${currentRpeMeta?.color}20`,
                    borderColor: `${currentRpeMeta?.color}50`,
                    color: currentRpeMeta?.color,
                  }}
                >
                  {playerRpe} / 10
                </span>
              )}
            </div>

            {/* Scale buttons grid */}
            <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 mb-2">
              {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as RpeScore[]).map((num) => {
                const meta = BORG_CR10_SCALE[num];
                const isSelected = playerRpe === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPlayerRpe(num)}
                    className={`h-10 sm:h-11 rounded-xl font-mono font-bold text-sm transition-all border flex items-center justify-center ${
                      isSelected
                        ? "shadow-lg scale-105 border-white text-slate-950 ring-2 ring-white/40"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                    style={{
                      backgroundColor: isSelected ? meta.color : undefined,
                    }}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Label based on selection */}
            {currentRpeMeta ? (
              <div
                className="p-3 rounded-2xl border text-xs flex items-center justify-between transition-all"
                style={{
                  backgroundColor: `${currentRpeMeta.color}15`,
                  borderColor: `${currentRpeMeta.color}35`,
                }}
              >
                <div>
                  <div className="font-bold text-white text-xs sm:text-sm">
                    {currentRpeMeta.label}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {currentRpeMeta.desc}
                  </div>
                </div>
                {calculatedWorkload !== null && (
                  <div className="text-right pl-3 border-l border-slate-700/50">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">
                      Навантаження
                    </div>
                    <div className="font-mono font-extrabold text-sm text-amber-400">
                      {calculatedWorkload} AU
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 italic text-center">
                Обери цифру від 0 (відпочинок) до 10 (максимальне виснаження)
              </div>
            )}

            {/* Coach expectation hint if exists */}
            {initialSession?.coachRpe !== undefined && initialSession?.coachRpe !== null && (
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Очікування тренера:</span>
                <span className="font-mono font-bold text-sky-400">
                  {initialSession.coachRpe} / 10
                </span>
                {playerRpe !== null && Math.abs(playerRpe - initialSession.coachRpe) >= 2 && (
                  <span className="text-amber-400 font-semibold text-[10px] bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/30">
                    ⚠️ Різниця відчуттів: {Math.abs(playerRpe - initialSession.coachRpe)} бали
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 4. М'язова реакція та забитість */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                4. Стан м'язів після навантаження
              </label>
              {selectedSoreness.length > 0 && (
                <button
                  type="button"
                  onClick={clearSoreness}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Скинути всі
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={clearSoreness}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  selectedSoreness.length === 0
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                ✨ Все супер / м'язи свіжі
              </button>

              {SORENESS_LOCATIONS.map((loc) => {
                const isSelected = selectedSoreness.includes(loc.id);
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => toggleSoreness(loc.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-orange-500/20 border-orange-500/60 text-orange-200 ring-1 ring-orange-500/40"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span>{loc.icon}</span>
                    <span>{loc.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedSoreness.length > 0 && (
              <p className="text-[11px] text-orange-300/80 bg-orange-950/30 p-2 rounded-xl border border-orange-500/20">
                ⚠️ Штаб побачить ці зони забитості та скоригує розминку або відновлення перед наступним днем.
              </p>
            )}
          </div>

          {/* 5. Контактний удар / забій */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5 pr-2">
              <span className="text-xl">🩹</span>
              <div>
                <div className="text-xs font-bold text-white">
                  Був контактний удар чи забій?
                </div>
                <div className="text-[10px] text-slate-400">
                  Познач, якщо потрібен огляд лікаря або лід/тейпування
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHasContusion(!hasContusion)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                hasContusion
                  ? "bg-rose-500 text-white border-rose-400 shadow-md ring-2 ring-rose-500/40"
                  : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
              }`}
            >
              {hasContusion ? "✓ Так, був удар" : "Ні, без забоїв"}
            </button>
          </div>

          {/* 6. Коментар футболіста */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              5. Коментар для тренера та лікаря (опціонально)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Наприклад: важке в'язке поле, наприкінці гри відчував судоми в литці..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950 flex items-center gap-2.5 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2"
          >
            {isPending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Збереження...</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Надіслати штабу</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
