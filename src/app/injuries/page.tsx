// src/app/injuries/page.tsx
// Список усіх травм — згруповано: активні / реабілітація / архів

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import {
  LOCATION_UA,
  INJURY_TYPE_UA,
  SEVERITY_UA,
  daysSince,
  vasColor,
  initials,
  fullNameShort,
} from "@/lib/constants";
import ArchiveSection from "./ArchiveSection";

// ── Картка травми ─────────────────────────────────────────────────────────────
function InjuryRow({ inj, zone }: { inj: any; zone: "red" | "amber" | "slate" }) {
  const p = inj.players;
  const avCls = {
    red:   "from-rose-500/20 to-red-600/30 text-rose-300 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
    amber: "from-amber-500/20 to-yellow-600/30 text-amber-300 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
    slate: "from-slate-700/40 to-slate-800/40 text-slate-400 border-slate-700/50",
  }[zone];

  // Класифікаційний бейдж (якщо є)
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
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50 flex-shrink-0">
            {p?.teams?.name ?? "—"}
          </span>
        </div>
        <div className="text-xs text-slate-400 truncate mt-0.5">
          <span className="text-slate-200 font-medium">{INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type}</span> ·{" "}
          <span>{LOCATION_UA[inj.location] ?? inj.location}</span>
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
      id, injury_type, location, status, vas_score,
      date_of_injury, days_missed,
      munich_type, bamic_code, mlgr_code,
      players ( first_name, last_name, position, teams ( name ) )
    `)
    .order("date_of_injury", { ascending: false });

  // Тимчасова діагностика — показуємо помилку запиту прямо на сторінці
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

  const active = (injuries ?? []).filter((i) => i.status === "active");
  const rehab  = (injuries ?? []).filter((i) => i.status === "rehabilitation");
  const closed = (injuries ?? []).filter((i) => i.status === "closed");

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
                {active.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Потребують гострого лікування</div>
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
                {rehab.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Фазове відновлення на полі</div>
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
                {closed.length}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Успішне повернення до гри</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 text-lg font-bold shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              🟢
            </div>
          </div>
        </div>

        {/* Активні */}
        {active.length > 0 && (
          <section className="space-y-3">
            <ZoneLabel color="bg-rose-500">
              <span className="text-rose-400 font-bold">Гостра фаза / Лазарет ({active.length})</span>
            </ZoneLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {active.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="red" />
              ))}
            </div>
          </section>
        )}

        {/* Реабілітація */}
        {rehab.length > 0 && (
          <section className="space-y-3">
            <ZoneLabel color="bg-amber-500">
              <span className="text-amber-400 font-bold">Етап реабілітації / Модифіковані ({rehab.length})</span>
            </ZoneLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rehab.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="amber" />
              ))}
            </div>
          </section>
        )}

        {/* Архів (згорнутий) */}
        {closed.length > 0 && (
          <ArchiveSection count={closed.length}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {closed.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="slate" />
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
