import { createClient } from "@/utils/supabase/server";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
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

export default async function GrowthDashboard() {
  const supabase = await createClient();

  const { data: players, error } = await supabase
    .from("players")
    .select(
      `
      id, first_name, last_name, date_of_birth, sex, position,
      teams ( name ),
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
    });

  if (error) {
    return (
      <div className="min-h-screen bg-background text-gray-100 p-6">
        <p className="text-status-danger">Помилка: {error.message}</p>
      </div>
    );
  }

  const playersData = (players as unknown as PlayerRow[])
    .map((p) => ({
      ...p,
      latest: p.maturation_assessments?.[0] ?? null,
    }))
    .sort((a, b) => {
      const order: Record<string, number> = { red: 0, yellow: 1, green: 2 };
      return (order[a.latest?.risk_zone ?? ""] ?? 3) - (order[b.latest?.risk_zone ?? ""] ?? 3);
    });

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

  return (
    <div className="min-h-screen bg-background text-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Заголовок */}
        <div className="border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-white">
            Моніторинг росту та матурації
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Мультиметодний підхід: Mirwald (2002) + Moore (2015) · Зважений консенсус
          </p>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <div className="text-3xl font-bold text-white">{stats.assessed}</div>
            <div className="text-sm text-gray-500">Обстежено</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-status-danger">{stats.red}</div>
            <div className="text-sm text-gray-500">Червона</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-status-warn">{stats.yellow}</div>
            <div className="text-sm text-gray-500">Жовта</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-status-ok">{stats.green}</div>
            <div className="text-sm text-gray-500">Зелена</div>
          </Card>
          <Card>
            <div className="text-3xl font-bold text-status-warn">{stats.inPhv}</div>
            <div className="text-sm text-gray-500">У фазі PHV</div>
          </Card>
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
                        <div className="font-bold text-white text-lg">
                          {p.last_name} {p.first_name.charAt(0)}.
                        </div>
                        <div className="text-sm text-gray-500">
                          {(p.teams as any)?.name} · {p.position} ·{" "}
                          {p.latest!.age_at_measurement.toFixed(1)}р.
                        </div>
                      </div>
                      <RiskBadge zone={p.latest!.risk_zone} />
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
          <h2 className="text-lg font-semibold text-gray-400 mb-3">
            Усі гравці ({stats.total})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-3 px-2 font-medium">Гравець</th>
                  <th className="text-left py-3 px-2 font-medium">Команда</th>
                  <th className="text-center py-3 px-2 font-medium">Вік</th>
                  <th className="text-center py-3 px-2 font-medium">Фаза</th>
                  <th className="text-center py-3 px-2 font-medium">Offset</th>
                  <th className="px-2 font-medium min-w-[140px]">Матурація</th>
                  <th className="text-center py-3 px-2 font-medium">Δ зріст</th>
                  <th className="text-center py-3 px-2 font-medium">Методи</th>
                  <th className="text-center py-3 px-2 font-medium">Ризик</th>
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
                        <span className="font-medium text-white">
                          {p.last_name} {p.first_name.charAt(0)}.
                        </span>
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
