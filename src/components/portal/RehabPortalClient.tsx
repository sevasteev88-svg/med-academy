"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { verifyPlayerPinAction, submitRehabCheckinAction } from "@/actions/rehab-portal-action";
import { RTP_PHASES, type RtpPhaseNumber } from "@/types/rtp";
import { getExercisesForInjuryAndPhase, DEFAULT_RECOVERY_QUESTS } from "@/lib/rehab-exercises";
import type { RehabExerciseItem, DailyRecoveryQuest } from "@/types/rehab-portal";
import { LOCATION_UA } from "@/lib/constants";

interface PlayerOption {
  id: string;
  name: string;
  team: string;
  position: string;
  diagnosis: string;
  location: string;
}

export default function RehabPortalClient({
  injuredPlayers,
}: {
  injuredPlayers: PlayerOption[];
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticatedPlayer, setAuthenticatedPlayer] = useState<any | null>(null);
  const [isVerifying, startVerify] = useTransition();

  // Active Tab inside Player Cabinet
  const [activeTab, setActiveTab] = useState<"plan" | "checkin" | "progress">("plan");

  // Exercises & Quests state
  const [exercises, setExercises] = useState<RehabExerciseItem[]>([]);
  const [quests, setQuests] = useState<DailyRecoveryQuest[]>(DEFAULT_RECOVERY_QUESTS);

  // Form checkin state
  const [vasScore, setVasScore] = useState<number>(1);
  const [swelling, setSwelling] = useState<"none" | "mild" | "moderate" | "severe">("none");
  const [stiffnessMinutes, setStiffnessMinutes] = useState<number>(0);
  const [psychReadiness, setPsychReadiness] = useState<number>(8); // 1-10 (I-PRRS)
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [fatigueLevel, setFatigueLevel] = useState<number>(2);
  const [playerComment, setPlayerComment] = useState<string>("");

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, startSubmit] = useTransition();

  // Verify PIN
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerId) {
      setAuthError("Оберіть своє прізвище зі списку");
      return;
    }
    if (pin.length < 4) {
      setAuthError("Введіть 4-значний PIN-код");
      return;
    }

    setAuthError(null);
    startVerify(async () => {
      const res = await verifyPlayerPinAction(selectedPlayerId, pin);
      if (res.error) {
        setAuthError(res.error);
      } else if (res.player) {
        setAuthenticatedPlayer(res.player);
        const primaryInjury = res.player.injuries?.[0];
        if (primaryInjury?.vas_score !== undefined) {
          setVasScore(primaryInjury.vas_score || 0);
        }

        // Generate tailored exercises
        const phaseNum = (res.player.currentRtpPhase || 1) as RtpPhaseNumber;
        const initialEx = getExercisesForInjuryAndPhase(primaryInjury?.location || "knee", phaseNum);
        setExercises(initialEx);
        setQuests(DEFAULT_RECOVERY_QUESTS);
      }
    });
  };

  // Toggle Exercise completion
  const toggleExercise = (exId: string) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, completed: !ex.completed } : ex))
    );
  };

  // Toggle Quest completion
  const toggleQuest = (qId: string) => {
    setQuests((prev) =>
      prev.map((q) => (q.id === qId ? { ...q, completed: !q.completed } : q))
    );
  };

  const completedExercisesCount = exercises.filter((e) => e.completed).length;
  const completedQuestsCount = quests.filter((q) => q.completed).length;

  // Submit Checkin
  const handleSubmitCheckin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedPlayer) return;

    const primaryInjury = authenticatedPlayer.injuries?.[0];
    const exercisesStatus =
      completedExercisesCount === exercises.length && exercises.length > 0
        ? "full"
        : completedExercisesCount > 0
        ? "partial"
        : "none";

    startSubmit(async () => {
      const res = await submitRehabCheckinAction({
        injury_id: primaryInjury?.id || "",
        player_id: authenticatedPlayer.id,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        vas_score: vasScore,
        swelling,
        stiffness_minutes: stiffnessMinutes,
        exercises_completed: exercisesStatus,
        completed_exercise_ids: exercises.filter((e) => e.completed).map((e) => e.id),
        completed_quests: quests.filter((q) => q.completed).map((q) => q.id),
        psychological_readiness: psychReadiness,
        sleep_quality: sleepQuality,
        fatigue_level: fatigueLevel,
        player_comment: playerComment.trim() || undefined,
      });

      if (res.success) {
        setIsSubmitted(true);
      } else {
        alert(res.error || "Помилка відправки рапорту");
      }
    });
  };

  // Countdown Helper
  const primaryInjury = authenticatedPlayer?.injuries?.[0];
  const targetDateStr = primaryInjury?.expected_return_date;
  const daysRemaining = useMemo(() => {
    if (!targetDateStr) return null;
    const diff = Math.ceil(
      (new Date(targetDateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    );
    return diff;
  }, [targetDateStr]);

  // 1. Success Screen
  if (isSubmitted) {
    return (
      <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-900/90 border border-emerald-500/30 backdrop-blur-xl text-center space-y-5 shadow-2xl shadow-emerald-950/40 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-3xl">
          ✅
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Рапорт успішно надіслано!
          </h2>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Дякуємо, <strong className="text-sky-300">{authenticatedPlayer?.name}</strong>! Медичний штаб та реабілітолог клубу вже отримали твої дані та врахують їх у сьогоднішньому плані відновлення.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/5 text-left text-xs space-y-2">
          <div className="flex justify-between text-slate-400">
            <span>Зафіксований біль (ВАШ):</span>
            <span className="font-mono font-bold text-white">{vasScore} / 10</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Виконано вправ ЛФК:</span>
            <span className="font-bold text-emerald-400">
              {completedExercisesCount} з {exercises.length} вправ
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Квести відновлення:</span>
            <span className="font-bold text-sky-400">
              {completedQuestsCount} з {quests.length} закрито
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setIsSubmitted(false);
            setAuthenticatedPlayer(null);
            setPin("");
          }}
          className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
        >
          Завершити або вийти
        </button>
      </div>
    );
  }

  // 2. Logged-in Player Cabinet Screen
  if (authenticatedPlayer) {
    const currentPhaseNumber = (authenticatedPlayer.currentRtpPhase || 1) as RtpPhaseNumber;
    const currentPhaseCfg = RTP_PHASES[currentPhaseNumber] || RTP_PHASES[1];
    const doctorInstruction = authenticatedPlayer.doctorInstruction;
    const pastCheckins = authenticatedPlayer.pastCheckins || [];

    return (
      <div className="max-w-lg mx-auto p-4 sm:p-6 rounded-3xl bg-slate-900/95 border border-sky-500/25 backdrop-blur-xl space-y-5 shadow-2xl shadow-black/60 animate-fadeIn">
        {/* Top Player Profile Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-sky-500/15">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center text-xl overflow-hidden shrink-0 shadow-md">
              <img src="/logo-chr.png" alt="Чорноморець" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {authenticatedPlayer.name}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {authenticatedPlayer.team} · <span className="text-rose-300 font-medium">{primaryInjury?.diagnosis || "Відновлення"}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => setAuthenticatedPlayer(null)}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-medium"
          >
            Вийти
          </button>
        </div>

        {/* Doctor's Daily Instruction Memo */}
        {doctorInstruction?.instruction && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-400/30 space-y-1.5 shadow-lg shadow-sky-950/30 animate-pulse">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-300 flex items-center gap-1.5">
                <span>👨‍⚕️</span> Вказівка лікаря на сьогодні:
              </span>
              {doctorInstruction.appointment_time && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/40">
                  ⏰ Огляд о {doctorInstruction.appointment_time}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200 leading-snug">
              «{doctorInstruction.instruction}»
            </p>
          </div>
        )}

        {/* Countdown & RTP Journey Header */}
        <div className={`p-4 rounded-2xl border ${currentPhaseCfg.borderClass} ${currentPhaseCfg.bgClass} space-y-2.5`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${currentPhaseCfg.badgeClass}`}>
              {currentPhaseCfg.shortTitle}
            </span>

            {daysRemaining !== null && (
              <span className="text-xs font-mono font-bold text-white bg-slate-900/80 px-2.5 py-1 rounded-xl border border-white/10 flex items-center gap-1">
                <span>⏳ До повернення:</span>
                <span className={daysRemaining <= 3 ? "text-emerald-400" : "text-sky-300"}>
                  ~{daysRemaining > 0 ? `${daysRemaining} дн.` : "Сьогодні!"}
                </span>
              </span>
            )}
          </div>

          <div>
            <div className="text-xs font-bold text-white">{currentPhaseCfg.title}</div>
            <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
              {currentPhaseCfg.tagline}
            </p>
          </div>

          {/* 5-Phase Mini Dots */}
          <div className="pt-1.5 border-t border-white/10">
            <div className="flex items-center justify-between text-[9px] text-slate-400 mb-1">
              <span>Шлях повернення у гру</span>
              <span className="font-mono text-sky-400 font-bold">{currentPhaseNumber * 20}%</span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((st) => (
                <div
                  key={st}
                  className={`flex-1 h-1.5 rounded-full transition-all ${
                    st < currentPhaseNumber
                      ? "bg-emerald-400"
                      : st === currentPhaseNumber
                      ? "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                      : "bg-slate-800"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 3 Main Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 rounded-2xl border border-sky-500/20 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("plan")}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "plan"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🏋️</span> План ЛФК
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checkin")}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "checkin"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🩹</span> Чек-ін
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("progress")}
            className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "progress"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>📈</span> Прогрес
          </button>
        </div>

        {/* TAB 1: План ЛФК та Квести відновлення */}
        {activeTab === "plan" && (
          <div className="space-y-4 animate-fadeIn">
            {/* Exercises List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🏋️</span> Персональні вправи на сьогодні ({completedExercisesCount}/{exercises.length}):
                </h4>
                <span className="text-[10px] font-mono text-sky-400 font-bold">
                  {Math.round((completedExercisesCount / (exercises.length || 1)) * 100)}%
                </span>
              </div>

              <div className="space-y-2.5">
                {exercises.map((ex) => (
                  <div
                    key={ex.id}
                    onClick={() => toggleExercise(ex.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                      ex.completed
                        ? "bg-emerald-950/30 border-emerald-500/40 shadow-sm"
                        : "bg-slate-950/60 border-white/5 hover:border-sky-500/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={!!ex.completed}
                          onChange={() => {}}
                          className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div>
                          <div className={`text-xs font-bold leading-tight ${ex.completed ? "text-emerald-300 line-through" : "text-white"}`}>
                            {ex.name}
                          </div>
                          <div className="text-[11px] font-mono text-sky-400 font-semibold mt-0.5">
                            {ex.setsReps}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                            {ex.technique}
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-900 border border-white/10 text-slate-400 shrink-0">
                        {ex.targetArea.split(" ")[0]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Daily Recovery Quests */}
            <div className="space-y-2 pt-2 border-t border-sky-500/15">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🧊</span> Квести відновлення ({completedQuestsCount}/{quests.length}):
                </h4>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  {completedQuestsCount === quests.length ? "Всі закриті! 🏆" : `${completedQuestsCount}/${quests.length}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {quests.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => toggleQuest(q.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      q.completed
                        ? "bg-emerald-950/30 border-emerald-500/40"
                        : "bg-slate-950/60 border-white/5 hover:border-sky-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{q.icon}</span>
                      <span className={`text-[11px] font-bold ${q.completed ? "text-emerald-300 line-through" : "text-white"}`}>
                        {q.title}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug line-clamp-2">
                      {q.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setActiveTab("checkin")}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
              Перейти до звіту про біль →
            </button>
          </div>
        )}

        {/* TAB 2: Чек-ін стану та болю */}
        {activeTab === "checkin" && (
          <form onSubmit={handleSubmitCheckin} className="space-y-4 animate-fadeIn">
            {/* VAS Pain Slider */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <span>🩹</span> Рівень болю зараз (Шкала ВАШ):
                </label>
                <span className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                  vasScore >= 7
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                    : vasScore >= 4
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                }`}>
                  {vasScore} / 10
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={vasScore}
                onChange={(e) => setVasScore(Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />

              <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                <span>0 (Не болить)</span>
                <span>3 (Дискомфорт)</span>
                <span>6 (Помірний)</span>
                <span>10 (Сильний)</span>
              </div>
            </div>

            {/* Swelling & Stiffness */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/60 border border-white/5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  🦿 Набряк у суглобі/м'язі:
                </label>
                <select
                  value={swelling}
                  onChange={(e: any) => setSwelling(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
                >
                  <option value="none">Відсутній (Норма)</option>
                  <option value="mild">Легкий набряк</option>
                  <option value="moderate">Помірний набряк</option>
                  <option value="severe">Виражений набряк ⚠️</option>
                </select>
              </div>

              <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/60 border border-white/5">
                <label className="text-[11px] font-bold text-slate-300 block">
                  ⏰ Ранкова скутість:
                </label>
                <select
                  value={stiffnessMinutes}
                  onChange={(e) => setStiffnessMinutes(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
                >
                  <option value={0}>Немає (0 хв)</option>
                  <option value={15}>До 15 хв</option>
                  <option value={30}>15 - 30 хв</option>
                  <option value={60}>Більше 30 хв</option>
                </select>
              </div>
            </div>

            {/* Psychological Readiness (FIFA I-PRRS) */}
            <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950/60 border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <span>🏆</span> Психологічна впевненість у кінцівці (без страху):
                </label>
                <span className="font-mono text-xs font-bold text-sky-400">
                  {psychReadiness} / 10
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={psychReadiness}
                onChange={(e) => setPsychReadiness(Number(e.target.value))}
                className="w-full accent-indigo-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>1 (Боюся наступати)</span>
                <span>5 (Обережно)</span>
                <span>10 (100% впевнений)</span>
              </div>
            </div>

            {/* Sleep & Fatigue */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-slate-300">
                  <span>😴 Якість сну:</span>
                  <span className="font-mono text-sky-400">{sleepQuality}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={sleepQuality}
                  onChange={(e) => setSleepQuality(Number(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-slate-300">
                  <span>⚡ Загальна втома:</span>
                  <span className="font-mono text-amber-400">{fatigueLevel}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={fatigueLevel}
                  onChange={(e) => setFatigueLevel(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>
            </div>

            {/* Player Comment */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 block">
                💬 Твої відчуття або питання до лікаря (опціонально):
              </label>
              <textarea
                value={playerComment}
                onChange={(e) => setPlayerComment(e.target.value)}
                placeholder="Наприклад: 'Після вчорашнього бігу трохи тягне зв'язку, але при ходьбі все ок...'"
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-sky-600/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{isSubmitting ? "Надсилаємо лікарю..." : "Надіслати рапорт лікарю 🚀"}</span>
            </button>
          </form>
        )}

        {/* TAB 3: Мій прогрес (Динаміка болю та сну) */}
        {activeTab === "progress" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-sky-500/20 space-y-3">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>📉</span> Динаміка болю ВАШ за останні дні:
              </h4>

              {pastCheckins.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  Ще немає збереженої історії звітів. Відправляй щоденний чек-ін, щоб бачити динаміку!
                </p>
              ) : (
                <div className="space-y-2 pt-2">
                  <div className="flex items-end justify-between gap-1.5 h-32 px-2 pb-2 border-b border-white/10">
                    {pastCheckins.slice(-7).map((c, i) => {
                      const heightPct = Math.max(10, ((c.vas_score || 0) / 10) * 100);
                      const isHigh = c.vas_score >= 6;
                      const isMid = c.vas_score >= 3;

                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-slate-300">
                            {c.vas_score}
                          </span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-lg transition-all ${
                              isHigh
                                ? "bg-rose-500"
                                : isMid
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                          />
                          <span className="text-[9px] font-mono text-slate-500 truncate max-w-[36px]">
                            {c.date?.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 px-1 font-mono">
                    <span>🟢 0–2: Без болю</span>
                    <span>🟡 3–5: Помірний</span>
                    <span>🔴 6+: Гострий</span>
                  </div>
                </div>
              )}
            </div>

            {/* Motivational message */}
            <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-slate-300 leading-relaxed flex items-center gap-3">
              <span className="text-2xl">💪</span>
              <p className="text-[11px]">
                Пам'ятай: дотримання програми ЛФК та якісний сон скорочують термін реабілітації на <strong>25–30%</strong>. Клуб вірить у твоє якнайшвидше повернення!
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Login Screen (Select player + PIN)
  return (
    <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-900/90 border border-sky-500/25 backdrop-blur-xl space-y-6 shadow-2xl shadow-sky-950/40">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-2 shadow-lg shadow-sky-500/20">
          <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-lg font-black text-white tracking-tight">
          Медичний Портал Гравця
        </h1>
        <p className="text-xs text-slate-400">
          ФК «Чорноморець» · Персональний кабінет відновлення
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 block">
            Оберіть своє прізвище:
          </label>
          <select
            value={selectedPlayerId}
            onChange={(e) => {
              setSelectedPlayerId(e.target.value);
              setAuthError(null);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-sky-400 transition-colors"
          >
            <option value="">— Оберіть зі списку —</option>
            {injuredPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.team} · {LOCATION_UA[p.location] || p.location})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">
              Ваш 4-значний PIN-код:
            </label>
            <span className="text-[10px] text-slate-500">
              (За замовчуванням: ДДММ народження)
            </span>
          </div>
          <input
            type="password"
            maxLength={4}
            pattern="\d*"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setAuthError(null);
            }}
            placeholder="••••"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-3 text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-sky-400 transition-colors"
          />
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs text-center font-medium animate-shake">
            {authError}
          </div>
        )}

        <button
          type="submit"
          disabled={isVerifying || !selectedPlayerId || pin.length < 4}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-sky-600/30 active:scale-95 disabled:opacity-50"
        >
          {isVerifying ? "Перевірка PIN-коду..." : "Увійти в кабінет →"}
        </button>
      </form>

      <div className="pt-2 text-center border-t border-sky-500/10">
        <p className="text-[11px] text-slate-500">
          Забули PIN? Зверніться до клубного лікаря на базі для скидання.
        </p>
      </div>
    </div>
  );
}
