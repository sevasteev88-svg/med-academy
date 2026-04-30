import { createClient } from "@/utils/supabase/server";
import InjuryAIAssistant from "@/components/injuries/InjuryAIAssistant";
import { calcDecimalAge } from "@/lib/phv-calculator";

/**
 * Серверний компонент-обгортка.
 * Завантажує профіль гравця, матурацію, попередні травми
 * і передає в клієнтський InjuryAIAssistant.
 *
 * Використання: <InjuryAISection injuryId="..." />
 * Додати на сторінку /injuries/[id]/page.tsx
 */

export default async function InjuryAISection({
  injuryId,
}: {
  injuryId: string;
}) {
  const supabase = await createClient();

  // 1. Поточна травма + гравець
  const { data: injury, error } = await supabase
    .from("injuries")
    .select(
      `id, injury_type, location, side, severity, mechanism, vas_score, description,
       date_of_injury, status,
       players!inner (
         id, first_name, last_name, date_of_birth, sex, position,
         teams!inner ( name )
       )`
    )
    .eq("id", injuryId)
    .single();

  if (error || !injury) return null;

  const player = (injury as any).players;
  const age = calcDecimalAge(player.date_of_birth, new Date().toISOString().split("T")[0]);

  // 2. Матурація гравця (остання)
  const { data: matRaw } = await supabase
    .from("maturation_assessments")
    .select(
      "consensus_offset, consensus_phv_age, growth_phase, risk_zone, height_velocity"
    )
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const maturation =
    matRaw && matRaw.length > 0
      ? {
          growthPhase: matRaw[0].growth_phase,
          consensusOffset: matRaw[0].consensus_offset,
          estimatedPhvAge: matRaw[0].consensus_phv_age,
          riskZone: matRaw[0].risk_zone,
          heightVelocity: matRaw[0].height_velocity,
        }
      : null;

  // 3. Попередні травми цього гравця (крім поточної)
  const { data: prevRaw } = await supabase
    .from("injuries")
    .select("injury_type, location, side, severity, date_of_injury, days_missed, status")
    .eq("player_id", player.id)
    .neq("id", injuryId)
    .order("date_of_injury", { ascending: false });

  const previousInjuries = (prevRaw ?? []).map((i: any) => ({
    injuryType: i.injury_type,
    location: i.location,
    side: i.side,
    severity: i.severity,
    dateOfInjury: i.date_of_injury,
    daysMissed: i.days_missed,
    status: i.status,
  }));

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
        🤖 AI-асистент
      </h2>
      <InjuryAIAssistant
        playerName={`${player.last_name} ${player.first_name}`}
        age={age}
        sex={player.sex}
        position={player.position}
        teamName={player.teams.name}
        injury={{
          injuryType: injury.injury_type,
          location: injury.location,
          side: injury.side,
          severity: injury.severity,
          mechanism: injury.mechanism,
          vasScore: injury.vas_score,
          description: injury.description,
        }}
        maturation={maturation}
        previousInjuries={previousInjuries}
      />
    </section>
  );
}
