"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  authenticatePlayerWithTokenAction,
  changePlayerPinAction,
  submitRehabCheckinAction,
  playerLogoutAction,
} from "@/actions/rehab-portal-action";
import { RTP_PHASES, type RtpPhaseNumber } from "@/types/rtp";
import {
  getExercisesForInjuryAndPhase,
  buildRecoveryQuests,
} from "@/lib/rehab-exercises";
import type { RehabExerciseItem, DailyRecoveryQuest } from "@/types/rehab-portal";
import {
  LOCATION_UA,
  INJURY_TYPE_UA,
  VAS_ALERT_THRESHOLD,
  URGENT_CASE_WARNING,
} from "@/lib/constants";

interface Props {
  initialSessionData?: any;
  tokenFromUrl?: string;
  playerPreview?: {
    name: string;
    team: string;
    position: string;
  } | null;
}

export default function RehabPortalClient({
  initialSessionData,
  tokenFromUrl = "",
  playerPreview,
}: Props) {
  const [tokenInput, setTokenInput] = useState<string>(tokenFromUrl);
  const [pin, setPin] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticatedPlayer, setAuthenticatedPlayer] = useState<any | null>(
    initialSessionData?.player || null
  );
  const [mustChangePin, setMustChangePin] = useState<boolean>(
    Boolean(initialSessionData?.mustChangePin)
  );

  // Forced PIN change state
  const [newPin, setNewPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [isChangingPin, startChangePin] = useTransition();

  const [isVerifying, startVerify] = useTransition();
  const [isLoggingOut, startLogout] = useTransition();

  // Active Tab inside Player Cabinet
  const [activeTab, setActiveTab] = useState<"plan" | "checkin" | "progress">("checkin");

  // Exercises & Quests state
  const [exercises, setExercises] = useState<RehabExerciseItem[]>([]);
  const [quests, setQuests] = useState<DailyRecoveryQuest[]>([]);

  // 1. Початковий стан полів: СТРОГО "Не обрано" (null / порожній рядок)
  const [vasScore, setVasScore] = useState<number | null>(null);
  const [swelling, setSwelling] = useState<"none" | "mild" | "moderate" | "severe" | "">("");
  const [stiffnessMinutes, setStiffnessMinutes] = useState<number | null>(null);
  const [psychReadiness, setPsychReadiness] = useState<number | null>(null); // 1-10

  // Узгоджена шкала: у всіх 5 = найкраще, 1 = найгірше
  const [sleepQuality, setSleepQuality] = useState<number | null>(null); // 1-5 (5 = чудово)
  const [freshnessLevel, setFreshnessLevel] = useState<number | null>(null); // 1-5 (1 = виснажений, 5 = свіжий)
  const [muscleSoreness, setMuscleSoreness] = useState<number | null>(null); // 1-5 (1 = сильний біль, 5 = м'язи свіжі)
  const [sorenessLocation, setSorenessLocation] = useState<string>("");
  const [stressLevel, setStressLevel] = useState<number | null>(null); // 1-5 (1 = сильний стрес, 5 = спокійний)

  // Оцінка тренування для підлітків (замість незрозумілих абревіатур Session-RPE та ACWR)
  const [hasTrainingSession, setHasTrainingSession] = useState<boolean>(false);
  const [sessionType, setSessionType] = useState<
    "match" | "training_team" | "individual_rehab" | "gym_strength" | "recovery"
  >("training_team");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number | "">("");
  const [sessionRpeScore, setSessionRpeScore] = useState<number | null>(null); // 1-10

  const [playerComment, setPlayerComment] = useState<string>("");

  // Показники смарт-годинника
  const [hasWearableData, setHasWearableData] = useState<boolean>(false);
  const [wearableDevice, setWearableDevice] = useState<"oura" | "apple_watch" | "whoop" | "garmin">("oura");
  const [wearableRecovery, setWearableRecovery] = useState<number | "">("");
  const [wearableHrv, setWearableHrv] = useState<number | "">("");
  const [wearableRhr, setWearableRhr] = useState<number | "">("");
  const [wearableSleepHours, setWearableSleepHours] = useState<number | "">("");
  const [wearableSleepEff, setWearableSleepEff] = useState<number | "">("");

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, startSubmit] = useTransition();

  // Helper to extract clean token from URL or string
  const cleanToken = (val: string): string => {
    let t = val.trim();
    if (t.includes("token=")) {
      const match = t.match(/token=([a-zA-Z0-9_-]+)/);
      if (match) return match[1];
    }
    return t;
  };

  // 12. Токен в адресному рядку: після відкриття та валідної сесії прибираємо токен з URL редиректом/replaceState
  React.useEffect(() => {
    if (initialSessionData?.player) {
      setupPlayerData(initialSessionData.player);
    }

    if (typeof window !== "undefined") {
      // Якщо є активна сесія і токен у search params — видаляємо його з адресного рядка
      if (initialSessionData?.player && window.location.search.includes("token=")) {
        window.history.replaceState({}, "", "/rehab-portal");
      }

      if (tokenFromUrl) {
        try {
          localStorage.setItem("med_player_portal_token", tokenFromUrl);
        } catch {}
      } else if (!tokenFromUrl && !initialSessionData?.player) {
        try {
          const saved = localStorage.getItem("med_player_portal_token");
          if (saved && saved.trim()) {
            window.location.replace(`/rehab-portal?token=${saved.trim()}`);
          }
        } catch {}
      }
    }
  }, [initialSessionData, tokenFromUrl]);

  const setupPlayerData = (player: any) => {
    const primaryInj = player.injuries?.[0];
    const isHealthy = !primaryInj;

    // Всі значення анкет починаються суворо з "Не обрано" (null)
    setVasScore(null);
    setSwelling("");
    setStiffnessMinutes(null);
    setPsychReadiness(null);
    setSleepQuality(null);
    setFreshnessLevel(null);
    setMuscleSoreness(null);
    setStressLevel(null);

    // Квести відновлення: прибираємо загальні цифри, додаємо тільки призначене лікарем
    const customQuests = buildRecoveryQuests({
      hasInjury: !isHealthy,
      prescriptions: player.prescribedSupplements || [],
    });
    setQuests(customQuests);

    if (isHealthy) {
      setActiveTab("checkin");
      setExercises([]);
    } else {
      setActiveTab("plan");
      // 10. План ЛФК прив'язаний до конкретного діагнозу/локалізації
      if (player.customRehabPlan && player.customRehabPlan.exercises?.length > 0) {
        const customEx = player.customRehabPlan.exercises.map((e: any) => ({
          id: e.exerciseId || e.id || `ex-${Math.random()}`,
          name: e.name,
          setsReps: e.setsReps,
          targetArea: e.targetArea,
          technique: e.technique,
          completed: false,
        }));
        setExercises(customEx);
      } else if (primaryInj?.location && primaryInj.location !== "other") {
        const phaseNum = (player.currentRtpPhase || 1) as RtpPhaseNumber;
        const initialEx = getExercisesForInjuryAndPhase(
          primaryInj.location,
          phaseNum,
          primaryInj.diagnosis
        );
        setExercises(initialEx);
      } else {
        // Якщо діагноз чи зона не задані — вправи не показуємо, повідомляємо «План призначить лікар»
        setExercises([]);
      }
    }
  };

  // Verify PIN with token
  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const token = cleanToken(tokenInput || tokenFromUrl);
    if (!token) {
      setAuthError("Не вказано персональний токен або посилання для входу");
      return;
    }
    if (pin.length !== 6) {
      setAuthError("Введіть 6-значний PIN-код");
      return;
    }

    setAuthError(null);
    startVerify(async () => {
      const res = await authenticatePlayerWithTokenAction({
        token,
        enteredPin: pin,
      });

      if (res.error) {
        setAuthError(res.error);
      } else if (res.success) {
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("med_player_portal_token", token);
          } catch {}
          // 12. Токен зникає з URL редиректом на чистий /rehab-portal (сесія вже в httpOnly cookie)
          window.location.href = "/rehab-portal";
        }
      }
    });
  };

  // Handle Forced PIN change on first login
  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      setChangePinError("Нові PIN-коди не співпадають");
      return;
    }
    if (!/^\d{6}$/.test(newPin)) {
      setChangePinError("PIN-код повинен складатися рівно з 6 цифр");
      return;
    }

    setChangePinError(null);
    startChangePin(async () => {
      const res = await changePlayerPinAction({
        newPin,
        confirmPin,
      });

      if (res.error) {
        setChangePinError(res.error);
      } else if (res.success) {
        setMustChangePin(false);
      }
    });
  };

  const handleLogout = () => {
    startLogout(async () => {
      await playerLogoutAction();
      setAuthenticatedPlayer(null);
      setPin("");
      if (typeof window !== "undefined") {
        window.location.href = "/rehab-portal";
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

  const primaryInjury = authenticatedPlayer?.injuries?.[0];
  const isHealthyProfile = !primaryInjury;

  // 1. Валідація обов'язкових полів: перевірка, що користувач обрав значення в кожному полі
  const missingFields = useMemo(() => {
    const list: string[] = [];
    if (sleepQuality === null) list.push("Якість сну");
    if (freshnessLevel === null) list.push("Свіжість");
    if (muscleSoreness === null) list.push("Біль у м'язах після тренування");
    if (stressLevel === null) list.push("Рівень стресу");

    if (primaryInjury) {
      if (vasScore === null) list.push("Рівень болю (ВАШ)");
      if (!swelling) list.push("Набряк");
      if (stiffnessMinutes === null) list.push("Ранкова скутість");
      if (psychReadiness === null) list.push("Психологічна впевненість");
    }

    if (hasTrainingSession) {
      if (sessionDurationMinutes === "" || Number(sessionDurationMinutes) <= 0) {
        list.push("Тривалість тренування");
      }
      if (sessionRpeScore === null) {
        list.push("Наскільки важким було тренування (0-10)");
      }
    }

    return list;
  }, [
    sleepQuality,
    freshnessLevel,
    muscleSoreness,
    stressLevel,
    primaryInjury,
    vasScore,
    swelling,
    stiffnessMinutes,
    psychReadiness,
    hasTrainingSession,
    sessionDurationMinutes,
    sessionRpeScore,
  ]);

  // 11. До встановлення постійного PIN блокувати відправку рапорту
  const isFormValid = missingFields.length === 0 && !mustChangePin;

  // 2. Єдина узгоджена сума балів (усі шкали 1..5, де 5 = найкраще)
  const currentTotalScore = useMemo(() => {
    if (
      sleepQuality === null ||
      freshnessLevel === null ||
      muscleSoreness === null ||
      stressLevel === null
    ) {
      return null;
    }
    return sleepQuality + freshnessLevel + muscleSoreness + stressLevel;
  }, [sleepQuality, freshnessLevel, muscleSoreness, stressLevel]);

  // 4. Срок повернення: в фазі 1 або якщо дата не задана/минула — «Термін повернення уточнює лікар»
  const currentPhaseNumber = (authenticatedPlayer?.currentRtpPhase || 1) as RtpPhaseNumber;
  const currentPhaseCfg = RTP_PHASES[currentPhaseNumber] || RTP_PHASES[1];
  const targetDateStr = primaryInjury?.expected_return_date;

  const returnDateDisplay = useMemo(() => {
    if (!primaryInjury) return null;
    if (currentPhaseNumber === 1) {
      return "Термін повернення уточнює лікар";
    }
    if (!targetDateStr) {
      return "Термін повернення уточнює лікар";
    }
    const diff = Math.ceil(
      (new Date(targetDateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
    );
    if (diff <= 0) {
      return "Термін повернення уточнює лікар";
    }
    return `~${diff} дн.`;
  }, [primaryInjury, currentPhaseNumber, targetDateStr]);

  // 8. Переклад заголовка травми без сирого enum
  const injuryLabel = useMemo(() => {
    if (!primaryInjury) return "🟢 Основна група (Готовий)";
    if (primaryInjury.diagnosis && primaryInjury.diagnosis.trim()) {
      return primaryInjury.diagnosis;
    }
    const typeLabel = primaryInjury.injury_type
      ? INJURY_TYPE_UA[primaryInjury.injury_type] || primaryInjury.injury_type
      : "";
    const locLabel = primaryInjury.location
      ? LOCATION_UA[primaryInjury.location] || primaryInjury.location
      : "";
    if (typeLabel && locLabel && locLabel !== "Інше") {
      return `${typeLabel} (${locLabel})`;
    }
    return typeLabel || locLabel || "Відновлення";
  }, [primaryInjury]);

  // Submit Checkin
  const handleSubmitCheckin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticatedPlayer || !isFormValid) return;

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
        swelling: swelling || null,
        stiffness_minutes: stiffnessMinutes,
        exercises_completed: exercisesStatus,
        completed_exercise_ids: exercises.filter((e) => e.completed).map((e) => e.id),
        completed_quests: quests.filter((q) => q.completed).map((q) => q.id),
        psychological_readiness: psychReadiness,
        sleep_quality: sleepQuality!,
        freshness_level: freshnessLevel!,
        fatigue_level: 6 - freshnessLevel!, // Збереження зворотної сумісності для legacy логів
        muscle_soreness: muscleSoreness!,
        soreness_location: muscleSoreness! <= 3 ? sorenessLocation : undefined,
        stress_level: stressLevel!,
        player_comment: playerComment.trim() || undefined,
        wearable_data:
          hasWearableData && wearableRecovery !== ""
            ? {
                device_type: wearableDevice,
                recovery_score: Number(wearableRecovery),
                hrv_rmssd: wearableHrv !== "" ? Number(wearableHrv) : undefined,
                resting_hr: wearableRhr !== "" ? Number(wearableRhr) : undefined,
                sleep_duration_hours: wearableSleepHours !== "" ? Number(wearableSleepHours) : undefined,
                sleep_efficiency_pct: wearableSleepEff !== "" ? Number(wearableSleepEff) : undefined,
              }
            : undefined,
        training_session:
          hasTrainingSession && sessionDurationMinutes !== "" && sessionRpeScore !== null
            ? {
                session_type: sessionType,
                duration_minutes: Number(sessionDurationMinutes),
                rpe_score: Number(sessionRpeScore),
              }
            : undefined,
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
      <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-900/95 border border-emerald-500/30 backdrop-blur-xl text-center space-y-5 shadow-2xl shadow-emerald-950/40 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-3xl">
          ✅
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Рапорт успішно надіслано!
          </h2>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Дякуємо, <strong className="text-sky-300">{authenticatedPlayer?.name}</strong>! Медичний штаб та тренер команди отримали твій звіт про щоденне самопочуття.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/5 text-left text-xs space-y-2">
          {primaryInjury ? (
            <>
              <div className="flex justify-between text-slate-400">
                <span>Зафіксований біль (ВАШ):</span>
                <span className="font-mono font-bold text-white">
                  {vasScore !== null ? `${vasScore} / 10` : "Не вказано"}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Виконано вправ ЛФК:</span>
                <span className="font-bold text-emerald-400">
                  {completedExercisesCount} з {exercises.length} вправ
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-slate-400">
                <span>Щоденне самопочуття:</span>
                <span className="font-bold text-emerald-400">
                  {currentTotalScore} / 20 балів
                </span>
              </div>
              {hasTrainingSession && sessionRpeScore !== null && (
                <div className="flex justify-between text-slate-400">
                  <span>Оцінка тренування:</span>
                  <span className="font-mono font-bold text-amber-300">
                    {sessionRpeScore}/10 ({Number(sessionDurationMinutes) * sessionRpeScore} од. навантаження)
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 7. Предупреждение о срочных случаях (после отправки) */}
        <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-left text-[11px] text-amber-200 leading-snug flex items-start gap-2.5">
          <span className="text-base shrink-0">⚠️</span>
          <span>{URGENT_CASE_WARNING}</span>
        </div>

        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
        >
          {isLoggingOut ? "Вихід..." : "Завершити або вийти"}
        </button>
      </div>
    );
  }

  // 2. Logged-in Player Cabinet Screen
  if (authenticatedPlayer) {
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
              {/* 8. Заголовок гравця без сирих англійських enum */}
              <p className="text-xs text-slate-400 mt-0.5">
                {authenticatedPlayer.team} ·{" "}
                <span className={primaryInjury ? "text-rose-300 font-medium" : "text-emerald-400 font-medium"}>
                  {injuryLabel}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-medium"
          >
            {isLoggingOut ? "Вихід..." : "Вийти"}
          </button>
        </div>

        {/* 11. Баннер первого входа: блокирует отправку рапорта до установки постоянного PIN */}
        {mustChangePin && (
          <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-left space-y-3 shadow-xl animate-pulse">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
              <span className="text-base">🛡️</span>
              <span>Перший вхід: обов'язково встановіть свій постійний 6-значний PIN</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              З міркувань безпеки замініть тимчасовий PIN, виданий лікарем, на власний 6-значний пароль. До встановлення постійного PIN відправка рапортів заблокована.
            </p>
            <form onSubmit={handleChangePin} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    Новий 6-значний PIN:
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    pattern="\d*"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => {
                      setNewPin(e.target.value.replace(/\D/g, ""));
                      setChangePinError(null);
                    }}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">
                    Підтвердження PIN:
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    pattern="\d*"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => {
                      setConfirmPin(e.target.value.replace(/\D/g, ""));
                      setChangePinError(null);
                    }}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-center text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {changePinError && (
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 text-[11px] text-center font-medium">
                  {changePinError}
                </div>
              )}

              <button
                type="submit"
                disabled={isChangingPin || newPin.length !== 6 || confirmPin.length !== 6}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {isChangingPin ? "Збереження..." : "Встановити мій постійний PIN"}
              </button>
            </form>
          </div>
        )}

        {/* Doctor's Daily Instruction Memo */}
        {doctorInstruction?.instruction && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-400/30 space-y-1.5 shadow-lg shadow-sky-950/30">
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

        {/* 4. Срок возвращения: только если подтверждена дата и фаза > 1 */}
        {primaryInjury && (
          <div className={`p-4 rounded-2xl border ${currentPhaseCfg.borderClass} ${currentPhaseCfg.bgClass} space-y-2.5`}>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${currentPhaseCfg.badgeClass}`}>
                {currentPhaseCfg.shortTitle}
              </span>

              <span className="text-xs font-mono font-bold text-white bg-slate-900/80 px-2.5 py-1 rounded-xl border border-white/10 flex items-center gap-1">
                <span>⏳ До повернення:</span>
                <span className={returnDateDisplay?.startsWith("~") ? "text-emerald-400" : "text-sky-300 font-sans"}>
                  {returnDateDisplay}
                </span>
              </span>
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
        )}

        {/* Tabs: збережено оригінальну структуру вкладок */}
        {primaryInjury ? (
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
              <span>📋</span> Чек-ін
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
              <span>📈</span> Динаміка
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 rounded-2xl border border-sky-500/20 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("checkin")}
              className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "checkin"
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>☀️</span> Щоденне самопочуття
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
              <span>📈</span> Мій стан та сон
            </button>
          </div>
        )}

        {/* TAB 1: План ЛФК та Квести відновлення */}
        {activeTab === "plan" && (
          <div className="space-y-4 animate-fadeIn">
            {/* Exercises List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🏋️</span> Персональні вправи на сьогодні ({completedExercisesCount}/{exercises.length}):
                </h4>
                {exercises.length > 0 && (
                  <span className="text-[10px] font-mono text-sky-400 font-bold">
                    {Math.round((completedExercisesCount / exercises.length) * 100)}%
                  </span>
                )}
              </div>

              {/* 10. Якщо діагноз/зона не задані — «План призначить лікар» */}
              {exercises.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-950/60 border border-white/5 text-center space-y-2">
                  <div className="text-3xl">📋</div>
                  <div className="text-sm font-bold text-white">План призначить лікар</div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Індивідуальну програму вправ ЛФК буде призначено клубним лікарем після клінічного огляду та уточнення діагнозу.
                  </p>
                </div>
              ) : (
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
                          {ex.targetArea?.split(" ")[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 9. Daily Recovery Quests (без числових норм білка і колагену з шаблону) */}
            {quests.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-sky-500/15">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🧊</span> Щоденні звички відновлення ({completedQuestsCount}/{quests.length}):
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
                        <span className={`text-[11px] font-bold leading-tight ${q.completed ? "text-emerald-300 line-through" : "text-white"}`}>
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
            )}

            <button
              onClick={() => setActiveTab("checkin")}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
              Перейти до звіту самопочуття →
            </button>
          </div>
        )}

        {/* TAB 2: Чек-ін щоденного самопочуття */}
        {activeTab === "checkin" && (
          <form onSubmit={handleSubmitCheckin} className="space-y-4 animate-fadeIn">
            {/* Тільки для травмованих гравців: ВАШ, Набряк, Скутість, Впевненість */}
            {primaryInjury && (
              <div className="space-y-3 p-3.5 rounded-2xl bg-slate-950/70 border border-rose-500/20">
                <div className="text-xs font-bold text-rose-300 flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="flex items-center gap-1.5">
                    <span>🩹</span> Стан пошкодженої ділянки
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {vasScore !== null ? `Біль ${vasScore}/10` : "Біль: Не обрано"}
                  </span>
                </div>

                {/* ВАШ боли без значення за замовчуванням */}
                <div className="space-y-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      Рівень болю в місці травми (Шкала ВАШ 0–10):
                    </label>
                    <span
                      className={`font-mono text-xs font-black px-2 py-0.5 rounded-lg border ${
                        vasScore === null
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : vasScore >= VAS_ALERT_THRESHOLD
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : vasScore >= 4
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      {vasScore !== null ? `${vasScore} / 10` : "Не обрано"}
                    </span>
                  </div>

                  {/* Pills для вибору 0..10 */}
                  <div className="grid grid-cols-11 gap-1 pt-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setVasScore(num)}
                        className={`h-8 rounded-lg font-mono text-xs font-bold transition-all border ${
                          vasScore === num
                            ? num >= VAS_ALERT_THRESHOLD
                              ? "bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/40 scale-105"
                              : num >= 4
                              ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/40 scale-105"
                              : "bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/40 scale-105"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between text-[9px] text-slate-400 font-medium px-0.5">
                    <span>0: Не болить</span>
                    <span>3: Легкий дискомфорт</span>
                    <span>6: Помірний</span>
                    <span>10: Нестерпний</span>
                  </div>
                </div>

                {/* Набряк та Ранкова скутість (стартують у стані "Не обрано") */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      🦿 Набряк у суглобі / м&apos;язі:
                    </label>
                    <select
                      value={swelling}
                      onChange={(e: any) => setSwelling(e.target.value)}
                      className={`w-full bg-slate-950 border rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none ${
                        !swelling ? "border-amber-500/50 text-amber-200" : "border-slate-700 focus:border-sky-400"
                      }`}
                    >
                      <option value="">-- Не обрано --</option>
                      <option value="none">Відсутній (Норма)</option>
                      <option value="mild">Легкий набряк</option>
                      <option value="moderate">Помірний набряк</option>
                      <option value="severe">Виражений набряк ⚠️</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      ⏰ Ранкова скутість:
                    </label>
                    <select
                      value={stiffnessMinutes === null ? "" : stiffnessMinutes}
                      onChange={(e) =>
                        setStiffnessMinutes(e.target.value === "" ? null : Number(e.target.value))
                      }
                      className={`w-full bg-slate-950 border rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none ${
                        stiffnessMinutes === null ? "border-amber-500/50 text-amber-200" : "border-slate-700 focus:border-sky-400"
                      }`}
                    >
                      <option value="">-- Не обрано --</option>
                      <option value={0}>Немає (0 хв)</option>
                      <option value={15}>До 15 хв</option>
                      <option value={30}>15 - 30 хв</option>
                      <option value={60}>Більше 30 хв</option>
                    </select>
                  </div>
                </div>

                {/* Психологічна впевненість у кінцівці (без страху) */}
                <div className="space-y-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>🏆</span> Психологічна впевненість у кінцівці:
                    </label>
                    <span className="font-mono text-xs font-bold text-sky-400">
                      {psychReadiness !== null ? `${psychReadiness} / 10` : "Не обрано"}
                    </span>
                  </div>
                  <div className="grid grid-cols-10 gap-1 pt-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setPsychReadiness(num)}
                        className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                          psychReadiness === num
                            ? "bg-indigo-500 text-white border-indigo-400 shadow-md scale-105"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>1 (Боюся наступати)</span>
                    <span>5 (Обережно)</span>
                    <span>10 (100% впевнений)</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Щоденне самопочуття: єдине узгоджене спрямування (5 = найкраще у всіх 4 шкалах) */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-sky-500/20 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <span>📊</span> Щоденне самопочуття:
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {currentTotalScore !== null ? `${currentTotalScore} / 20 балів` : "— / 20 балів"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Сон (5 = чудово) */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-300">
                    <span>😴 Якість сну:</span>
                    <span className="font-mono text-sky-400">
                      {sleepQuality !== null ? `${sleepQuality} / 5` : "Не обрано"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSleepQuality(val)}
                        className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                          sleepQuality === val
                            ? "bg-sky-500 text-white border-sky-400 shadow-sm"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>1: Дуже погано</span>
                    <span>5: Чудово</span>
                  </div>
                </div>

                {/* 2. Свіжість (Замість "Рівень втоми" — 1 виснажений, 5 свіжий) */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-300">
                    <span>⚡ Свіжість:</span>
                    <span className="font-mono text-amber-400">
                      {freshnessLevel !== null ? `${freshnessLevel} / 5` : "Не обрано"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFreshnessLevel(val)}
                        className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                          freshnessLevel === val
                            ? "bg-amber-500 text-black border-amber-400 shadow-sm"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>1: Виснажений</span>
                    <span>5: Свіжий</span>
                  </div>
                </div>

                {/* 3. Біль у м'язах після тренування (Замість DOMS — 1 сильний біль, 5 свіжі) */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-300">
                    <span>🦵 Біль у м&apos;язах після тренування:</span>
                    <span className="font-mono text-rose-400">
                      {muscleSoreness !== null ? `${muscleSoreness} / 5` : "Не обрано"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setMuscleSoreness(val)}
                        className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                          muscleSoreness === val
                            ? "bg-rose-500 text-white border-rose-400 shadow-sm"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>1: Сильний біль</span>
                    <span>5: М&apos;язи свіжі</span>
                  </div>
                </div>

                {/* 4. Рівень стресу (1 тривога/стрес, 5 спокійний) */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <div className="flex justify-between text-[11px] font-bold text-slate-300">
                    <span>🧠 Рівень спокою (стрес):</span>
                    <span className="font-mono text-purple-400">
                      {stressLevel !== null ? `${stressLevel} / 5` : "Не обрано"}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setStressLevel(val)}
                        className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                          stressLevel === val
                            ? "bg-purple-500 text-white border-purple-400 shadow-sm"
                            : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>1: Сильний стрес</span>
                    <span>5: Спокійний</span>
                  </div>
                </div>
              </div>

              {/* Уточнення локалізації, якщо м'язи болять (бал <= 3) */}
              {muscleSoreness !== null && muscleSoreness <= 3 && (
                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/25 space-y-1 animate-fadeIn">
                  <label className="text-[10px] font-bold text-rose-300 block">
                    ⚠️ Де саме відчуваєш найбільшу забитість чи біль у м&apos;язах?
                  </label>
                  <select
                    value={sorenessLocation}
                    onChange={(e) => setSorenessLocation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-rose-400"
                  >
                    <option value="">Оберіть м&apos;яз (опціонально)...</option>
                    <option value="Задня поверхня стегна (Хамстрінг)">🦵 Задня поверхня стегна (Хамстрінг)</option>
                    <option value="Передня поверхня (Квадрицепс)">🦵 Передня поверхня (Квадрицепс)</option>
                    <option value="Пах / Привідні м'язи">🩲 Пах / Привідні м&apos;язи</option>
                    <option value="Литковий м'яз / Ахілл">🦶 Литковий м&apos;яз / Ахілл</option>
                    <option value="Сідничні м'язи">🍑 Сідничні м&apos;язи</option>
                    <option value="Поперек / Спина">🧱 Поперек / Спина</option>
                  </select>
                </div>
              )}
            </div>

            {/* 3 & 13. Оцінка тренування без жаргону (Session-RPE / ACWR замінено зрозумілими словами для підлітків) */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">⏱️</span>
                  <div>
                    <label className="text-xs font-bold text-slate-200 block">
                      Наскільки важким було тренування?
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Допомагає тренеру планувати відпочинок та навантаження
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHasTrainingSession(!hasTrainingSession)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all border ${
                    hasTrainingSession
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  {hasTrainingSession ? "✓ Оцінити" : "+ Додати тренування"}
                </button>
              </div>

              {hasTrainingSession && (
                <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-fadeIn">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Тип заняття:
                      </label>
                      <select
                        value={sessionType}
                        onChange={(e) => setSessionType(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="training_team">🏃 Командне тренування</option>
                        <option value="match">⚽ Офіційний матч</option>
                        <option value="gym_strength">🏋️ Силовий зал</option>
                        <option value="individual_rehab">🩹 Індивідуальне відновлення</option>
                        <option value="recovery">🧘 Стретчинг / Басейн</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Тривалість (хвилини):
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="180"
                        step="5"
                        placeholder="хв"
                        value={sessionDurationMinutes}
                        onChange={(e) =>
                          setSessionDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-center font-mono font-bold text-sky-400"
                      />
                    </div>
                  </div>

                  {/* Оцінка важкості 0-10 */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-300">
                        Оціни важкість тренування (0–10):
                      </span>
                      <span className="font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {sessionRpeScore !== null ? `${sessionRpeScore} / 10` : "Не обрано"}
                      </span>
                    </div>

                    <div className="grid grid-cols-11 gap-1 pt-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setSessionRpeScore(num)}
                          className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                            sessionRpeScore === num
                              ? "bg-amber-500 text-black border-amber-400 shadow-sm scale-105"
                              : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-between text-[9px] text-slate-400 pt-0.5">
                      <span>0-2: Дуже легко</span>
                      <span>5-6: Важко</span>
                      <span>9-10: На межі сил</span>
                    </div>

                    {sessionDurationMinutes !== "" && sessionRpeScore !== null && (
                      <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-800 flex justify-between font-mono">
                        <span>Загальне навантаження:</span>
                        <span className="text-emerald-400 font-bold">
                          {Number(sessionDurationMinutes) * sessionRpeScore} од. навантаження
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 13. Показники смарт-годинника без штучних значень за замовчуванням */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-sky-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">⌚</span>
                  <div>
                    <label className="text-xs font-bold text-slate-200 block">
                      Показники смарт-годинника чи браслета
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Apple Watch, Garmin, Whoop, Oura Ring (опціонально)
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHasWearableData(!hasWearableData)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all border ${
                    hasWearableData
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  {hasWearableData ? "✓ Внести дані" : "+ Додати"}
                </button>
              </div>

              {hasWearableData && (
                <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-fadeIn">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Мій пристрій:
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: "oura", label: "Oura Ring", icon: "💍" },
                        { id: "apple_watch", label: "Apple Watch", icon: "🍎" },
                        { id: "whoop", label: "WHOOP", icon: "⭕" },
                        { id: "garmin", label: "Garmin", icon: "⌚" },
                      ].map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setWearableDevice(d.id as any)}
                          className={`py-1.5 px-1 rounded-xl text-center text-[10px] font-bold transition-all border flex flex-col items-center gap-0.5 ${
                            wearableDevice === d.id
                              ? "bg-sky-500/20 text-sky-200 border-sky-400 shadow-sm"
                              : "bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <span className="text-sm">{d.icon}</span>
                          <span className="truncate w-full">{d.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Відновлення (%):</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {wearableRecovery !== "" ? `${wearableRecovery}%` : "—"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="напр. 85"
                        value={wearableRecovery}
                        onChange={(e) =>
                          setWearableRecovery(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-emerald-300 text-xs focus:border-sky-500"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">ВСР (HRV, мс):</span>
                        <span className="font-mono font-bold text-sky-400">
                          {wearableHrv !== "" ? `${wearableHrv} мс` : "—"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="10"
                        max="250"
                        placeholder="напр. 65"
                        value={wearableHrv}
                        onChange={(e) =>
                          setWearableHrv(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sky-300 text-xs focus:border-sky-500"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Пульс спокою:</span>
                        <span className="font-mono font-bold text-indigo-300">
                          {wearableRhr !== "" ? `${wearableRhr} уд/хв` : "—"}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="30"
                        max="120"
                        placeholder="напр. 52"
                        value={wearableRhr}
                        onChange={(e) =>
                          setWearableRhr(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-indigo-200 text-xs focus:border-sky-500"
                      />
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Сон (години):</span>
                        <span className="font-mono font-bold text-amber-300">
                          {wearableSleepHours !== "" ? `${wearableSleepHours} год` : "—"}
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="16"
                        placeholder="напр. 8.0"
                        value={wearableSleepHours}
                        onChange={(e) =>
                          setWearableSleepHours(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-amber-200 text-xs focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Коментар гравця */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 block">
                💬 Твої відчуття або повідомлення для тренера та лікаря (опціонально):
              </label>
              <textarea
                value={playerComment}
                onChange={(e) => setPlayerComment(e.target.value)}
                placeholder="Наприклад: 'Після вчорашнього бігу трохи відчуваю забитість, але під час ходьби все добре...'"
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 resize-none"
              />
            </div>

            {/* 7. Предупреждение о срочных случаях перед отправкой */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                vasScore !== null && vasScore >= VAS_ALERT_THRESHOLD
                  ? "bg-rose-950/60 border-rose-500 text-rose-200 shadow-lg shadow-rose-950/50"
                  : "bg-slate-950/80 border-slate-800 text-slate-400"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base shrink-0">
                  {vasScore !== null && vasScore >= VAS_ALERT_THRESHOLD ? "🚨" : "ℹ️"}
                </span>
                <div className="text-[11px] leading-snug space-y-1">
                  {vasScore !== null && vasScore >= VAS_ALERT_THRESHOLD && (
                    <div className="font-bold text-rose-300 uppercase tracking-wider text-[10px]">
                      Увага: високий рівень болю ({vasScore}/10)!
                    </div>
                  )}
                  <p className={vasScore !== null && vasScore >= VAS_ALERT_THRESHOLD ? "text-rose-100 font-medium" : "text-slate-400"}>
                    {URGENT_CASE_WARNING}
                  </p>
                </div>
              </div>
            </div>

            {/* 1. Блокування кнопки, доки всі обов'язкові поля не обрано, або до зміни PIN */}
            <div className="space-y-2">
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-sky-600/30 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>
                  {isSubmitting ? "Надсилаємо звіт..." : "Надіслати щоденний звіт 🚀"}
                </span>
              </button>

              {!isFormValid && (
                <div className="text-[11px] text-amber-300/90 text-center font-medium bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 space-y-1">
                  {mustChangePin ? (
                    <div>🛡️ Спочатку встановіть постійний PIN-код у верхньому блоці.</div>
                  ) : (
                    <div>
                      ⚠️ Будь ласка, оберіть значення для полів:{" "}
                      <span className="font-bold text-amber-200">{missingFields.join(", ")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        )}

        {/* TAB 3: Мій стан та сон (Динаміка) */}
        {activeTab === "progress" && (
          <div className="space-y-4 animate-fadeIn">
            {/* 6. Здоровому гравцю НЕ показувати пустий блок «Динаміка болю ВАШ»! */}
            {primaryInjury ? (
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
                      {pastCheckins.slice(-14).map((c: any, i: number) => {
                        const v = c.vas_score ?? 0;
                        const heightPct = Math.max(10, (v / 10) * 100);
                        const isHigh = v >= VAS_ALERT_THRESHOLD;
                        const isMid = v >= 4;

                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] font-mono font-bold text-slate-300">
                              {v}
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
                            <span className="text-[9px] font-mono text-slate-500 truncate max-w-[28px]">
                              {c.date?.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 px-1 font-mono">
                      <span>🟢 0–3: Норма</span>
                      <span>🟡 4–6: Помірний</span>
                      <span>🔴 7+: Гострий біль</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Графік власної анкети здорового гравця за останні 14 днів */
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-sky-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>📊</span> Динаміка самопочуття за останні 14 днів:
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">Макс. 20 балів</span>
                </div>

                {pastCheckins.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Ще немає збереженої історії відповідей. Відправляй щоденне самопочуття, щоб відстежувати графік своєї форми!
                  </p>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-end justify-between gap-1.5 h-36 px-2 pb-2 border-b border-white/10">
                      {pastCheckins.slice(-14).map((c: any, i: number) => {
                        const total = c.total_score ?? 16;
                        const heightPct = Math.max(15, (total / 20) * 100);
                        const isGood = total >= 16;
                        const isWarn = total >= 12;

                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] font-mono font-bold text-slate-300">
                              {total}
                            </span>
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-lg transition-all ${
                                isGood
                                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]"
                                  : isWarn
                                  ? "bg-amber-400"
                                  : "bg-rose-500"
                              }`}
                            />
                            <span className="text-[9px] font-mono text-slate-500 truncate max-w-[28px]">
                              {c.date?.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 px-1 font-mono">
                      <span>🟢 16–20: Оптимально</span>
                      <span>🟡 12–15: Увага</span>
                      <span>🔴 &lt;12: Втома</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. Мотиваційний блок з нейтральним текстом без вигаданих відсотків */}
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-sky-500/20 text-xs text-slate-300 leading-relaxed flex items-center gap-3">
              <span className="text-2xl">🌱</span>
              <p className="text-[11px] leading-snug">
                Відновлення залежить від твого стану, а не від дат. Повідомляй лікаря про біль і дискомфорт.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Login Screen (Personal Token + 6-digit PIN)
  return (
    <div className="max-w-md mx-auto p-6 rounded-3xl bg-slate-900/90 border border-sky-500/25 backdrop-blur-xl space-y-6 shadow-2xl shadow-sky-950/40">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-2 shadow-lg shadow-sky-500/20">
          <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-lg font-black text-white tracking-tight">
          Щоденне самопочуття
        </h1>
        <p className="text-xs text-slate-400">
          ФК «Чорноморець» · Персональний кабінет гравця
        </p>

        {playerPreview && (
          <div className="mt-3 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-center">
            <span className="text-[10px] text-sky-400 uppercase tracking-wider font-semibold block">
              Авторизація для гравця:
            </span>
            <span className="text-sm font-bold text-white block mt-0.5">
              {playerPreview.name}
            </span>
            <span className="text-[11px] text-slate-400 block">
              {playerPreview.team} · {playerPreview.position}
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  try {
                    localStorage.removeItem("med_player_portal_token");
                  } catch {}
                  window.location.href = "/rehab-portal";
                }
              }}
              className="mt-2 text-[10px] text-sky-400/80 hover:text-sky-300 underline font-medium inline-block cursor-pointer"
            >
              Не ваш профіль? Увійти іншим гравцем
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleVerify} className="space-y-4">
        {!tokenFromUrl && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              Персональний токен або посилання:
            </label>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => {
                const cleaned = cleanToken(e.target.value);
                setTokenInput(cleaned);
                setAuthError(null);
              }}
              placeholder="Вставте посилання або персональний токен"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 transition-colors font-mono"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">
              Ваш 6-значний PIN-код:
            </label>
            <span className="text-[10px] text-slate-500">
              (6 цифр)
            </span>
          </div>
          <input
            type="password"
            maxLength={6}
            pattern="\d*"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setAuthError(null);
            }}
            placeholder="••••••"
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
          disabled={isVerifying || pin.length !== 6 || (!tokenInput && !tokenFromUrl)}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-sky-600/30 active:scale-95 disabled:opacity-50"
        >
          {isVerifying ? "Перевірка PIN-коду..." : "Увійти в кабінет →"}
        </button>
      </form>

      <div className="pt-2 text-center border-t border-sky-500/10">
        <p className="text-[11px] text-slate-500">
          Забули PIN або не маєте персонального посилання? Зверніться до клубного лікаря для скидання.
        </p>
      </div>
    </div>
  );
}
