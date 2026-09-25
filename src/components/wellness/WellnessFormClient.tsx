"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveWellnessSurveyAction } from "@/actions/save-wellness-action";
import {
  calculateWellnessReadiness,
  type WellnessScore,
} from "@/types/wellness";
import { LOCATION_UA } from "@/lib/constants";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  teams?: { name: string } | null;
};

type Props = {
  players: Player[];
  defaultPlayerId?: string;
};

const METRIC_LABELS: Record<string, { title: string; low: string; high: string; icon: string }> = {
  sleepQuality: {
    title: "Якість сну",
    low: "1 - Дуже погано, часто прокидався",
    high: "5 - Глибокий спокійний сон, виспався",
    icon: "😴",
  },
  fatigueLevel: {
    title: "Рівень енергії / свіжості",
    low: "1 - Сильне виснаження / млявість",
    high: "5 - Свіжий, повний сил та енергії",
    icon: "⚡",
  },
  muscleSoreness: {
    title: "М'язова крепатура (DOMS)",
    low: "1 - Сильний біль / скутість у м'язах",
    high: "5 - Повна відсутність болю / легкість",
    icon: "🦵",
  },
  stressLevel: {
    title: "Стрес / психологічний настрій",
    low: "1 - Високий рівень стресу / тривожність",
    high: "5 - Спокійний, зосереджений, гарний настрій",
    icon: "🧘",
  },
};

export default function WellnessFormClient({ players, defaultPlayerId }: Props) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    defaultPlayerId || (players[0]?.id ?? "")
  );
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [sleepQuality, setSleepQuality] = useState<WellnessScore>(4);
  const [fatigueLevel, setFatigueLevel] = useState<WellnessScore>(4);
  const [muscleSoreness, setMuscleSoreness] = useState<WellnessScore>(4);
  const [stressLevel, setStressLevel] = useState<WellnessScore>(4);
  const [sorenessLocation, setSorenessLocation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  // Калькуляція на льоту
  const currentReadiness = calculateWellnessReadiness({
    sleep_quality: sleepQuality,
    fatigue_level: fatigueLevel,
    muscle_soreness: muscleSoreness,
    stress_level: stressLevel,
  });

  const readinessColor = {
    optimal: "text-status-ok bg-status-ok/10 border-status-ok/30",
    warning: "text-status-warn bg-status-warn/10 border-status-warn/30",
    risk: "text-status-danger bg-status-danger/10 border-status-danger/30",
  }[currentReadiness.readiness_status];

  const readinessLabel = {
    optimal: "🟢 Оптимальна готовність до навантажень",
    warning: "🟡 Помірна втома / крепатура (потрібен контроль)",
    risk: "🔴 Високий ризик травми (рекомендовано знизити об'єм / огляд лікаря)",
  }[currentReadiness.readiness_status];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayerId) {
      setError("Будь ласка, оберіть гравця");
      return;
    }
    setError(null);
    setSavedSuccess(false);

    startTransition(async () => {
      const res = await saveWellnessSurveyAction({
        playerId: selectedPlayerId,
        date,
        sleepQuality,
        fatigueLevel,
        muscleSoreness,
        stressLevel,
        sorenessLocation: muscleSoreness <= 3 ? sorenessLocation : null,
        notes,
      });

      if (res.error) {
        setError(res.error);
      } else {
        setSavedSuccess(true);
      }
    });
  }

  function renderScale(
    key: "sleepQuality" | "fatigueLevel" | "muscleSoreness" | "stressLevel",
    currentVal: WellnessScore,
    setter: (val: WellnessScore) => void
  ) {
    const meta = METRIC_LABELS[key];
    return (
      <div className="bg-surface/80 border border-blue-900/18 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-white flex items-center gap-2">
            <span>{meta.icon}</span>
            <span>{meta.title}</span>
          </label>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-brand-blue">
            {currentVal} / 5
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {([1, 2, 3, 4, 5] as WellnessScore[]).map((score) => {
            const isSelected = currentVal === score;
            const scoreColor =
              score <= 2
                ? "hover:bg-red-500/20 hover:border-red-500/40"
                : score === 3
                ? "hover:bg-amber-500/20 hover:border-amber-500/40"
                : "hover:bg-green-500/20 hover:border-green-500/40";

            return (
              <button
                key={score}
                type="button"
                onClick={() => setter(score)}
                className={`py-2 rounded-lg font-mono font-bold text-sm transition-all border ${
                  isSelected
                    ? score <= 2
                      ? "bg-status-danger text-white border-status-danger shadow-md shadow-status-danger/30"
                      : score === 3
                      ? "bg-status-warn text-slate-900 border-status-warn shadow-md shadow-status-warn/30"
                      : "bg-status-ok text-slate-950 border-status-ok shadow-md shadow-status-ok/30"
                    : `bg-slate-900/80 border-slate-800 text-slate-400 ${scoreColor}`
                }`}
              >
                {score}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] text-slate-500 pt-1">
          <span>{meta.low}</span>
          <span className="text-right">{meta.high}</span>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Вибір гравця та дати */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface border border-blue-900/18 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1 font-medium">
            Гравець академії
          </label>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name} {p.teams?.name ? `(${p.teams.name})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1 font-medium">
            Дата опитування (ранок)
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
          />
        </div>
      </div>

      {/* 4 ключові шкали Hooper-Mackinnon */}
      <div className="space-y-3">
        {renderScale("sleepQuality", sleepQuality, setSleepQuality)}
        {renderScale("fatigueLevel", fatigueLevel, setFatigueLevel)}
        {renderScale("muscleSoreness", muscleSoreness, setMuscleSoreness)}
        {renderScale("stressLevel", stressLevel, setStressLevel)}
      </div>

      {/* Уточнення локалізації крепатури, якщо показник низький */}
      {muscleSoreness <= 3 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
          <label className="block text-xs font-bold text-amber-300">
            ⚠️ Де саме відчувається біль або скутість у м'язах?
          </label>
          <select
            value={sorenessLocation}
            onChange={(e) => setSorenessLocation(e.target.value)}
            className="w-full bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">Оберіть зону...</option>
            {Object.entries(LOCATION_UA).map(([key, name]) => (
              <option key={key} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Примітки */}
      <div className="bg-surface border border-blue-900/18 rounded-xl p-4">
        <label className="block text-xs text-slate-400 mb-1 font-medium">
          Коментар / самопочуття гравця (опціонально)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Наприклад: важка нічна дорога з виїзного матчу, відчуття забитості литкових м'язів..."
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-blue"
        />
      </div>

      {/* Підсумок готовності на льоту */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${readinessColor}`}>
        <div>
          <div className="text-xs uppercase tracking-wider font-bold">
            Сумарний бал готовності
          </div>
          <div className="text-sm font-semibold mt-0.5">{readinessLabel}</div>
        </div>
        <div className="text-2xl font-mono font-extrabold">
          {currentReadiness.total_score} <span className="text-xs text-slate-400">/ 20</span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {savedSuccess && (
        <div className="p-3 rounded-lg bg-green-500/15 border border-green-500/30 text-xs text-green-300 flex items-center justify-between">
          <span>✓ Ранкове опитування успішно збережено для {selectedPlayer?.last_name}!</span>
          <Link href="/availability" className="underline font-bold hover:text-white">
            Перейти в доступність →
          </Link>
        </div>
      )}

      {/* Кнопки збереження */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-3 px-6 rounded-xl bg-brand-blue hover:bg-blue-600 text-white font-bold text-sm transition-colors shadow-lg shadow-brand-blue/20 disabled:opacity-50"
        >
          {isPending ? "Збереження…" : "💾 Зберегти ранковий велнес"}
        </button>
        <Link
          href="/"
          className="py-3 px-5 rounded-xl bg-surface border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          Скасувати
        </Link>
      </div>
    </form>
  );
}
