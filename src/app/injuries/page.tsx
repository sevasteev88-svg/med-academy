// src/app/injuries/page.tsx
// Список усіх травм — згруповано за гравцями: активні / реабілітація / архів
// Якщо у гравця кілька травм, вони відображаються в одній спільній картці, не дублюючи людей.

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import {
  formatLocation,
  formatInjuryType,
  formatPosition,
  daysSince,
  vasColor,
  initials,
  fullNameShort,
} from "@/lib/constants";
import ArchiveSection from "./ArchiveSection";

type PlayerInjuryGroup = {
  playerId: string;
  player: any;
  injuries: any[];
  maxVas: number | null;
};

function groupInjuriesByPlayer(injuries: any[]): PlayerInjuryGroup[] {
  const map = new Map<string, PlayerInjuryGroup>();

  for (const inj of injuries) {
    const p = inj.players;
    const pid = inj.player_id || p?.id || `${p?.last_name}_${p?.first_name}`;
    let group = map.get(pid);
    if (!group) {
      group = {
        playerId: pid,
        player: p,
        injuries: [],
        maxVas: inj.vas_score,
      };
      map.set(pid, group);
    }
    group.injuries.push(inj);
    if (inj.vas_score != null) {
      group.maxVas = Math.max(group.maxVas ?? 0, inj.vas_score);
    }
  }

  return Array.from(map.values());
}

// ── Картка гравця з однією або кількома травмами ──────────────────────────────
function PlayerInjuryCard({ group, zone }: { group: PlayerInjuryGroup; zone: "red" | "amber" | "slate" }) {
  const p = group.player;
  const isMulti = group.injuries.length > 1;

  const avCls = {
    red:   "from-rose-500/20 to-red-600/30 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
    amber: "from-amber-500/20 to-yellow-600/30 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
    slate: "from-slate-700/40 to-slate-800/40 text-slate-400 border-slate-700/50",
  }[zone];

  // Якщо у гравця одна травма — відображаємо швидку компактну картку
  if (!isMulti) {
    const inj = group.injuries[0];
    const codes: string[] = [];
    if (inj.munich_type) codes.push(`Munich ${inj.munich_type}`);
    if (inj.bamic_code) codes.push(`BAMIC ${inj.bamic_code}`);
    if (inj.mlgr_code) codes.push(`MLG-R ${inj.mlgr_code}`);

    return (
      <Link
        href={`/injuries/${inj.id}`}
        className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 hover:border-sky-500/40 hover:bg-slate-900/80 transition-all duration-200 flex items-center gap-3.5 group shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_25px_rgba(14,165,233,0.12)] hover:-translate-y-0.5"
      >
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br border flex-shrink-0 flex items-center justify-center text-xs font-black tracking-wider ${avCls}`}>
          {initials(p)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors truncate">
              {fullNameShort(p)}
            </span>
            {p?.position && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20 font-semibold">
                {formatPosition(p.position)}
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50 flex-shrink-0">
              {p?.teams?.name ?? "—"}
            </span>
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            <span className="text-slate-200 font-medium">{formatInjuryType(inj.injury_type)}</span> ·{" "}
            <span>{formatLocation(inj.location)}</span>
            {inj.status !== "closed" && (
              <span className="text-sky-400/80 font-mono ml-1">· {daysSince(inj.date_of_injury)} дн.</span>
            )}
          </div>
          {codes.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {codes.map((c, idx) => (
                <span
                  key={idx}
                  className="text-[9px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/25 font-mono"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {inj.status === "closed" ? (
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex-shrink-0">
            {inj.days_missed != null ? `${inj.days_missed} дн.` : "закрита"}
          </span>
        ) : (
          <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/50 flex-shrink-0 ${vasColor(inj.vas_score)}`}>
            {inj.vas_score != null ? `ВАШ ${inj.vas_score}/10` : "—"}
          </span>
        )}
      </Link>
    );
  }

  // Якщо у гравця кілька травм — групуємо їх в єдину розширену картку гравця
  return (
    <div className="p-4 rounded-2xl bg-slate-900/70 backdrop-blur-md border border-rose-500/30 hover:border-rose-500/50 transition-all duration-200 shadow-[0_4px_25px_rgba(0,0,0,0.35)] space-y-3">
      {/* Шапка гравця */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br border flex-shrink-0 flex items-center justify-center text-xs font-black tracking-wider ${avCls}`}>
            {initials(p)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white truncate">
                {fullNameShort(p)}
              </span>
              {p?.position && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20 font-semibold">
                  {formatPosition(p.position)}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50 flex-shrink-0">
                {p?.teams?.name ?? "—"}
              </span>
            </div>
            <div className="text-[11px] text-rose-400 font-semibold mt-0.5 flex items-center gap-1.5">
              <span>⚠️ Кілька травм:</span>
              <span className="font-mono text-white bg-rose-500/20 px-1.5 py-0.2 rounded border border-rose-500/30">
                {group.injuries.length} травми
              </span>
            </div>
          </div>
        </div>

        {group.maxVas != null && (
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] uppercase font-mono text-slate-400">макс. біль</span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/50 ${vasColor(group.maxVas)}`}>
              ВАШ {group.maxVas}/10
            </span>
          </div>
        )}
      </div>

      {/* Список травм гравця */}
      <div className="space-y-2">
        {group.injuries.map((inj, idx) => {
          const codes: string[] = [];
          if (inj.munich_type) codes.push(`Munich ${inj.munich_type}`);
          if (inj.bamic_code) codes.push(`BAMIC ${inj.bamic_code}`);
          if (inj.mlgr_code) codes.push(`MLG-R ${inj.mlgr_code}`);

          return (
            <Link
              key={inj.id}
              href={`/injuries/${inj.id}`}
              className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-900/90 transition-all flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-400">#{idx + 1}</span>
                  <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                    {formatInjuryType(inj.injury_type)} — {formatLocation(inj.location)}
                  </span>
                  {inj.status !== "closed" && (
                    <span className="text-[11px] text-sky-400/80 font-mono">
                      · {daysSince(inj.date_of_injury)} дн.
                    </span>
                  )}
                </div>

                {codes.length > 0 && (
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {codes.map((c, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {inj.status === "closed" ? (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    закрита
                  </span>
                ) : (
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/50 ${vasColor(inj.vas_score)}`}>
                    {inj.vas_score != null ? `ВАШ ${inj.vas_score}` : "—"}
                  </span>
                )}
                <span className="text-xs text-slate-500 group-hover:text-sky-300 transition-colors">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ZoneLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color} shadow-[0_0_8px_currentColor]`} />
      <div className="text-xs uppercase tracking-widest whitespace-nowrap">
        {children}
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-sky-500/20 to-transparent" />
    </div>
  );
}

// ── Сторінка ──────────────────────────────────────────────────────────────────
export default async function InjuriesListPage() {
  const supabase = await createClient();

  const { data: injuries, error } = await supabase
    .from("injuries")
    .select(`
      id, player_id, injury_type, location, status, vas_score,
      date_of_injury, days_missed,
      munich_type, bamic_code, mlgr_code,
      players ( id, first_name, last_name, position, teams ( name ) )
    `)
    .order("date_of_injury", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-[#070A13] text-rose-400 p-8">
        <h1 className="text-lg font-bold mb-4">Помилка запиту травм:</h1>
        <pre className="text-xs bg-slate-900/80 p-4 rounded-xl border border-rose-500/20 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(error, null, 2)}
        </pre>
      </div>
    );
  }

  const activeRaw = (injuries ?? []).filter((i) => i.status === "active");
  const rehabRaw  = (injuries ?? []).filter((i) => i.status === "rehabilitation");
  const closedRaw = (injuries ?? []).filter((i) => i.status === "closed");

  // Групуємо за гравцями
  const activeGroups = groupInjuriesByPlayer(activeRaw);
  const rehabGroups  = groupInjuriesByPlayer(rehabRaw);
  const closedGroups = groupInjuriesByPlayer(closedRaw);

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Topbar / Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-sky-500/15">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Журнал травм та реабілітації
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Клінічний моніторинг травматизму · ФК «Чорноморець» Одеса
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/injuries/new"
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Фіксувати травму</span>
            </Link>
          </div>
        </header>

        {/* Статистичні плашки (KPI) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                Активні травми
              </div>
              <div className="text-2xl font-black font-mono text-white mt-0.5">
                {activeRaw.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {activeGroups.length} {activeGroups.length === 1 ? "гравець" : "гравців"} у лазареті
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 text-lg font-bold shadow-[0_0_12px_rgba(244,63,94,0.2)]">
              🔴
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                Реабілітація (RTP)
              </div>
              <div className="text-2xl font-black font-mono text-white mt-0.5">
                {rehabRaw.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {rehabGroups.length} {rehabGroups.length === 1 ? "гравець" : "гравців"} на відновленні
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 text-lg font-bold shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              🟡
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-emerald-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.35)] flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                Архів / Закриті
              </div>
              <div className="text-2xl font-black font-mono text-white mt-0.5">
                {closedRaw.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Успішне повернення до гри</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 text-lg font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              🟢
            </div>
          </div>
        </div>

        {/* Активні травми (згруповані за гравцями) */}
        {activeGroups.length > 0 && (
          <section className="space-y-3">
            <ZoneLabel color="bg-rose-500">
              <span className="text-rose-400 font-bold">
                Гостра фаза / Лазарет ({activeRaw.length} {activeRaw.length === 1 ? "травма" : "травм"} · {activeGroups.length} {activeGroups.length === 1 ? "футболіст" : "футболістів"})
              </span>
            </ZoneLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeGroups.map((group) => (
                <PlayerInjuryCard key={group.playerId} group={group} zone="red" />
              ))}
            </div>
          </section>
        )}

        {/* Реабілітація (згруповані за гравцями) */}
        {rehabGroups.length > 0 && (
          <section className="space-y-3">
            <ZoneLabel color="bg-amber-500">
              <span className="text-amber-400 font-bold">
                Етап реабілітації / Модифіковані ({rehabRaw.length} {rehabRaw.length === 1 ? "травма" : "травм"} · {rehabGroups.length} {rehabGroups.length === 1 ? "футболіст" : "футболістів"})
              </span>
            </ZoneLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rehabGroups.map((group) => (
                <PlayerInjuryCard key={group.playerId} group={group} zone="amber" />
              ))}
            </div>
          </section>
        )}

        {/* Архів (згорнутий) */}
        {closedGroups.length > 0 && (
          <ArchiveSection count={closedRaw.length}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {closedGroups.map((group) => (
                <PlayerInjuryCard key={group.playerId} group={group} zone="slate" />
              ))}
            </div>
          </ArchiveSection>
        )}

        {/* Порожньо */}
        {(injuries ?? []).length === 0 && (
          <div className="p-12 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 text-center text-slate-400 text-sm">
            <div className="text-3xl mb-2">🟢</div>
            Травмованих гравців немає — весь склад готовий до тренувань!
          </div>
        )}
      </div>
    </div>
  );
}
