"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveWellnessSurveyAction } from "@/actions/save-wellness-action";
import {
  type WellnessScore,
  type WellnessSurvey,
  calculateWellnessReadiness,
} from "@/types/wellness";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  team_name: string;
};

type Props = {
  players: Player[];
  todaySurveys: Record<string, WellnessSurvey>;
};

const METRIC_CONFIG: {
  key: "sleepQuality" | "fatigueLevel" | "muscleSoreness" | "stressLevel";
  title: string;
  options: { score: WellnessScore; label: string; icon: string; color: string }[];
}[] = [
  {
    key: "sleepQuality",
    title: "1. Як ти спав сьогодні вночі?",
    options: [
      { score: 1, label: "Жахливо / Безсоння", icon: "😫", color: "hover:border-red-500 bg-red-950/20" },
      { score: 2, label: "Погано, прокидався", icon: "🥱", color: "hover:border-orange-500 bg-orange-950/20" },
      { score: 3, label: "Нормально", icon: "😐", color: "hover:border-yellow-500 bg-yellow-950/20" },
      { score: 4, label: "Добре виспався", icon: "🙂", color: "hover:border-lime-500 bg-lime-950/20" },
      { score: 5, label: "Чудово / Повний сил", icon: "😴✨", color: "hover:border-emerald-500 bg-emerald-950/20" },
    ],
  },
  {
    key: "fatigueLevel",
    title: "2. Рівень бадьорості та енергії:",
    options: [
      { score: 1, label: "Виснажений / Слабкість", icon: "🪫", color: "hover:border-red-500 bg-red-950/20" },
      { score: 2, label: "Млявий", icon: "🔋", color: "hover:border-orange-500 bg-orange-950/20" },
      { score: 3, label: "Помірна втома", icon: "⚡", color: "hover:border-yellow-500 bg-yellow-950/20" },
      { score: 4, label: "Свіжий", icon: "💪", color: "hover:border-lime-500 bg-lime-950/20" },
      { score: 5, label: "Пік форми!", icon: "🚀", color: "hover:border-emerald-500 bg-emerald-950/20" },
    ],
  },
  {
    key: "muscleSoreness",
    title: "3. М'язовий біль / Крепатура (DOMS):",
    options: [
      { score: 1, label: "Сильний біль / Скутість", icon: "🛑", color: "hover:border-red-500 bg-red-950/20" },
      { score: 2, label: "Відчутний біль", icon: "⚠️", color: "hover:border-orange-500 bg-orange-950/20" },
      { score: 3, label: "Помірна крепатура", icon: "🦵", color: "hover:border-yellow-500 bg-yellow-950/20" },
      { score: 4, label: "Легкий тонус", icon: "👌", color: "hover:border-lime-500 bg-lime-950/20" },
      { score: 5, label: "М'язи легкі, без болю", icon: "✨", color: "hover:border-emerald-500 bg-emerald-950/20" },
    ],
  },
  {
    key: "stressLevel",
    title: "4. Психологічний стан / Настрій:",
    options: [
      { score: 1, label: "Високий стрес / Пригнічений", icon: "🤯", color: "hover:border-red-500 bg-red-950/20" },
      { score: 2, label: "Тривожний", icon: "😟", color: "hover:border-orange-500 bg-orange-950/20" },
      { score: 3, label: "Нейтральний", icon: "😐", color: "hover:border-yellow-500 bg-yellow-950/20" },
      { score: 4, label: "Спокійний / Сфокусований", icon: "🎯", color: "hover:border-lime-500 bg-lime-950/20" },
      { score: 5, label: "Максимальна впевненість", icon: "🔥", color: "hover:border-emerald-500 bg-emerald-950/20" },
    ],
  },
];

export default function KioskWellnessClient({ players, todaySurveys }: Props) {
  const [surveys, setSurveys] = useState(todaySurveys);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");

  // Flow in modal
  const [step, setStep] = useState<number>(0);
  const [answers, setAnswers] = useState<{
    sleepQuality: WellnessScore;
    fatigueLevel: WellnessScore;
    muscleSoreness: WellnessScore;
    stressLevel: WellnessScore;
  }>({
    sleepQuality: 4,
    fatigueLevel: 4,
    muscleSoreness: 4,
    stressLevel: 4,
  });

  const [isPending, startTransition] = useTransition();

  const teams = Array.from(new Set(players.map((p) => p.team_name)));

  const filteredPlayers = players.filter((p) =>
    selectedTeam === "all" ? true : p.team_name === selectedTeam
  );

  const startSurvey = (player: Player) => {
    setActivePlayer(player);
    setStep(0);
    setAnswers({
      sleepQuality: 4,
      fatigueLevel: 4,
      muscleSoreness: 4,
      stressLevel: 4,
    });
  };

  const handleSelectScore = (score: WellnessScore) => {
    const currentKey = METRIC_CONFIG[step].key;
    const nextAnswers = { ...answers, [currentKey]: score };
    setAnswers(nextAnswers);

    if (step < 3) {
      setStep(step + 1);
    } else {
      // Final step submit
      if (!activePlayer) return;
      startTransition(async () => {
        const today = new Date().toISOString().split("T")[0];
        const res = await saveWellnessSurveyAction({
          playerId: activePlayer.id,
          date: today,
          sleepQuality: nextAnswers.sleepQuality,
          fatigueLevel: nextAnswers.fatigueLevel,
          muscleSoreness: nextAnswers.muscleSoreness,
          stressLevel: nextAnswers.stressLevel,
        });

        if (res.survey) {
          setSurveys((prev) => ({ ...prev, [activePlayer.id]: res.survey! }));
        }
        setTimeout(() => setActivePlayer(null), 800);
      });
    }
  };

  const completedCount = Object.keys(surveys).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-blue-900/30 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-blue/20 border border-brand-blue/40 flex items-center justify-center text-2xl shadow-glow-sm">
            📱
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Планшетний режим роздягальні (Kiosk Mode)
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                Швидкий чекін
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Кожен гравець обирає своє прізвище та відповідає на 4 запитання за 15 секунд
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Пройшли чекін:</div>
            <div className="text-lg font-black font-mono text-emerald-400">
              {completedCount} / {players.length}
            </div>
          </div>
          <Link
            href="/wellness"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
          >
            ← Звичайний режим
          </Link>
        </div>
      </div>

      {/* Team Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-400 mr-2 font-semibold">Вікова група:</span>
        <button
          onClick={() => setSelectedTeam("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedTeam === "all"
              ? "bg-brand-blue text-white shadow-md shadow-blue-900/30"
              : "bg-surface-raised text-slate-400 hover:text-white"
          }`}
        >
          Всі команди ({players.length})
        </button>
        {teams.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedTeam(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedTeam === t
                ? "bg-brand-blue text-white shadow-md shadow-blue-900/30"
                : "bg-surface-raised text-slate-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Players Grid (Big touch-friendly tiles) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filteredPlayers.map((player) => {
          const s = surveys[player.id];
          const isDone = Boolean(s);
          const initials = `${player.last_name[0]}${player.first_name[0]}`;

          return (
            <button
              key={player.id}
              onClick={() => startSurvey(player)}
              className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group flex flex-col justify-between h-36 ${
                isDone
                  ? s.readiness_status === "optimal"
                    ? "bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400"
                    : s.readiness_status === "warning"
                    ? "bg-amber-950/25 border-amber-500/40 hover:border-amber-400"
                    : "bg-red-950/25 border-red-500/40 hover:border-red-400"
                  : "bg-slate-900/80 border-blue-900/25 hover:border-brand-blue hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border ${
                    isDone
                      ? "bg-slate-800 text-white border-slate-700"
                      : "bg-blue-600/20 text-brand-blue border-blue-500/30"
                  }`}
                >
                  {initials}
                </div>

                {isDone ? (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono border ${
                      s.readiness_status === "optimal"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : s.readiness_status === "warning"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : "bg-red-500/20 text-red-300 border-red-500/30"
                    }`}
                  >
                    {s.total_score} б
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                    Очікує
                  </span>
                )}
              </div>

              <div>
                <div className="font-bold text-white text-sm truncate group-hover:text-blue-300 transition-colors">
                  {player.last_name}
                </div>
                <div className="text-xs text-slate-400 truncate">{player.first_name}</div>
                <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                  <span>{player.team_name}</span>
                  <span className="font-mono">{player.position}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Touch Modal for Answering */}
      {activePlayer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-blue-900/40 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-blue-900/25 pb-4">
              <div>
                <div className="text-xs uppercase font-bold text-brand-blue tracking-wider">
                  Ранковий чекін гравця ({step + 1} з 4)
                </div>
                <h2 className="text-xl font-black text-white mt-0.5">
                  {activePlayer.last_name} {activePlayer.first_name}
                </h2>
                <div className="text-xs text-slate-400">
                  {activePlayer.team_name} · {activePlayer.position}
                </div>
              </div>

              <button
                onClick={() => setActivePlayer(null)}
                className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Current Question */}
            <div className="space-y-4">
              <div className="text-base sm:text-lg font-bold text-white">
                {METRIC_CONFIG[step].title}
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {METRIC_CONFIG[step].options.map((opt) => (
                  <button
                    key={opt.score}
                    type="button"
                    onClick={() => handleSelectScore(opt.score)}
                    className={`p-3.5 rounded-2xl border border-blue-900/30 flex items-center justify-between text-left transition-all active:scale-[0.98] ${opt.color}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{opt.icon}</span>
                      <span className="text-sm font-bold text-white">{opt.label}</span>
                    </div>
                    <span className="w-8 h-8 rounded-full bg-slate-800/80 font-mono font-black text-slate-200 flex items-center justify-center text-xs">
                      {opt.score}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-between pt-2 border-t border-blue-900/20">
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-2 rounded-full transition-all ${
                      i === step
                        ? "w-8 bg-brand-blue"
                        : i < step
                        ? "w-3 bg-emerald-500"
                        : "w-3 bg-slate-800"
                    }`}
                  />
                ))}
              </div>

              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="text-xs text-slate-400 hover:text-white font-semibold"
                >
                  ← Назад
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
