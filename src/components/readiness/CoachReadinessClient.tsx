"use client";

import React, { useState, useTransition } from "react";
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
import type { TeamComplianceStats } from "@/types/wellness";
import { acknowledgeReadinessAction } from "@/actions/readiness-actions";
import { DoctorPlayerReadinessModal } from "./DoctorPlayerReadinessModal";

interface Props {
  initialPlayers: PlayerReadinessResult[];
  teams: { id: string; name: string }[];
  currentTeamId: string;
  currentDate: string;
  userRole: "coach" | "doctor" | "admin";
  config: ClubReadinessConfig;
  teamCompliance?: TeamComplianceStats;
}

export default function CoachReadinessClient({
  initialPlayers,
  teams,
  currentTeamId,
  currentDate,
  userRole,
  config,
  teamCompliance,
}: Props) {
  const [players, setPlayers] = useState<PlayerReadinessResult[]>(initialPlayers);
  const [selectedTeamId, setSelectedTeamId] = useState(currentTeamId);
  const [filterStatus, setFilterStatus] = useState<"all" | "attention" | "green" | "gray">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [selectedDoctorPlayer, setSelectedDoctorPlayer] = useState<PlayerReadinessResult | null>(null);
  const [selectedDoctorDate, setSelectedDoctorDate] = useState<string | undefined>(undefined);
  const [ackToast, setAckToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isDoctorOrAdmin = userRole === "doctor" || userRole === "admin";

  // Навігація по датах
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const isToday = currentDate === todayStr;
  const isFuture = currentDate > todayStr;

  const changeDate = (newDate: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", newDate);
    window.location.href = url.toString();
  };

  const handlePrevDay = () => {
    const parts = currentDate.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() - 1);
    const prevStr = d.toISOString().split("T")[0];
    changeDate(prevStr);
  };

  const handleNextDay = () => {
    const parts = currentDate.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + 1);
    const nextStr = d.toISOString().split("T")[0];
    changeDate(nextStr);
  };

  const handleAcknowledge = (playerId: string, date: string) => {
    setPendingPlayerId(playerId);
    startTransition(async () => {
      const res = await acknowledgeReadinessAction({ playerId, date });
      if (res.success) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.playerId === playerId
              ? {
                  ...p,
                  isAcknowledged: true,
                  reviewedByRole: res.reviewedByRole || (userRole as any),
                  reviewedAt: res.reviewedAt || new Date().toISOString(),
                }
              : p
          )
        );
        setSelectedDoctorPlayer((prev) =>
          prev && prev.playerId === playerId
            ? {
                ...prev,
                isAcknowledged: true,
                reviewedByRole: res.reviewedByRole || (userRole as any),
                reviewedAt: res.reviewedAt || new Date().toISOString(),
              }
            : prev
        );
        setAckToast("✓ Анкету взято до уваги! Футболіст бачить відмітку у додатку.");
        setTimeout(() => setAckToast(null), 4000);
      } else {
        alert(res.error || "Помилка при збереженні відмітки перегляду");
      }
      setPendingPlayerId(null);
    });
  };

  // Фільтрація списку гравців
  const filteredPlayers = players.filter((p) => {
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
  const totalCount = players.length;
  const greenCount = players.filter((p) => p.status === "green").length;
  const yellowCount = players.filter((p) => p.status === "yellow").length;
  const redCount = players.filter((p) => p.status === "red").length;
  const grayCount = players.filter((p) => p.status === "gray").length;

  const attentionCount = yellowCount + redCount;

  return (
    <div className="space-y-6">
      {/* 1. ОБОВ'ЯЗКОВИЙ ДИСКЛЕЙМЕР ТА ПОСИЛАННЯ НА ПАМ'ЯТКУ ДЛЯ ТРЕНЕРА */}
      <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-r from-sky-950/40 via-blue-950/30 to-slate-900/40 p-4 sm:p-5 backdrop-blur-md shadow-[0_0_25px_rgba(14,165,233,0.1)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
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
              Кольори відображають відхилення від особистої норми гравця, а не команди. Жодних автоматичних відсторонень — система лише підказує теми для бесіди перед заняттям.
            </p>
          </div>
        </div>

        <Link
          href="/how-to-use"
          className="self-start md:self-center px-4 py-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
        >
          <span>📖</span>
          <span>Пам&apos;ятка «Як користуватись» →</span>
        </Link>
      </div>

      {/* 8.5 КОМАНДНА СТАТИСТИКА ЗАПОВНЕННЯ (COMPLIANCE RATE) */}
      {teamCompliance && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">
                Регулярність команди (7 днів)
              </div>
              <div className="text-lg font-black text-white flex items-center gap-1.5">
                <span>{teamCompliance.rate7Days}%</span>
                <span className="text-[10px] text-slate-400 font-normal">заповнення</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4">
            <span className="text-2xl">🗓️</span>
            <div>
              <div className="text-[11px] text-slate-400 font-medium">
                Регулярність команди (28 днів)
              </div>
              <div className="text-lg font-black text-white flex items-center gap-1.5">
                <span>{teamCompliance.rate28Days}%</span>
                <span className="text-[10px] text-slate-400 font-normal">заповнення</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4">
            <span className="text-2xl">🛡️</span>
            <div className="text-[11px] text-slate-400 leading-snug">
              Тренер бачить відсоток заповнення для контролю дисципліни без розкриття чутливих відповідей.
            </div>
          </div>
        </div>
      )}

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

          {/* Дата моніторингу та навігація по днях */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shadow-sm">
            <button
              type="button"
              onClick={handlePrevDay}
              title="Попередній день"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer text-xs font-bold"
            >
              ◀
            </button>

            <div className="flex items-center gap-1.5 px-2">
              <span className="text-xs">📅</span>
              <input
                type="date"
                value={currentDate}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) changeDate(e.target.value);
                }}
                className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={handleNextDay}
              disabled={isToday || isFuture}
              title="Наступний день"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/60 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 hover:text-white transition-colors cursor-pointer text-xs font-bold"
            >
              ▶
            </button>

            {!isToday && (
              <button
                type="button"
                onClick={() => changeDate(todayStr)}
                className="ml-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                Сьогодні
              </button>
            )}
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

      {/* ПОВІДОМЛЕННЯ ПРО ВДАЛЕ ПІДТВЕРДЖЕННЯ */}
      {ackToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center justify-between gap-3 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{ackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setAckToast(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* РЕЖИМ ПЕРЕГЛЯДУ ІСТОРІЇ (ЯКЩО ДАТА НЕ СЬОГОДНІ) */}
      {!isToday && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🗓️</span>
            <div>
              <strong className="text-amber-100 font-bold block text-sm">
                Режим перегляду історії: анкетування за {currentDate}
              </strong>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Ви переглядаєте заповнені анкети, скарги на біль, ВАШ та показники датчиків за минулий день.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => changeDate(todayStr)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-bold transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto shadow-sm"
          >
            Повернутися до сьогодні →
          </button>
        </div>
      )}

      {/* 4. СПИСОК ГРАВЦІВ (СВІТЛОФОР) */}
      <div className="space-y-3">
        {filteredPlayers.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 text-sm">
            Гравців за обраним фільтром не знайдено.
          </div>
        ) : (
          filteredPlayers.map((player) => (
            <PlayerReadinessCard
              key={player.playerId}
              player={player}
              userRole={userRole}
              onAcknowledge={handleAcknowledge}
              isPendingAck={pendingPlayerId === player.playerId}
              onOpenDoctorModal={(p, d) => {
                setSelectedDoctorPlayer(p);
                setSelectedDoctorDate(d);
              }}
              onSelectDate={changeDate}
              selectedDate={currentDate}
            />
          ))
        )}
      </div>

      {/* 8.8 МОДАЛЬНЕ ВІКНО МЕДИЧНИХ ДЕТАЛЕЙ ТА ГОДИННИКА (ТІЛЬКИ ДЛЯ ЛІКАРЯ ТА АДМІНА) */}
      {selectedDoctorPlayer && isDoctorOrAdmin && (
        <DoctorPlayerReadinessModal
          player={selectedDoctorPlayer}
          initialDate={selectedDoctorDate}
          onClose={() => {
            setSelectedDoctorPlayer(null);
            setSelectedDoctorDate(undefined);
          }}
          onAcknowledge={handleAcknowledge}
          isPendingAck={pendingPlayerId === selectedDoctorPlayer.playerId}
        />
      )}
    </div>
  );
}

/**
 * Окрема картка готовності гравця
 */
function PlayerReadinessCard({
  player,
  userRole,
  onAcknowledge,
  isPendingAck,
  onOpenDoctorModal,
  onSelectDate,
  selectedDate,
}: {
  player: PlayerReadinessResult;
  userRole: "coach" | "doctor" | "admin";
  onAcknowledge: (playerId: string, date: string) => void;
  isPendingAck: boolean;
  onOpenDoctorModal?: (player: PlayerReadinessResult, initialDate?: string) => void;
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
}) {
  const isDoctorOrAdmin = userRole === "doctor" || userRole === "admin";

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

              {/* 8.5 Дисципліна заповнення гравця (7 та 28 днів) - видно тренеру */}
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/60 font-mono">
                7д: {player.compliance7Days}% · 28д: {player.compliance28Days}%
              </span>

              {/* 8.5 Серія заповнень поспіль */}
              {player.currentStreakDays > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1">
                  <span>🔥</span>
                  <span>{player.currentStreakDays} дн. поспіль</span>
                </span>
              )}

              {/* 8.5 ДЕТЕКЦІЯ МОНОТОННОСТІ (ВИДНО ТІЛЬКИ ЛІКАРЮ ТА АДМІНУ!) */}
              {isDoctorOrAdmin && player.hasMonotony && (
                <span
                  title="Гравець відповідає однаково кілька днів поспіль. Рекомендовано делікатно запитати на огляді."
                  className="text-[11px] px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/40 text-purple-300 font-medium flex items-center gap-1 cursor-help"
                >
                  <span>⚠️</span>
                  <span>Повторювані відповіді ({player.monotonyDays} дн.)</span>
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

        {/* Прапорці фізичного стану, тренд та кнопка «Взято до уваги» */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:justify-end">
          {/* Категорії фізичних прапорців */}
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

          {/* 7-денний міні-графік тренду (клікабельний для перегляду дня) */}
          <div className="flex items-center gap-2 bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-500 font-medium mr-1">
              7 днів:
            </span>
            <div className="flex items-end gap-1.5 h-6">
              {player.trendLast7Days.map((pt, idx) => {
                const isSelected = selectedDate ? pt.date === selectedDate : idx === player.trendLast7Days.length - 1;
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
                  <button
                    key={pt.date}
                    type="button"
                    onClick={() => {
                      if (isDoctorOrAdmin && onOpenDoctorModal) {
                        onOpenDoctorModal(player, pt.date);
                      }
                    }}
                    className="group relative flex flex-col items-center cursor-pointer p-0.5 rounded focus:outline-none"
                    title={`Переглянути анкету за ${pt.date}: ${pt.label} (без перезавантаження сторінки)`}
                  >
                    <div
                      style={{ height: `${heightPx}px` }}
                      className={`w-2.5 rounded-sm transition-all group-hover:scale-125 ${dotColor} ${
                        isSelected ? "ring-2 ring-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" : "opacity-80 group-hover:opacity-100"
                      }`}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                      <div className="bg-slate-900 border border-slate-700 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow-lg">
                        {pt.date.slice(5)}: {pt.label} (клік для перегляду)
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8.8 КНОПКА «АНКЕТА ТА ГОДИННИК» ТІЛЬКИ ДЛЯ ЛІКАРЯ ТА АДМІНА */}
          {isDoctorOrAdmin && onOpenDoctorModal && (
            <button
              type="button"
              onClick={() => onOpenDoctorModal(player, currentDate)}
              className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700/80 shadow-sm whitespace-nowrap"
            >
              <span>🩺</span>
              <span>Анкета та годинник</span>
              {player.doctorDetails?.wearables && (
                <span className="w-2 h-2 rounded-full bg-sky-400 inline-block ml-0.5" />
              )}
            </button>
          )}

          {/* 8.5 КНОПКА «ВЗЯТО ДО УВАГИ» ТА ЗВОРОТНИЙ ЗВ'ЯЗОК */}
          {player.status !== "gray" && (
            <div className="flex items-center">
              {player.isAcknowledged ? (
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-sm">
                  <span>✓</span>
                  <span>
                    Взято до уваги ({player.reviewedByRole === "doctor" ? "лікар" : "тренер"})
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isPendingAck}
                  onClick={() => onAcknowledge(player.playerId, player.date)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-600/20 active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>👁️</span>
                  <span>{isPendingAck ? "Збереження..." : "Взято до уваги"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
