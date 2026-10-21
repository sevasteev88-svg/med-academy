"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  type PlayerReadinessResult,
  type ReadinessColor,
  type PhysicalFlagCategory,
} from "@/lib/readiness";
import {
  READINESS_DISCLAIMER_TEXT,
  type ClubReadinessConfig,
} from "@/lib/readiness-constants";

interface Props {
  initialPlayers: PlayerReadinessResult[];
  teams: { id: string; name: string }[];
  currentTeamId: string;
  currentDate: string;
  userRole: "coach" | "doctor" | "admin";
  config: ClubReadinessConfig;
}

export default function CoachReadinessClient({
  initialPlayers,
  teams,
  currentTeamId,
  currentDate,
  userRole,
  config,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState(currentTeamId);
  const [filterStatus, setFilterStatus] = useState<"all" | "attention" | "green" | "gray">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const isDoctorOrAdmin = userRole === "doctor" || userRole === "admin";

  // Фільтрація списку гравців
  const filteredPlayers = initialPlayers.filter((p) => {
    // Пошук за ім'ям
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = p.playerName?.toLowerCase().includes(q);
      const posMatch = p.position?.toLowerCase().includes(q);
      if (!nameMatch && !posMatch) return false;
    }

    if (filterStatus === "attention") {
      return p.status === "red" || p.status === "yellow";
    }
    if (filterStatus === "green") {
      return p.status === "green";
    }
    if (filterStatus === "gray") {
      return p.status === "gray";
    }
    return true;
  });

  // Лічильники
  const totalCount = initialPlayers.length;
  const greenCount = initialPlayers.filter((p) => p.status === "green").length;
  const yellowCount = initialPlayers.filter((p) => p.status === "yellow").length;
  const redCount = initialPlayers.filter((p) => p.status === "red").length;
  const grayCount = initialPlayers.filter((p) => p.status === "gray").length;

  const attentionCount = yellowCount + redCount;

  return (
    <div className="space-y-6">
      {/* 1. ОБОВ'ЯЗКОВИЙ ДИСКЛЕЙМЕР ДЛЯ ТРЕНЕРА */}
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-950/40 via-blue-950/30 to-slate-900/40 p-4 sm:p-5 backdrop-blur-md shadow-[0_0_25px_rgba(14,165,233,0.1)] flex items-start gap-3.5">
        <span className="text-2xl mt-0.5">ℹ️</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
              Принцип моніторингу
            </span>
            <span className="text-xs text-slate-400">
              Індивідуальний Z-score (28 днів)
            </span>
          </div>
          <p className="text-sm sm:text-base font-bold text-white mt-1.5 leading-snug">
            «{READINESS_DISCLAIMER_TEXT}»
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Кольори світлофора відображають відхилення від особистої норми гравця, а не команди. Жодних автоматичних відсторонень — система лише підказує теми для бесіди перед заняттям.
          </p>
        </div>
      </div>

      {/* 2. ШАПКА ТА ФІЛЬТРИ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Вибір команди (для лікаря/адміна) */}
          {teams.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-400">Команда:</label>
              <select
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value);
                  const url = new URL(window.location.href);
                  url.searchParams.set("teamId", e.target.value);
                  window.location.href = url.toString();
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-sky-500"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Дата моніторингу */}
          <div className="flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
            <span>📅</span>
            <span className="font-medium">{currentDate}</span>
          </div>

          {/* Пошук */}
          <input
            type="text"
            placeholder="Пошук гравця..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-sky-500 min-w-[160px]"
          />
        </div>

        {/* Посилання для лікаря на налаштування порогових значень */}
        {isDoctorOrAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/admin/readiness-settings"
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors font-medium"
            >
              <span>⚙️</span>
              <span>
                {config.status === "draft"
                  ? "Чернетка порогових правил (потребує затвердження)"
                  : "Порогові правила лікаря"}
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* 3. КАРТКИ ЗВЕДЕНОЇ СТАТИСТИКИ ТА ТАБИ ФІЛЬТРАЦІЇ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Всі */}
        <button
          onClick={() => setFilterStatus("all")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            filterStatus === "all"
              ? "bg-slate-800 border-sky-500 shadow-[0_0_15px_rgba(56,189,248,0.2)]"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="text-xs text-slate-400 font-medium">Вся команда</div>
          <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Всі зареєстровані</div>
        </button>

        {/* Оптимально (Зелені) */}
        <button
          onClick={() => setFilterStatus("green")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            filterStatus === "green"
              ? "bg-emerald-950/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : "bg-slate-900/60 border-slate-800 hover:border-emerald-500/40"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Оптимально</span>
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-1">{greenCount}</div>
          <div className="text-[11px] text-emerald-400/60 mt-0.5">Повний допуск</div>
        </button>

        {/* Потребують уваги (Жовті + Червоні) */}
        <button
          onClick={() => setFilterStatus("attention")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            filterStatus === "attention"
              ? "bg-amber-950/40 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
              : "bg-slate-900/60 border-slate-800 hover:border-amber-500/40"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span>Увага / Лікар</span>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1 flex items-baseline gap-2">
            <span>{attentionCount}</span>
            <span className="text-xs text-rose-400 font-bold">
              (🔴 {redCount} / 🟡 {yellowCount})
            </span>
          </div>
          <div className="text-[11px] text-amber-400/60 mt-0.5">Коригування / діалог</div>
        </button>

        {/* Сірі (Збір даних / Не заповнив) */}
        <button
          onClick={() => setFilterStatus("gray")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            filterStatus === "gray"
              ? "bg-slate-800 border-slate-500 shadow-[0_0_15px_rgba(148,163,184,0.2)]"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" />
            <span>Збір даних / Пропуск</span>
          </div>
          <div className="text-2xl font-black text-slate-300 mt-1">{grayCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Немає повної норми</div>
        </button>
      </div>

      {/* 4. СПИСОК ГРАВЦІВ (СВІТЛОФОР) */}
      <div className="space-y-3">
        {filteredPlayers.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 text-sm">
            Гравців за обраним фільтром не знайдено.
          </div>
        ) : (
          filteredPlayers.map((player) => (
            <PlayerReadinessCard key={player.playerId} player={player} />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Окрема картка готовності гравця
 */
function PlayerReadinessCard({ player }: { player: PlayerReadinessResult }) {
  // Візуальні стилі для кольорів світлофора
  const colorStyles: Record<
    ReadinessColor,
    {
      border: string;
      bg: string;
      badgeBg: string;
      badgeText: string;
      dot: string;
      icon: string;
    }
  > = {
    green: {
      border: "border-emerald-500/30 hover:border-emerald-500/50",
      bg: "bg-slate-900/70 hover:bg-slate-900/90",
      badgeBg: "bg-emerald-500/10 border-emerald-500/30",
      badgeText: "text-emerald-300",
      dot: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]",
      icon: "🟢",
    },
    yellow: {
      border: "border-amber-500/30 hover:border-amber-500/50",
      bg: "bg-amber-950/20 hover:bg-amber-950/30",
      badgeBg: "bg-amber-500/10 border-amber-500/30",
      badgeText: "text-amber-300",
      dot: "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]",
      icon: "🟡",
    },
    red: {
      border: "border-rose-500/40 hover:border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
      bg: "bg-rose-950/25 hover:bg-rose-950/35",
      badgeBg: "bg-rose-500/15 border-rose-500/30",
      badgeText: "text-rose-300 font-bold",
      dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]",
      icon: "🔴",
    },
    gray: {
      border: "border-slate-800 hover:border-slate-700",
      bg: "bg-slate-900/40 hover:bg-slate-900/60",
      badgeBg: "bg-slate-800 border-slate-700",
      badgeText: "text-slate-400",
      dot: "bg-slate-500",
      icon: "⚪",
    },
  };

  const style = colorStyles[player.status] || colorStyles.gray;

  // Відображення категорій прапорців
  const categoryBadges: Record<PhysicalFlagCategory, { label: string; icon: string; style: string }> = {
    біль: {
      label: "Біль",
      icon: "⚡",
      style: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    },
    втома: {
      label: "Втома",
      icon: "🔋",
      style: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    },
    сон: {
      label: "Сон",
      icon: "🌙",
      style: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
    },
    нездужання: {
      label: "Нездужання",
      icon: "🤒",
      style: "bg-red-500/15 text-red-300 border-red-500/40 font-bold",
    },
  };

  return (
    <div
      className={`p-4 rounded-2xl border transition-all backdrop-blur-sm ${style.border} ${style.bg}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Гравець та статус */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex-shrink-0 mt-1 sm:mt-0">
            <span className={`w-3.5 h-3.5 rounded-full inline-block ${style.dot}`} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white text-base">
                {player.playerName || "Невідомий гравець"}
              </span>
              {player.position && (
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/80 font-medium">
                  {player.position}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1.5 ${style.badgeBg} ${style.badgeText}`}
              >
                <span>{style.icon}</span>
                <span>{player.statusLabel}</span>
              </span>

              <span className="text-xs text-slate-400 font-medium">
                {player.actionPrompt}
              </span>
            </div>
          </div>
        </div>

        {/* Прапорці фізичного стану та тренд */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:justify-end">
          {/* Категорії фізичних прапорців (ТІЛЬКИ узагальнені категорії: біль, втома, сон, нездужання) */}
          {player.flagCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">
                Флажки:
              </span>
              {player.flagCategories.map((cat) => {
                const b = categoryBadges[cat];
                if (!b) return null;
                return (
                  <span
                    key={cat}
                    className={`text-xs px-2 py-0.5 rounded-lg border flex items-center gap-1 font-medium ${b.style}`}
                  >
                    <span>{b.icon}</span>
                    <span>{b.label}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* 7-денний міні-графік тренду */}
          <div className="flex items-center gap-2 bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-500 font-medium mr-1">
              7 днів:
            </span>
            <div className="flex items-end gap-1.5 h-6">
              {player.trendLast7Days.map((pt, idx) => {
                const isToday = idx === player.trendLast7Days.length - 1;
                const dotColor =
                  pt.status === "green"
                    ? "bg-emerald-400"
                    : pt.status === "yellow"
                    ? "bg-amber-400"
                    : pt.status === "red"
                    ? "bg-rose-500"
                    : "bg-slate-600";

                const heightPx = pt.compositeScore
                  ? Math.max(8, Math.round((pt.compositeScore / 15) * 24))
                  : 6;

                return (
                  <div
                    key={pt.date}
                    className="group relative flex flex-col items-center cursor-pointer"
                  >
                    <div
                      style={{ height: `${heightPx}px` }}
                      className={`w-2.5 rounded-sm transition-all group-hover:opacity-80 ${dotColor} ${
                        isToday ? "ring-2 ring-white/40" : ""
                      }`}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-20">
                      <div className="bg-slate-900 border border-slate-700 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-lg">
                        {pt.date.slice(5)}: {pt.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
