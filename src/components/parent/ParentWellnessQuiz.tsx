"use client";

import { useState } from "react";
import { PAIN_LOCATIONS_LIST } from "@/types/wellness";

type Props = {
  playerFirstName: string;
  sleepQuality: number;
  setSleepQuality: (v: number) => void;
  sleepHours: string;
  setSleepHours: (v: string) => void;
  fatigue: number;
  setFatigue: (v: number) => void;
  soreness: number;
  setSoreness: (v: number) => void;
  hasPain: boolean;
  setHasPain: (v: boolean) => void;
  painLocations: string[];
  onTogglePainLocation: (locId: string) => void;
  hasIllness: boolean;
  setHasIllness: (v: boolean) => void;
  wellnessNotes: string;
  setWellnessNotes: (v: string) => void;
  wellnessFeedback: { type: "ok" | "err"; text: string } | null;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
};

const SLEEP_QUALITY_OPTIONS = [
  { score: 1, label: "Дуже погано", icon: "😫" },
  { score: 2, label: "Погано", icon: "🥱" },
  { score: 3, label: "Нормально", icon: "😐" },
  { score: 4, label: "Добре виспалась", icon: "🙂" },
  { score: 5, label: "Чудово / Повна сил", icon: "😴✨" },
];

const SLEEP_HOURS_OPTIONS = [
  { val: "5.5", label: "< 6 год" },
  { val: "6.5", label: "6–7 год" },
  { val: "7.5", label: "7–8 год" },
  { val: "8.5", label: "8–9 год" },
  { val: "9.5", label: "9+ год" },
];

const FRESHNESS_OPTIONS = [
  { score: 1, label: "Виснажена", icon: "🪫" },
  { score: 2, label: "Втомлена", icon: "🔋" },
  { score: 3, label: "Помірно", icon: "⚡" },
  { score: 4, label: "Бадьора", icon: "💪" },
  { score: 5, label: "Повна енергії!", icon: "🚀" },
];

const SORENESS_OPTIONS = [
  { score: 1, label: "Сильний біль у м'язах", icon: "🛑" },
  { score: 2, label: "Відчутна крепатура", icon: "⚠️" },
  { score: 3, label: "Помірна крепатура", icon: "🦵" },
  { score: 4, label: "Легкий тонус", icon: "👌" },
  { score: 5, label: "М'язи свіжі, без болю", icon: "✨" },
];

const TOTAL_STEPS = 7;

/**
 * Покроковий квіз ранкового самопочуття для батьків (аналог квізу футболіста).
 */
export default function ParentWellnessQuiz({
  playerFirstName,
  sleepQuality,
  setSleepQuality,
  sleepHours,
  setSleepHours,
  fatigue,
  setFatigue,
  soreness,
  setSoreness,
  hasPain,
  setHasPain,
  painLocations,
  onTogglePainLocation,
  hasIllness,
  setHasIllness,
  wellnessNotes,
  setWellnessNotes,
  wellnessFeedback,
  isPending,
  onSubmit,
}: Props) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [painAnswered, setPainAnswered] = useState<boolean | null>(null);
  const [illnessAnswered, setIllnessAnswered] = useState<boolean | null>(null);

  const progressPercent = Math.round(((currentStep + 1) / TOTAL_STEPS) * 100);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-sky-500/25 space-y-4">
      {/* Прогрес-бар */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-sky-300 flex items-center gap-1.5">
            <span>📋</span> Покроковий квіз самопочуття
          </span>
          <span className="font-mono text-[10px] text-slate-400">
            Крок {currentStep + 1} з {TOTAL_STEPS} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 transition-all duration-300"
          />
        </div>
      </div>

      {/* КРОК 1: Якість сну */}
      {currentStep === 0 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              1. Як {playerFirstName} спав(ла) сьогодні вночі?
            </h3>
            <p className="text-[11px] text-slate-400">Оберіть одне значення</p>
          </div>
          <div className="space-y-2">
            {SLEEP_QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setSleepQuality(opt.score);
                  setTimeout(() => setCurrentStep(1), 160);
                }}
                className={`w-full min-h-[48px] p-3 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                  sleepQuality === opt.score
                    ? "border-sky-400 bg-sky-500/20 text-white shadow-md shadow-sky-500/15"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-950 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* КРОК 2: Тривалість сну */}
      {currentStep === 1 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              2. Скільки приблизно годин тривав сон?
            </h3>
            <p className="text-[11px] text-slate-400">Швидкий вибір або точне значення</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SLEEP_HOURS_OPTIONS.map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => {
                  setSleepHours(opt.val);
                  setTimeout(() => setCurrentStep(2), 160);
                }}
                className={`min-h-[48px] p-2.5 rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  sleepHours === opt.val
                    ? "border-sky-400 bg-sky-500/20 text-white shadow-md"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
                }`}
              >
                <span className="text-base">⏱️</span>
                <span className="text-xs font-bold font-mono">{opt.label}</span>
              </button>
            ))}
          </div>

          <div>
            <input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              placeholder="Або введіть вручну (напр. 9)"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(0)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-xs text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
            >
              Далі →
            </button>
          </div>
        </div>
      )}

      {/* КРОК 3: Бадьорість */}
      {currentStep === 2 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              3. Наскільки бадьорим(ою) почувається зранку?
            </h3>
            <p className="text-[11px] text-slate-400">Рівень фізичної енергії (1–5)</p>
          </div>
          <div className="space-y-2">
            {FRESHNESS_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setFatigue(opt.score);
                  setTimeout(() => setCurrentStep(3), 160);
                }}
                className={`w-full min-h-[48px] p-3 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                  fatigue === opt.score
                    ? "border-amber-400 bg-amber-500/20 text-white shadow-md shadow-amber-500/15"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-950 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* КРОК 4: М'язи / Крепатура */}
      {currentStep === 3 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              4. Стан м&apos;язів після попередніх занять:
            </h3>
            <p className="text-[11px] text-slate-400">
              Відчуття крепатури (1 = сильний біль, 5 = м&apos;язи свіжі)
            </p>
          </div>
          <div className="space-y-2">
            {SORENESS_OPTIONS.map((opt) => (
              <button
                key={opt.score}
                type="button"
                onClick={() => {
                  setSoreness(opt.score);
                  setTimeout(() => setCurrentStep(4), 160);
                }}
                className={`w-full min-h-[48px] p-3 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
                  soreness === opt.score
                    ? "border-rose-400 bg-rose-500/20 text-white shadow-md shadow-rose-500/15"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-semibold">{opt.label}</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400 px-2 py-0.5 rounded-lg bg-slate-950 border border-white/5">
                  {opt.score}
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* КРОК 5: Біль або дискомфорт */}
      {currentStep === 4 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              5. Чи скаржиться дитина на біль у суглобі чи м&apos;язі?
            </h3>
            <p className="text-[11px] text-slate-400">
              Гострий або локальний біль, окрім звичайної крепатури
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setHasPain(false);
                setPainAnswered(false);
                setTimeout(() => setCurrentStep(5), 160);
              }}
              className={`min-h-[64px] p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                painAnswered === false || (!hasPain && painAnswered !== true)
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-xl">👌</span>
              <span className="text-xs font-bold">Ні, болю немає</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHasPain(true);
                setPainAnswered(true);
              }}
              className={`min-h-[64px] p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                hasPain
                  ? "border-amber-500 bg-amber-500/20 text-amber-200 shadow-md"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-xl">⚠️</span>
              <span className="text-xs font-bold">Так, є біль</span>
            </button>
          </div>

          {hasPain && (
            <div className="space-y-2.5 pt-2 border-t border-amber-500/20">
              <div className="text-[11px] font-bold text-slate-300">
                📍 Оберіть зони, де болить (можна кілька):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PAIN_LOCATIONS_LIST.map((loc) => {
                  const selected = painLocations.includes(loc.id);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => onTogglePainLocation(loc.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        selected
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {loc.icon} {loc.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Далі →
              </button>
            </div>
          )}

          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* КРОК 6: Ознаки нездужання */}
      {currentStep === 5 && (
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              6. Чи є ознаки нездужання або застуди?
            </h3>
            <p className="text-[11px] text-slate-400">
              Температура, нежить, біль у горлі, слабкість
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setHasIllness(false);
                setIllnessAnswered(false);
                setTimeout(() => setCurrentStep(6), 160);
              }}
              className={`min-h-[64px] p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                illnessAnswered === false || (!hasIllness && illnessAnswered !== true)
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 shadow-md"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-xl">🍏</span>
              <span className="text-xs font-bold">Ні, дитина здорова</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHasIllness(true);
                setIllnessAnswered(true);
                setTimeout(() => setCurrentStep(6), 160);
              }}
              className={`min-h-[64px] p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                hasIllness
                  ? "border-rose-500 bg-rose-500/20 text-rose-200 shadow-md"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300"
              }`}
            >
              <span className="text-xl">🤒</span>
              <span className="text-xs font-bold">Так, є нездужання</span>
            </button>
          </div>

          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
          </div>
        </div>
      )}

      {/* КРОК 7: Підсумок, примітка та збереження */}
      {currentStep === 6 && (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="text-center space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white">
              7. Перевірте відповіді та додайте примітку
            </h3>
            <p className="text-[11px] text-slate-400">
              Дані буде передано лікарю та тренеру клубу
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Якість сну</div>
              <div className="font-bold text-white">{sleepQuality} / 5</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Тривалість сну</div>
              <div className="font-bold text-white">{sleepHours || "—"} год</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Бадьорість</div>
              <div className="font-bold text-white">{fatigue} / 5</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">М&apos;язи</div>
              <div className="font-bold text-white">{soreness} / 5</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Біль</div>
              <div className={`font-bold ${hasPain ? "text-amber-300" : "text-emerald-300"}`}>
                {hasPain ? `Так (${painLocations.length || 0} зон)` : "Ні"}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Застуда</div>
              <div className={`font-bold ${hasIllness ? "text-rose-300" : "text-emerald-300"}`}>
                {hasIllness ? "Є ознаки" : "Немає"}
              </div>
            </div>
          </div>

          <div>
            <input
              type="text"
              value={wellnessNotes}
              onChange={(e) => setWellnessNotes(e.target.value)}
              placeholder="Коротка примітка (за бажанням, напр. погано спав)"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {wellnessFeedback && (
            <div
              className={`p-2.5 rounded-xl text-xs font-semibold ${
                wellnessFeedback.type === "ok"
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
              }`}
            >
              {wellnessFeedback.text}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              ← Назад
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
            >
              {isPending ? "Збереження..." : "Зберегти ранковий чекін"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
