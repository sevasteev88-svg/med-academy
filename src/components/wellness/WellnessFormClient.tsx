"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import {
  submitWellnessEntryAction,
  getTodayWellnessEntryForPlayerAction,
} from "@/actions/wellness-entry-actions";
import {
  type WellnessScore,
  type WellnessEntry,
  PAIN_LOCATIONS_LIST,
} from "@/types/wellness";
import PlayerWellnessQuiz from "@/components/wellness/PlayerWellnessQuiz";

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

const METRIC_LABELS: Record<
  string,
  { title: string; low: string; high: string; icon: string }
> = {
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

const SLEEP_HOURS_OPTIONS = [
  { val: 5.5, label: "< 6 год" },
  { val: 6.5, label: "6–7 год" },
  { val: 7.5, label: "7–8 год" },
  { val: 8.5, label: "8–9 год" },
  { val: 9.5, label: "9+ год" },
];

export default function WellnessFormClient({ players, defaultPlayerId }: Props) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    defaultPlayerId || (players[0]?.id ?? "")
  );
  const [viewMode, setViewMode] = useState<"compact" | "quiz">("compact");

  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [sleepQuality, setSleepQuality] = useState<WellnessScore>(4);
  const [sleepHours, setSleepHours] = useState<number | null>(7.5);
  const [fatigueLevel, setFatigueLevel] = useState<WellnessScore>(4);
  const [muscleSoreness, setMuscleSoreness] = useState<WellnessScore>(4);
  const [stressLevel, setStressLevel] = useState<WellnessScore>(4);

  // Прапорці 8.1 / 8.4: Хвороба та Біль (ВАШ)
  const [isIll, setIsIll] = useState<boolean>(false);
  const [hasPain, setHasPain] = useState<boolean>(false);
  const [painVas, setPainVas] = useState<number>(5);
  const [painLocations, setPainLocations] = useState<string[]>([]);
  const [comment, setComment] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  // Завантажуємо вже наявну анкету гравця на сьогодні, якщо вона є
  useEffect(() => {
    if (!selectedPlayerId) return;
    setSavedSuccess(false);
    setError(null);

    getTodayWellnessEntryForPlayerAction(selectedPlayerId).then((res) => {
      if (res.entry) {
        setSleepQuality(res.entry.sleep_quality);
        setSleepHours(res.entry.sleep_hours ?? 7.5);
        setFatigueLevel(res.entry.fatigue);
        setMuscleSoreness(res.entry.soreness);
        setStressLevel(res.entry.stress ?? 4);
        setIsIll(Boolean(res.entry.illness));
        setHasPain(Boolean(res.entry.pain));
        setPainVas(res.entry.pain_vas ?? 5);
        setPainLocations(res.entry.pain_locations || []);
        setComment(res.entry.comment || "");
      }
    });
  }, [selectedPlayerId]);

  const toggleLocation = (locId: string) => {
    setPainLocations((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  // Розрахунок композитного балу
  const totalScore = sleepQuality + fatigueLevel + muscleSoreness + stressLevel;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayerId) {
      setError("Будь ласка, оберіть гравця");
      return;
    }
    setError(null);
    setSavedSuccess(false);

    startTransition(async () => {
      const res = await submitWellnessEntryAction({
        playerId: selectedPlayerId,
        sleepQuality,
        fatigue: fatigueLevel,
        soreness: muscleSoreness,
        stress: stressLevel,
        sleepHours: sleepHours ?? null,
        pain: hasPain,
        painVas: hasPain ? painVas : null,
        painLocations: hasPain ? painLocations : [],
        illness: isIll,
        comment: comment.trim() || null,
        source: "staff",
        entryDate: date,
      });

      if (res.error) {
        setError(res.error);
      } else {
        setSavedSuccess(true);
      }
    });
  }

  // Якщо увімкнено інтерактивний покроковий квіз
  if (viewMode === "quiz" && selectedPlayer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-300 font-medium">
            Гравець: <strong className="text-white">{selectedPlayer.last_name} {selectedPlayer.first_name}</strong>
          </span>
          <button
            onClick={() => setViewMode("compact")}
            className="text-xs text-sky-400 hover:text-sky-300 font-bold px-3 py-1 rounded-xl bg-slate-800 border border-slate-700"
          >
            ← Повернутися до швидкої форми
          </button>
        </div>

        <PlayerWellnessQuiz
          key={selectedPlayer.id}
          playerId={selectedPlayer.id}
          playerName={`${selectedPlayer.last_name} ${selectedPlayer.first_name}`}
          source="staff"
          onSuccess={() => {
            setSavedSuccess(true);
            setViewMode("compact");
          }}
        />
      </div>
    );
  }

  function renderScale(
    key: "sleepQuality" | "fatigueLevel" | "muscleSoreness" | "stressLevel",
    currentVal: WellnessScore,
    setter: (val: WellnessScore) => void
  ) {
    const meta = METRIC_LABELS[key];
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-white flex items-center gap-2">
            <span>{meta.icon}</span>
            <span>{meta.title}</span>
          </label>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-sky-400 border border-slate-700">
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
                className={`py-2 rounded-xl font-mono font-bold text-sm transition-all border ${
                  isSelected
                    ? score <= 2
                      ? "bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/30"
                      : score === 3
                      ? "bg-amber-500 text-slate-900 border-amber-500 shadow-md shadow-amber-500/30"
                      : "bg-emerald-500 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/30"
                    : `bg-slate-950/70 border-slate-800 text-slate-400 ${scoreColor}`
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
      {/* 1. Вибір гравця, дати та режиму */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1 font-medium">
            Гравець академії
          </label>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name} {p.teams?.name ? `(${p.teams.name})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-44">
          <label className="block text-xs text-slate-400 mb-1 font-medium">
            Дата
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="sm:self-end">
          <button
            type="button"
            onClick={() => setViewMode("quiz")}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <span>📱</span>
            <span>Режим Quiz</span>
          </button>
        </div>
      </div>

      {/* 2. КЛЮЧОВІ ПРАПОРЦІ ДЛЯ СВІТЛОФОРА: «ХВОРІЮ» ТА «БІЛЬ» */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Тумблер «Хворію» */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isIll
              ? "bg-rose-950/30 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
              : "bg-slate-900/60 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>🤒</span>
                <span>Стан здоров'я («Хворію»)</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Застуда, температура або нездужання
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsIll(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  !isIll
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                Здоровий
              </button>
              <button
                type="button"
                onClick={() => setIsIll(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  isIll
                    ? "bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/30"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-rose-400"
                }`}
              >
                Хворію 🔴
              </button>
            </div>
          </div>
          {isIll && (
            <p className="text-[11px] text-rose-300 font-semibold mt-2.5 pt-2 border-t border-rose-500/20">
              ⚠️ Гравець отримає червоний статус у світлофорі готовності («Поговорити з гравцем / повідомити лікаря»).
            </p>
          )}
        </div>

        {/* Тумблер «Біль» */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            hasPain
              ? "bg-amber-950/25 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
              : "bg-slate-900/60 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>⚡</span>
                <span>Наявність болю / травми</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Локальний біль у м'язі чи суглобі
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHasPain(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  !hasPain
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                Без болю
              </button>
              <button
                type="button"
                onClick={() => setHasPain(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  hasPain
                    ? "bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/30"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-amber-400"
                }`}
              >
                Є біль ⚡
              </button>
            </div>
          </div>
          {hasPain && (
            <p className="text-[11px] text-amber-300 font-semibold mt-2.5 pt-2 border-t border-amber-500/20">
              Вкажіть рівень болю за шкалою ВАШ нижче.
            </p>
          )}
        </div>
      </div>

      {/* 3. ДЕТАЛІЗАЦІЯ БОЛЮ (ВАШ + ЗОНИ ТІЛА), ЯКЩО hasPain === true */}
      {hasPain && (
        <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-4 animate-fadeIn">
          {/* Слайдер ВАШ */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🎯</span>
                <span>Інтенсивність болю за шкалою ВАШ (0–10):</span>
              </label>
              <span
                className={`text-sm font-mono font-black px-2.5 py-0.5 rounded-lg border ${
                  painVas >= 5
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    : painVas >= 3
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                }`}
              >
                {painVas} / 10{" "}
                {painVas >= 5 ? "(🔴 Червоний поріг)" : painVas >= 3 ? "(🟡 Жовтий поріг)" : "(🟢 Низький)"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400 font-mono">0</span>
              <input
                type="range"
                min={0}
                max={10}
                value={painVas}
                onChange={(e) => setPainVas(parseInt(e.target.value))}
                className="w-full accent-amber-400 h-2 bg-slate-900 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 font-mono">10</span>
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 px-1">
              <span>0: Немає болю</span>
              <span>3-4: Помірний біль</span>
              <span>5+: Сильний біль</span>
            </div>
          </div>

          {/* Локалізація на карті тіла */}
          <div className="space-y-2 pt-2 border-t border-amber-500/20">
            <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span>📍</span>
              <span>Локалізація болю / м'язова група:</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PAIN_LOCATIONS_LIST.map((loc) => {
                const isSelected = painLocations.includes(loc.id);
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => toggleLocation(loc.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-amber-400 text-slate-950 border-amber-400 font-bold shadow-md shadow-amber-400/20"
                        : "bg-slate-900/80 border-slate-700/80 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <span>{loc.icon}</span>
                    <span>{loc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Шкала тривалості сну */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
        <label className="block text-xs font-bold text-slate-300 mb-1">
          ⏱️ Скільки годин спав гравець?
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SLEEP_HOURS_OPTIONS.map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => setSleepHours(opt.val)}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                sleepHours === opt.val
                  ? "bg-sky-500/20 border-sky-400 text-white shadow-md shadow-sky-500/20"
                  : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Чотири ключові шкали Hooper-Mackinnon */}
      <div className="space-y-3">
        {renderScale("sleepQuality", sleepQuality, setSleepQuality)}
        {renderScale("fatigueLevel", fatigueLevel, setFatigueLevel)}
        {renderScale("muscleSoreness", muscleSoreness, setMuscleSoreness)}
        {renderScale("stressLevel", stressLevel, setStressLevel)}
      </div>

      {/* 6. Примітки / коментар */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <label className="block text-xs text-slate-400 mb-1 font-medium">
          Коментар або спостереження медичного штабу (опціонально)
        </label>
        <textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Наприклад: скарги на втому після вечірнього спарингу, процедури масажу..."
          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Підсумок */}
      <div className="p-4 rounded-2xl border bg-slate-900/60 border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-slate-400">
            Сумарний бал за шкалою Hooper
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Фізичний композит (сон + втома + крепатура):{" "}
            <strong className="text-white">
              {sleepQuality + fatigueLevel + muscleSoreness} / 15
            </strong>
          </div>
        </div>
        <div className="text-2xl font-mono font-extrabold text-white">
          {totalScore} <span className="text-xs text-slate-400">/ 20</span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-300">
          {error}
        </div>
      )}

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span>✓ Дані самопочуття успішно збережено для {selectedPlayer?.last_name}!</span>
          <Link
            href="/team/readiness"
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-colors inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <span>🚦</span>
            <span>Світлофор готовності →</span>
          </Link>
        </div>
      )}

      {/* Кнопки дій */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-sm transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "Збереження…" : "💾 Зберегти ранковий велнес"}
        </button>
        <Link
          href="/team/readiness"
          className="py-3 px-5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-colors"
        >
          До світлофора
        </Link>
      </div>
    </form>
  );
}
