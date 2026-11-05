"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X, Users, UserCheck, AlertTriangle, ShieldAlert, ArrowRight } from "lucide-react";

export type PlayerSelectionItem = {
  id: string;
  first_name: string;
  last_name: string;
  position?: string | null;
  date_of_birth?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  active_injuries_count: number;
  latest_injury_date?: string | null;
  latest_injury_type?: string | null;
};

export type TeamOption = {
  id: string;
  name: string;
  sort_order?: number;
};

interface Props {
  players: PlayerSelectionItem[];
  teams: TeamOption[];
  isIllness?: boolean;
  userRole?: string;
  initialTeamId?: string;
  extraParams?: Record<string, string>;
}

export default function PlayerSelectionGrid({
  players,
  teams,
  isIllness = false,
  userRole = "doctor",
  initialTeamId,
  extraParams = {},
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "injured">("all");

  const isCoach = userRole === "coach";

  // Побудова списку команд з реальними кількостями гравців
  const teamTabs = useMemo(() => {
    const list: { id: string; name: string; count: number }[] = [
      { id: "all", name: "Всі команди", count: players.length },
    ];

    // Додаємо відомі команди з таблиці teams або з прив'язок гравців
    const teamMap = new Map<string, { name: string; count: number }>();
    teams.forEach((t) => {
      teamMap.set(t.id, { name: t.name, count: 0 });
    });

    players.forEach((p) => {
      if (p.team_id && teamMap.has(p.team_id)) {
        teamMap.get(p.team_id)!.count += 1;
      } else if (p.team_id) {
        teamMap.set(p.team_id, { name: p.team_name || "Команда", count: 1 });
      }
    });

    teamMap.forEach((val, id) => {
      list.push({ id, name: val.name, count: val.count });
    });

    return list;
  }, [players, teams]);

  // Фільтрація списку гравців
  const filteredPlayers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return players.filter((p) => {
      // 1. Фільтр за командою
      if (selectedTeamId !== "all" && p.team_id !== selectedTeamId) {
        return false;
      }

      // 2. Фільтр за статусом (в строю чи в лазареті)
      if (statusFilter === "active" && p.active_injuries_count > 0) {
        return false;
      }
      if (statusFilter === "injured" && p.active_injuries_count === 0) {
        return false;
      }

      // 3. Текстовий пошук за прізвищем, ім'ям або амплуа
      if (query) {
        const fullName = `${p.last_name} ${p.first_name}`.toLowerCase();
        const reverseName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const pos = (p.position || "").toLowerCase();
        const team = (p.team_name || "").toLowerCase();

        return (
          fullName.includes(query) ||
          reverseName.includes(query) ||
          pos.includes(query) ||
          team.includes(query)
        );
      }

      return true;
    });
  }, [players, selectedTeamId, statusFilter, searchQuery]);

  // Підрахунок для статус-фільтрів
  const totalInjured = useMemo(
    () => players.filter((p) => p.active_injuries_count > 0).length,
    [players]
  );
  const totalHealthy = players.length - totalInjured;

  // Формування URL параметрів для переходу
  const buildPlayerUrl = (playerId: string) => {
    const params = new URLSearchParams();
    params.set("playerId", playerId);
    if (isIllness) params.set("isIllness", "true");
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `/injuries/new?${params.toString()}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Верхній блок заголовка */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              ← Головна
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-xs text-sky-400 font-medium">Медичний штаб</span>
          </div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <span>{isIllness ? "🤒" : "⚡"}</span>
            <span>{isIllness ? "Оформлення лікарняного / захворювання" : "Фіксація травми"}</span>
          </h1>
          <p className="text-xs text-gray-400">
            Оберіть футболіста зі списку для відкриття протоколу первинного огляду
          </p>
        </div>

        {/* Підказка ролі */}
        <div className="flex items-center gap-2">
          {isCoach ? (
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <span className="text-sm">⏱️</span>
              <div>
                <span className="font-bold block text-white">Режим тренера</span>
                <span className="text-[11px] text-amber-300/80">Швидка фіксація на виїзді / тренуванні</span>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
              <span className="text-sm">🩺</span>
              <div>
                <span className="font-bold block text-white">Медичний протокол</span>
                <span className="text-[11px] text-sky-300/80">Стандарти UEFA та класифікація OSIICS</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Панель фільтрів: Пошук та команди */}
      <div className="space-y-3.5 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-lg">
        {/* Рядок 1: Живий пошук та фільтр статусу здоров'я */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Пошук */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Швидкий пошук за прізвищем, ім'ям або амплуа..."
              className="w-full bg-slate-950/80 border border-slate-700/70 focus:border-sky-500 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Статус-фільтри (Всі / В строю / У лазареті) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-xl text-xs shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                statusFilter === "all"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Всі ({players.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                statusFilter === "active"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-gray-400 hover:text-emerald-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              В строю ({totalHealthy})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("injured")}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                statusFilter === "injured"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "text-gray-400 hover:text-rose-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              У лазареті ({totalInjured})
            </button>
          </div>
        </div>

        {/* Рядок 2: Вкладки команд (Pill tabs) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin scrollbar-thumb-slate-700">
          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Команда:
          </span>
          {teamTabs.map((tab) => {
            const isSelected = selectedTeamId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTeamId(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 ring-2 ring-sky-400/30"
                    : "bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-800/50"
                }`}
              >
                <span>{tab.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-white/25 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Лічильник знайдених гравців */}
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <div>
          Відображено: <span className="text-white font-bold">{filteredPlayers.length}</span> з {players.length} футболістів
        </div>
        {(searchQuery || selectedTeamId !== "all" || statusFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedTeamId("all");
              setStatusFilter("all");
            }}
            className="text-sky-400 hover:text-sky-300 underline font-medium"
          >
            Скинути всі фільтри
          </button>
        )}
      </div>

      {/* Адаптивна сітка карток футболістів */}
      {filteredPlayers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
          <div className="text-3xl">🔍</div>
          <h3 className="text-base font-bold text-white">Футболістів не знайдено</h3>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            За вказаними критеріями пошуку або обраною командою немає гравців. Спробуйте змінити фільтри або запит.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedTeamId("all");
              setStatusFilter("all");
            }}
            className="mt-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition"
          >
            Показати всіх гравців
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
          {filteredPlayers.map((player) => {
            const hasActiveInjury = player.active_injuries_count > 0;
            const initials = `${player.last_name?.[0] || ""}${player.first_name?.[0] || ""}`.toUpperCase();

            return (
              <Link
                key={player.id}
                href={buildPlayerUrl(player.id)}
                className={`group relative flex flex-col justify-between p-4 rounded-2xl border transition-all duration-200 text-left ${
                  hasActiveInjury
                    ? "bg-slate-900/80 border-rose-500/25 hover:border-rose-400 hover:bg-slate-900 shadow-sm hover:shadow-rose-500/10"
                    : "bg-slate-900/60 border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-800/60 shadow-sm hover:shadow-sky-500/10"
                } active:scale-[0.98]`}
              >
                <div>
                  {/* Верхня плашка: Ініціали, Амплуа та Команда */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border ${
                        hasActiveInjury
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                          : "bg-sky-500/15 border-sky-500/30 text-sky-300"
                      }`}
                    >
                      {initials}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {player.team_name && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {player.team_name}
                        </span>
                      )}
                      {player.position && (
                        <span className="text-[10px] font-extrabold text-sky-400 font-mono">
                          {player.position}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ПІБ гравця */}
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-white text-sm group-hover:text-sky-300 transition-colors leading-snug">
                      {player.last_name}
                    </h3>
                    <p className="text-xs text-gray-400">{player.first_name}</p>
                  </div>
                </div>

                {/* Нижня плашка: Медичний статус та стрілка вибору */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  {hasActiveInjury ? (
                    <div className="flex items-center gap-1.5 text-rose-300 font-medium text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
                      <span>У лазареті ({player.active_injuries_count})</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-emerald-300 font-medium text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>В строю</span>
                    </div>
                  )}

                  <span className="text-gray-500 group-hover:text-sky-300 group-hover:translate-x-1 transition-all">
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
