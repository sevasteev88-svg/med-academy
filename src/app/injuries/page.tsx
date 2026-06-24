// src/app/injuries/page.tsx
// Список усіх травм — згруповано: активні / реабілітація / архів

import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { LOCATION_UA, INJURY_TYPE_UA, SEVERITY_UA } from "@/lib/constants";
import ArchiveSection from "./ArchiveSection";

// ── Утиліти ──────────────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function vasColor(vas: number | null): string {
  if (vas == null) return "text-slate-500";
  if (vas >= 7) return "text-red-400";
  if (vas >= 4) return "text-amber-400";
  return "text-green-400";
}

function initials(p: any): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

function fullNameShort(p: any): string {
  if (!p) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

// ── Картка травми ─────────────────────────────────────────────────────────────
function InjuryRow({ inj, zone }: { inj: any; zone: "red" | "amber" | "slate" }) {
  const p = inj.players;
  const avCls = {
    red:   "bg-red-500/14 text-red-400",
    amber: "bg-amber-500/14 text-amber-400",
    slate: "bg-slate-700/40 text-slate-400",
  }[zone];

  // Класифікаційний бейдж (якщо є)
  const codes: string[] = [];
  if (inj.munich_type) codes.push(`Munich ${inj.munich_type}`);
  if (inj.bamic_code) codes.push(`BAMIC ${inj.bamic_code}`);
  if (inj.mlgr_code) codes.push(`MLG-R ${inj.mlgr_code}`);

  return (
    <Link
      href={`/injuries/${inj.id}`}
      className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 flex items-center gap-2.5 hover:border-blue-500/40 transition-colors group"
    >
      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-medium ${avCls}`}>
        {initials(p)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-slate-200 truncate">
            {fullNameShort(p)}
          </span>
          <span className="text-[9px] text-slate-600">{p?.teams?.name ?? "—"}</span>
        </div>
        <div className="text-[10px] text-slate-600 truncate">
          {INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type} ·{" "}
          {LOCATION_UA[inj.location] ?? inj.location}
          {inj.status !== "closed" && <> · {daysSince(inj.date_of_injury)} дн.</>}
        </div>
        {codes.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {codes.map((c, idx) => (
              <span
                key={idx}
                className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
      {inj.status === "closed" ? (
        <span className="text-[10px] text-slate-600 flex-shrink-0">
          {inj.days_missed != null ? `${inj.days_missed} дн.` : "закрита"}
        </span>
      ) : (
        <span className={`text-[12px] font-medium flex-shrink-0 ${vasColor(inj.vas_score)}`}>
          {inj.vas_score != null ? `${inj.vas_score}/10` : "—"}
        </span>
      )}
    </Link>
  );
}

function ZoneLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
      <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-blue-900/15" />
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
      players ( first_name, last_name, teams ( name ) )
    `)
    .order("date_of_injury", { ascending: false });

  // Тимчасова діагностика — показуємо помилку запиту прямо на сторінці
  if (error) {
    return (
      <div className="min-h-screen bg-[#07090F] text-red-400 p-8">
        <h1 className="text-lg font-bold mb-4">Помилка запиту травм:</h1>
        <pre className="text-xs bg-slate-900 p-4 rounded-lg overflow-auto whitespace-pre-wrap">
          {JSON.stringify(error, null, 2)}
        </pre>
      </div>
    );
  }

  const active = (injuries ?? []).filter((i) => i.status === "active");
  const rehab  = (injuries ?? []).filter((i) => i.status === "rehabilitation");
  const closed = (injuries ?? []).filter((i) => i.status === "closed");

  return (
    <div
      className="relative min-h-screen"
      style={{
        background:
          "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
      }}
    >
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />
      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center justify-between py-3 border-b border-blue-900/15 mb-4">
          <div>
            <div className="text-[15px] font-medium text-slate-200">Травми</div>
            <div className="text-[10px] text-slate-600">
              Активних: {active.length} · Реабілітація: {rehab.length} · Архів: {closed.length}
            </div>
          </div>
          <Link
            href="/injuries/new"
            className="text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors"
          >
            + Фіксувати
          </Link>
        </div>

        {/* Активні */}
        {active.length > 0 && (
          <section className="mb-4">
            <ZoneLabel color="bg-red-500">Активні травми</ZoneLabel>
            <div className="flex flex-col gap-1.5">
              {active.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="red" />
              ))}
            </div>
          </section>
        )}

        {/* Реабілітація */}
        {rehab.length > 0 && (
          <section className="mb-4">
            <ZoneLabel color="bg-amber-500">Реабілітація</ZoneLabel>
            <div className="flex flex-col gap-1.5">
              {rehab.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="amber" />
              ))}
            </div>
          </section>
        )}

        {/* Архів (згорнутий) */}
        {closed.length > 0 && (
          <ArchiveSection count={closed.length}>
            <div className="flex flex-col gap-1.5">
              {closed.map((inj) => (
                <InjuryRow key={inj.id} inj={inj} zone="slate" />
              ))}
            </div>
          </ArchiveSection>
        )}

        {/* Порожньо */}
        {(injuries ?? []).length === 0 && (
          <div className="text-center py-16 text-slate-600 text-sm">
            Травм ще немає 🟢
          </div>
        )}
      </div>
    </div>
  );
}
