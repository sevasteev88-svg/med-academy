/**
 * InjuriesAnalytics.tsx
 * Аналітика травм команди: статистика по локалізації,
 * механізму, класифікації та загальний стан доступності.
 *
 * Серверний компонент — завантажує дані напряму з Supabase.
 *
 * Використання в сторінці:
 *   import InjuriesAnalytics from "@/components/injuries/InjuriesAnalytics";
 *   <InjuriesAnalytics teamId="uuid" />
 */

import { createClient } from "@/utils/supabase/server";
import type { Injury, RtpPrediction } from "@/types/database";
import RtpBadge from "@/components/ui/RtpBadge";

type Props = {
  teamId?: string;
};

// ─── Допоміжні функції ─────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-gray-800 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] ?? "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

const LOCATION_UA: Record<string, string> = {
  knee: "Коліно", ankle: "Гомілковий", shoulder: "Плече",
  hip: "Стегно (суглоб)", thigh: "Стегно (м'яз)", calf: "Литка",
  foot: "Стопа", groin: "Пах", back: "Спина",
  neck: "Шия", wrist: "Зап'ясток", head: "Голова", other: "Інше",
};
const MECHANISM_UA: Record<string, string> = {
  contact: "Контактна", non_contact: "Неконтактна", overuse: "Перевантаження",
};
const STATUS_UA: Record<string, string> = {
  active: "Активна", rehabilitation: "Реабілітація", closed: "Закрита",
};

// ─── Компонент ─────────────────────────────────────────────────
export default async function InjuriesAnalytics({ teamId }: Props) {
  const supabase = await createClient();

  // Завантажуємо травми з гравцями
  let query = supabase
    .from("injuries")
    .select(`
      *,
      players (
        id, first_name, last_name, team_id,
        teams ( name )
      )
    `)
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  if (teamId) {
    query = query.eq("players.team_id", teamId);
  }

  const { data: injuries, error } = await query;

  if (error) {
    return (
      <div className="bg-status-danger/10 border border-status-danger/30 rounded-xl p-4 text-status-danger text-sm">
        Помилка завантаження травм: {error.message}
      </div>
    );
  }

  const all = (injuries ?? []) as any[];
  const active = all.filter(i => i.status === "active");
  const rehab = all.filter(i => i.status === "rehabilitation");
  const tJunction = all.filter(
    i => i.bamic_location === "c" && (i.bamic_grade ?? 0) >= 2
  );
  const classified = all.filter(i => i.classification_system !== "none");

  // Топ локалізацій (активні + реабілітація)
  const locationCounts = countBy(all, "location");
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Механізм травм
  const mechanismCounts = countBy(all, "mechanism");

  // Середній RTP для класифікованих
  const rtpValues = classified
    .map(i => i.rtp_prediction as RtpPrediction | null)
    .filter(Boolean)
    .map(r => r!.max_days);
  const avgRtp =
    rtpValues.length > 0
      ? Math.round(rtpValues.reduce((a, b) => a + b, 0) / rtpValues.length)
      : null;

  return (
    <div className="space-y-6">

      {/* ── Зведена статистика ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Активні травми"
          value={active.length}
          sub="потребують уваги"
          color="text-status-danger"
        />
        <StatCard
          label="Реабілітація"
          value={rehab.length}
          sub="у процесі відновлення"
          color="text-status-warn"
        />
        <StatCard
          label="T-junction ⚠️"
          value={tJunction.length}
          sub="подвоєний термін RTP"
          color={tJunction.length > 0 ? "text-status-danger" : "text-status-ok"}
        />
        <StatCard
          label="Сер. RTP (класиф.)"
          value={avgRtp !== null ? `${avgRtp} дн.` : "—"}
          sub={`класифіковано ${classified.length} з ${all.length}`}
        />
      </div>

      {/* ── Список активних травм із RTP ── */}
      {active.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Активні травми
          </h3>
          <div className="space-y-2">
            {active.map((injury: any) => {
              const player = injury.players;
              const fullName = player
                ? `${player.last_name} ${player.first_name[0]}.`
                : "—";
              const team = player?.teams?.name ?? "";
              const loc = LOCATION_UA[injury.location] ?? injury.location;
              const rtp = injury.rtp_prediction as RtpPrediction | null;

              return (
                <div
                  key={injury.id}
                  className="bg-surface rounded-xl border border-gray-800 hover:border-gray-600 transition-colors p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{fullName}</span>
                      {team && (
                        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">
                          {team}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 mt-0.5 flex items-center gap-2">
                      <span>{loc}</span>
                      {injury.classification_system !== "none" && (
                        <span className="text-xs text-gray-600">
                          {injury.classification_system === "bamic"
                            ? `BAMIC ${injury.bamic_grade}${injury.bamic_location ?? ""}`
                            : `Munich ${injury.munich_grade}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <RtpBadge prediction={rtp} showNotes={false} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Топ локалізацій ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Топ локалізацій
          </h3>
          <div className="bg-surface rounded-xl border border-gray-800 p-4 space-y-3">
            {topLocations.length === 0 && (
              <p className="text-sm text-gray-600">Даних немає</p>
            )}
            {topLocations.map(([loc, count]) => {
              const pct = Math.round((count / all.length) * 100);
              return (
                <div key={loc}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{LOCATION_UA[loc] ?? loc}</span>
                    <span className="text-gray-500">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Механізм травм ── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Механізм травм
          </h3>
          <div className="bg-surface rounded-xl border border-gray-800 p-4 space-y-3">
            {Object.entries(mechanismCounts).map(([mech, count]) => {
              const pct = Math.round((count / all.length) * 100);
              const color =
                mech === "contact"
                  ? "bg-status-danger"
                  : mech === "non_contact"
                  ? "bg-status-warn"
                  : "bg-brand-blue";
              return (
                <div key={mech}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">
                      {MECHANISM_UA[mech] ?? mech}
                    </span>
                    <span className="text-gray-500">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(mechanismCounts).length === 0 && (
              <p className="text-sm text-gray-600">Даних немає</p>
            )}
          </div>
        </section>
      </div>

      {/* ── T-junction попередження ── */}
      {tJunction.length > 0 && (
        <section>
          <div className="bg-status-danger/10 border border-status-danger/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold text-status-danger text-sm">
                  T-junction травми потребують особливої уваги ({tJunction.length})
                </p>
                <p className="text-xs text-status-danger/80 mt-1">
                  Пошкодження інтрам'язового сухожилля (BAMIC суфікс c, ступінь ≥2).
                  Термін реабілітації подвоєно. Обов'язкові МРТ-контроль та
                  обережне поступове повернення до навантажень.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {tJunction.map((i: any) => {
                    const p = i.players;
                    return p ? (
                      <span
                        key={i.id}
                        className="text-xs bg-status-danger/20 text-status-danger border border-status-danger/30 px-2 py-0.5 rounded-md"
                      >
                        {p.last_name} {p.first_name[0]}. — BAMIC {i.bamic_grade}c
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
