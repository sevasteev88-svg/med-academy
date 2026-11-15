"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import {
  groupPlayersByBioBand,
  type BioBandingPlayerInput,
  type BioBandKey,
} from "@/lib/phv-calculator";

type AgeFilter = "all" | "u12" | "12_14" | "14_16" | "16_plus";

const AGE_FILTER_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: "all", label: "Усі віки" },
  { value: "u12", label: "До 12 р." },
  { value: "12_14", label: "12–14 р." },
  { value: "14_16", label: "14–16 р." },
  { value: "16_plus", label: "16+ р." },
];

function matchesAgeFilter(age: number, filter: AgeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "u12") return age < 12;
  if (filter === "12_14") return age >= 12 && age < 14;
  if (filter === "14_16") return age >= 14 && age <= 16;
  return age > 16;
}

const BAND_HEADER_STYLE: Record<BioBandKey, string> = {
  pre_phv: "border-slate-700/70 bg-slate-900/70",
  early_phv: "border-amber-500/30 bg-amber-950/20",
  circa_phv: "border-rose-500/40 bg-rose-950/25",
  post_phv: "border-emerald-500/30 bg-emerald-950/20",
};

export default function BioBandingSection({
  players,
  teams,
  initialTeam,
}: {
  players: BioBandingPlayerInput[];
  teams: string[];
  initialTeam?: string;
}) {
  const [teamFilter, setTeamFilter] = useState<string>(initialTeam || "all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [onlyDiscrepancy, setOnlyDiscrepancy] = useState<boolean>(false);

  const filteredInputs = useMemo(() => {
    return players.filter((p) => {
      if (teamFilter !== "all" && p.teamName !== teamFilter) return false;
      if (!matchesAgeFilter(p.chronologicalAge, ageFilter)) return false;
      return true;
    });
  }, [players, teamFilter, ageFilter]);

  const allGroups = useMemo(
    () => groupPlayersByBioBand(filteredInputs),
    [filteredInputs]
  );

  const displayGroups = useMemo(() => {
    if (!onlyDiscrepancy) return allGroups;
    return allGroups.map((g) => ({
      ...g,
      players: g.players.filter((p) => p.maturationTempo !== "on_time"),
    }));
  }, [allGroups, onlyDiscrepancy]);

  const totalShown = filteredInputs.length;
  const discrepancyCount = allGroups.reduce(
    (sum, g) =>
      sum + g.players.filter((p) => p.maturationTempo !== "on_time").length,
    0
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-sky-500/15 pt-6">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>🧬</span>
            <span>Біо-бандинг (групи дозрівання)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Групування гравців за біологічною зрілістю (Maturity Offset) для дозування навантажень та профілактики апофізитів
          </p>
        </div>

        {/* Фільтр раннього/пізнього дозрівання */}
        <button
          type="button"
          onClick={() => setOnlyDiscrepancy((v) => !v)}
          className={`self-start md:self-auto px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
            onlyDiscrepancy
              ? "bg-amber-500/20 border-amber-400 text-amber-200"
              : "bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          ⚡ Раннє / пізнє дозрівання ({discrepancyCount})
        </button>
      </div>

      {/* Фільтри за командою та віком */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
        {teams.length > 0 && !initialTeam && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
              Команда:
            </span>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">Усі команди</option>
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
            Паспортний вік:
          </span>
          {AGE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAgeFilter(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                ageFilter === opt.value
                  ? "bg-sky-500/25 text-sky-200 border border-sky-400/50"
                  : "bg-slate-950/70 text-slate-400 border border-slate-800 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Розподіл по групах (прогрес-бар) */}
      {totalShown > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Розподіл академії по біо-бандах ({totalShown} гравців з PHV-оцінкою)</span>
          </div>
          <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-950 border border-slate-800">
            {allGroups.map((g) => {
              const pct = Math.round((g.players.length / totalShown) * 100);
              if (pct === 0) return null;
              const barColor: Record<BioBandKey, string> = {
                pre_phv: "bg-slate-500",
                early_phv: "bg-amber-400",
                circa_phv: "bg-rose-500",
                post_phv: "bg-emerald-500",
              };
              return (
                <div
                  key={g.definition.key}
                  style={{ width: `${pct}%` }}
                  className={`${barColor[g.definition.key]} transition-all`}
                  title={`${g.definition.label}: ${g.players.length} (${pct}%)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 4 картки біо-бандів */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayGroups.map((group) => {
          const { definition, players: bandPlayers } = group;
          return (
            <div
              key={definition.key}
              className={`rounded-2xl border p-4 space-y-3 shadow-lg ${BAND_HEADER_STYLE[definition.key]}`}
            >
              {/* Заголовок групи */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={definition.badgeVariant}>
                      {definition.offsetRangeLabel}
                    </Badge>
                    <h3 className="text-sm font-bold text-white">
                      {definition.label}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-300/90 mt-1">
                    {definition.injuryFocus}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono font-bold text-white shrink-0">
                  {bandPlayers.length}
                </span>
              </div>

              {/* Рекомендації тренеру */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  Рекомендації тренеру (навантаження):
                </div>
                <ul className="text-xs text-slate-300 space-y-1">
                  {definition.coachRecommendations.map((rec, idx) => (
                    <li key={idx}>• {rec}</li>
                  ))}
                </ul>
              </div>

              {/* Список гравців */}
              {bandPlayers.length === 0 ? (
                <div className="text-xs text-slate-500 italic py-2">
                  Немає гравців у цій групі за поточним фільтром.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {bandPlayers.map((p) => {
                    const isEarly = p.maturationTempo === "early";
                    const isLate = p.maturationTempo === "late";
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition ${
                          isEarly
                            ? "bg-amber-500/10 border-amber-500/40"
                            : isLate
                            ? "bg-sky-500/10 border-sky-500/40"
                            : "bg-slate-950/50 border-slate-800/80"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/players/${p.id}`}
                              className="font-bold text-white hover:text-sky-400 truncate"
                            >
                              {p.lastName} {p.firstName}
                            </Link>
                            {isEarly && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                                ⚡ Раннє (+{p.ageDiscrepancyYears.toFixed(1)} р.)
                              </span>
                            )}
                            {isLate && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold">
                                ⏳ Пізнє ({p.ageDiscrepancyYears.toFixed(1)} р.)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {p.teamName || "—"} · Паспорт: {p.chronologicalAge.toFixed(1)} р. · Біо:{" "}
                            <span className="text-slate-200 font-semibold">
                              {p.biologicalAge.toFixed(1)} р.
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-slate-200">
                            {p.consensusOffset > 0 ? "+" : ""}
                            {p.consensusOffset.toFixed(2)}
                          </div>
                          <Link
                            href={`/players/${p.id}/growth`}
                            className="text-[10px] text-sky-400 hover:underline"
                          >
                            Графік →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
