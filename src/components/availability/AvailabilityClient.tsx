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
  diagnosis: string | null;
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
      <div key={team.id} className="bg-surface/60 border border-blue-900/15 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 border-b border-blue-900/10 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">{team.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
              {okInTeam}/{totalInTeam} доступних
            </span>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {team.category === "youth" ? "Молодіжка" : "Академія"}
          </span>
        </div>

        {sortedPlayers.length === 0 ? (
          <div className="text-xs text-slate-500 py-3 text-center">
            Немає гравців за вибраним фільтром статусу
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
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
                      className={`relative rounded-xl p-2.5 text-center transition-all cursor-pointer border ${
                        status === "ok"
                          ? "bg-status-ok/[0.06] border-status-ok/20 hover:border-status-ok/50 hover:bg-status-ok/[0.12]"
                          : status === "warn"
                          ? "bg-status-warn/[0.08] border-status-warn/30 hover:border-status-warn/60 hover:bg-status-warn/[0.15] ring-1 ring-status-warn/20"
                          : "bg-status-danger/[0.08] border-status-danger/30 hover:border-status-danger/60 hover:bg-status-danger/[0.15] ring-1 ring-status-danger/20"
                      }`}
                    >
                      {zone && (
                        <span
                          title={
                            zone === "red"
                              ? "Зона росту: червона (PHV пік росту)"
                              : "Зона росту: жовта (PHV увага)"
                          }
                          className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                            zone === "red" ? "bg-status-danger animate-pulse" : "bg-status-warn"
                          }`}
                        />
                      )}
                      <div
                        className={`w-3.5 h-3.5 rounded-full mx-auto mb-1.5 shadow-sm ${
                          status === "ok"
                            ? "bg-status-ok shadow-status-ok/40"
                            : status === "warn"
                            ? "bg-status-warn shadow-status-warn/40"
                            : "bg-status-danger shadow-status-danger/40"
                        }`}
                      />
                      <div className="text-[12px] font-bold text-white truncate">
                        {player.last_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
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
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Заголовок та кнопка PDF */}
        <header className="pb-4 border-b border-blue-900/15 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Доступність гравців
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Ранковий рапорт готовності складу ·{" "}
              {new Date().toLocaleDateString("uk-UA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/wellness"
              className="px-3.5 py-2 rounded-lg bg-surface border border-brand-blue/40 text-brand-blue hover:bg-brand-blue hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>Велнес</span>
            </Link>
            <Link
              href="/workload"
              className="px-3.5 py-2 rounded-lg bg-surface border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <span>⏱️</span>
              <span>Навантаження (ACWR)</span>
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
              statusFilter === "ok" ? "ring-2 ring-status-ok rounded-xl" : ""
            }`}
          >
            <Card accent="ok">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-status-ok shadow-sm shadow-status-ok/50" />
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-status-ok">
                      {totalOk}
                    </div>
                    <div className="text-[11px] text-slate-400 uppercase font-medium">
                      Готових до гри
                    </div>
                  </div>
                </div>
                {statusFilter === "ok" && (
                  <span className="text-[10px] text-status-ok font-semibold bg-status-ok/10 px-2 py-0.5 rounded">
                    Активно
                  </span>
                )}
              </div>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "warn" ? "all" : "warn")}
            className={`text-left transition-all ${
              statusFilter === "warn" ? "ring-2 ring-status-warn rounded-xl" : ""
            }`}
          >
            <Card accent="warn">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-status-warn shadow-sm shadow-status-warn/50" />
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-status-warn">
                      {totalWarn}
                    </div>
                    <div className="text-[11px] text-slate-400 uppercase font-medium">
                      Обмежених (реабілітація)
                    </div>
                  </div>
                </div>
                {statusFilter === "warn" && (
                  <span className="text-[10px] text-status-warn font-semibold bg-status-warn/10 px-2 py-0.5 rounded">
                    Активно
                  </span>
                )}
              </div>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "danger" ? "all" : "danger")}
            className={`text-left transition-all ${
              statusFilter === "danger" ? "ring-2 ring-status-danger rounded-xl" : ""
            }`}
          >
            <Card accent="danger">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-status-danger shadow-sm shadow-status-danger/50" />
                  <div>
                    <div className="text-2xl font-extrabold font-mono text-status-danger">
                      {totalDanger}
                    </div>
                    <div className="text-[11px] text-slate-400 uppercase font-medium">
                      Травмованих (недоступні)
                    </div>
                  </div>
                </div>
                {statusFilter === "danger" && (
                  <span className="text-[10px] text-status-danger font-semibold bg-status-danger/10 px-2 py-0.5 rounded">
                    Активно
                  </span>
                )}
              </div>
            </Card>
          </button>
        </div>

        {/* Швидкі фільтри по командах */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 print:hidden">
          <span className="text-xs text-slate-500 mr-1.5 flex-shrink-0">Команда:</span>
          <button
            type="button"
            onClick={() => setSelectedTeam("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
              selectedTeam === "all"
                ? "bg-brand-blue text-white"
                : "bg-surface border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                  isSelected
                    ? "bg-brand-blue text-white"
                    : "bg-surface border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
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
              className="text-xs text-slate-500 hover:text-slate-300 ml-2 underline flex-shrink-0"
            >
              Скинути всі фільтри
            </button>
          )}
        </div>

        {/* Легенда */}
        <div className="flex gap-4 text-xs text-slate-400 flex-wrap bg-surface/40 p-3 rounded-lg border border-slate-800/80">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-ok" /> Готовий до тренування
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-warn" /> Обмежений (індивідуальний план)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-status-danger" /> Травмований (медпункт)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full ring-1 ring-slate-600 bg-status-warn" />{" "}
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
