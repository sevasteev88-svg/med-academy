"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  type TrainingSessionType,
  type RpeScore,
  SESSION_TYPE_UA,
  BORG_CR10_SCALE,
} from "@/types/workload";
import {
  saveWeeklyMicrocyclePlanAction,
  getWeeklyMicrocyclePlanAction,
  type MicrocycleDayPlan,
} from "@/actions/training-session-actions";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  currentDate: string;
  onPlanApplied: (date: string) => void;
}

// Отримання дати понеділка для вказаної дати
function getMonday(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(y, m - 1, diff));
}

function formatDateIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

const UKRAINIAN_DAYS = [
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "П'ятниця",
  "Субота",
  "Неділя",
];

const DEFAULT_MATCHDAY_LABELS = [
  "MD-5 (Втягуюче)",
  "MD-4 (Сила / Тактика)",
  "MD-3 (Швидкість / Об'єм)",
  "MD-2 (Реакція / Пресинг)",
  "MD-1 (Передматчеве)",
  "MD (Матч / Гра)",
  "MD+1 (Відновлення / Вихідний)",
];

export default function WeeklyMicrocyclePlannerModal({
  isOpen,
  onClose,
  teamId,
  teamName,
  currentDate,
  onPlanApplied,
}: Props) {
  const [weekStartMonday, setWeekStartMonday] = useState<string>(() =>
    formatDateIso(getMonday(currentDate || new Date().toISOString().split("T")[0]))
  );
  const [days, setDays] = useState<MicrocycleDayPlan[]>([]);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // Ініціалізація днів при зміні понеділка або команди
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const baseDate = new Date(`${weekStartMonday}T00:00:00Z`);

    const initialDays: MicrocycleDayPlan[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(baseDate.getTime() + i * 86400000);
      const isWeekendSunday = i === 6;
      const isMatchdaySaturday = i === 5;

      return {
        date: formatDateIso(d),
        dayName: UKRAINIAN_DAYS[i],
        matchdayLabel: DEFAULT_MATCHDAY_LABELS[i],
        sessionType: isMatchdaySaturday
          ? "match"
          : isWeekendSunday
          ? "recovery"
          : "training_team",
        minutes: isWeekendSunday ? 0 : isMatchdaySaturday ? 90 : 75,
        rpeScore: isWeekendSunday ? 0 : (isMatchdaySaturday ? 9 : 6) as RpeScore,
        notes: isWeekendSunday ? "Вихідний день" : isMatchdaySaturday ? "Офіційна гра" : "",
        isDayOff: isWeekendSunday,
      };
    });

    // Спробуємо завантажити раніше збережений план з бази
    getWeeklyMicrocyclePlanAction({ teamId, weekStart: weekStartMonday }).then((res) => {
      if (isMounted) {
        if (res.success && res.plan?.days && res.plan.days.length === 7) {
          setDays(res.plan.days);
        } else {
          setDays(initialDays);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, teamId, weekStartMonday]);

  if (!isOpen) return null;

  const handlePrevWeek = () => {
    const d = new Date(`${weekStartMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    setWeekStartMonday(formatDateIso(d));
    setFeedback(null);
  };

  const handleNextWeek = () => {
    const d = new Date(`${weekStartMonday}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    setWeekStartMonday(formatDateIso(d));
    setFeedback(null);
  };

  const handleCurrentWeek = () => {
    setWeekStartMonday(formatDateIso(getMonday(new Date().toISOString().split("T")[0])));
    setFeedback(null);
  };

  const updateDay = (index: number, updates: Partial<MicrocycleDayPlan>) => {
    setDays((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  };

  // Розрахунок підсумкового навантаження тижня
  const totalWeeklyMinutes = days.reduce(
    (sum, d) => sum + (d.isDayOff ? 0 : Number(d.minutes) || 0),
    0
  );
  const totalWeeklyAu = days.reduce(
    (sum, d) => sum + (d.isDayOff ? 0 : (Number(d.minutes) || 0) * (Number(d.rpeScore) || 0)),
    0
  );
  const activeTrainingDays = days.filter((d) => !d.isDayOff).length;

  const handleSavePlan = () => {
    startTransition(async () => {
      setFeedback(null);
      const res = await saveWeeklyMicrocyclePlanAction({
        teamId,
        weekStart: weekStartMonday,
        days,
      });

      if (res.success) {
        setFeedback({
          success: true,
          msg: `План мікроциклу успішно збережено на весь тиждень! Заплановано ${days.length} днів для команди ${teamName}.`,
        });
        setTimeout(() => {
          onPlanApplied(days[0]?.date || currentDate);
          onClose();
        }, 1500);
      } else {
        setFeedback({
          success: false,
          msg: res.error || "Помилка збереження мікроциклу",
        });
      }
    });
  };

  const [y1, m1, d1] = weekStartMonday.split("-");
  const sunday = new Date(new Date(`${weekStartMonday}T00:00:00Z`).getTime() + 6 * 86400000);
  const [y2, m2, d2] = formatDateIso(sunday).split("-");
  const weekLabel = `${d1}.${m1} – ${d2}.${m2}.${y2}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-5 sm:p-6 space-y-5 text-slate-100">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Планувальник мікроциклу на тиждень
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold">
                {teamName}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Розпишіть тренування, відновлення та гру на весь тиждень. Параметри автоматично стануть планом за замовчуванням.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors self-end sm:self-auto cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* НАВІГАЦІЯ ПО ТИЖНЯХ */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              ← Попередній
            </button>
            <button
              type="button"
              onClick={handleCurrentWeek}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 border border-slate-700 transition-colors cursor-pointer"
            >
              Поточний тиждень
            </button>
            <button
              type="button"
              onClick={handleNextWeek}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              Наступний →
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs font-bold text-white bg-slate-900 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <span>🗓️</span>
            <span>Тиждень: {weekLabel}</span>
          </div>

          {/* Підсумок тижня */}
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="text-slate-400">
              Днів роботи: <strong className="text-white">{activeTrainingDays}</strong> / 7
            </span>
            <span className="text-slate-400">
              Хвилини: <strong className="text-sky-300">{totalWeeklyMinutes} хв</strong>
            </span>
            <span className="text-slate-400">
              Сумарно: <strong className="text-amber-300">{totalWeeklyAu} AU</strong>
            </span>
          </div>
        </div>

        {/* СІТКА 7 ДНІВ МІКРОЦИКЛУ */}
        <div className="space-y-3">
          {days.map((day, idx) => {
            const [, m, d] = day.date.split("-");
            const dateShort = `${d}.${m}`;

            return (
              <div
                key={day.date}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                  day.isDayOff
                    ? "bg-slate-950/40 border-slate-800/80 opacity-75"
                    : day.sessionType === "match"
                    ? "bg-amber-950/20 border-amber-500/40 shadow-sm"
                    : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* День і дата */}
                  <div className="md:col-span-3 flex items-center justify-between md:justify-start gap-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm">
                          {day.dayName}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {dateShort}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={day.matchdayLabel || ""}
                        onChange={(e) => updateDay(idx, { matchdayLabel: e.target.value })}
                        placeholder="Мітка, напр. MD-3"
                        className="text-[11px] font-semibold text-sky-400 bg-transparent border-b border-transparent hover:border-sky-500/40 focus:border-sky-500 focus:outline-none mt-0.5"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateDay(idx, {
                          isDayOff: !day.isDayOff,
                          minutes: !day.isDayOff ? 0 : 75,
                          rpeScore: !day.isDayOff ? 0 : 6,
                          sessionType: !day.isDayOff ? "recovery" : "training_team",
                          notes: !day.isDayOff ? "Вихідний день" : "",
                        })
                      }
                      className={`text-[10px] px-2 py-1 rounded-lg border font-bold transition-all cursor-pointer whitespace-nowrap ${
                        day.isDayOff
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                      }`}
                    >
                      {day.isDayOff ? "🛌 Вихідний" : "⚽ Тренувальний"}
                    </button>
                  </div>

                  {/* Якщо вихідний — спрощений рядок */}
                  {day.isDayOff ? (
                    <div className="md:col-span-9 flex items-center justify-between text-xs text-slate-500 italic py-1">
                      <span>Відпочинок / Відновлення команди (0 хв, 0 AU)</span>
                      <input
                        type="text"
                        placeholder="Нотатка до вихідного..."
                        value={day.notes || ""}
                        onChange={(e) => updateDay(idx, { notes: e.target.value })}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 w-64 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <>
                      {/* Тип заняття */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] text-slate-400 block mb-1">Тип сесії</label>
                        <select
                          value={day.sessionType}
                          onChange={(e) =>
                            updateDay(idx, {
                              sessionType: e.target.value as TrainingSessionType,
                              rpeScore: e.target.value === "match" ? 9 : day.rpeScore,
                              minutes: e.target.value === "match" ? 90 : day.minutes,
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        >
                          {(Object.keys(SESSION_TYPE_UA) as TrainingSessionType[]).map((type) => (
                            <option key={type} value={type}>
                              {SESSION_TYPE_UA[type].icon} {SESSION_TYPE_UA[type].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Хвилини */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-400 block mb-1">Тривалість (хв)</label>
                        <input
                          type="number"
                          min={0}
                          max={240}
                          step={5}
                          value={day.minutes}
                          onChange={(e) => updateDay(idx, { minutes: Number(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono font-bold focus:outline-none"
                        />
                      </div>

                      {/* RPE */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-400 block mb-1">Цільовий RPE</label>
                        <select
                          value={day.rpeScore}
                          onChange={(e) => updateDay(idx, { rpeScore: Number(e.target.value) as RpeScore })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-bold focus:outline-none"
                        >
                          {Object.entries(BORG_CR10_SCALE).map(([scoreStr, s]) => (
                            <option key={scoreStr} value={scoreStr}>
                              {scoreStr} - {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Нотатка / Акцент */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] text-slate-400 block mb-1">Акцент / Нотатка</label>
                        <input
                          type="text"
                          placeholder="напр. Тактика, пресинг"
                          value={day.notes || ""}
                          onChange={(e) => updateDay(idx, { notes: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none truncate"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FEEDBACK */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
              feedback.success
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : "bg-rose-950/40 border-rose-500/40 text-rose-300"
            }`}
          >
            <span>{feedback.success ? "✓" : "⚠️"}</span>
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* КНОПКА ЗБЕРЕЖЕННЯ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <span className="text-xs text-slate-400">
            Збереження розпише базові параметри навантаження на всі 7 днів тижня.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleSavePlan}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <span>{isPending ? "⏳" : "💾"}</span>
              <span>{isPending ? "Збереження плану..." : "Зберегти план мікроциклу на тиждень"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
