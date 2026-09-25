"use client";

import { useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import PrintButton from "@/components/ui/PrintButton";
import TelegramDigestModal from "@/components/reports/TelegramDigestModal";
import {
  POSITION_LABELS,
  TEAM_CATEGORY_UA,
  LOCATION_UA,
  INJURY_TYPE_UA,
  daysSince,
  vasColor,
} from "@/lib/constants";
import { playerStatus, type PlayerStatus } from "@/lib/player-status";

type MaturationAssessment = {
  risk_zone: string | null;
  growth_phase: string | null;
  consensus_offset: number | null;
  created_at: string;
};

type Injury = {
  id: string;
  status: string;
  vas_score: number | null;
  location: string;
  injury_type: string;
  date_of_injury: string;
  expected_return_date: string | null;
  description?: string | null;
  diagnosis?: string | null;
};

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  injuries: Injury[];
  maturation_assessments: MaturationAssessment[];
};

type Team = {
  id: string;
  name: string;
  category: "youth" | "academy";
  sort_order: number;
  players: Player[];
};

type Props = {
  teams: Team[];
};

function growthZone(player: Player): "yellow" | "red" | null {
  const assessments = player.maturation_assessments ?? [];
  if (assessments.length === 0) return null;
  const latest = [...assessments].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  if (latest.risk_zone === "red") return "red";
  if (latest.risk_zone === "yellow") return "yellow";
  return null;
}

export default function AvailabilityClient({ teams }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PlayerStatus>("all");

  const allPlayers = teams.flatMap((t) => t.players ?? []);
  const totalOk = allPlayers.filter((p) => playerStatus(p) === "ok").length;
  const totalWarn = allPlayers.filter((p) => playerStatus(p) === "warn").length;
  const totalDanger = allPlayers.filter((p) => playerStatus(p) === "danger").length;

  // Формування тексту рапорту для Telegram
  const todayStr = new Date().toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const injuredList = allPlayers
    .filter((p) => playerStatus(p) === "danger" || playerStatus(p) === "warn")
    .map((p) => {
      const inj = (p.injuries ?? []).find((i) => i.status === "active" || i.status === "rehabilitation");
      const icon = playerStatus(p) === "danger" ? "🔴" : "🟡";
      const diag = inj ? `${INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type} (${LOCATION_UA[inj.location] ?? inj.location})` : "Травма";
      const vas = inj?.vas_score != null ? `ВАШ ${inj.vas_score}/10` : "";
      return `${icon} *${p.last_name} ${p.first_name}* — ${diag} ${vas}`;
    })
    .join("\n");

  const telegramDigestText = `🏥 *МЕДИЧНИЙ ЗВІТ ФК «ЧОРНОМОРЕЦЬ»*
📅 *${todayStr}*

📊 *Статус доступності складу:*
🟢 Доступні: *${totalOk}*
🟡 Обмежені/реабілітація: *${totalWarn}*
🔴 Травмовані/недоступні: *${totalDanger}*
👥 Всього гравців: *${allPlayers.length}*

${injuredList ? `📋 *Гравці в лазареті / модифіковані:*\n${injuredList}` : "✅ Всі гравці в строю без травм!"}

🔗 _Згенеровано медичною системою ФК Чорноморець_`;

  // Фільтрація команд
  const filteredTeams = teams
    .filter((t) => (selectedTeam === "all" ? true : t.name === selectedTeam))
    .map((t) => {
      let pl = t.players ?? [];
      if (statusFilter !== "all") {
        pl = pl.filter((p) => playerStatus(p) === statusFilter);
      }
      return { ...t, players: pl };
    });

  const youth = filteredTeams.filter((t) => t.category === "youth");
  const academy = filteredTeams.filter((t) => t.category === "academy");

  function renderTeam(team: Team) {
    const sortedPlayers = [...team.players].sort((a, b) =>
      a.last_name.localeCompare(b.last_name, "uk")
    );
    const totalInTeam = (teams.find((t) => t.id === team.id)?.players ?? []).length;
    const okInTeam = (teams.find((t) => t.id === team.id)?.players ?? []).filter(
      (p) => playerStatus(p) === "ok"
    ).length;

    return (
      <div key={team.id} className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_25px_rgba(0,0,0,0.35)] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-sky-500/10">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-black text-white">{team.name}</h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800/80 text-sky-400 border border-sky-500/20 font-mono">
              {okInTeam}/{totalInTeam} доступних
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline uppercase tracking-wider">
            {team.category === "youth" ? "Молодіжний склад" : "Академія клубу"}
          </span>
        </div>

        {sortedPlayers.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">
            Немає гравців за вибраним фільтром статусу
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {sortedPlayers.map((player) => {
              const status = playerStatus(player);
              const zone = growthZone(player);

              const activeInjuries = (player.injuries ?? []).filter(
                (i) => i.status === "active" || i.status === "rehabilitation"
              );
              const primaryInj = activeInjuries[0];

              return (
                <div key={player.id} className="relative group">
                  <Link href={`/players/${player.id}`}>
                    <div
                      className={`relative rounded-2xl p-3 text-center transition-all duration-200 cursor-pointer border backdrop-blur-sm ${
                        status === "ok"
                          ? "bg-emerald-500/[0.05] border-emerald-500/20 hover:border-emerald-500/60 hover:bg-emerald-500/[0.12] hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                          : status === "warn"
                          ? "bg-amber-500/[0.07] border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/[0.15] ring-1 ring-amber-500/20 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                          : "bg-rose-500/[0.07] border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-500/[0.15] ring-1 ring-rose-500/20 hover:shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                      } hover:-translate-y-0.5`}
                    >
                      {zone && (
                        <span
                          title={
                            zone === "red"
                              ? "Зона росту: червона (PHV пік росту)"
                              : "Зона росту: жовта (PHV увага)"
                          }
                          className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                            zone === "red" ? "bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" : "bg-amber-400"
                          }`}
                        />
                      )}
                      <div
                        className={`w-3.5 h-3.5 rounded-full mx-auto mb-2 shadow-sm ${
                          status === "ok"
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                            : status === "warn"
                            ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                            : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse"
                        }`}
                      />
                      <div className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                        {player.last_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {POSITION_LABELS[player.position] ?? player.position}
                      </div>
                    </div>
                  </Link>

                  {/* Спливаюча картка-підказка для тренера (hover) */}
                  <div className="pointer-events-none group-hover:pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl text-left text-xs backdrop-blur-md">
                    <div className="font-bold text-white text-[13px] border-b border-slate-800 pb-1.5 mb-1.5 flex justify-between items-center">
                      <span>{player.last_name} {player.first_name}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {POSITION_LABELS[player.position] ?? player.position}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">Статус:</span>
                        <span
                          className={`font-semibold text-[11px] ${
                            status === "ok"
                              ? "text-status-ok"
                              : status === "warn"
                              ? "text-status-warn"
                              : "text-status-danger"
                          }`}
                        >
                          {status === "ok"
                            ? "Готовий (без обмежень)"
                            : status === "warn"
                            ? "Обмежений (реабілітація)"
                            : "Травмований (недоступний)"}
                        </span>
                      </div>

                      {primaryInj && (
                        <div className="bg-slate-950/70 rounded-lg p-2 border border-slate-800 space-y-1">
                          <div className="text-[11px] text-slate-200 font-medium truncate">
                            {INJURY_TYPE_UA[primaryInj.injury_type] ?? primaryInj.injury_type} ·{" "}
                            {LOCATION_UA[primaryInj.location] ?? primaryInj.location}
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Біль ВАШ:</span>
                            <span className={`font-mono font-bold ${vasColor(primaryInj.vas_score)}`}>
                              {primaryInj.vas_score != null ? `${primaryInj.vas_score}/10` : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Травмі:</span>
                            <span className="text-slate-300 font-mono">
                              {daysSince(primaryInj.date_of_injury)} дн.
                            </span>
                          </div>
                          {primaryInj.expected_return_date && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-500">Очік. повернення:</span>
                              <span className="text-amber-300 font-mono">
                                {new Date(primaryInj.expected_return_date).toLocaleDateString("uk-UA")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {zone && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-1.5 text-[10px] text-yellow-300 leading-tight">
                          ⚠️ <strong>Фаза росту (PHV):</strong> ризик перенавантаження зон росту (апофізити). Рекомендовано коригувати стрибковий обʼєм.
                        </div>
                      )}

                      <div className="pt-1 border-t border-slate-800 flex justify-between items-center text-[10px]">
                        <Link
                          href={`/wellness?playerId=${player.id}`}
                          className="text-brand-blue hover:underline flex items-center gap-1 font-semibold"
                        >
                          ⚡ Внести велнес
                        </Link>
                        <Link
                          href={`/players/${player.id}`}
                          className="text-slate-400 hover:text-white"
                        >
                          Профіль →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Заголовок та кнопка PDF */}
        <header className="pb-4 border-b border-sky-500/15 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Доступність гравців
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ранковий рапорт готовності та статус ротації складу ·{" "}
              {new Date().toLocaleDateString("uk-UA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/wellness"
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>Велнес</span>
            </Link>
            <Link
              href="/workload"
              className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>⏱️</span>
              <span>ACWR</span>
            </Link>
            <PrintButton label="📥 Друк (PDF)" />
            <TelegramDigestModal defaultMessage={telegramDigestText} />
          </div>
        </header>

        {/* Лічильники статусів (з можливістю швидкої фільтрації по кліку) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:grid-cols-3">
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "ok" ? "all" : "ok")}
            className={`text-left transition-all ${
              statusFilter === "ok" ? "ring-2 ring-emerald-500 rounded-2xl" : ""
            }`}
          >
            <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-emerald-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-emerald-500/40 transition-all flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 text-lg font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                  🟢
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-white">
                    {totalOk}
                  </div>
                  <div className="text-[11px] text-emerald-400 uppercase font-bold tracking-wider">
                    Готові до гри
                  </div>
                </div>
              </div>
              {statusFilter === "ok" && (
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  Фільтр
                </span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "warn" ? "all" : "warn")}
            className={`text-left transition-all ${
              statusFilter === "warn" ? "ring-2 ring-amber-500 rounded-2xl" : ""
            }`}
          >
            <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-amber-500/40 transition-all flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 text-lg font-bold shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                  🟡
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-white">
                    {totalWarn}
                  </div>
                  <div className="text-[11px] text-amber-400 uppercase font-bold tracking-wider">
                    Обмежені (RTP)
                  </div>
                </div>
              </div>
              {statusFilter === "warn" && (
                <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  Фільтр
                </span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "danger" ? "all" : "danger")}
            className={`text-left transition-all ${
              statusFilter === "danger" ? "ring-2 ring-rose-500 rounded-2xl" : ""
            }`}
          >
            <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-rose-500/40 transition-all flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 text-lg font-bold shadow-[0_0_12px_rgba(244,63,94,0.2)]">
                  🔴
                </div>
                <div>
                  <div className="text-2xl font-black font-mono text-white">
                    {totalDanger}
                  </div>
                  <div className="text-[11px] text-rose-400 uppercase font-bold tracking-wider">
                    Недоступні (травма)
                  </div>
                </div>
              </div>
              {statusFilter === "danger" && (
                <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                  Фільтр
                </span>
              )}
            </div>
          </button>
        </div>

        {/* Швидкі фільтри по командах */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 print:hidden scrollbar-thin">
          <span className="text-xs text-slate-400 mr-1 flex-shrink-0 font-medium">Команда:</span>
          <button
            type="button"
            onClick={() => setSelectedTeam("all")}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
              selectedTeam === "all"
                ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                : "bg-slate-900/80 border border-sky-500/15 text-slate-300 hover:text-white hover:border-sky-500/30"
            }`}
          >
            Всі команди ({allPlayers.length})
          </button>
          {teams.map((t) => {
            const count = t.players?.length ?? 0;
            const isSelected = selectedTeam === t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTeam(isSelected ? "all" : t.name)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
                  isSelected
                    ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                    : "bg-slate-900/80 border border-sky-500/15 text-slate-300 hover:text-white hover:border-sky-500/30"
                }`}
              >
                {t.name} ({count})
              </button>
            );
          })}

          {(selectedTeam !== "all" || statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSelectedTeam("all");
                setStatusFilter("all");
              }}
              className="text-xs text-sky-400 hover:text-sky-300 ml-2 underline flex-shrink-0 font-medium"
            >
              Скинути всі фільтри
            </button>
          )}
        </div>

        {/* Легенда */}
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" /> Готовий до тренування
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" /> Обмежений (RTP / індивідуально)
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" /> Травмований (лазарет)
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 bg-amber-400" />{" "}
            Кутова мітка — пік росту PHV (корекція стрибків/навантажень)
          </span>
        </div>

        {/* Секції команд */}
        {youth.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span>{TEAM_CATEGORY_UA.youth}</span>
              <div className="flex-1 h-px bg-slate-800" />
            </h2>
            {youth.map(renderTeam)}
          </section>
        )}

        {academy.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span>{TEAM_CATEGORY_UA.academy}</span>
              <div className="flex-1 h-px bg-slate-800" />
            </h2>
            {academy.map(renderTeam)}
          </section>
        )}
      </div>
    </div>
  );
}
