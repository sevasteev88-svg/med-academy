"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import {
  type WearableBiometricsEntry,
  type WearableDeviceType,
  DEVICE_META,
} from "@/types/wearables";
import { saveWearableBiometricsAction } from "@/actions/save-wearable-biometrics-action";

type Props = {
  playerId: string;
  playerName: string;
  initialEntries: WearableBiometricsEntry[];
};

export default function WearablesBiometricsCard({
  playerId,
  playerName,
  initialEntries,
}: Props) {
  const [entries, setEntries] = useState<WearableBiometricsEntry[]>(initialEntries);
  const [isOpen, setIsOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Останній замір
  const latest = entries[0] || null;

  // Форма додавання або корекції
  const [deviceType, setDeviceType] = useState<WearableDeviceType>("whoop");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [recoveryScore, setRecoveryScore] = useState<number>(84);
  const [hrvRmssd, setHrvRmssd] = useState<number>(78);
  const [restingHr, setRestingHr] = useState<number>(48);
  const [sleepHours, setSleepHours] = useState<number>(8.2);
  const [sleepEfficiency, setSleepEfficiency] = useState<number>(92);
  const [dayStrain, setDayStrain] = useState<number>(14.5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const res = await saveWearableBiometricsAction({
        playerId,
        deviceType,
        date,
        recoveryScore,
        hrvRmssd,
        restingHr,
        sleepDurationHours: sleepHours,
        sleepEfficiencyPct: sleepEfficiency,
        dayStrain,
        source: "manual",
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.biometrics) {
        setEntries([res.biometrics, ...entries]);
        setIsOpen(false);
      }
    });
  };

  // Швидка демонстраційна авто-синхронізація (емуляція Apple Watch / WHOOP Cloud)
  const handleQuickSync = (dev: WearableDeviceType) => {
    setSyncModalOpen(false);
    startTransition(async () => {
      // Генерація фізіологічно коректних футбольних метрик
      const rec = Math.floor(Math.random() * 35) + 65; // 65-99%
      const hrv = Math.floor(Math.random() * 40) + 60; // 60-100 ms
      const rhr = Math.floor(Math.random() * 10) + 44; // 44-54 bpm
      const sleep = parseFloat((Math.random() * 2.5 + 7.0).toFixed(1)); // 7.0 - 9.5 h
      const strain = parseFloat((Math.random() * 6 + 12).toFixed(1)); // 12 - 18

      const res = await saveWearableBiometricsAction({
        playerId,
        deviceType: dev,
        date: new Date().toISOString().split("T")[0],
        recoveryScore: rec,
        hrvRmssd: hrv,
        restingHr: rhr,
        sleepDurationHours: sleep,
        sleepEfficiencyPct: Math.floor(Math.random() * 10) + 88,
        dayStrain: strain,
        source: dev === "apple_watch" ? "apple_health" : "api_sync",
      });

      if (res.biometrics) {
        setEntries([res.biometrics, ...entries]);
      }
    });
  };

  // Колір recovery
  const getRecoveryColor = (score: number) => {
    if (score >= 67) return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Зелена зона (Повне відновлення)" };
    if (score >= 34) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Жовта зона (Помірне відновлення)" };
    return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", label: "Червона зона (Висока втома)" };
  };

  return (
    <Card className="p-5 md:p-6 bg-slate-900/60 backdrop-blur-xl border border-sky-500/20 shadow-2xl space-y-5">
      {/* Шапка секції */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-sky-500/15 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              <span>⌚</span> Біометрія та носимі пристрої (WHOOP / Apple Watch)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Синхронізація вегетативної нервової системи (HRV), пульсу спокою та якості сну
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSyncModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)] text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>Синхронізувати</span>
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 text-xs font-semibold transition-all"
          >
            {isOpen ? "Скасувати" : "+ Вручну"}
          </button>
        </div>
      </div>

      {/* Останній статус відновлення */}
      {latest ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Recovery Score */}
            <div className={`p-4 rounded-2xl border backdrop-blur-md ${getRecoveryColor(latest.recovery_score).bg} ${getRecoveryColor(latest.recovery_score).border}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recovery</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/50">
                  {DEVICE_META[latest.device_type]?.icon} {DEVICE_META[latest.device_type]?.label.split(" ")[0]}
                </span>
              </div>
              <div className={`text-3xl font-black font-mono mt-1 ${getRecoveryColor(latest.recovery_score).text}`}>
                {latest.recovery_score}%
              </div>
              <div className="text-[10px] text-slate-300 mt-1 font-medium truncate">
                {getRecoveryColor(latest.recovery_score).label.split(" (")[0]}
              </div>
            </div>

            {/* HRV (RMSSD) */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-sky-500/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Варіабельність (HRV)</span>
              <div className="text-3xl font-black font-mono text-white mt-1">
                {latest.hrv_rmssd} <span className="text-xs font-normal text-slate-400">мс</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {latest.hrv_rmssd >= 70 ? "Відмінний тонус ВНС" : latest.hrv_rmssd >= 45 ? "Нормальний стан" : "Парасимпатична втома"}
              </div>
            </div>

            {/* Пульс у спокої (RHR) */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-sky-500/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Пульс у спокої</span>
              <div className="text-3xl font-black font-mono text-white mt-1">
                {latest.resting_hr} <span className="text-xs font-normal text-slate-400">уд/хв</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {latest.resting_hr <= 50 ? "Атлетична брадикардія" : "Базовий рівень"}
              </div>
            </div>

            {/* Сон */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-purple-500/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Тривалість сну</span>
              <div className="text-3xl font-black font-mono text-white mt-1">
                {latest.sleep_duration_hours} <span className="text-xs font-normal text-slate-400">год</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Ефективність сну: <span className="text-purple-300 font-semibold">{latest.sleep_efficiency_pct}%</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Останній замір зафіксовано: <strong className="text-slate-200">{new Date(latest.date).toLocaleDateString("uk-UA")}</strong></span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
              Джерело: {latest.source === "apple_health" ? "Apple HealthKit" : latest.source === "api_sync" ? "WHOOP Cloud API" : "Ручне внесення"}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-400 space-y-2">
          <div className="text-3xl">⌚</div>
          <div>Біометричних записів з трекерів ще не додано.</div>
          <div className="text-[11px] text-sky-400 font-medium">
            Натисніть «Синхронізувати» для імпорту даних WHOOP або Apple Watch.
          </div>
        </div>
      )}

      {/* Модалка вибору пристрою для синхронізації */}
      {syncModalOpen && (
        <div className="p-4 rounded-2xl bg-slate-950/90 border border-sky-500/30 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Оберіть пристрій футболіста для синхронізації:
            </h3>
            <button
              type="button"
              onClick={() => setSyncModalOpen(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleQuickSync("whoop")}
              disabled={isPending}
              className="p-3 rounded-xl bg-slate-900 border border-rose-500/30 hover:border-rose-500/70 hover:bg-slate-850 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⭕</span>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-rose-300">WHOOP 4.0 Strap</div>
                  <div className="text-[10px] text-slate-400">Recovery, HRV, Day Strain, Sleep</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/25">
                Імпорт →
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickSync("apple_watch")}
              disabled={isPending}
              className="p-3 rounded-xl bg-slate-900 border border-sky-500/30 hover:border-sky-500/70 hover:bg-slate-850 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🍎</span>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-sky-300">Apple Watch (HealthKit)</div>
                  <div className="text-[10px] text-slate-400">RHR, HRV SDNN, Sleep Stages</div>
                </div>
              </div>
              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/25">
                Імпорт →
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Форма ручного внесення */}
      {isOpen && (
        <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-slate-950/60 border border-sky-500/20 space-y-4">
          <div className="text-xs font-bold text-white border-b border-slate-800 pb-2">
            Внесення біометричного показника
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Пристрій</label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as WearableDeviceType)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="whoop">WHOOP 4.0</option>
                <option value="apple_watch">Apple Watch</option>
                <option value="garmin">Garmin</option>
                <option value="oura">Oura Ring</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Дата</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Recovery Score (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={recoveryScore}
                onChange={(e) => setRecoveryScore(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">HRV RMSSD (мс)</label>
              <input
                type="number"
                min="10"
                max="250"
                value={hrvRmssd}
                onChange={(e) => setHrvRmssd(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Пульс у спокої (уд/хв)</label>
              <input
                type="number"
                min="35"
                max="120"
                value={restingHr}
                onChange={(e) => setRestingHr(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Годин сну</label>
              <input
                type="number"
                step="0.1"
                min="3"
                max="15"
                value={sleepHours}
                onChange={(e) => setSleepHours(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold"
            >
              {isPending ? "Збереження..." : "Зберегти замір"}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
