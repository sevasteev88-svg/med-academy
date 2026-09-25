"use client";

import React, { useState } from "react";
import Card from "@/components/ui/Card";
import { POSITION_LABELS } from "@/lib/constants";

export interface BriefingPlayer {
  id: string;
  name: string;
  number?: number | null;
  position: string;
  team_id: string;
  team_name: string;
  category: string;
  status: "available" | "restricted" | "unavailable";
  restriction_notes?: string;
  max_minutes?: number;
  injury_summary?: string;
  fitness_alert?: string;
  acwr?: number;
  wellness_score?: number;
}

export interface CoachBriefingProps {
  teams: { id: string; name: string }[];
  players: BriefingPlayer[];
}

export default function CoachBriefingClient({ teams, players }: CoachBriefingProps) {
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [tacticalFilter, setTacticalFilter] = useState<"all" | "available" | "restricted" | "unavailable">("all");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [copiedAi, setCopiedAi] = useState(false);

  const filtered = players.filter((p) => {
    if (selectedTeam !== "all" && p.team_id !== selectedTeam) return false;
    if (tacticalFilter !== "all" && p.status !== tacticalFilter) return false;
    return true;
  });

  const availableList = filtered.filter((p) => p.status === "available");
  const restrictedList = filtered.filter((p) => p.status === "restricted");
  const unavailableList = filtered.filter((p) => p.status === "unavailable");

  const totalCount = filtered.length;
  const availPct = totalCount > 0 ? Math.round((availableList.length / totalCount) * 100) : 0;

  const generateAiBriefing = async () => {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const squadContext = {
        totalPlayers: filtered.length,
        availableCount: availableList.length,
        restrictedCount: restrictedList.length,
        unavailableCount: unavailableList.length,
        restrictedPlayers: restrictedList.map((p) => ({
          name: p.name,
          position: p.position,
          limitMinutes: p.max_minutes,
          notes: p.restriction_notes,
          injury: p.injury_summary,
        })),
        unavailablePlayers: unavailableList.map((p) => ({
          name: p.name,
          position: p.position,
          diagnosis: p.injury_summary,
        })),
      };

      const res = await fetch("/api/ai/sports-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "squad-briefing",
          squadContext,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка зв'язку з Gemini");
      setAiSummary(data.answer);
    } catch (err: any) {
      setAiSummary(`⚠️ Помилка формування брифінгу: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Print / Briefing trigger */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-sky-500/15 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Медико-Тактичний Брифінг Тренера (Matchday)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Експрес-зведення для Головного тренера та тренера з фізпідготовки перед тренуванням або грою
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generateAiBriefing}
              disabled={aiLoading}
              className="px-4 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.3)] transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <span>🧠</span> {aiLoading ? "Аналіз Gemini..." : "ШІ-Зведення (Gemini)"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-slate-900/80 hover:bg-slate-800 text-sky-400 border border-sky-500/25 text-xs font-bold rounded-xl shadow-[0_0_12px_rgba(14,165,233,0.15)] transition-all flex items-center gap-2"
            >
              <span>🖨️</span> Роздрукувати рапорт
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Команда:</span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">Усі склади (Академія + U19)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/60">
            <button
              type="button"
              onClick={() => setTacticalFilter("all")}
              className={
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all " +
                (tacticalFilter === "all" ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_10px_rgba(14,165,233,0.4)]" : "text-slate-400 hover:text-white")
              }
            >
              Всі ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("available")}
              className={
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all " +
                (tacticalFilter === "available" ? "bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "text-slate-400 hover:text-white")
              }
            >
              🟢 Готові ({availableList.length})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("restricted")}
              className={
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all " +
                (tacticalFilter === "restricted" ? "bg-amber-600 text-white shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "text-slate-400 hover:text-white")
              }
            >
              🟡 Ліміт ({restrictedList.length})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("unavailable")}
              className={
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all " +
                (tacticalFilter === "unavailable" ? "bg-rose-600 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]" : "text-slate-400 hover:text-white")
              }
            >
              🔴 Лазарет ({unavailableList.length})
            </button>
          </div>
        </div>

        {/* AI Briefing Summary Box */}
        {(aiLoading || aiSummary) && (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-sky-500/30 backdrop-blur-md shadow-xl shadow-sky-950/30 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-sky-500/15">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-base">
                  🧠
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                    Оперативне ШІ-Зведення для Головного Тренера
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      Gemini 2.5 Flash
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Спортивно-медичний розрахунок допусків, ротації та фокусів розминки
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {aiSummary && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(aiSummary);
                      setCopiedAi(true);
                      setTimeout(() => setCopiedAi(false), 2000);
                    }}
                    className="text-xs text-sky-300 hover:text-white px-2.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 transition-colors"
                  >
                    {copiedAi ? "✓ Скопійовано" : "📋 Копіювати"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAiSummary(null)}
                  className="text-slate-400 hover:text-white text-xs p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {aiLoading ? (
              <div className="py-6 flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-300 font-mono">
                  Gemini формує тактико-медичний рапорт...
                </span>
              </div>
            ) : (
              <div className="whitespace-pre-wrap text-xs text-slate-200 leading-relaxed font-sans">
                {aiSummary}
              </div>
            )}
          </div>
        )}

        {/* Readiness Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-emerald-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold mb-1">
              Бойова готовність
            </div>
            <div className="text-3xl font-black font-mono text-emerald-400">{availPct}%</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {availableList.length} з {totalCount} гравців на 100% готові
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase font-mono tracking-wider text-amber-400 font-bold mb-1">
              Модифікований допуск
            </div>
            <div className="text-3xl font-black font-mono text-amber-400">{restrictedList.length}</div>
            <div className="text-[10px] text-slate-400 mt-1">Хвилинний ліміт / щадний режим</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase font-mono tracking-wider text-rose-400 font-bold mb-1">
              Лазарет клубу
            </div>
            <div className="text-3xl font-black font-mono text-rose-400">{unavailableList.length}</div>
            <div className="text-[10px] text-slate-400 mt-1">Гостра фаза / іммобілізація</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase font-mono tracking-wider text-sky-400 font-bold mb-1">
              Акцент фізпідготовки
            </div>
            <div className="text-sm font-bold text-white mt-1">Динамічна розминка</div>
            <div className="text-[10px] text-sky-300 mt-1">Акцент на привідні та литкові м-зи</div>
          </div>
        </div>

        {/* 3 Main Action Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. GREEN: 100% MATCH READY */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Повна готовність (90+ хв)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25">
                {availableList.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {availableList.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 text-center">Гравців не знайдено</div>
              ) : (
                availableList.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-emerald-500/20 hover:border-emerald-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{p.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                          {POSITION_LABELS[p.position] ?? p.position}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.team_name}</div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                        100% Clear
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. AMBER: RESTRICTED / LOAD MANAGEMENT */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  Обмеження / Тайм-ліміт
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
                {restrictedList.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {restrictedList.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 text-center">Гравців з обмеженнями немає</div>
              ) : (
                restrictedList.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 hover:border-amber-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                            {POSITION_LABELS[p.position] ?? p.position}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{p.team_name}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40">
                          {p.max_minutes ? "Макс: " + p.max_minutes + " хв" : "Частковий"}
                        </span>
                      </div>
                    </div>

                    <div className="bg-amber-950/40 p-2 rounded-lg border border-amber-900/40 text-[11px] text-amber-200">
                      <span className="font-semibold text-amber-300">Вказівка штабу: </span>
                      {p.restriction_notes || "Контроль контактних єдиноборств, заміна у 2-му таймі."}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. RED: UNAVAILABLE / MEDICAL WARD */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-rose-500/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider">
                  Недоступні (Лазарет)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/25">
                {unavailableList.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {unavailableList.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 text-center">Лазарет порожній</div>
              ) : (
                unavailableList.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 hover:border-rose-500/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                            {POSITION_LABELS[p.position] ?? p.position}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{p.team_name}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/30">
                          Out
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
                      <span className="text-rose-400 font-semibold">Діагноз / Причина: </span>
                      {p.injury_summary || "Травма на стадії відновлення"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Coach Tactical Advisory Box */}
        <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/20 shadow-[0_4px_25px_rgba(0,0,0,0.35)]">
          <div className="flex items-start gap-3.5">
            <span className="text-2xl">🧠</span>
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">
                Рекомендації Медичного Департаменту ФК «Чорноморець» до гри:
              </h4>
              <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
                <li>
                  Гравцям з групи «Обмеження» обов&apos;язково провести додаткову тейпувальну підготовку за 45 хв до виходу на газон.
                </li>
                <li>
                  За високої температури повітря (більше 24°C) організувати гідратаційні паузи кожні 20–25 хвилин згідно з протоколом Sweat Rate.
                </li>
                <li>
                  При появі будь-яких ознак дезорієнтації чи удару голови — негайно сигналізувати лікарю для застосування протоколу FIFA SCAT6.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
