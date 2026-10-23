"use client";

import { useState, useTransition, useMemo } from "react";
import {
  createExposureAction,
  createBatchExposuresAction,
  deleteExposureAction,
  type BatchExposureEntry,
} from "@/actions/exposure-actions";
import { downloadExposuresCsv, type ExposureExportRow } from "@/lib/export-exposures-csv";
import {
  calculateExposureHours,
  calculateExposureMetrics,
  INSUFFICIENT_EXPOSURE_DATA_MSG,
} from "@/lib/exposure-calculator";
import {
  Calendar,
  Clock,
  Users,
  Download,
  Plus,
  Trash2,
  Layers,
  Filter,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export type TeamItem = {
  id: string;
  name: string;
  playerCount: number;
};

export type ExposureRecord = {
  id: string;
  team_id: string | null;
  date: string;
  type: "training" | "match";
  minutes: number;
  players_count: number;
  notes: string | null;
  created_at: string;
  teams?: { id: string; name: string } | null;
};

type Props = {
  teams: TeamItem[];
  initialExposures: ExposureRecord[];
  injuries: Array<{
    id: string;
    team_id: string | null;
    date_of_injury: string;
    activity_type?: string | null;
  }>;
};

export default function ExposuresManager({
  teams,
  initialExposures,
  injuries,
}: Props) {
  const [exposures, setExposures] = useState<ExposureRecord[]>(initialExposures);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Single Entry Form state
  const defaultTeamId = teams[0]?.id || "";
  const [teamId, setTeamId] = useState<string>(defaultTeamId);
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [sessionType, setSessionType] = useState<"training" | "match">("training");
  const [minutes, setMinutes] = useState<number>(90);
  const selectedTeam = teams.find((t) => t.id === teamId);
  const [playersCount, setPlayersCount] = useState<number>(selectedTeam?.playerCount || 20);
  const [notes, setNotes] = useState<string>("");

  // Batch Entry Form state (Week schedule)
  const [batchTeamId, setBatchTeamId] = useState<string>(defaultTeamId);
  const [batchStartDate, setBatchStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [batchEntries, setBatchEntries] = useState<
    Array<{ enabled: boolean; date: string; dayName: string; type: "training" | "match"; minutes: number; playersCount: number }>
  >([]);

  // Filters
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  // When team changes in single mode, adjust players count default
  function handleTeamChange(newId: string) {
    setTeamId(newId);
    const t = teams.find((item) => item.id === newId);
    if (t && t.playerCount > 0) {
      setPlayersCount(t.playerCount);
    }
  }

  // Generate 7 days for batch mode
  function generateWeekDays(startDateStr: string, tId: string) {
    const t = teams.find((item) => item.id === tId);
    const pCount = t?.playerCount || 20;
    const start = new Date(startDateStr);
    const dayNames = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const dayIndex = d.getDay(); // 0 is Sunday, 6 is Saturday
      const isMatchDay = dayIndex === 6; // default match on Saturday
      const isRestDay = dayIndex === 0; // default Sunday off

      days.push({
        enabled: !isRestDay,
        date: iso,
        dayName: dayNames[dayIndex],
        type: (isMatchDay ? "match" : "training") as "training" | "match",
        minutes: isMatchDay ? 90 : 90,
        playersCount: pCount,
      });
    }
    setBatchEntries(days);
  }

  function handleOpenBatch() {
    setMode("batch");
    if (batchEntries.length === 0) {
      generateWeekDays(batchStartDate, batchTeamId);
    }
  }

  // Handle single submit
  function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const res = await createExposureAction({
        teamId,
        date,
        type: sessionType,
        minutes,
        playersCount,
        notes,
      });

      if (!res.success || !res.exposure) {
        setFeedback({ type: "error", text: res.error || "Помилка збереження" });
        return;
      }

      const teamObj = teams.find((t) => t.id === teamId);
      const newRec: ExposureRecord = {
        ...res.exposure,
        teams: teamObj ? { id: teamObj.id, name: teamObj.name } : null,
      };

      setExposures((prev) => [newRec, ...prev]);
      setNotes("");
      setFeedback({ type: "success", text: "Експозицію успішно додано!" });
      setTimeout(() => setFeedback(null), 3000);
    });
  }

  // Handle batch submit
  function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const activeEntries: BatchExposureEntry[] = batchEntries
      .filter((b) => b.enabled)
      .map((b) => ({
        date: b.date,
        type: b.type,
        minutes: b.minutes,
        playersCount: b.playersCount,
      }));

    if (activeEntries.length === 0) {
      setFeedback({ type: "error", text: "Оберіть хоча б один день для збереження" });
      return;
    }

    startTransition(async () => {
      const res = await createBatchExposuresAction({
        teamId: batchTeamId,
        entries: activeEntries,
      });

      if (!res.success) {
        setFeedback({ type: "error", text: res.error || "Помилка масового збереження" });
        return;
      }

      setFeedback({ type: "success", text: `Успішно збережено ${res.count} сесій!` });
      setMode("single");
      window.location.reload();
    });
  }

  // Handle delete
  function handleDelete(id: string) {
    if (!confirm("Ви впевнені, що хочете видалити цей запис експозиції?")) return;

    startTransition(async () => {
      const res = await deleteExposureAction(id);
      if (res.success) {
        setExposures((prev) => prev.filter((e) => e.id !== id));
      } else {
        alert(res.error || "Помилка видалення");
      }
    });
  }

  // Filtered exposures
  const filteredExposures = useMemo(() => {
    return exposures.filter((exp) => {
      if (filterTeam !== "all" && exp.team_id !== filterTeam) return false;
      if (filterStartDate && exp.date < filterStartDate) return false;
      if (filterEndDate && exp.date > filterEndDate) return false;
      return true;
    });
  }, [exposures, filterTeam, filterStartDate, filterEndDate]);

  // Overall metrics based on current filter
  const currentMetrics = useMemo(() => {
    return calculateExposureMetrics(filteredExposures, injuries, {
      teamId: filterTeam !== "all" ? filterTeam : null,
      startDate: filterStartDate || null,
      endDate: filterEndDate || null,
    });
  }, [filteredExposures, injuries, filterTeam, filterStartDate, filterEndDate]);

  // Handle CSV export
  function handleExportCsv() {
    const rows: ExposureExportRow[] = filteredExposures.map((exp) => {
      const tName = exp.teams?.name || teams.find((t) => t.id === exp.team_id)?.name || "—";
      return {
        date: exp.date,
        teamName: tName,
        type: exp.type,
        minutes: exp.minutes,
        playersCount: exp.players_count,
        exposureHours: calculateExposureHours(exp.minutes, exp.players_count),
        notes: exp.notes,
      };
    });

    downloadExposuresCsv(rows);
  }

  const liveHours = calculateExposureHours(minutes, playersCount);

  return (
    <div className="space-y-6">
      {/* KPI Cards: Експозиція та захворюваність на 1000 годин */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
            Загальна експозиція
          </div>
          <div className="text-2xl font-black font-mono text-white">
            {currentMetrics.totalExposureHours.toLocaleString("uk-UA")} <span className="text-xs text-sky-400 font-sans">год</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {filteredExposures.length} сесій зареєстровано
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
            Експозиція тренувань
          </div>
          <div className="text-2xl font-black font-mono text-sky-400">
            {currentMetrics.trainingExposureHours.toLocaleString("uk-UA")} <span className="text-xs text-slate-400 font-sans">год</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Інцидентність: {currentMetrics.trainingDisplayLabel}
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1">
            Експозиція матчів
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {currentMetrics.matchExposureHours.toLocaleString("uk-UA")} <span className="text-xs text-slate-400 font-sans">год</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Інцидентність: {currentMetrics.matchDisplayLabel}
          </div>
        </div>

        <div className={`bg-slate-900/60 backdrop-blur-md border rounded-2xl p-4 ${
          currentMetrics.hasSufficientData ? "border-amber-500/30" : "border-slate-800"
        }`}>
          <div className="text-[10px] uppercase font-mono tracking-wider text-amber-400 mb-1 font-bold">
            Захворюваність (на 1000 год)
          </div>
          <div className="text-xl md:text-2xl font-black font-mono text-white truncate">
            {currentMetrics.hasSufficientData && currentMetrics.overallIncidence != null ? (
              <span>{currentMetrics.overallIncidence.toFixed(1)} <span className="text-xs text-slate-400 font-sans">/ 1000 год</span></span>
            ) : (
              <span className="text-xs text-slate-400 font-normal leading-tight block">
                {INSUFFICIENT_EXPOSURE_DATA_MSG}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {currentMetrics.totalInjuries} травм у періоді
          </div>
        </div>
      </div>

      {/* Mode Switcher: Одиночний ввід vs Масовий ввід (Тиждень) */}
      <div className="flex items-center justify-between gap-3 border-b border-sky-500/15 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              mode === "single"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-sky-500/15"
            }`}
          >
            <Plus size={14} /> Швидкий ввід сесії
          </button>
          <button
            type="button"
            onClick={handleOpenBatch}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              mode === "batch"
                ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                : "bg-slate-900/60 text-slate-400 hover:text-white border border-sky-500/15"
            }`}
          >
            <Layers size={14} /> Масовий ввід (розклад тижня)
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredExposures.length === 0}
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/80 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download size={14} /> Експорт CSV
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
              : "bg-red-950/40 text-red-300 border border-red-500/30"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {feedback.text}
        </div>
      )}

      {/* FORM: Single Entry */}
      {mode === "single" && (
        <form
          onSubmit={handleSingleSubmit}
          className="bg-slate-900/60 backdrop-blur-md border border-sky-500/20 rounded-2xl p-4 md:p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-2 border-b border-sky-500/10">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Clock size={15} className="text-sky-400" /> Реєстрація командного навантаження
            </h2>
            <span className="text-[11px] font-mono font-semibold text-sky-300">
              Експозиція: <strong className="text-white">{liveHours.toFixed(1)}</strong> людино-годин
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Team */}
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Команда
              </label>
              <select
                value={teamId}
                onChange={(e) => handleTeamChange(e.target.value)}
                className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.playerCount} гравців)
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Дата
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Тип сесії
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-950/80 p-1 rounded-xl border border-sky-500/20">
                <button
                  type="button"
                  onClick={() => setSessionType("training")}
                  className={`py-1 text-[11px] font-bold rounded-lg transition ${
                    sessionType === "training"
                      ? "bg-sky-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ⏱️ Тренування
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType("match")}
                  className={`py-1 text-[11px] font-bold rounded-lg transition ${
                    sessionType === "match"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ⚽ Матч
                </button>
              </div>
            </div>

            {/* Minutes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                  Хвилини
                </label>
                <div className="flex gap-1">
                  {[60, 75, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinutes(m)}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        minutes === m
                          ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min={1}
                max={300}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
              />
            </div>

            {/* Players count */}
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Кількість гравців
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={playersCount}
                onChange={(e) => setPlayersCount(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 pt-1">
            <input
              type="text"
              placeholder="Примітки (опціонально: опонент, мікроцикл, стадіон тощо)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1 w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full md:w-auto px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-600/20 active:scale-95 transition whitespace-nowrap disabled:opacity-50"
            >
              {isPending ? "Збереження…" : "+ Зберегти сесію"}
            </button>
          </div>
        </form>
      )}

      {/* FORM: Batch Entry (Week Schedule) */}
      {mode === "batch" && (
        <form
          onSubmit={handleBatchSubmit}
          className="bg-slate-900/60 backdrop-blur-md border border-sky-500/20 rounded-2xl p-4 md:p-5 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-sky-500/10 gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Layers size={15} className="text-sky-400" /> Масовий ввід розкладу на тиждень
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Швидко внесіть тренування та матчі за тиждень для розрахунку людино-годин
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={batchTeamId}
                onChange={(e) => {
                  setBatchTeamId(e.target.value);
                  generateWeekDays(batchStartDate, e.target.value);
                }}
                className="bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-1.5 text-xs text-white"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={batchStartDate}
                onChange={(e) => {
                  setBatchStartDate(e.target.value);
                  generateWeekDays(e.target.value, batchTeamId);
                }}
                className="bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="space-y-2">
            {batchEntries.map((entry, index) => {
              const rowHours = entry.enabled ? calculateExposureHours(entry.minutes, entry.playersCount) : 0;
              return (
                <div
                  key={entry.date}
                  className={`p-3 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition ${
                    entry.enabled
                      ? "bg-slate-950/60 border-sky-500/20"
                      : "bg-slate-950/20 border-slate-800/40 opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-[150px]">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) => {
                        const next = [...batchEntries];
                        next[index].enabled = e.target.checked;
                        setBatchEntries(next);
                      }}
                      className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-0"
                    />
                    <div>
                      <span className="text-xs font-bold text-white">{entry.dayName}</span>
                      <span className="text-[11px] font-mono text-slate-400 ml-2">{entry.date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      disabled={!entry.enabled}
                      value={entry.type}
                      onChange={(e) => {
                        const next = [...batchEntries];
                        next[index].type = e.target.value as "training" | "match";
                        setBatchEntries(next);
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white disabled:opacity-40"
                    >
                      <option value="training">⏱️ Тренування</option>
                      <option value="match">⚽ Матч</option>
                    </select>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-mono">Хв:</span>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        disabled={!entry.enabled}
                        value={entry.minutes}
                        onChange={(e) => {
                          const next = [...batchEntries];
                          next[index].minutes = Number(e.target.value);
                          setBatchEntries(next);
                        }}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white text-center disabled:opacity-40"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-mono">Гравців:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        disabled={!entry.enabled}
                        value={entry.playersCount}
                        onChange={(e) => {
                          const next = [...batchEntries];
                          next[index].playersCount = Number(e.target.value);
                          setBatchEntries(next);
                        }}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white text-center disabled:opacity-40"
                      />
                    </div>

                    <span className="text-[11px] font-mono text-sky-400 min-w-[70px] text-right">
                      {rowHours.toFixed(1)} год
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMode("single")}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-600/20 active:scale-95 transition disabled:opacity-50"
            >
              {isPending ? "Збереження…" : "Зберегти обрані сесії тижня"}
            </button>
          </div>
        </form>
      )}

      {/* FILTER & REGISTRY TABLE */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-sky-500/15 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-sky-500/10 gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Реєстр експозиції ({filteredExposures.length} записів)
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="bg-slate-950/80 border border-sky-500/20 rounded-xl px-2.5 py-1.5 text-xs text-white"
            >
              <option value="all">Усі команди</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              placeholder="Від дати"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="bg-slate-950/80 border border-sky-500/20 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />
            <span className="text-slate-600 text-xs">—</span>
            <input
              type="date"
              placeholder="До дати"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="bg-slate-950/80 border border-sky-500/20 rounded-xl px-2.5 py-1.5 text-xs text-white"
            />

            {(filterTeam !== "all" || filterStartDate || filterEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setFilterTeam("all");
                  setFilterStartDate("");
                  setFilterEndDate("");
                }}
                className="text-[11px] text-slate-400 hover:text-white px-2 py-1"
              >
                Скинути
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase font-mono tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Дата</th>
                <th className="py-2.5 px-3">Команда</th>
                <th className="py-2.5 px-3">Тип</th>
                <th className="py-2.5 px-3 text-right">Хвилини</th>
                <th className="py-2.5 px-3 text-right">Гравців</th>
                <th className="py-2.5 px-3 text-right">Людино-години</th>
                <th className="py-2.5 px-3">Примітки</th>
                <th className="py-2.5 px-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredExposures.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    Записів експозиції не знайдено
                  </td>
                </tr>
              ) : (
                filteredExposures.map((exp) => {
                  const hrs = calculateExposureHours(exp.minutes, exp.players_count);
                  const tName = exp.teams?.name || teams.find((t) => t.id === exp.team_id)?.name || "—";
                  return (
                    <tr key={exp.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-white">{exp.date}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-300">{tName}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                            exp.type === "match"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                          }`}
                        >
                          {exp.type === "match" ? "⚽ Матч" : "⏱️ Тренування"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{exp.minutes} хв</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{exp.players_count}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-sky-300">{hrs.toFixed(1)} год</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 max-w-[200px] truncate">
                        {exp.notes || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(exp.id)}
                          className="text-slate-500 hover:text-red-400 transition p-1"
                          title="Видалити"
                        >
                          <Trash2 size={13} />
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
  );
}
