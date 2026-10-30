"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  submitWellnessEntryAction,
  checkPlayerWellnessAccessAction,
  getTodayWellnessEntryForPlayerAction,
  getPlayerWeeklySummaryAction,
} from "@/actions/wellness-entry-actions";
import {
  type WellnessScore,
  type WellnessEntry,
  PAIN_LOCATIONS_LIST,
} from "@/types/wellness";
import { PlayerWearablesSection } from "./PlayerWearablesSection";
import {
  getTodayWearableEntryAction,
  submitWearableEntryAction,
} from "@/actions/wearable-actions";
import type { WearableInputData } from "@/types/wearables";
import Link from "next/link";

export const PAIN_SYMPTOMS_LIST = [
  { id: "sharp_movement", label: "⚡ Різкий при русі" },
  { id: "shooting", label: "🎯 Прострілює / коле" },
  { id: "aching", label: "🌊 Ниючий / тягне" },
  { id: "stiffness", label: "🧱 Скутість / спазм" },
  { id: "pulsing", label: "💥 Пульсуючий" },
  { id: "impact_contusion", label: "🤕 Наслідок удару / стику" },
  { id: "pain_at_rest", label: "🛏️ Біль у спокої" },
];

export const ILLNESS_SYMPTOMS_LIST = [
  { id: "sore_throat", label: "🗣️ Біль у горлі" },
  { id: "runny_nose", label: "🤧 Нежить / закладеність" },
  { id: "cough", label: "😮‍💨 Кашель" },
  { id: "fever_chills", label: "🌡️ Озноб / жар" },
  { id: "body_aches", label: "🦴 Ломота в тілі" },
  { id: "headache", label: "🤕 Головний біль" },
  { id: "nausea_gi", label: "🤢 Нудота / розлад" },
  { id: "weakness", label: "🥱 Слабкість" },
];

interface Props {
  playerId: string;
  playerName: string;
  initialEntry?: WellnessEntry | null;
  onSuccess?: (entry: WellnessEntry) => void;
  source?: "player" | "kiosk" | "staff";
}

const SLEEP_QUALITY_OPTIONS: { score: WellnessScore; label: string; icon: string; color: string }[] = [
  { score: 1, label: "Дуже погано", icon: "😫", color: "border-rose-500/40 bg-rose-950/20 text-rose-300" },
  { score: 2, label: "Погано", icon: "🥱", color: "border-orange-500/40 bg-orange-950/20 text-orange-300" },
  { score: 3, label: "Нормально", icon: "😐", color: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300" },
  { score: 4, label: "Добре виспався", icon: "🙂", color: "border-lime-500/40 bg-lime-950/20 text-lime-300" },
  { score: 5, label: "Чудово / Повний сил", icon: "😴✨", color: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300" },
];

const SLEEP_HOURS_OPTIONS = [
  { val: 5.5, label: "< 6 год" },
  { val: 6.5, label: "6–7 год" },
  { val: 7.5, label: "7–8 год" },
  { val: 8.5, label: "8–9 год" },
  { val: 9.5, label: "9+ год" },
];

const FRESHNESS_OPTIONS: { score: WellnessScore; label: string; icon: string; color: string }[] = [
  { score: 1, label: "Виснажений", icon: "🪫", color: "border-rose-500/40 bg-rose-950/20 text-rose-300" },
  { score: 2, label: "Втомлений", icon: "🔋", color: "border-orange-500/40 bg-orange-950/20 text-orange-300" },
  { score: 3, label: "Помірно", icon: "⚡", color: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300" },
  { score: 4, label: "Бадьорий", icon: "💪", color: "border-lime-500/40 bg-lime-950/20 text-lime-300" },
  { score: 5, label: "Пік форми!", icon: "🚀", color: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300" },
];

const SORENESS_OPTIONS: { score: WellnessScore; label: string; icon: string; color: string }[] = [
  { score: 1, label: "Сильний біль у м'язах", icon: "🛑", color: "border-rose-500/40 bg-rose-950/20 text-rose-300" },
  { score: 2, label: "Відчутна крепатура", icon: "⚠️", color: "border-orange-500/40 bg-orange-950/20 text-orange-300" },
  { score: 3, label: "Помірна крепатура", icon: "🦵", color: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300" },
  { score: 4, label: "Легкий тонус", icon: "👌", color: "border-lime-500/40 bg-lime-950/20 text-lime-300" },
  { score: 5, label: "М'язи свіжі, без болю", icon: "✨", color: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300" },
];

const STRESS_OPTIONS: { score: WellnessScore; label: string; icon: string; color: string }[] = [
  { score: 1, label: "Сильний стрес / Тривога", icon: "🤯", color: "border-rose-500/40 bg-rose-950/20 text-rose-300" },
  { score: 2, label: "Тривожний", icon: "😟", color: "border-orange-500/40 bg-orange-950/20 text-orange-300" },
  { score: 3, label: "Нейтральний", icon: "😐", color: "border-yellow-500/40 bg-yellow-950/20 text-yellow-300" },
  { score: 4, label: "Спокійний", icon: "🎯", color: "border-lime-500/40 bg-lime-950/20 text-lime-300" },
  { score: 5, label: "Максимальна впевненість", icon: "🔥", color: "border-emerald-500/40 bg-emerald-950/20 text-emerald-300" },
];

export default function PlayerWellnessQuiz({
  playerId,
  playerName,
  initialEntry,
  onSuccess,
  source = "player",
}: Props) {
  // Access & Parental consent check
  const [accessChecked, setAccessChecked] = useState(false);
  const [canFill, setCanFill] = useState(true);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Steps: 0: Sleep, 1: Sleep Hours, 2: Freshness, 3: Soreness, 4: Stress, 5: Pain, 6: Illness, 7: Comment & Submit
  const [currentStep, setCurrentStep] = useState<number>(0);

  // Questionnaire state (starts unselected)
  const [sleepQuality, setSleepQuality] = useState<WellnessScore | null>(initialEntry?.sleep_quality || null);
  const [sleepHours, setSleepHours] = useState<number | null>(initialEntry?.sleep_hours ?? null);
  const [fatigue, setFatigue] = useState<WellnessScore | null>(initialEntry?.fatigue || null);
  const [soreness, setSoreness] = useState<WellnessScore | null>(initialEntry?.soreness || null);
  const [stress, setStress] = useState<WellnessScore | null>(initialEntry?.stress || null);

  const [hasPain, setHasPain] = useState<boolean | null>(initialEntry ? initialEntry.pain : null);
  const [painVas, setPainVas] = useState<number | null>(initialEntry?.pain_vas ?? null);
  const [painLocations, setPainLocations] = useState<string[]>(initialEntry?.pain_locations || []);
  const [painSymptoms, setPainSymptoms] = useState<string[]>(initialEntry?.pain_symptoms || []);
  const [painComment, setPainComment] = useState<string>(initialEntry?.pain_comment || "");

  const [isIll, setIsIll] = useState<boolean | null>(initialEntry ? initialEntry.illness : null);
  const [bodyTemperature, setBodyTemperature] = useState<string>(
    initialEntry?.body_temperature !== undefined && initialEntry?.body_temperature !== null
      ? String(initialEntry.body_temperature)
      : ""
  );
  const [illnessSymptoms, setIllnessSymptoms] = useState<string[]>(initialEntry?.illness_symptoms || []);
  const [illnessComment, setIllnessComment] = useState<string>(initialEntry?.illness_comment || "");
  const [doctorRecommendation, setDoctorRecommendation] = useState<any>(initialEntry?.doctor_recommendation || null);
  const [comment, setComment] = useState<string>(initialEntry?.comment || "");
  const [trainingRpe, setTrainingRpe] = useState<number | null>(null);
  const [wearablesData, setWearablesData] = useState<WearableInputData | null>(null);
  const [monotonyNotice, setMonotonyNotice] = useState<{
    isMonotonous: boolean;
    consecutiveDays: number;
    prompt: string | null;
  } | null>(null);

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 4. Перевірка згоди батьків для неповнолітніх при завантаженні
  useEffect(() => {
    let isMounted = true;
    async function verify() {
      const access = await checkPlayerWellnessAccessAction(playerId);
      if (isMounted) {
        setCanFill(access.canFill);
        setBlockReason(access.reason || null);
        setAccessChecked(true);
      }
    }
    verify();
    return () => {
      isMounted = false;
    };
  }, [playerId]);

  // Завантаження вже поданого сьогоднішнього звіту та перевірка монотонності відповідей
  useEffect(() => {
    if (playerId) {
      getPlayerWeeklySummaryAction(playerId).then((summary) => {
        if (summary?.monotonyNotice) {
          setMonotonyNotice(summary.monotonyNotice);
        }
      });
    }

    if (!initialEntry && playerId) {
      getTodayWellnessEntryForPlayerAction(playerId).then((res) => {
        if (res.entry) {
          setSleepQuality(res.entry.sleep_quality);
          setSleepHours(res.entry.sleep_hours);
          setFatigue(res.entry.fatigue);
          setSoreness(res.entry.soreness);
          setStress(res.entry.stress);
          setHasPain(res.entry.pain);
          setPainVas(res.entry.pain_vas);
          setPainLocations(res.entry.pain_locations || []);
          setPainSymptoms(res.entry.pain_symptoms || (res.entry as any).painSymptoms || []);
          setPainComment(res.entry.pain_comment || (res.entry as any).painComment || "");
          setIsIll(res.entry.illness);
          setBodyTemperature(
            res.entry.body_temperature !== undefined && res.entry.body_temperature !== null
              ? String(res.entry.body_temperature)
              : ""
          );
          setIllnessSymptoms(res.entry.illness_symptoms || (res.entry as any).illnessSymptoms || []);
          setIllnessComment(res.entry.illness_comment || (res.entry as any).illnessComment || "");
          setDoctorRecommendation(res.entry.doctor_recommendation || (res.entry as any).doctorRecommendation || null);
          setComment(res.entry.comment || "");
        }
      });

      // 8.8 Завантаження сьогоднішніх даних годинника
      getTodayWearableEntryAction(playerId).then((res) => {
        if (res?.entry) {
          setWearablesData({
            device_type: res.entry.device_type,
            resting_hr_bpm: res.entry.resting_hr_bpm,
            hrv_ms: res.entry.hrv_ms,
            hrv_metric: res.entry.hrv_metric,
            sleep_duration_min: res.entry.sleep_duration_min,
            device_score: res.entry.device_score,
            device_score_name: res.entry.device_score_name,
            source: res.entry.source,
          });
        }
      });
    }
  }, [initialEntry, playerId]);

  // Якщо перевірка ще триває
  if (!accessChecked) {
    return (
      <div className="p-8 text-center text-xs text-slate-400 font-mono animate-pulse">
        Перевірка статусу доступу...
      </div>
    );
  }

  // 4. Якщо гравець < 18 років без згоди data_processing — блокуємо форму
  if (!canFill) {
    return (
      <div className="p-6 sm:p-8 rounded-3xl bg-amber-950/40 border border-amber-500/40 text-center space-y-4 shadow-2xl animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-3xl">
          🛡️
        </div>
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Потрібна згода батьків
          </h3>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-sm mx-auto">
            Для заповнення щоденної анкети самопочуття гравцям віком до 18 років необхідна підтверджена згода батьків або законного представника на базову обробку даних.
          </p>
        </div>
        <div className="pt-2 border-t border-amber-500/20 text-xs">
          <Link
            href="/privacy"
            className="text-amber-300 hover:text-amber-200 underline font-semibold transition-colors"
          >
            Дізнатися більше про надання згоди та конфіденційність →
          </Link>
        </div>
      </div>
    );
  }

  // 2. Екран підтвердження «Дякуємо» БЕЗ оцінок («добре/погано») в тексті
  if (isSubmitted) {
    return (
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/95 border border-emerald-500/40 text-center space-y-4 shadow-2xl shadow-emerald-950/40 animate-fadeIn max-w-md mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-3xl">
          ✅
        </div>
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Дякуємо!
          </h3>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed">
            Твою відповідь збережено. Дані передано медичному штабу та тренеру.
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-slate-950/80 border border-white/5 text-[11px] text-slate-400">
          Якщо протягом дня відчуєш біль або зміну стану, ти можеш оновити цю анкету до кінця доби.
        </div>
        <button
          type="button"
          onClick={() => {
            setIsSubmitted(false);
            setCurrentStep(0);
          }}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
        >
          Переглянути або редагувати відповідь
        </button>
      </div>
    );
  }

  // Тогл локалізацій болю на карті тіла
  const toggleLocation = (locId: string) => {
    setPainLocations((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  // Submit Handler
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (sleepQuality === null || fatigue === null || soreness === null || stress === null) {
      setErrorMsg("Будь ласка, заповніть усі основні питання анкети.");
      return;
    }
    if (hasPain === null) {
      setErrorMsg("Будь ласка, вкажіть, чи відчуваєте ви біль.");
      return;
    }
    if (isIll === null) {
      setErrorMsg("Будь ласка, вкажіть свій стан здоров'я.");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const res = await submitWellnessEntryAction({
        playerId,
        sleepQuality,
        fatigue,
        soreness,
        stress,
        sleepHours: sleepHours ?? null,
        pain: hasPain,
        painVas: hasPain ? (painVas ?? 0) : null,
        painLocations: hasPain ? painLocations : [],
        painSymptoms: hasPain && (painVas ?? 0) >= 3 ? painSymptoms : [],
        painComment: hasPain && (painVas ?? 0) >= 3 ? painComment.trim() : null,
        illness: isIll,
        temperature: isIll && bodyTemperature ? bodyTemperature : null,
        illnessSymptoms: isIll ? illnessSymptoms : [],
        illnessComment: isIll ? illnessComment.trim() : null,
        comment: comment.trim() || null,
        trainingRpe: trainingRpe !== null ? trainingRpe : undefined,
        source,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.success && res.entry) {
        // 8.8 Збереження даних з годинника (якщо введено)
        if (wearablesData) {
          try {
            await submitWearableEntryAction({
              ...wearablesData,
              playerId,
            });
          } catch (wErr) {
            console.error("[PlayerWellnessQuiz] Error submitting wearables:", wErr);
          }
        }

        setIsSubmitted(true);
        if (onSuccess) onSuccess(res.entry);
      }
    });
  };

  // Total steps in quiz
  const TOTAL_STEPS = 7;
  const progressPercent = Math.round(((currentStep + 1) / TOTAL_STEPS) * 100);

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6 rounded-3xl bg-slate-900/95 border border-sky-500/25 backdrop-blur-xl space-y-5 shadow-2xl animate-fadeIn">
      {/* Top Header & Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-sky-300 flex items-center gap-1.5">
            <span>📋</span> Щоденне самопочуття
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            Крок {currentStep + 1} з {TOTAL_STEPS} ({progressPercent}%)
          </span>
        </div>
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-white/5">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 transition-all duration-300"
          />
        </div>
      </div>

      {/* QUESTION 1: Якість сну */}
      {currentStep === 0 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              1. Як ти спав сьогодні вночі?
            </h3>
            <p className="text-xs text-slate-400">Обери одне значення</p>
          </div>

          <div className="space-y-2">
            {SLEEP_QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setSleepQuality(opt.score);
                  setTimeout(() => setCurrentStep(1), 180);
                }}
                className={`w-full min-h-[52px] p-3 rounded-2xl border transition-all text-left flex items-center justify-between active:scale-98 cursor-pointer ${
                  sleepQuality === opt.score
                    ? "border-sky-400 bg-sky-500/20 text-white shadow-md shadow-sky-500/20"
                    : `bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-200`
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* QUESTION 2: Тривалість сну */}
      {currentStep === 1 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              2. Скільки приблизно годин ти спав?
            </h3>
            <p className="text-xs text-slate-400">Швидкий вибір тривалості</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SLEEP_HOURS_OPTIONS.map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => {
                  setSleepHours(opt.val);
                  setTimeout(() => setCurrentStep(2), 180);
                }}
                className={`min-h-[52px] p-3 rounded-2xl border transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer ${
                  sleepHours === opt.val
                    ? "border-sky-400 bg-sky-500/20 text-white shadow-md"
                    : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-300"
                }`}
              >
                <span className="text-lg">⏱️</span>
                <span className="text-xs font-bold font-mono">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-xs text-sky-400 font-bold"
            >
              Пропустити / Далі →
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 3: Свіжість / Бадьорість */}
      {currentStep === 2 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              3. Наскільки свіжим і бадьорим почуваєшся?
            </h3>
            <p className="text-xs text-slate-400">Рівень фізичної енергії (1–5)</p>
          </div>

          <div className="space-y-2">
            {FRESHNESS_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setFatigue(opt.score);
                  setTimeout(() => setCurrentStep(3), 180);
                }}
                className={`w-full min-h-[52px] p-3 rounded-2xl border transition-all text-left flex items-center justify-between active:scale-98 cursor-pointer ${
                  fatigue === opt.score
                    ? "border-amber-400 bg-amber-500/20 text-white shadow-md shadow-amber-500/20"
                    : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 4: Біль у м'язах після тренування */}
      {currentStep === 3 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              4. Біль у м&apos;язах після попереднього тренування:
            </h3>
            <p className="text-xs text-slate-400">Відчуття крепатури (1 = біль, 5 = м&apos;язи свіжі)</p>
          </div>

          <div className="space-y-2">
            {SORENESS_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setSoreness(opt.score);
                  setTimeout(() => setCurrentStep(4), 180);
                }}
                className={`w-full min-h-[52px] p-3 rounded-2xl border transition-all text-left flex items-center justify-between active:scale-98 cursor-pointer ${
                  soreness === opt.score
                    ? "border-rose-400 bg-rose-500/20 text-white shadow-md shadow-rose-500/20"
                    : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 5: Рівень спокою / Стрес */}
      {currentStep === 4 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              5. Рівень психологічного спокою та настрій:
            </h3>
            <p className="text-xs text-slate-400">Конфіденційно (тільки для медичного штабу)</p>
          </div>

          <div className="space-y-2">
            {STRESS_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setStress(opt.score);
                  setTimeout(() => setCurrentStep(5), 180);
                }}
                className={`w-full min-h-[52px] p-3 rounded-2xl border transition-all text-left flex items-center justify-between active:scale-98 cursor-pointer ${
                  stress === opt.score
                    ? "border-purple-400 bg-purple-500/20 text-white shadow-md shadow-purple-500/20"
                    : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 6: «Є біль?» + Карта тіла та ВАШ тільки якщо «Так» */}
      {currentStep === 5 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              6. Чи відчуваєш біль у суглобі або м&apos;язі?
            </h3>
            <p className="text-xs text-slate-400">Гострий чи локальний біль, окрім звичайної крепатури</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setHasPain(false);
                setPainVas(null);
                setPainLocations([]);
                setTimeout(() => setCurrentStep(6), 180);
              }}
              className={`min-h-[64px] p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                hasPain === false
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                  : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-2xl">👌</span>
              <span className="text-xs font-bold">Ні, болю немає</span>
            </button>

            <button
              type="button"
              onClick={() => setHasPain(true)}
              className={`min-h-[64px] p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                hasPain === true
                  ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md"
                  : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-2xl">⚠️</span>
              <span className="text-xs font-bold">Так, відчуваю біль</span>
            </button>
          </div>

          {/* Шкала ВАШ та Карта тіла — показуються ТІЛЬКИ якщо біль = «так» */}
          {hasPain === true && (
            <div className="space-y-3.5 pt-3 border-t border-rose-500/20 animate-fadeIn">
              {/* ВАШ боли */}
              <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/90 border border-rose-500/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200">Рівень болю (ВАШ 0–10):</span>
                  <span className="font-mono font-bold text-rose-400">
                    {painVas !== null ? `${painVas} / 10` : "Оберіть бал"}
                  </span>
                </div>
                <div className="grid grid-cols-11 gap-1 pt-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setPainVas(num)}
                      className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                        painVas === num
                          ? "bg-rose-500 text-white border-rose-400 shadow-sm"
                          : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Карта тіла (швидкий вибір зон) */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  📍 Відзнач зону, де відчуваєш біль (можна кілька):
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PAIN_LOCATIONS_LIST.map((loc) => {
                    const isSelected = painLocations.includes(loc.id);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => toggleLocation(loc.id)}
                        className={`p-2 rounded-xl border text-left text-xs transition-all flex items-center gap-2 ${
                          isSelected
                            ? "bg-rose-500/20 border-rose-400 text-rose-200 shadow-sm"
                            : "bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <span>{loc.icon}</span>
                        <span className="truncate font-medium">{loc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Якщо біль >= 3 та обрано зону — швидкий опис характеру болю для лікаря */}
              {painVas !== null && painVas >= 3 && painLocations.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-rose-500/20 animate-fadeIn">
                  <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>Опишіть характер болю (для лікаря):</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAIN_SYMPTOMS_LIST.map((sym) => {
                      const isSel = painSymptoms.includes(sym.id);
                      return (
                        <button
                          key={sym.id}
                          type="button"
                          onClick={() => {
                            setPainSymptoms((prev) =>
                              prev.includes(sym.id)
                                ? prev.filter((x) => x !== sym.id)
                                : [...prev, sym.id]
                            );
                          }}
                          className={`p-2 rounded-xl border text-left text-xs transition-all ${
                            isSel
                              ? "bg-amber-500/25 border-amber-400 text-amber-200 font-semibold shadow-sm"
                              : "bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          {sym.label}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <input
                      type="text"
                      value={painComment}
                      onChange={(e) => setPainComment(e.target.value)}
                      placeholder="Що посилює біль (біг, нахил, дотик, після навантаження)..."
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setCurrentStep(6)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
              >
                Далі →
              </button>
            </div>
          )}

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* QUESTION 7: «Хворію?» */}
      {currentStep === 6 && (
        <div className="space-y-4 animate-fadeIn">
          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              7. Чи є ознаки захворювання?
            </h3>
            <p className="text-xs text-slate-400">Температура, нежить, біль у горлі, слабкість</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setIsIll(false);
                setTimeout(() => setCurrentStep(7), 180);
              }}
              className={`min-h-[64px] p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                isIll === false
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                  : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-2xl">🍏</span>
              <span className="text-xs font-bold">Ні, здоровий</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsIll(true);
              }}
              className={`min-h-[64px] p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer ${
                isIll === true
                  ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md"
                  : "bg-slate-950/70 border-white/5 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-2xl">🤒</span>
              <span className="text-xs font-bold">Так, хворію / нездужання</span>
            </button>
          </div>

          {/* Деталізація температури та симптомів ГРВІ */}
          {isIll === true && (
            <div className="space-y-3.5 pt-3 border-t border-rose-500/20 animate-fadeIn">
              {/* Температура */}
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-rose-500/30 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span>🌡️</span> Температура тіла:
                  </span>
                  <span className="font-mono font-bold text-rose-400">
                    {bodyTemperature ? `${bodyTemperature}°C` : "Не вимірював"}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  {["36.6", "37.0", "37.2", "37.5", "38.0+"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBodyTemperature(t)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                        bodyTemperature === t
                          ? "bg-rose-500 text-white border-rose-400 shadow-sm"
                          : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {t}°
                    </button>
                  ))}
                  <input
                    type="text"
                    value={bodyTemperature}
                    onChange={(e) => setBodyTemperature(e.target.value)}
                    placeholder="Своє (напр. 37.4)"
                    className="w-28 px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-rose-400 transition-colors"
                  />
                </div>
              </div>

              {/* Симптоми ГРВІ */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 block">
                  🤧 Що саме турбує (симптоми):
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {ILLNESS_SYMPTOMS_LIST.map((sym) => {
                    const isSel = illnessSymptoms.includes(sym.id);
                    return (
                      <button
                        key={sym.id}
                        type="button"
                        onClick={() => {
                          setIllnessSymptoms((prev) =>
                            prev.includes(sym.id)
                              ? prev.filter((x) => x !== sym.id)
                              : [...prev, sym.id]
                          );
                        }}
                        className={`p-2 rounded-xl border text-left text-xs transition-all ${
                          isSel
                            ? "bg-rose-500/25 border-rose-400 text-rose-200 font-semibold shadow-sm"
                            : "bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        {sym.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Коментар */}
              <div>
                <input
                  type="text"
                  value={illnessComment}
                  onChange={(e) => setIllnessComment(e.target.value)}
                  placeholder="Додатковий коментар (коли піднялася t°, які ліки приймав)..."
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 transition-colors"
                />
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep(7)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
              >
                Далі →
              </button>
            </div>
          )}

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* FINAL STEP: Коментар та кнопка відправки */}
      {currentStep === 7 && (
        <form onSubmit={handleSubmit} className="space-y-4 animate-fadeIn">
          {/* Рекомендація лікаря, якщо вже надана */}
          {doctorRecommendation && (
            <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/40 space-y-1.5 shadow-md animate-fadeIn">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <span>👨‍⚕️</span> Рекомендація лікаря ({doctorRecommendation.doctor || "Штаб"}):
                </span>
                {doctorRecommendation.sentAt && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(doctorRecommendation.sentAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <p className="text-xs text-white leading-relaxed font-medium">
                «{doctorRecommendation.text}»
              </p>
              <div className="pt-2 border-t border-sky-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[11px] text-sky-200">
                  📞 Контакт лікаря: <span className="font-mono font-bold text-white">+380935623945</span>
                </span>
                <a
                  href="https://t.me/+380935623945"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
                >
                  <span>💬</span>
                  <span>Написати в Telegram</span>
                </a>
              </div>
            </div>
          )}

          <div className="text-center space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              Завершення анкети
            </h3>
            <p className="text-xs text-slate-400">
              Коментар лікарю (конфіденційно, тренер його не бачить)
            </p>
          </div>

          {/* 8.5 М'яка ненав'язлива підказка при однакових відповідях N днів поспіль (не блокує і не штрафує) */}
          {monotonyNotice?.isMonotonous && (
            <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex items-start gap-2.5 text-xs text-purple-200 shadow-sm animate-fadeIn">
              <span className="text-lg mt-0.5">💬</span>
              <div>
                <span className="font-bold block text-white">Все гаразд? Можна додати нотатку</span>
                <span className="text-[11px] text-slate-300 leading-snug block mt-0.5">
                  Твої відповіді стабільні кілька днів поспіль. Якщо відчуваєш дискомфорт, втому чи стрес — напиши нижче для лікаря. Це приватно, тренер цей коментар не бачить.
                </span>
              </div>
            </div>
          )}

          {/* 8.8 Ручний ввід даних з годинника (сворачиваемый блок, необов'язково) */}
          <PlayerWearablesSection
            playerId={playerId}
            initialData={wearablesData}
            parentSleepHours={sleepHours}
            onSleepHoursChange={(hours) => {
              if (hours !== null) setSleepHours(hours);
            }}
            onChange={(data) => setWearablesData(data)}
          />

          {/* 8.6 Оцінка навантаження тренування гравцем (необов'язково) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/25 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">⏱️</span>
                <div>
                  <label className="text-xs font-bold text-slate-200 block">
                    Оцінка тренування за сьогодні (необов&apos;язково)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Як ти оцінюєш важкість заняття? (Borg 0–10)
                  </span>
                </div>
              </div>
              {trainingRpe !== null && (
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {trainingRpe} / 10
                </span>
              )}
            </div>

            <div className="grid grid-cols-11 gap-1 pt-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setTrainingRpe(trainingRpe === num ? null : num)}
                  className={`h-7 rounded-lg font-mono text-xs font-bold transition-all border ${
                    trainingRpe === num
                      ? "bg-amber-500 text-black border-amber-400 shadow-md font-black"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-slate-400 pt-0.5">
              <span>0: Відпочинок</span>
              <span>5: Важко</span>
              <span>10: Максимум</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 block">
              💬 Особисте повідомлення / коментар (опціонально):
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Якщо є скарги чи запитання, опиши тут..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 resize-none"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-sky-600/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{isPending ? "Збереження..." : "Надіслати анкету 🚀"}</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="w-full py-2 text-xs text-slate-400 hover:text-white"
            >
              ← Повернутися до питань
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
