"use client";

import React, { useState, useEffect } from "react";
import type {
  WearableDeviceType,
  HrvMetricType,
  WearableInputData,
  WearableSource,
} from "@/types/wearables";
import {
  SUPPORTED_DEVICE_PROFILES,
  RESTING_HR_PLAUSIBLE_RANGE,
  HRV_PLAUSIBLE_RANGE,
  SLEEP_DURATION_MIN_PLAUSIBLE_RANGE,
  validatePlausibleRange,
  WEARABLES_DISCLAIMER_TEXT,
} from "@/lib/wearables-constants";
import {
  checkPlayerWearablesAccessAction,
  parseWearableScreenshotAction,
} from "@/actions/wearable-actions";

export interface PlayerWearablesSectionProps {
  playerId: string;
  initialData?: WearableInputData | null;
  // Синхронізація зі спільним полем тривалості сну (sleep_hours з 8.1)
  parentSleepHours?: number | null;
  onSleepHoursChange?: (hours: number | null) => void;
  // Колбек зміни стану носимих пристроїв
  onChange: (data: WearableInputData | null) => void;
}

export function PlayerWearablesSection({
  playerId,
  initialData,
  parentSleepHours,
  onSleepHoursChange,
  onChange,
}: PlayerWearablesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [canUseWearables, setCanUseWearables] = useState(true);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [aiScreenshotEnabled, setAiScreenshotEnabled] = useState(false);
  const [aiConsentGranted, setAiConsentGranted] = useState(true);

  // Стан полів форми
  const [deviceType, setDeviceType] = useState<WearableDeviceType>("whoop");
  const [restingHr, setRestingHr] = useState<string>("");
  const [hrv, setHrv] = useState<string>("");
  const [hrvMetric, setHrvMetric] = useState<HrvMetricType>("rmssd");
  const [sleepHoursPart, setSleepHoursPart] = useState<string>("");
  const [sleepMinPart, setSleepMinPart] = useState<string>("");
  const [deviceScore, setDeviceScore] = useState<string>("");
  const [source, setSource] = useState<WearableSource>("manual");

  // Стан завантаження скріншота через ШІ
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 1. Перевірка доступу та прав (неповнолітні / згода батьків)
  useEffect(() => {
    let isMounted = true;
    async function check() {
      if (!playerId) return;
      const res = await checkPlayerWearablesAccessAction(playerId);
      if (isMounted) {
        setCanUseWearables(res.canUseWearables);
        setBlockReason(res.reason || null);
        setAiScreenshotEnabled(res.aiScreenshotEnabled);
        setAiConsentGranted(!res.isMinor || res.aiProcessingConsentGranted);
        setAccessChecked(true);
      }
    }
    check();
    return () => {
      isMounted = false;
    };
  }, [playerId]);

  // 2. Відновлення запам'ятованого пристрою з localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDevice = localStorage.getItem("med_academy_wearable_device") as WearableDeviceType;
      if (savedDevice && SUPPORTED_DEVICE_PROFILES[savedDevice]) {
        setDeviceType(savedDevice);
        setHrvMetric(SUPPORTED_DEVICE_PROFILES[savedDevice].defaultHrvMetric);
      }
    }
  }, []);

  // 3. Ініціалізація або синхронізація сну з батьківського компонента (8.1 sleep_hours)
  useEffect(() => {
    if (initialData) {
      setDeviceType(initialData.device_type);
      setHrvMetric(initialData.hrv_metric || SUPPORTED_DEVICE_PROFILES[initialData.device_type].defaultHrvMetric);
      if (initialData.resting_hr_bpm) setRestingHr(String(initialData.resting_hr_bpm));
      if (initialData.hrv_ms) setHrv(String(initialData.hrv_ms));
      if (initialData.device_score !== undefined && initialData.device_score !== null) {
        setDeviceScore(String(initialData.device_score));
      }
      if (initialData.sleep_duration_min) {
        const hrs = Math.floor(initialData.sleep_duration_min / 60);
        const mins = initialData.sleep_duration_min % 60;
        setSleepHoursPart(String(hrs));
        setSleepMinPart(mins > 0 ? String(mins) : "0");
      }
      if (
        initialData.resting_hr_bpm ||
        initialData.hrv_ms ||
        initialData.sleep_duration_min ||
        initialData.device_score
      ) {
        setIsOpen(true);
      }
    } else if (parentSleepHours && parentSleepHours > 0 && !sleepHoursPart) {
      // Авто-перенесення вибраних годин сну з форми 8.1
      const totalMins = Math.round(parentSleepHours * 60);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      setSleepHoursPart(String(hrs));
      setSleepMinPart(mins > 0 ? String(mins) : "0");
    }
  }, [initialData, parentSleepHours]);

  // Зміна типу пристрою (зберігається в localStorage)
  const handleDeviceChange = (type: WearableDeviceType) => {
    setDeviceType(type);
    const prof = SUPPORTED_DEVICE_PROFILES[type] || SUPPORTED_DEVICE_PROFILES.other;
    setHrvMetric(prof.defaultHrvMetric);
    if (typeof window !== "undefined") {
      localStorage.setItem("med_academy_wearable_device", type);
    }
  };

  // Розрахунок загальних хвилин сну
  const totalSleepMinutes = (() => {
    const hrs = parseInt(sleepHoursPart, 10);
    const mins = parseInt(sleepMinPart, 10) || 0;
    if (isNaN(hrs) && isNaN(mins)) return null;
    return (isNaN(hrs) ? 0 : hrs * 60) + (isNaN(mins) ? 0 : mins);
  })();

  // Повідомлення батьківського компонента про зміни
  useEffect(() => {
    const rhrVal = restingHr ? parseInt(restingHr, 10) : null;
    const hrvVal = hrv ? parseFloat(hrv) : null;
    const scoreVal = deviceScore ? parseFloat(deviceScore) : null;
    const profile = SUPPORTED_DEVICE_PROFILES[deviceType] || SUPPORTED_DEVICE_PROFILES.other;

    const hasAnyData =
      rhrVal !== null ||
      hrvVal !== null ||
      totalSleepMinutes !== null ||
      scoreVal !== null;

    if (!hasAnyData) {
      onChange(null);
      return;
    }

    onChange({
      device_type: deviceType,
      resting_hr_bpm: rhrVal,
      hrv_ms: hrvVal,
      hrv_metric: hrvMetric,
      sleep_duration_min: totalSleepMinutes,
      device_score: scoreVal,
      device_score_name: profile.defaultScoreName,
      source,
    });

    // Двостороння синхронізація тривалості сну з формою 8.1
    if (totalSleepMinutes !== null && totalSleepMinutes > 0 && onSleepHoursChange) {
      const convertedHours = Math.round((totalSleepMinutes / 60) * 10) / 10;
      onSleepHoursChange(convertedHours);
    }
  }, [
    deviceType,
    restingHr,
    hrv,
    hrvMetric,
    sleepHoursPart,
    sleepMinPart,
    deviceScore,
    source,
  ]);

  // Валідація правдоподібності (м'яка, не блокує)
  const rhrWarn = validatePlausibleRange(
    restingHr ? parseInt(restingHr, 10) : null,
    RESTING_HR_PLAUSIBLE_RANGE
  ).warning;

  const hrvWarn = validatePlausibleRange(
    hrv ? parseFloat(hrv) : null,
    HRV_PLAUSIBLE_RANGE
  ).warning;

  const sleepWarn = validatePlausibleRange(
    totalSleepMinutes,
    SLEEP_DURATION_MIN_PLAUSIBLE_RANGE
  ).warning;

  // Обробник ШІ-скріншота
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiScanning(true);
    setAiNotice(null);
    setAiError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(",")[1];
          const mediaType = file.type as any;

          const res = await parseWearableScreenshotAction({
            playerId,
            imageBase64: base64Data,
            mediaType: mediaType.includes("png")
              ? "image/png"
              : mediaType.includes("webp")
              ? "image/webp"
              : "image/jpeg",
          });

          if (!res.success || !res.data) {
            setAiError(res.error || "Не вдалося розпізнати показники");
            return;
          }

          // Предзаповнюємо форму розпізнаними значеннями
          const d = res.data;
          if (d.device_type) handleDeviceChange(d.device_type);
          if (d.resting_hr_bpm) setRestingHr(String(d.resting_hr_bpm));
          if (d.hrv_ms) setHrv(String(d.hrv_ms));
          if (d.hrv_metric) setHrvMetric(d.hrv_metric);
          if (d.device_score !== undefined && d.device_score !== null) {
            setDeviceScore(String(d.device_score));
          }
          if (d.sleep_duration_min) {
            const hrs = Math.floor(d.sleep_duration_min / 60);
            const mins = d.sleep_duration_min % 60;
            setSleepHoursPart(String(hrs));
            setSleepMinPart(String(mins));
          }
          setSource("screenshot");
          setIsOpen(true);
          setAiNotice("✅ Показники розпізнано! Перевірте значення перед надсиланням.");
        } catch (err: any) {
          setAiError("Помилка обробки файлу");
        } finally {
          setIsAiScanning(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsAiScanning(false);
      setAiError("Не вдалося завантажити зображення");
    }
  };

  if (!accessChecked) return null;

  // 6. Якщо гравець < 18 років без згоди батьків — показуємо компактну плашку блокування
  if (!canUseWearables) {
    return (
      <div className="p-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs flex items-center gap-3">
        <span className="text-xl">⌚</span>
        <div className="text-[11px] leading-snug">
          <span className="font-bold text-slate-300 block">Дані з годинника</span>
          {blockReason || "Потрібна згода батьків на використання носимих пристроїв."}
        </div>
      </div>
    );
  }

  const currentProfile = SUPPORTED_DEVICE_PROFILES[deviceType] || SUPPORTED_DEVICE_PROFILES.other;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden transition-all shadow-sm">
      {/* HEADER / TOGGLE BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3.5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">⌚</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-tight">
                Дані з годинника
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-medium">
                необов&apos;язково
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              WHOOP, Apple Watch, Garmin • Пульс спокою, HRV, сон
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalSleepMinutes || restingHr || hrv ? (
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              Внесено
            </span>
          ) : null}
          <span className="text-slate-400 text-xs font-bold px-1">
            {isOpen ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* COLLAPSIBLE BODY */}
      {isOpen && (
        <div className="p-4 pt-1 border-t border-slate-800/80 space-y-4 animate-fadeIn">
          {/* AI SCREENSHOT UPLOAD (Якщо увімкнено клубом) */}
          {aiScreenshotEnabled && aiConsentGranted && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-sky-950/30 to-indigo-950/30 border border-sky-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-[11px] text-slate-300">
                <span className="font-bold text-sky-300 block">ШІ-розпізнавання зі скріншота</span>
                Зроби скріншот екрана годинника — ШІ автоматично заповнить поля. Зображення не зберігається.
              </div>

              <label className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition-all shrink-0 active:scale-95 disabled:opacity-50">
                <span>{isAiScanning ? "Розпізнавання..." : "📷 Скріншот"}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={isAiScanning}
                  onChange={handleScreenshotUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {aiNotice && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300">
              {aiNotice}
            </div>
          )}

          {aiError && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-300">
              {aiError}
            </div>
          )}

          {/* 1. ВИБІР ТИПУ ПРИСТРОЮ */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 block">
              Тип пристрою (годинник / трекер):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(["whoop", "apple_watch", "garmin", "other"] as WearableDeviceType[]).map((dev) => {
                const p = SUPPORTED_DEVICE_PROFILES[dev];
                const isSelected = deviceType === dev;
                return (
                  <button
                    key={dev}
                    type="button"
                    onClick={() => handleDeviceChange(dev)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? "border-sky-400 bg-sky-500/20 text-white shadow-sm"
                        : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span className="truncate">{p.name.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. ПОЛЯ ВВЕДЕННЯ БІОМЕТРІЇ В РЯДОК */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Пульс спокою */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  Пульс спокою (RHR)
                </label>
                <span className="text-[10px] text-slate-500 font-mono">уд/хв</span>
              </div>
              <input
                type="number"
                min={20}
                max={220}
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                placeholder="напр. 48"
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
              />
              {rhrWarn && (
                <span className="text-[10px] text-amber-400 block font-medium">
                  ⚠️ {rhrWarn}
                </span>
              )}
            </div>

            {/* HRV */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  HRV (варіабельність)
                </label>
                <span className="text-[10px] text-sky-400 font-mono font-bold">
                  {hrvMetric.toUpperCase()} (мс)
                </span>
              </div>
              <input
                type="number"
                step="any"
                min={0}
                max={350}
                value={hrv}
                onChange={(e) => setHrv(e.target.value)}
                placeholder="напр. 72"
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
              />
              {hrvWarn && (
                <span className="text-[10px] text-amber-400 block font-medium">
                  ⚠️ {hrvWarn}
                </span>
              )}
            </div>

            {/* Сон: Години і хвилини */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  Тривалість сну
                </label>
                <span className="text-[10px] text-slate-500 font-mono">год : хв</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={sleepHoursPart}
                  onChange={(e) => setSleepHoursPart(e.target.value)}
                  placeholder="Год (напр. 7)"
                  className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
                />
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={sleepMinPart}
                  onChange={(e) => setSleepMinPart(e.target.value)}
                  placeholder="Хв (напр. 45)"
                  className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
                />
              </div>
              {sleepWarn && (
                <span className="text-[10px] text-amber-400 block font-medium">
                  ⚠️ {sleepWarn}
                </span>
              )}
            </div>

            {/* Показник пристрою (якщо є) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  {currentProfile.defaultScoreName || "Показник пристрою"}
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  {currentProfile.scoreUnit || "бал"}
                </span>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={deviceScore}
                onChange={(e) => setDeviceScore(e.target.value)}
                placeholder={currentProfile.scorePlaceholder || "напр. 85"}
                className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="pt-1 text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-800/40">
            <span>{WEARABLES_DISCLAIMER_TEXT}</span>
            <span>Заповнення: ~10 сек</span>
          </div>
        </div>
      )}
    </div>
  );
}
