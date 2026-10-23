import { createClient } from "@/utils/supabase/server";
import InjuryPatternsAI, {
  AggregatedPatternsData,
  PatternsSummary,
} from "@/components/reports/InjuryPatternsAI";
import { calculateExposureMetrics } from "@/lib/exposure-calculator";
import Link from "next/link";

export default async function InjuryPatternsPage() {
  const supabase = await createClient();

  // 1. Запити до бази даних
  const [
    { data: injuriesRaw },
    { data: maturationRaw },
    { data: teamPlayersRaw },
    { data: exposuresRaw },
  ] = await Promise.all([
    supabase
      .from("injuries")
      .select(
        `id, injury_type, location, side, severity, mechanism, vas_score,
         status, date_of_injury, expected_return_date, actual_return_date, activity_type,
         players!inner (
           id, first_name, last_name, position, date_of_birth, sex,
           teams!inner ( id, name )
         )`
      )
      .order("date_of_injury", { ascending: false }),
    supabase
      .from("maturation_assessments")
      .select(
        `player_id, consensus_offset, consensus_phv_age, growth_phase,
         risk_zone, height_velocity, age_at_measurement, created_at,
         players!inner ( first_name, last_name, date_of_birth, teams!inner ( name ) )`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("players")
      .select("id, teams!inner ( id, name )"),
    supabase
      .from("exposures")
      .select("id, team_id, date, type, minutes, players_count"),
  ]);

  // ─── Форматування ────────────────────────────────────────

  const now = Date.now();
  const calcAge = (dob: string) =>
    Math.round(((now - new Date(dob).getTime()) / (365.25 * 86400000)) * 10) / 10;
  const daysBetween = (a: string, b: string) =>
    Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

  // Останній assessment на гравця (для зведеного списку матурації)
  const maturationMap = new Map<string, any>();
  // Усі assessment-и гравця (для темпорального матчингу травма↔фаза)
  const maturationByPlayer = new Map<string, any[]>();
  for (const m of maturationRaw ?? []) {
    if (!maturationMap.has(m.player_id)) {
      maturationMap.set(m.player_id, m); // перший у DESC = найсвіжіший
    }
    if (!maturationByPlayer.has(m.player_id)) maturationByPlayer.set(m.player_id, []);
    maturationByPlayer.get(m.player_id)!.push(m);
  }

  // Оцінка матурації, найближча за датою до дати травми
  function matNearestToInjury(playerId: string, dob: string, injuryDate: string) {
    const list = maturationByPlayer.get(playerId);
    if (!list || list.length === 0) return null;
    const injMs = new Date(injuryDate).getTime();
    const dobMs = new Date(dob).getTime();
    let best = list[0];
    let bestDiff = Infinity;
    for (const m of list) {
      const measMs = dobMs + (m.age_at_measurement ?? 0) * 365.25 * 86400000;
      const diff = Math.abs(measMs - injMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = m;
      }
    }
    return best;
  }

  // Травми з розширеними даними
  const injuries = (injuriesRaw ?? []).map((inj: any) => {
    const playerId = inj.players.id;
    const mat =
      matNearestToInjury(playerId, inj.players.date_of_birth, inj.date_of_injury) ||
      maturationMap.get(playerId);
    const daysMissed = inj.actual_return_date
      ? daysBetween(inj.date_of_injury, inj.actual_return_date)
      : inj.status === "closed" && inj.expected_return_date
        ? daysBetween(inj.date_of_injury, inj.expected_return_date)
        : null;

    return {
      id: inj.id,
      playerId: inj.players.id,
      firstName: inj.players.first_name,
      lastName: inj.players.last_name,
      position: inj.players.position,
      teamName: inj.players.teams.name,
      teamId: inj.players.teams.id,
      age: calcAge(inj.players.date_of_birth),
      injuryType: inj.injury_type,
      location: inj.location,
      side: inj.side,
      severity: inj.severity,
      mechanism: inj.mechanism,
      vasScore: inj.vas_score,
      status: inj.status,
      dateOfInjury: inj.date_of_injury,
      expectedReturn: inj.expected_return_date,
      actualReturn: inj.actual_return_date,
      daysMissed,
      activityType: inj.activity_type ?? "training",
      growthPhase: mat?.growth_phase ?? null,
      riskZone: mat?.risk_zone ?? null,
    };
  });

  // Рецидиви: гравці з >1 травмою
  const playerInjuries = new Map<string, any[]>();
  for (const inj of injuries) {
    const key = `${inj.lastName}_${inj.firstName}`;
    if (!playerInjuries.has(key)) playerInjuries.set(key, []);
    playerInjuries.get(key)!.push(inj);
  }
  const recurrences = Array.from(playerInjuries.entries())
    .filter(([, injs]) => injs.length > 1)
    .map(([, injs]) => ({
      playerId: injs[0].playerId,
      firstName: injs[0].firstName,
      lastName: injs[0].lastName,
      teamName: injs[0].teamName,
      injuryCount: injs.length,
      locations: injs.map((i: any) => i.location).join(", "),
    }));

  // Статистика по командах
  const teamMap = new Map<string, { name: string; injuries: number; players: number }>();
  for (const p of teamPlayersRaw ?? []) {
    const t = (p as any).teams;
    if (!teamMap.has(t.id)) teamMap.set(t.id, { name: t.name, injuries: 0, players: 0 });
    teamMap.get(t.id)!.players++;
  }
  for (const inj of injuries) {
    if (teamMap.has(inj.teamId)) teamMap.get(inj.teamId)!.injuries++;
  }
  const teamStats = Array.from(teamMap.values()).map((t) => ({
    teamName: t.name,
    totalInjuries: t.injuries,
    totalPlayers: t.players,
    injuryRate: t.players > 0 ? (t.injuries / t.players).toFixed(1) : "0",
  }));

  // Розрахунок метрик експозиції та захворюваності (травми на 1000 годин)
  const exposureMetrics = calculateExposureMetrics(
    exposuresRaw ?? [],
    injuries.map((i) => ({
      date_of_injury: i.dateOfInjury,
      team_id: i.teamId,
      activity_type: i.activityType,
    }))
  );

  // Підрахунок відомої/невідомої фази росту
  const maturationKnownCount = injuries.filter((i) => !!i.growthPhase).length;
  const maturationUnknownCount = injuries.length - maturationKnownCount;

  // Саммарі для UI
  const summary: PatternsSummary = {
    totalInjuries: injuries.length,
    totalPlayers: teamPlayersRaw?.length ?? 0,
    uniqueInjuredPlayers: playerInjuries.size,
    recurrenceCount: recurrences.length,
    byType: countBy(injuries, "injuryType"),
    byLocation: countBy(injuries, "location"),
    byMechanism: countBy(injuries, "mechanism"),
    bySeverity: countBy(injuries, "severity"),
    byPhase: countBy(injuries.filter((i) => i.growthPhase), "growthPhase"),
    maturationKnownCount,
    maturationUnknownCount,
    exposureMetrics,
  };

  // Виключно знеособлені агрегати для передачі в ШІ
  const validAges = injuries.map((i) => i.age).filter((a) => !isNaN(a) && a > 0);
  const aggregates: AggregatedPatternsData = {
    sampleSize: injuries.length,
    totalPlayers: teamPlayersRaw?.length ?? 0,
    uniqueInjuredPlayers: playerInjuries.size,
    ageStats: {
      min: validAges.length > 0 ? Math.min(...validAges) : null,
      max: validAges.length > 0 ? Math.max(...validAges) : null,
      avg:
        validAges.length > 0
          ? Math.round((validAges.reduce((s, a) => s + a, 0) / validAges.length) * 10) / 10
          : null,
    },
    byType: summary.byType,
    byLocation: summary.byLocation,
    byMechanism: summary.byMechanism,
    bySeverity: summary.bySeverity,
    maturation: {
      totalInjuries: injuries.length,
      knownCount: maturationKnownCount,
      unknownCount: maturationUnknownCount,
      byPhase: summary.byPhase,
    },
    recurrencesSummary: {
      playersWithRecurrences: recurrences.length,
      distribution: countBy(recurrences, "injuryCount"),
      recurringLocations: recurrences.map((r) => r.locations),
    },
    teamStats,
    exposureMetrics: {
      hasData: false,
      hours1000Rate: null,
      placeholderNote: "Показники на 1000 годин з'являться після задачі 4.2",
    },
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              Аналіз патернів травм
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Описова аналітика та патерни ризику · Агреговані дані для ШІ
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-white transition-colors"
          >
            ← Дашборд
          </Link>
        </div>

        <InjuryPatternsAI aggregates={aggregates} summary={summary} />
      </div>
    </div>
  );
}

// Підрахунок по полю
function countBy(arr: any[], field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const key = item[field] ?? "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}
