"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveWorkloadAction } from "@/actions/save-workload-action";
import {
  type RpeScore,
  type TrainingSessionType,
  type SessionRpeEntry,
  type PlayerWorkloadSummary,
  BORG_CR10_SCALE,
  SESSION_TYPE_UA,
  calculateAcwr,
} from "@/types/workload";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  teams?: { name: string } | null;
};

type Props = {
  players: Player[];
  summaries: PlayerWorkloadSummary[];
  recentEntries: (SessionRpeEntry & { playerName?: string; teamName?: string })[];
  defaultPlayerId?: string;
};

export default function WorkloadClient({
  players,
  summaries,
  recentEntries,
  defaultPlayerId,
}: Props) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    defaultPlayerId || (players[0]?.id ?? "")
  );
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [sessionType, setSessionType] = useState<TrainingSessionType>("training_team");
  const [durationMinutes, setDurationMinutes] = useState<number>(75);
  const [rpeScore, setRpeScore] = useState<RpeScore>(6);
  const [notes, setNotes] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"log" | "acwr_table" | "history">("acwr_table");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const currentAu = Math.round(durationMinutes * rpeScore);
  const rpeMeta = BORG_CR10_SCALE[rpeScore];

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const selectedSummary = summaries.find((s) => s.playerId === selectedPlayerId);

  // Teams list
  const teams = Array.from(
    new Set(players.map((p) => p.teams?.name).filter(Boolean) as string[])
  );

  const filteredSummaries = summaries.filter((s) => {
    if (riskFilter !== "all" && s.riskZone !== riskFilter) return false;
    if (teamFilter !== "all" && s.teamName !== teamFilter) return false;
    return true;
  });

  const dangerCount = summaries.filter((s) => s.riskZone === "danger").length;
  const cautionCount = summaries.filter((s) => s.riskZone === "caution").length;
  const sweetSpotCount = summaries.filter((s) => s.riskZone === "sweet_spot").length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerId) return;

    startTransition(async () => {
      const res = await saveWorkloadAction({
        playerId: selectedPlayerId,
        date,
        sessionType,
        durationMinutes,
        rpeScore,
        notes: notes.trim() || undefined,
      });

      if (res.error) {
        setNotification({ type: "error", message: res.error });
      } else {
        setNotification({
          type: "success",
          message: `Навантаження ${currentAu} AU успішно збережено для ${selectedPlayer?.first_name} ${selectedPlayer?.last_name}!`,
        });
        setNotes("");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 border border-blue-900/20 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Гравців у базі
          </div>
          <div className="text-2xl font-black text-white">{summaries.length}</div>
          <div className="text-xs text-slate-500 mt-1">Під моніторингом ACWR</div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Sweet Spot</span>
            <span>🟢</span>
          </div>
          <div className="text-2xl font-black text-emerald-300">{sweetSpotCount}</div>
          <div className="text-xs text-emerald-500/80 mt-1">ACWR 0.8 – 1.3 (Оптимально)</div>
        </div>

        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Підвищений ризик</span>
            <span>🟡</span>
          </div>
          <div className="text-2xl font-black text-amber-300">{cautionCount}</div>
          <div className="text-xs text-amber-500/80 mt-1">ACWR 1.3 – 1.5 (Контроль)</div>
        </div>

        <div className="bg-red-950/20 border border-red-500/40 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Danger Zone</span>
            <span>🔴</span>
          </div>
          <div className="text-2xl font-black text-red-400">{dangerCount}</div>
          <div className="text-xs text-red-400/80 mt-1">ACWR ≥ 1.5 (Стрибок у 2-4x)</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-blue-900/20 pb-3">
        <button
          onClick={() => setActiveTab("acwr_table")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "acwr_table"
              ? "bg-brand-blue text-white shadow-md shadow-blue-900/30"
              : "bg-surface-raised text-slate-400 hover:text-white"
          }`}
        >
          📊 Матриця навантажень ACWR
        </button>
        <button
          onClick={() => setActiveTab("log")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "log"
              ? "bg-brand-blue text-white shadow-md shadow-blue-900/30"
              : "bg-surface-raised text-slate-400 hover:text-white"
          }`}
        >
          ⏱️ Внести тренування (Session-RPE)
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "history"
              ? "bg-brand-blue text-white shadow-md shadow-blue-900/30"
              : "bg-surface-raised text-slate-400 hover:text-white"
          }`}
        >
          📜 Останні записи ({recentEntries.length})
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between ${
            notification.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
              : "bg-red-950/40 border-red-500/40 text-red-200"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: ACWR TABLE */}
      {activeTab === "acwr_table" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-500 mr-1">Команда:</span>
              <button
                onClick={() => setTeamFilter("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  teamFilter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-surface-raised text-slate-400 hover:text-white"
                }`}
              >
                Всі
              </button>
              {teams.map((t) => (
                <button
                  key={t}
                  onClick={() => setTeamFilter(t)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    teamFilter === t
                      ? "bg-blue-600 text-white"
                      : "bg-surface-raised text-slate-400 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-500 mr-1">Зона ризику:</span>
              <button
                onClick={() => setRiskFilter("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  riskFilter === "all" ? "bg-slate-700 text-white" : "bg-surface-raised text-slate-400"
                }`}
              >
                Всі ({summaries.length})
              </button>
              <button
                onClick={() => setRiskFilter("danger")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  riskFilter === "danger"
                    ? "bg-red-600 text-white"
                    : "bg-surface-raised text-red-400 hover:bg-red-950/30"
                }`}
              >
                🔴 Небезпека ({dangerCount})
              </button>
              <button
                onClick={() => setRiskFilter("caution")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  riskFilter === "caution"
                    ? "bg-amber-600 text-white"
                    : "bg-surface-raised text-amber-400 hover:bg-amber-950/30"
                }`}
              >
                🟡 Контроль ({cautionCount})
              </button>
              <button
                onClick={() => setRiskFilter("sweet_spot")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                  riskFilter === "sweet_spot"
                    ? "bg-emerald-600 text-white"
                    : "bg-surface-raised text-emerald-400 hover:bg-emerald-950/30"
                }`}
              >
                🟢 Оптимум ({sweetSpotCount})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface border border-blue-900/20 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-raised text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-blue-900/20">
                  <tr>
                    <th className="py-3 px-4">Гравець</th>
                    <th className="py-3 px-3">Команда</th>
                    <th className="py-3 px-3">Позиція</th>
                    <th className="py-3 px-3 text-right">Гостре (7д AU)</th>
                    <th className="py-3 px-3 text-right">Хронічне (Сер/тижд)</th>
                    <th className="py-3 px-3 text-center">ACWR Коефіцієнт</th>
                    <th className="py-3 px-3">Статус ризику</th>
                    <th className="py-3 px-3">Останнє тренування</th>
                    <th className="py-3 px-4 text-center">Дія</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-900/10">
                  {filteredSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        Гравців за обраними фільтрами не знайдено
                      </td>
                    </tr>
                  ) : (
                    filteredSummaries.map((s) => {
                      const badge = calculateAcwr(s.acuteLoad, s.chronicLoad);
                      return (
                        <tr
                          key={s.playerId}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                            <Link
                              href={`/players/${s.playerId}`}
                              className="hover:text-brand-blue-light transition-colors"
                            >
                              {s.playerName}
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-slate-300">{s.teamName}</td>
                          <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                            {s.position}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-200">
                            {s.acuteLoad} <span className="text-[10px] text-slate-500">AU</span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {s.weeklyChronicAverage}{" "}
                            <span className="text-[10px] text-slate-500">AU/т</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-md font-mono font-black text-xs border ${badge.badgeClass}`}
                            >
                              {s.acwr.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[11px] font-medium text-slate-300">
                              {badge.titleUa}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-400">
                            {s.lastSessionDate ? (
                              <span>
                                {s.lastSessionDate} · RPE {s.lastSessionRpe}/10 ({s.lastSessionWorkload} AU)
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedPlayerId(s.playerId);
                                setActiveTab("log");
                              }}
                              className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-medium transition-all"
                            >
                              + RPE
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOG FORM */}
      {activeTab === "log" && (
        <div className="max-w-2xl mx-auto bg-surface border border-blue-900/20 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="border-b border-blue-900/20 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>⏱️</span> Фіксація тренувального навантаження (Session-RPE)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Методологія Carl Foster & Borg CR10: Workload (AU) = Тривалість (хв) × RPE (1–10).
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Player Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Гравець
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full bg-surface-raised border border-blue-900/30 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.teams?.name ?? "Без команди"} · {p.position})
                  </option>
                ))}
              </select>
            </div>

            {/* Date & Session Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Дата сесії
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-surface-raised border border-blue-900/30 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Тип тренування
                </label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value as TrainingSessionType)}
                  className="w-full bg-surface-raised border border-blue-900/30 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                >
                  {Object.entries(SESSION_TYPE_UA).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.icon} {val.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Duration slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Тривалість тренування (хвилини)
                </label>
                <span className="text-base font-black font-mono text-brand-blue">
                  {durationMinutes} хв
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={150}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-blue"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>15 хв (відновлення)</span>
                <span>45 хв (зал)</span>
                <span>75-90 хв (тренування)</span>
                <span>120+ хв (матч)</span>
              </div>
            </div>

            {/* Borg CR10 RPE Slider */}
            <div className="bg-slate-900/70 border border-blue-900/30 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Інтенсивність за шкалою Борга (Borg CR10 RPE)
                </label>
                <span
                  className="px-3 py-1 rounded-lg text-lg font-black font-mono border"
                  style={{
                    color: rpeMeta.color,
                    borderColor: `${rpeMeta.color}40`,
                    backgroundColor: `${rpeMeta.color}15`,
                  }}
                >
                  {rpeScore} / 10
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={10}
                value={rpeScore}
                onChange={(e) => setRpeScore(Number(e.target.value) as RpeScore)}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                style={{
                  accentColor: rpeMeta.color,
                }}
              />

              <div className="bg-slate-950/60 p-3 rounded-lg border border-blue-900/15">
                <div className="text-xs font-bold" style={{ color: rpeMeta.color }}>
                  {rpeMeta.label}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{rpeMeta.desc}</div>
              </div>
            </div>

            {/* Calculated Workload Preview */}
            <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-blue-300 font-semibold uppercase tracking-wider">
                  Розраховане навантаження (Workload)
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {durationMinutes} хв × {rpeScore} RPE
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-white font-mono">{currentAu}</span>
                <span className="text-xs text-blue-400 font-bold ml-1.5">AU</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Примітки тренера / лікаря (опціонально)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Індивідуальні обмеження, пульсові зони, відчуття дискомфорту..."
                rows={2}
                className="w-full bg-surface-raised border border-blue-900/30 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 rounded-xl bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-900/40 transition-all flex items-center justify-center gap-2"
            >
              {isPending ? "Збереження..." : "💾 Зафіксувати Session-RPE"}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: RECENT ENTRIES */}
      {activeTab === "history" && (
        <div className="bg-surface border border-blue-900/20 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-raised text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-blue-900/20">
                <tr>
                  <th className="py-3 px-4">Дата</th>
                  <th className="py-3 px-4">Гравець</th>
                  <th className="py-3 px-3">Тип сесії</th>
                  <th className="py-3 px-3 text-right">Тривалість</th>
                  <th className="py-3 px-3 text-center">RPE</th>
                  <th className="py-3 px-3 text-right">Workload</th>
                  <th className="py-3 px-4">Примітки</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-900/10">
                {recentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Ще немає зафіксованих тренувань
                    </td>
                  </tr>
                ) : (
                  recentEntries.map((entry) => {
                    const typeMeta = SESSION_TYPE_UA[entry.session_type] || {
                      label: entry.session_type,
                      icon: "🏃",
                    };
                    const rpeMeta = BORG_CR10_SCALE[entry.rpe_score as RpeScore];
                    return (
                      <tr key={entry.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300">{entry.date}</td>
                        <td className="py-3 px-4 font-semibold text-white">
                          {entry.playerName || entry.player_id}
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {typeMeta.icon} {typeMeta.label}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {entry.duration_minutes} хв
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                            style={{
                              backgroundColor: `${rpeMeta?.color ?? "#3b82f6"}20`,
                              color: rpeMeta?.color ?? "#3b82f6",
                            }}
                          >
                            {entry.rpe_score}/10
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-white">
                          {entry.workload_au}{" "}
                          <span className="text-[10px] text-slate-500">AU</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {entry.notes || <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
