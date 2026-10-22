"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type TrainingSessionType,
  type RpeScore,
  type TeamTrainingPlayerItem,
  SESSION_TYPE_UA,
  BORG_CR10_SCALE,
  ABSENCE_REASONS,
} from "@/types/workload";
import { saveTeamTrainingAction } from "@/actions/training-session-actions";

type Props = {
  initialTeam: { id: string; name: string } | null;
  teams: { id: string; name: string }[];
  initialDate: string;
  isCoach: boolean;
  userRole: "coach" | "doctor" | "admin";
  initialPlayers: TeamTrainingPlayerItem[];
  existingSession: {
    teamSessionId: string | null;
    sessionType: TrainingSessionType;
    defaultMinutes: number;
    defaultRpe: RpeScore;
    sessionNotes: string;
    loggedAt: string;
  } | null;
};

export default function CoachTrainingClient({
  initialTeam,
  teams,
  initialDate,
  isCoach,
  userRole,
  initialPlayers,
  existingSession,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Дата та вибір команди
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    initialTeam?.id || teams[0]?.id || ""
  );
  const [date, setDate] = useState<string>(initialDate);

  // Глобальні параметри тренування
  const [sessionType, setSessionType] = useState<TrainingSessionType>(
    existingSession?.sessionType || "training_team"
  );
  const [teamMinutes, setTeamMinutes] = useState<number>(
    existingSession?.defaultMinutes || 75
  );
  const [teamRpe, setTeamRpe] = useState<RpeScore>(
    existingSession?.defaultRpe ?? 6
  );
  const [sessionNotes, setSessionNotes] = useState<string>(
    existingSession?.sessionNotes || ""
  );

  // Стан гравців
  const [players, setPlayers] = useState<TeamTrainingPlayerItem[]>(initialPlayers);

  // Сповіщення
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Застосувати глобальні хвилини та RPE до всіх присутніх гравців
  function applyDefaultsToAll() {
    setPlayers((prev) =>
      prev.map((p) => {
        if (!p.isPresent) return p;
        return {
          ...p,
          minutes: teamMinutes,
          rpeScore: teamRpe,
        };
      })
    );
    setNotification({
      type: "success",
      message: `Застосовано: ${teamMinutes} хв та RPE ${teamRpe}/10 для всіх присутніх гравців!`,
    });
  }

  // Перемкнути присутність гравця
  function togglePlayerPresence(playerId: string, isPresent: boolean) {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.playerId !== playerId) return p;
        return {
          ...p,
          isPresent,
          minutes: isPresent ? teamMinutes : 0,
          rpeScore: isPresent ? teamRpe : 0,
          absenceReason: isPresent ? "" : p.absenceReason || "unspecified",
        };
      })
    );
  }

  // Зміна хвилин для одного гравця
  function updatePlayerMinutes(playerId: string, minutes: number) {
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, minutes } : p))
    );
  }

  // Зміна RPE для одного гравця
  function updatePlayerRpe(playerId: string, rpeScore: RpeScore) {
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, rpeScore } : p))
    );
  }

  // Зміна причини відсутності
  function updatePlayerAbsenceReason(playerId: string, reason: string) {
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, absenceReason: reason } : p))
    );
  }

  // Зміна нотатки гравця
  function updatePlayerNotes(playerId: string, notes: string) {
    setPlayers((prev) =>
      prev.map((p) => (p.playerId === playerId ? { ...p, notes } : p))
    );
  }

  // Позначити всіх присутніми
  function markAllPresent() {
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        isPresent: true,
        minutes: teamMinutes,
        rpeScore: teamRpe,
        absenceReason: "",
      }))
    );
  }

  // Обробка зміни команди чи дати через URL
  function handleFilterChange(newTeamId: string, newDate: string) {
    setSelectedTeamId(newTeamId);
    setDate(newDate);
    router.push(`/training?teamId=${newTeamId}&date=${newDate}`);
  }

  // Збереження тренування
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeamId) {
      setNotification({ type: "error", message: "Будь ласка, оберіть команду." });
      return;
    }

    startTransition(async () => {
      const res = await saveTeamTrainingAction({
        teamId: selectedTeamId,
        date,
        sessionType,
        defaultMinutes: teamMinutes,
        defaultRpe: teamRpe,
        sessionNotes,
        players: players.map((p) => ({
          playerId: p.playerId,
          isPresent: p.isPresent,
          absenceReason: p.absenceReason || null,
          minutes: p.minutes,
          rpeScore: p.rpeScore,
          notes: p.notes || null,
        })),
      });

      if (!res.success) {
        setNotification({ type: "error", message: res.error || "Помилка збереження" });
      } else {
        setNotification({
          type: "success",
          message: `Тренування успішно збережено! Присутніх: ${res.presentCount}, відсутніх: ${res.absentCount}. Дані внесені до ACWR та експозицій.`,
        });
      }
    });
  }

  const presentCount = players.filter((p) => p.isPresent).length;
  const absentCount = players.filter((p) => !p.isPresent).length;
  const totalAu = players.reduce((sum, p) => sum + (p.isPresent ? p.minutes * p.rpeScore : 0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Топ-навігація та статус */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-500/15 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>⏱️</span> Навантаження тренера (Session-RPE за 10 секунд)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Швидке введення тренування або матчу для всієї команди, відмітка присутності та облік експозицій
          </p>
        </div>

        {/* Швидкі посилання */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/workload"
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition-all flex items-center gap-1.5"
          >
            <span>📊</span>
            <span>Аналітика ACWR</span>
          </Link>
          <Link
            href="/team/readiness"
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition-all flex items-center gap-1.5"
          >
            <span>🚦</span>
            <span>Готовність</span>
          </Link>
        </div>
      </div>

      {/* Сповіщення */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between ${
            notification.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Верхня панель налаштувань: Команда і Дата */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Команда */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Команда {isCoach && <span className="text-amber-400 font-normal">(закріплена)</span>}
            </label>
            {isCoach ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm">
                <span>🛡️</span>
                <span>{initialTeam?.name || "Ваша команда"}</span>
                <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Тренер
                </span>
              </div>
            ) : (
              <select
                value={selectedTeamId}
                onChange={(e) => handleFilterChange(e.target.value, date)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:border-sky-500 focus:outline-none"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Дата тренування */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Дата сесії
              </label>
              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    const yest = new Date(Date.now() - 86400000).toISOString().split("T")[0];
                    handleFilterChange(selectedTeamId, yest);
                  }}
                  className="text-slate-400 hover:text-sky-300 underline"
                >
                  Вчора
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => {
                    const tod = new Date().toISOString().split("T")[0];
                    handleFilterChange(selectedTeamId, tod);
                  }}
                  className="text-slate-400 hover:text-sky-300 underline"
                >
                  Сьогодні
                </button>
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => handleFilterChange(selectedTeamId, e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Тип тренувального заняття */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Тип заняття
            </label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as TrainingSessionType)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:border-sky-500 focus:outline-none"
            >
              {(Object.keys(SESSION_TYPE_UA) as TrainingSessionType[]).map((typeKey) => (
                <option key={typeKey} value={typeKey}>
                  {SESSION_TYPE_UA[typeKey].icon} {SESSION_TYPE_UA[typeKey].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Швидке встановлення для всієї команди (Session-RPE за 10 секунд) */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Швидке встановлення для всієї команди (в 1 клік)
              </span>
            </div>
            <button
              type="button"
              onClick={applyDefaultsToAll}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>⚡</span>
              <span>Застосувати до всіх присутніх</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Базові хвилини */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-300">
                  Тривалість тренування (хвилини):
                </span>
                <span className="font-mono text-sm font-black text-sky-400">
                  {teamMinutes} хв
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[45, 60, 75, 90, 105, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTeamMinutes(m)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                      teamMinutes === m
                        ? "bg-sky-500 text-black border-sky-400 shadow-sm"
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {m} хв
                  </button>
                ))}
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={teamMinutes}
                  onChange={(e) => setTeamMinutes(Number(e.target.value))}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-center font-mono text-white"
                />
              </div>
            </div>

            {/* Базовий RPE команди (0-10) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-bold text-slate-300">
                  Оцінка навантаження команди (Borg CR10: 0–10):
                </span>
                <span
                  className="font-mono text-xs font-black px-2 py-0.5 rounded border"
                  style={{
                    backgroundColor: `${BORG_CR10_SCALE[teamRpe].color}20`,
                    borderColor: `${BORG_CR10_SCALE[teamRpe].color}60`,
                    color: BORG_CR10_SCALE[teamRpe].color,
                  }}
                >
                  {teamRpe} · {BORG_CR10_SCALE[teamRpe].label}
                </span>
              </div>
              <div className="grid grid-cols-11 gap-1">
                {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as RpeScore[]).map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setTeamRpe(score)}
                    className={`h-8 rounded-lg font-mono text-xs font-bold transition-all border ${
                      teamRpe === score
                        ? "text-black shadow-md scale-105 font-black"
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                    style={
                      teamRpe === score
                        ? {
                            backgroundColor: BORG_CR10_SCALE[score].color,
                            borderColor: BORG_CR10_SCALE[score].color,
                          }
                        : {}
                    }
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Загальні примітки тренера */}
          <div>
            <input
              type="text"
              placeholder="Нотатки до тренування (необов'язково, наприклад: Тактична схема, акцент на пресинг)"
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-slate-700 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Панель статистики складу */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-bold text-slate-300">Склад команди ({players.length}):</span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 font-semibold">
            ✓ Присутні: {presentCount}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-950/40 text-rose-400 border border-rose-500/30 font-semibold">
            ✗ Відсутні: {absentCount}
          </span>
          <span className="text-slate-400 font-mono">
            Сумарно: <strong className="text-white">{totalAu} AU</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllPresent}
            className="text-xs text-sky-400 hover:text-sky-300 underline font-semibold"
          >
            Позначити всіх присутніми
          </button>
        </div>
      </div>

      {/* Таблиця гравців з індивідуальними коригуваннями */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Гравець</th>
                <th className="py-3 px-3 text-center">Присутність</th>
                <th className="py-3 px-3 text-center">Хвилини</th>
                <th className="py-3 px-3 text-center">Оцінка RPE (0–10)</th>
                <th className="py-3 px-3 text-center">Навантаження</th>
                <th className="py-3 px-3 text-center">Оцінка гравця</th>
                <th className="py-3 px-4">Коментар / Причина</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    У цій команді немає активних гравців.
                  </td>
                </tr>
              ) : (
                players.map((p) => {
                  const au = p.isPresent ? p.minutes * p.rpeScore : 0;
                  const hasDiscrepancy =
                    p.isPresent &&
                    p.playerRpe !== null &&
                    p.playerRpe !== undefined &&
                    Math.abs(p.playerRpe - p.rpeScore) >= 2;

                  return (
                    <tr
                      key={p.playerId}
                      className={`transition-colors ${
                        !p.isPresent
                          ? "bg-slate-950/40 opacity-70"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      {/* Гравець */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">
                          {p.playerName}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span className="font-mono px-1.5 py-0.2 rounded bg-slate-800 text-sky-400 text-[10px]">
                            {p.position}
                          </span>
                        </div>
                      </td>

                      {/* Присутність (Toggle) */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
                          <button
                            type="button"
                            onClick={() => togglePlayerPresence(p.playerId, true)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                              p.isPresent
                                ? "bg-emerald-500 text-black shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            ✓ Є
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePlayerPresence(p.playerId, false)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                              !p.isPresent
                                ? "bg-rose-500 text-white shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            ✗ Немає
                          </button>
                        </div>
                      </td>

                      {/* Хвилини */}
                      <td className="py-3 px-3 text-center">
                        {p.isPresent ? (
                          <input
                            type="number"
                            min="0"
                            max="180"
                            step="5"
                            value={p.minutes}
                            onChange={(e) =>
                              updatePlayerMinutes(p.playerId, Number(e.target.value))
                            }
                            className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-sky-400 text-xs focus:border-sky-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-slate-500 font-mono">0 хв</span>
                        )}
                      </td>

                      {/* Оцінка RPE тренера */}
                      <td className="py-3 px-3 text-center">
                        {p.isPresent ? (
                          <div className="inline-flex items-center gap-1">
                            <select
                              value={p.rpeScore}
                              onChange={(e) =>
                                updatePlayerRpe(p.playerId, Number(e.target.value) as RpeScore)
                              }
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-center font-mono font-bold text-xs focus:outline-none"
                              style={{
                                color: BORG_CR10_SCALE[p.rpeScore].color,
                              }}
                            >
                              {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as RpeScore[]).map((score) => (
                                <option key={score} value={score}>
                                  {score} — {BORG_CR10_SCALE[score].label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Навантаження AU */}
                      <td className="py-3 px-3 text-center font-mono font-bold">
                        {p.isPresent ? (
                          <span className="text-amber-400">{au} AU</span>
                        ) : (
                          <span className="text-slate-600">0 AU</span>
                        )}
                      </td>

                      {/* Оцінка самого гравця та розбіжність */}
                      <td className="py-3 px-3 text-center">
                        {p.playerRpe !== null && p.playerRpe !== undefined ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-xs font-bold text-slate-300">
                              {p.playerRpe}/10
                            </span>
                            {hasDiscrepancy && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-0.5 bg-amber-500/15 border-amber-500/40 text-amber-300"
                                title={`Розбіжність: Тренер ${p.rpeScore}, Гравець ${p.playerRpe}`}
                              >
                                ⚠️ Δ {Math.abs(p.playerRpe - p.rpeScore)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[10px]">Не заповнив</span>
                        )}
                      </td>

                      {/* Причина або коментар */}
                      <td className="py-3 px-4">
                        {!p.isPresent ? (
                          <select
                            value={p.absenceReason || "unspecified"}
                            onChange={(e) =>
                              updatePlayerAbsenceReason(p.playerId, e.target.value)
                            }
                            className="w-full bg-slate-950 border border-rose-500/30 rounded-lg px-2.5 py-1 text-xs text-rose-300 focus:outline-none"
                          >
                            {ABSENCE_REASONS.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            placeholder="Коментар..."
                            value={p.notes || ""}
                            onChange={(e) => updatePlayerNotes(p.playerId, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:border-slate-700 focus:outline-none"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Підвал таблиці з кнопкою збереження */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-400">
            Введені хвилини автоматично будуть внесені до таблиці{" "}
            <strong className="text-sky-400">exposures</strong> (задача 4.2) та враховані в
            алгоритмі <strong className="text-amber-400">ACWR</strong>.
          </div>

          <button
            type="submit"
            disabled={isPending || players.length === 0}
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <span>Збереження навантаження...</span>
            ) : (
              <>
                <span>💾</span>
                <span>
                  Зберегти навантаження ({presentCount} присутніх, {absentCount} відсутніх)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
