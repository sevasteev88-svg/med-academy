"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { AuditLogEntry } from "@/types/database";

interface AuditLogViewerClientProps {
  initialLogs: (AuditLogEntry & {
    user_email?: string;
    user_name?: string;
    player_name?: string;
  })[];
  users: { id: string; name: string; email: string }[];
  players: { id: string; name: string }[];
}

const ACTION_LABELS: Record<string, { label: string; variant: "ok" | "warn" | "danger" | "neutral" | "info" }> = {
  view_player: { label: "👁️ Перегляд картки", variant: "neutral" },
  create_injury: { label: "🩹 Створення травми", variant: "danger" },
  update_injury: { label: "✏️ Зміна травми", variant: "warn" },
  delete_injury: { label: "🗑️ Видалення травми", variant: "danger" },
  add_examination: { label: "🩺 Огляд / Оновлення ВАШ", variant: "ok" },
  save_screening: { label: "📋 Передсезонний скринінг", variant: "info" },
  prescribe_treatment: { label: "💊 Призначення препарату", variant: "info" },
  reset_pin: { label: "🔑 Скидання PIN гравця", variant: "warn" },
  export_pdf: { label: "📥 Експорт PDF", variant: "ok" },
  ai_call: { label: "🤖 Запит до ШІ", variant: "info" },
};

export default function AuditLogViewerClient({
  initialLogs,
  users,
  players,
}: AuditLogViewerClientProps) {
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Фільтрація логів
  const filteredLogs = useMemo(() => {
    return initialLogs.filter((log) => {
      if (selectedUser !== "all" && log.user_id !== selectedUser) {
        return false;
      }
      if (selectedPlayer !== "all" && log.player_id !== selectedPlayer) {
        return false;
      }
      if (selectedAction !== "all" && log.action !== selectedAction) {
        return false;
      }
      if (dateFrom) {
        const logDate = log.at.split("T")[0];
        if (logDate < dateFrom) return false;
      }
      if (dateTo) {
        const logDate = log.at.split("T")[0];
        if (logDate > dateTo) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const userName = (log.user_name || "").toLowerCase();
        const userEmail = (log.user_email || "").toLowerCase();
        const playerName = (log.player_name || "").toLowerCase();
        const action = log.action.toLowerCase();
        const entity = log.entity.toLowerCase();
        if (
          !userName.includes(term) &&
          !userEmail.includes(term) &&
          !playerName.includes(term) &&
          !action.includes(term) &&
          !entity.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [initialLogs, selectedUser, selectedPlayer, selectedAction, dateFrom, dateTo, searchTerm]);

  function resetFilters() {
    setSelectedUser("all");
    setSelectedPlayer("all");
    setSelectedAction("all");
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
  }

  return (
    <div className="space-y-6">
      {/* Панель фільтрів */}
      <Card className="p-4 sm:p-5 border-sky-500/20 bg-slate-900/60 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-sky-500/10 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h2 className="text-sm font-semibold text-white">Фільтри журналу безпеки</h2>
          </div>
          <button
            onClick={resetFilters}
            className="text-xs text-sky-400 hover:text-sky-300 transition-colors self-start md:self-auto cursor-pointer"
          >
            Скинути всі фільтри
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Пошук за текстом */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Пошук</label>
            <input
              type="text"
              placeholder="Користувач, дія..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Фільтр по діях */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Тип дії</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
            >
              <option value="all">Усі дії</option>
              {Object.entries(ACTION_LABELS).map(([action, meta]) => (
                <option key={action} value={action}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          {/* Фільтр по користувачах */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Користувач (штаб)</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
            >
              <option value="all">Усі користувачі</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>

          {/* Фільтр по гравцях */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Футболіст</label>
            <select
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
            >
              <option value="all">Усі гравці</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Діапазон дат */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Від</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">До</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500 flex justify-between items-center">
          <span>Знайдено записів: <strong className="text-sky-400 font-semibold">{filteredLogs.length}</strong> із {initialLogs.length}</span>
          <span className="text-[10px] text-slate-500">🔒 RLS захист: тільки перегляд для admin, без права редагування/видалення</span>
        </div>
      </Card>

      {/* Таблиця записів журналу */}
      <Card className="overflow-hidden border-sky-500/15 bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-sky-500/20 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-3.5">Час (UTC)</th>
                <th className="py-3 px-3.5">Користувач</th>
                <th className="py-3 px-3.5">Дія</th>
                <th className="py-3 px-3.5">Сутність</th>
                <th className="py-3 px-3.5">Гравець</th>
                <th className="py-3 px-3.5">Метадані (безпечні)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-sans text-xs">
                    Записів журналу дій не знайдено за вказаними фільтрами.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const actionMeta = ACTION_LABELS[log.action] || {
                    label: log.action,
                    variant: "neutral",
                  };
                  const dateObj = new Date(log.at);
                  const formattedDate = dateObj.toLocaleDateString("uk-UA", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });
                  const formattedTime = dateObj.toLocaleTimeString("uk-UA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors font-sans">
                      <td className="py-2.5 px-3.5 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                        <div>{formattedDate}</div>
                        <div className="text-[10px] text-slate-500">{formattedTime}</div>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-200">
                        <div className="font-medium text-white">{log.user_name || "Користувач"}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{log.user_email || log.user_id}</div>
                      </td>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <Badge variant={actionMeta.variant as any}>
                          {actionMeta.label}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-400 whitespace-nowrap">
                        <span className="font-mono text-slate-300 font-medium">{log.entity}</span>
                        {log.entity_id && (
                          <span className="block text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                            #{log.entity_id}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-300 whitespace-nowrap">
                        {log.player_id ? (
                          <Link
                            href={`/players/${log.player_id}`}
                            className="text-sky-400 hover:text-sky-300 hover:underline font-medium"
                          >
                            {log.player_name || "Картка гравця →"}
                          </Link>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-400">
                        {log.meta && Object.keys(log.meta).length > 0 ? (
                          <div className="max-w-[280px] bg-slate-950/60 rounded px-2 py-1 font-mono text-[10px] text-slate-400 border border-slate-800/60 truncate">
                            {JSON.stringify(log.meta)}
                          </div>
                        ) : (
                          <span className="text-slate-600 font-mono text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
