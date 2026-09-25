"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { verifyPlayerPinAction, submitRehabCheckinAction } from "@/actions/rehab-portal-action";
import { RTP_PHASES, type RtpPhaseNumber } from "@/types/rtp";
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

  // Form checkin state
  const [vasScore, setVasScore] = useState<number>(1);
  const [swelling, setSwelling] = useState<"none" | "mild" | "moderate" | "severe">("none");
  const [stiffnessMinutes, setStiffnessMinutes] = useState<number>(0);
  const [exercisesCompleted, setExercisesCompleted] = useState<"full" | "partial" | "none">("full");
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [fatigueLevel, setFatigueLevel] = useState<number>(2);
  const [playerComment, setPlayerComment] = useState<string>("");

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, startSubmit] = useTransition();

  // Handle PIN verification
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
        if (res.player.injuries?.[0]?.vas_score !== undefined) {
          setVasScore(res.player.injuries[0].vas_score || 0);
        }
      }
    });
  };

  // Handle Checkin submit
  const handleSubmitCheckin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedPlayer) return;

    const primaryInjury = authenticatedPlayer.injuries?.[0];

    startSubmit(async () => {
      const res = await submitRehabCheckinAction({
        injury_id: primaryInjury?.id || "",
        player_id: authenticatedPlayer.id,
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        vas_score: vasScore,
        swelling,
        stiffness_minutes: stiffnessMinutes,
        exercises_completed: exercisesCompleted,
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
            <span>Виконання вправ ЛФК:</span>
            <span className="font-bold text-emerald-400">
              {exercisesCompleted === "full" ? "Повністю виконано" : exercisesCompleted === "partial" ? "Частково" : "Не виконано"}
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Скутість суглоба / набряк:</span>
            <span className="text-slate-200">
              {swelling === "none" ? "Відсутній" : swelling === "mild" ? "Легкий" : "Помірний/Сильний"}
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
          Завершити або увійти іншому гравцю
        </button>
      </div>
    );
  }

  // 2. Form Checkin Screen (Logged in)
  if (authenticatedPlayer) {
    const currentPhaseNumber = (authenticatedPlayer.currentRtpPhase || 1) as RtpPhaseNumber;
    const currentPhaseCfg = RTP_PHASES[currentPhaseNumber] || RTP_PHASES[1];
    const injury = authenticatedPlayer.injuries?.[0];

    return (
      <div className="max-w-lg mx-auto p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-sky-500/25 backdrop-blur-xl space-y-5 shadow-2xl shadow-black/50">
        {/* Player Header */}
        <div className="flex items-center justify-between pb-3 border-b border-sky-500/15">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center text-xl overflow-hidden shrink-0">
              <img src="/logo-chr.png" alt="Чорноморець" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {authenticatedPlayer.name}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {authenticatedPlayer.team} · {injury?.diagnosis || "Програма відновлення"}
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

        {/* Current RTP Phase Card */}
        <div className={`p-3.5 rounded-2xl border ${currentPhaseCfg.borderClass} ${currentPhaseCfg.bgClass} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${currentPhaseCfg.badgeClass}`}>
              {currentPhaseCfg.shortTitle}
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-semibold">
              Етап {currentPhaseNumber} з 5
            </span>
          </div>
          <div className="text-xs font-bold text-white pt-1">{currentPhaseCfg.title}</div>
          <p className="text-[11px] text-slate-300 leading-snug">
            <strong className="text-emerald-400">Дозволено:</strong> {currentPhaseCfg.allowedActivity}
          </p>
        </div>

        {/* Check-in Form */}
        <form onSubmit={handleSubmitCheckin} className="space-y-4">
          {/* VAS Pain Slider */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950/60 border border-white/5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <span>🩹</span> Рівень болю зараз (Шкала ВАШ):
              </label>
              <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-lg border ${
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

          {/* Swelling / Stiffness */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/60 border border-white/5">
              <label className="text-[11px] font-bold text-slate-300 block">
                🦿 Набряк у травмі:
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

          {/* Exercises Completion */}
          <div className="space-y-1.5 p-3.5 rounded-2xl bg-slate-950/60 border border-white/5">
            <label className="text-xs font-bold text-slate-200 block mb-1">
              🏋️ Виконання призначених вправ ЛФК / процедур:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExercisesCompleted("full")}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                  exercisesCompleted === "full"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                ✅ Повністю
              </button>
              <button
                type="button"
                onClick={() => setExercisesCompleted("partial")}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                  exercisesCompleted === "partial"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                🟡 Частково
              </button>
              <button
                type="button"
                onClick={() => setExercisesCompleted("none")}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                  exercisesCompleted === "none"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm"
                    : "bg-slate-900 border-slate-800 text-slate-400"
                }`}
              >
                ❌ Не виконав
              </button>
            </div>
          </div>

          {/* Sleep Quality & Fatigue */}
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-sky-600/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>{isSubmitting ? "Надсилаємо лікарю..." : "Надіслати рапорт лікарю 🚀"}</span>
          </button>
        </form>
      </div>
    );
  }

  // 3. Login Screen (Select player + 4-digit PIN)
  return (
    <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-900/90 border border-sky-500/25 backdrop-blur-xl space-y-6 shadow-2xl shadow-sky-950/40">
      {/* Top Brand Logo */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-2 shadow-lg shadow-sky-500/20">
          <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-lg font-black text-white tracking-tight">
          Медичний Портал Гравця
        </h1>
        <p className="text-xs text-slate-400">
          ФК «Чорноморець» · Щоденний чек-ін відновлення після травми
        </p>
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        {/* Player Selector */}
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

        {/* 4-Digit PIN */}
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

        {/* Submit PIN */}
        <button
          type="submit"
          disabled={isVerifying || !selectedPlayerId || pin.length < 4}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-sky-600/30 active:scale-95 disabled:opacity-50"
        >
          {isVerifying ? "Перевірка PIN-коду..." : "Увійти в кабінет →"}
        </button>
      </form>

      {/* Info Tip */}
      <div className="pt-2 text-center border-t border-sky-500/10">
        <p className="text-[11px] text-slate-500">
          Забули PIN? Зверніться до клубного лікаря або масажиста на базі для скидання.
        </p>
      </div>
    </div>
  );
}
