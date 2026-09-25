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

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Print / Briefing trigger */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-blue-900/20 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                Медико-Тактичний Брифінг Тренера (Matchday Briefing)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Експрес-зведення для Головного тренера та тренера з фізпідготовки перед матчем / тренуванням
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition flex items-center gap-2"
            >
              <span>🖨️</span> Роздрукувати бриф
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-blue-950/40">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold">Команда:</span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
            >
              <option value="all">Усі склади (Академія + U19)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
            <button
              type="button"
              onClick={() => setTacticalFilter("all")}
              className={
                "px-3 py-1 text-xs font-semibold rounded-md transition " +
                (tacticalFilter === "all" ? "bg-primary text-white" : "text-slate-400 hover:text-white")
              }
            >
              Всі ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("available")}
              className={
                "px-3 py-1 text-xs font-semibold rounded-md transition " +
                (tacticalFilter === "available" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white")
              }
            >
              🟢 Готові ({availableList.length})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("restricted")}
              className={
                "px-3 py-1 text-xs font-semibold rounded-md transition " +
                (tacticalFilter === "restricted" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white")
              }
            >
              🟡 Ліміт ({restrictedList.length})
            </button>
            <button
              type="button"
              onClick={() => setTacticalFilter("unavailable")}
              className={
                "px-3 py-1 text-xs font-semibold rounded-md transition " +
                (tacticalFilter === "unavailable" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white")
              }
            >
              🔴 Недоступні ({unavailableList.length})
            </button>
          </div>
        </div>

        {/* Readiness Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-slate-900/60 border-blue-900/20">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">
              Бойова готовність складу
            </div>
            <div className="text-3xl font-black font-mono text-emerald-400">{availPct}%</div>
            <div className="text-[10px] text-slate-400 mt-1">
              {availableList.length} з {totalCount} гравців на 100% готові
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-blue-900/20">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">
              Модифікований допуск
            </div>
            <div className="text-3xl font-black font-mono text-amber-400">{restrictedList.length}</div>
            <div className="text-[10px] text-slate-400 mt-1">Хвилинний ліміт / щадний режим</div>
          </Card>

          <Card className="bg-slate-900/60 border-blue-900/20">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">
              Лазарет (Поза заявкою)
            </div>
            <div className="text-3xl font-black font-mono text-red-400">{unavailableList.length}</div>
            <div className="text-[10px] text-slate-400 mt-1">Гостра фаза / повна іммобілізація</div>
          </Card>

          <Card className="bg-slate-900/60 border-blue-900/20">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1">
              Акцент фізпідготовки
            </div>
            <div className="text-sm font-bold text-white mt-1">Динамічна розминка</div>
            <div className="text-[10px] text-sky-400 mt-1">Акцент на привідні та литкові м-зи</div>
          </Card>
        </div>

        {/* 3 Main Action Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. GREEN: 100% MATCH READY */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/40">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Повна готовність (90+ хв)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
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
                    className="p-3 rounded-xl bg-slate-900/60 border border-emerald-900/30 hover:border-emerald-500/40 transition flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{p.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                          {POSITION_LABELS[p.position] ?? p.position}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.team_name}</div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
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
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/40">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  Обмеження / Тайм-ліміт
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
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
                    className="p-3 rounded-xl bg-slate-900/60 border border-amber-900/40 hover:border-amber-500/40 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
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
            <div className="flex items-center justify-between pb-2 border-b border-red-500/40">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                  Недоступні (Лазарет)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-800">
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
                    className="p-3 rounded-xl bg-slate-900/60 border border-red-900/40 hover:border-red-500/40 transition space-y-1.5 opacity-90"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">{p.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {POSITION_LABELS[p.position] ?? p.position}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{p.team_name}</div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                          Out
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-300">
                      <span className="text-slate-400">Діагноз / Причина: </span>
                      {p.injury_summary || "Травма на стадії відновлення"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Coach Tactical Advisory Box */}
        <Card className="bg-slate-900/80 border-blue-900/30 p-4 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🧠</span>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Рекомендації Медичного Департаменту ФК Чорноморець до гри:
              </h4>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
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
        </Card>
      </div>
    </div>
  );
}
