import { createClient } from "@/utils/supabase/server";
import InjuryPatternsAI from "@/components/reports/InjuryPatternsAI";
import Link from "next/link";

export default async function InjuryPatternsPage() {
  const supabase = await createClient();

  // 1. ВСІ травми (не тільки активні)
  const { data: injuriesRaw } = await supabase
    .from("injuries")
    .select(
      `id, injury_type, location, side, severity, mechanism, vas_score,
       status, date_of_injury, expected_return_date, actual_return_date,
       players!inner (
         id, first_name, last_name, position, date_of_birth, sex,
         teams!inner ( id, name )
       )`
    )
    .order("date_of_injury", { ascending: false });

  // 2. Дані матурації
  const { data: maturationRaw } = await supabase
    .from("maturation_assessments")
    .select(
      `player_id, consensus_offset, consensus_phv_age, growth_phase,
       risk_zone, height_velocity, age_at_measurement,
       players!inner ( first_name, last_name, teams!inner ( name ) )`
    )
    .order("created_at", { ascending: false });

  // 3. Кількість гравців по командах
  const { data: teamPlayersRaw } = await supabase
    .from("players")
    .select("id, teams!inner ( id, name )");

  // ─── Форматування ────────────────────────────────────────

  const now = Date.now();
  const calcAge = (dob: string) =>
    Math.round(((now - new Date(dob).getTime()) / (365.25 * 86400000)) * 10) / 10;
  const daysBetween = (a: string, b: string) =>
    Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

  // Мап матурації: player_id → останній assessment
  const maturationMap = new Map<string, any>();
  for (const m of maturationRaw ?? []) {
    if (!maturationMap.has(m.player_id)) {
      maturationMap.set(m.player_id, m);
    }
  }

  // Травми з розширеними даними
  const injuries = (injuriesRaw ?? []).map((inj: any) => {
    const playerId = inj.players.id;
    const mat = maturationMap.get(playerId);
    const daysMissed = inj.actual_return_date
      ? daysBetween(inj.date_of_injury, inj.actual_return_date)
      : inj.status === "closed" && inj.expected_return_date
        ? daysBetween(inj.date_of_injury, inj.expected_return_date)
        : null;

    return {
      id: inj.id,
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
      growthPhase: mat?.growth_phase ?? null,
      riskZone: mat?.risk_zone ?? null,
    };
  });

  // Матурація (унікальні гравці)
  const maturation = Array.from(maturationMap.values()).map((m: any) => ({
    firstName: m.players.first_name,
    lastName: m.players.last_name,
    teamName: m.players.teams.name,
    age: m.age_at_measurement?.toFixed(1),
    growthPhase: m.growth_phase,
    consensusOffset: m.consensus_offset,
    riskZone: m.risk_zone,
    heightVelocity: m.height_velocity,
  }));

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

  // Саммарі для UI
  const summary = {
    totalInjuries: injuries.length,
    totalPlayers: teamPlayersRaw?.length ?? 0,
    uniqueInjuredPlayers: playerInjuries.size,
    recurrenceCount: recurrences.length,
    byType: countBy(injuries, "injuryType"),
    byLocation: countBy(injuries, "location"),
    byMechanism: countBy(injuries, "mechanism"),
    bySeverity: countBy(injuries, "severity"),
    byPhase: countBy(injuries.filter((i) => i.growthPhase), "growthPhase"),
  };

  const analysisData = { injuries, maturation, recurrences, teamStats };

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              Аналіз патернів травм
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              AI-аналітика кореляцій та факторів ризику · Claude API
            </p>
          </div>
          <Link
            href="/uk"
            className="text-sm text-slate-500 hover:text-white transition-colors"
          >
            ← Дашборд
          </Link>
        </div>

        <InjuryPatternsAI data={analysisData} summary={summary} />
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
