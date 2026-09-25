import { createClient } from "@/utils/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import {
  GROWTH_PHASE_LABELS,
  PHASE_TYPICAL_INJURIES,
  METHOD_LABELS,
  RECOMMENDED_AGE_RANGE,
  type GrowthPhase,
  type RiskZone,
  type MethodName,
} from "@/lib/phv-calculator";

// ─── Типи з БД ─────────────────────────────────────────────

type AssessmentRow = {
  age_at_measurement: number;
  consensus_offset: number;
  consensus_phv_age: number;
  mirwald_offset: number | null;
  mirwald_phv_age: number | null;
  moore1_offset: number | null;
  moore1_phv_age: number | null;
  moore2_offset: number | null;
  moore2_phv_age: number | null;
  fransen_phv_age: number | null;
  methods_used: string[];
  growth_phase: GrowthPhase;
  height_velocity: number | null;
  weight_velocity: number | null;
  risk_zone: RiskZone;
  risk_factors: string[];
  created_at: string;
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  position: string;
  teams: { name: string } | null;
  maturation_assessments: AssessmentRow[];
};

// ─── Допоміжні компоненти ───────────────────────────────────

function RiskBadge({ zone }: { zone: RiskZone }) {
  const map: Record<RiskZone, { label: string; variant: "ok" | "warn" | "danger" }> = {
    green: { label: "Зелена", variant: "ok" },
    yellow: { label: "Жовта", variant: "warn" },
    red: { label: "Червона", variant: "danger" },
  };
  const { label, variant } = map[zone];
  return <Badge variant={variant}>{label}</Badge>;
}

function PhaseBadge({ phase }: { phase: GrowthPhase }) {
  const variant: Record<GrowthPhase, "neutral" | "warn" | "ok"> = {
    pre_phv: "neutral",
    phv: "warn",
    post_phv: "ok",
  };
  return <Badge variant={variant[phase]}>{GROWTH_PHASE_LABELS[phase]}</Badge>;
}

function MaturityBar({ offset }: { offset: number }) {
  const clamped = Math.max(-4, Math.min(4, offset));
  const percent = ((clamped + 4) / 8) * 100;
  const phvStart = ((-0.5 + 4) / 8) * 100;
  const phvEnd = ((0.5 + 4) / 8) * 100;

  return (
    <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="absolute top-0 h-full bg-status-warn/20"
        style={{ left: `${phvStart}%`, width: `${phvEnd - phvStart}%` }}
      />
      <div
        className="absolute top-0 h-full w-2.5 rounded-full -translate-x-1/2 transition-all"
        style={{
          left: `${percent}%`,
          backgroundColor:
            offset >= -0.5 && offset <= 0.5
              ? "var(--color-status-warn)"
              : offset < -0.5
                ? "var(--color-gray-400)"
                : "var(--color-status-ok)",
        }}
      />
    </div>
  );
}

/** Блок порівняння методів для одного гравця */
function MethodsComparison({ assessment }: { assessment: AssessmentRow }) {
  const entries: { method: MethodName; offset: number | null; phvAge: number | null }[] = [
    { method: "mirwald", offset: assessment.mirwald_offset, phvAge: assessment.mirwald_phv_age },
    { method: "moore1", offset: assessment.moore1_offset, phvAge: assessment.moore1_phv_age },
    { method: "moore2", offset: assessment.moore2_offset, phvAge: assessment.moore2_phv_age },
  ];

  if (assessment.fransen_phv_age != null) {
    entries.push({
      method: "fransen",
      offset: assessment.age_at_measurement - assessment.fransen_phv_age,
      phvAge: assessment.fransen_phv_age,
    });
  }

  const available = entries.filter((e) => e.offset != null);

  return (
    <div className="grid grid-cols-1 gap-1 text-xs">
      {available.map((e) => (
        <div key={e.method} className="flex justify-between text-gray-400">
          <span>{METHOD_LABELS[e.method]}</span>
          <span className="font-mono text-gray-300">
            offset {e.offset! > 0 ? "+" : ""}
            {e.offset!.toFixed(2)} · PHV {e.phvAge!.toFixed(1)}р.
          </span>
        </div>
      ))}
      <div className="flex justify-between text-gray-200 border-t border-gray-700 pt-1 mt-1 font-medium">
        <span>Консенсус ({available.length} методи)</span>
        <span className="font-mono">
          offset {assessment.consensus_offset > 0 ? "+" : ""}
          {assessment.consensus_offset.toFixed(2)} · PHV{" "}
          {assessment.consensus_phv_age.toFixed(1)}р.
        </span>
      </div>
    </div>
  );
}

// ─── Головний компонент ─────────────────────────────────────

export default async function GrowthDashboard({
  selectedTeam,
}: {
  selectedTeam?: string;
}) {
  const supabase = await createClient();

  const [{ data: players, error }, { data: allTeams }] = await Promise.all([
    supabase
      .from("players")
      .select(
        `
        id, first_name, last_name, date_of_birth, sex, position,
        teams ( id, name ),
        maturation_assessments (
          age_at_measurement, consensus_offset, consensus_phv_age,
          mirwald_offset, mirwald_phv_age,
          moore1_offset, moore1_phv_age,
          moore2_offset, moore2_phv_age,
          fransen_phv_age, methods_used,
          growth_phase, height_velocity, weight_velocity,
          risk_zone, risk_factors, created_at
        )
      `
      )
      .order("created_at", {
        referencedTable: "maturation_assessments",
        ascending: false,
      }),
    supabase.from("teams").select("id, name, sort_order").order("sort_order", { ascending: true }),
  ]);

  if (error) {
    return (
      <div className="min-h-screen bg-background text-gray-100 p-6">
        <p className="text-status-danger">Помилка: {error.message}</p>
      </div>
    );
  }

  const rawPlayers = (players as unknown as PlayerRow[])
    .map((p) => ({
      ...p,
      latest: p.maturation_assessments?.[0] ?? null,
    }))
    .sort((a, b) => {
      const order: Record<string, number> = { red: 0, yellow: 1, green: 2 };
      return (order[a.latest?.risk_zone ?? ""] ?? 3) - (order[b.latest?.risk_zone ?? ""] ?? 3);
    });

  // Фільтрація по команді
  const playersData = selectedTeam
    ? rawPlayers.filter((p) => (p.teams as any)?.name === selectedTeam)
    : rawPlayers;

  const withData = playersData.filter((p) => p.latest);
  const stats = {
    total: playersData.length,
    assessed: withData.length,
    red: withData.filter((p) => p.latest?.risk_zone === "red").length,
    yellow: withData.filter((p) => p.latest?.risk_zone === "yellow").length,
    green: withData.filter((p) => p.latest?.risk_zone === "green").length,
    inPhv: withData.filter((p) => p.latest?.growth_phase === "phv").length,
    noData: playersData.length - withData.length,
  };

  const availableTeams = allTeams ?? [];

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Заголовок */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-sky-500/15 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Моніторинг росту та матурації (PHV)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Мультиметодний підхід: Mirwald (2002) + Moore (2015) · Зважений консенсус піку росту
            </p>
          </div>
          <Link
            href="/growth/new"
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)] text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Новий замір антропометрії</span>
          </Link>
        </header>

        {/* Фільтр команд */}
        {availableTeams.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400 mr-1 font-semibold">Команда:</span>
            <Link
              href="/growth"
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                !selectedTeam
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                  : "bg-slate-900/80 border border-sky-500/15 text-slate-400 hover:border-sky-500/30 hover:text-white"
              }`}
            >
              Всі ({rawPlayers.length})
            </Link>
            {availableTeams.map((t) => {
              const isSelected = selectedTeam === t.name;
              const count = rawPlayers.filter((p) => (p.teams as any)?.name === t.name).length;
              return (
                <Link
                  key={t.id}
                  href={`/growth?team=${encodeURIComponent(t.name)}`}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                      : "bg-slate-900/80 border border-sky-500/15 text-slate-400 hover:border-sky-500/30 hover:text-white"
                  }`}
                >
                  {t.name} {count > 0 && <span className="opacity-70">({count})</span>}
                </Link>
              );
            })}
          </div>
        )}

        {/* Статистика */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Обстежено</div>
            <div className="text-3xl font-black font-mono text-white">{stats.assessed}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase tracking-wider text-rose-400 font-bold mb-1">Червона зона</div>
            <div className="text-3xl font-black font-mono text-rose-400">{stats.red}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">Жовта зона</div>
            <div className="text-3xl font-black font-mono text-amber-400">{stats.yellow}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-emerald-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-1">Зелена зона</div>
            <div className="text-3xl font-black font-mono text-emerald-400">{stats.green}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] col-span-2 md:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">У фазі PHV</div>
            <div className="text-3xl font-black font-mono text-amber-400">{stats.inPhv}</div>
          </div>
        </div>

        {/* PHV-зона */}
        {stats.inPhv > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-status-warn mb-3">
              У фазі PHV — потрібна підвищена увага ({stats.inPhv})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {playersData
                .filter((p) => p.latest?.growth_phase === "phv")
                .map((p) => (
                  <Card key={p.id} className="hover:border-status-warn/40 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <Link
                          href={`/players/${p.id}`}
                          className="font-bold text-white text-lg hover:text-blue-400 transition-colors flex items-center gap-1.5"
                        >
                          {p.last_name} {p.first_name}
                          <span className="text-xs text-blue-500">→</span>
                        </Link>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {(p.teams as any)?.name} · {p.position} ·{" "}
                          {p.latest!.age_at_measurement.toFixed(1)}р.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <RiskBadge zone={p.latest!.risk_zone} />
                        <Link
                          href={`/players/${p.id}/growth`}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline"
                        >
                          Графік
                        </Link>
                      </div>
                    </div>

                    <MaturityBar offset={p.latest!.consensus_offset} />

                    <div className="mt-3">
                      <MethodsComparison assessment={p.latest!} />
                    </div>

                    {p.latest!.risk_factors.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-800">
                        <div className="text-xs text-gray-500 mb-1">Фактори ризику:</div>
                        {p.latest!.risk_factors.map((f: string, i: number) => (
                          <div key={i} className="text-xs text-gray-400">• {f}</div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
            </div>
          </section>
        )}

        {/* Таблиця всіх */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-400">
              Усі гравці {selectedTeam ? `· ${selectedTeam}` : ""} ({stats.total})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-3 px-2 font-medium">Гравець</th>
                  <th className="text-left py-3 px-2 font-medium">Команда</th>
                  <th className="text-center py-3 px-2 font-medium">Вік</th>
                  <th className="text-center py-3 px-2 font-medium">Фаза</th>
                  <th className="text-center py-3 px-2 font-medium">Offset</th>
                  <th className="text-left py-3 px-2 font-medium min-w-[120px]">Шкала</th>
                  <th className="text-center py-3 px-2 font-medium">Δ зріст</th>
                  <th className="text-center py-3 px-2 font-medium">Методи</th>
                  <th className="text-center py-3 px-2 font-medium">Ризик</th>
                  <th className="text-right py-3 px-2 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody>
                {playersData.map((p) => {
                  const a = p.latest;
                  const age = a?.age_at_measurement;
                  const sex = p.sex as "male" | "female";
                  const rec = RECOMMENDED_AGE_RANGE[sex];
                  const outsideRange = age != null && (age < rec.min || age > rec.max);

                  return (
                    <tr
                      key={p.id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <Link
                          href={`/players/${p.id}`}
                          className="font-medium text-white hover:text-blue-400 transition-colors"
                        >
                          {p.last_name} {p.first_name}
                        </Link>
                        <span className="text-gray-600 ml-2 text-xs">{p.position}</span>
                      </td>
                      <td className="py-3 px-2 text-gray-400">
                        {(p.teams as any)?.name ?? "—"}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={outsideRange ? "text-gray-500" : "text-gray-300"}>
                          {a ? a.age_at_measurement.toFixed(1) : "—"}
                        </span>
                        {outsideRange && (
                          <div className="text-[10px] text-gray-600">поза діапазоном</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {a ? <PhaseBadge phase={a.growth_phase} /> : "—"}
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-gray-300">
                        {a
                          ? (a.consensus_offset > 0 ? "+" : "") +
                            a.consensus_offset.toFixed(1)
                          : "—"}
                      </td>
                      <td className="py-3 px-2">
                        {a ? (
                          <MaturityBar offset={a.consensus_offset} />
                        ) : (
                          <span className="text-gray-600 text-xs">Немає даних</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        {a?.height_velocity != null ? (
                          <span
                            className={
                              a.height_velocity > 8
                                ? "text-status-warn"
                                : "text-gray-400"
                            }
                          >
                            {a.height_velocity.toFixed(1)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-2 text-center text-gray-500 text-xs">
                        {a ? a.methods_used.length : "—"}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {a ? <RiskBadge zone={a.risk_zone} /> : "—"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Link
                          href={`/players/${p.id}/growth`}
                          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          Крива росту →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Без даних */}
        {stats.noData > 0 && (
          <Card className="border-dashed">
            <p className="text-gray-500 text-sm">
              <span className="font-medium text-gray-400">{stats.noData} гравців</span>{" "}
              без даних. Мінімум для розрахунку: зріст + вік (Moore-2).
              Для повної оцінки: + вага, зріст сидячи.
            </p>
          </Card>
        )}

        {/* Легенда */}
        <section className="border-t border-gray-800 pt-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">
            Типові патології по фазах матурації
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            {(["pre_phv", "phv", "post_phv"] as GrowthPhase[]).map((phase) => (
              <Card key={phase}>
                <div className="mb-2">
                  <PhaseBadge phase={phase} />
                </div>
                <ul className="text-xs text-gray-400 space-y-1">
                  {PHASE_TYPICAL_INJURIES[phase].map((inj, i) => (
                    <li key={i}>• {inj}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>

        {/* Примітки щодо обмежень */}
        <Card className="border-dashed">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Обмеження методів
          </h3>
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              • Усі методи найточніші для середньо дозріваючих гравців ±1 рік від PHV.
              Для рано та пізно дозріваючих похибка більша (до 9-10 міс.).
            </p>
            <p>
              • Рекомендований вік: хлопці 12-16р., дівчата 10-14р.
              Поза цим діапазоном точність знижується.
            </p>
            <p>
              • Формули розроблені на вибірках європейського походження.
              Для інших етнічних груп можлива додаткова похибка.
            </p>
            <p>
              • Консенсусний offset — зважене середнє всіх доступних методів (вага = 1/SEE).
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
