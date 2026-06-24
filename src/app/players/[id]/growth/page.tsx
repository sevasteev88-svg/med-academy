import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import PlayerGrowthChart from "@/components/growth/PlayerGrowthChart";
import { calcDecimalAge } from "@/lib/phv-calculator";

export default async function PlayerGrowthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Дані гравця
  const { data: player, error } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth, sex, position, teams ( name )")
    .eq("id", id)
    .single();

  if (error || !player) notFound();

  // Усі антропометричні виміри
  const { data: anthroRaw } = await supabase
    .from("anthropometry_logs")
    .select("id, date, height, weight, sitting_height")
    .eq("player_id", id)
    .order("date", { ascending: true });

  // Усі оцінки матурації
  const { data: matRaw } = await supabase
    .from("maturation_assessments")
    .select(
      "anthropometry_log_id, consensus_offset, consensus_phv_age, growth_phase, height_velocity, weight_velocity"
    )
    .eq("player_id", id);

  // Мап матурації по anthropometry_log_id
  const matMap = new Map<string, any>();
  for (const m of matRaw ?? []) {
    matMap.set(m.anthropometry_log_id, m);
  }

  // Зводимо дані
  const measurements = (anthroRaw ?? []).map((a: any) => {
    const mat = matMap.get(a.id);
    return {
      date: a.date,
      age: calcDecimalAge(player.date_of_birth, a.date),
      height: a.height,
      weight: a.weight,
      sittingHeight: a.sitting_height,
      consensusOffset: mat?.consensus_offset ?? null,
      growthPhase: mat?.growth_phase ?? null,
      heightVelocity: mat?.height_velocity ?? null,
      weightVelocity: mat?.weight_velocity ?? null,
      estimatedPhvAge: mat?.consensus_phv_age ?? null,
    };
  });

  // Останній PHV age
  const lastMat = (matRaw ?? []).sort(
    (a: any, b: any) =>
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
  )[0];

  const playerName = `${player.last_name} ${player.first_name}`;
  const teamName = (player.teams as any)?.name ?? "";

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={`/players/${id}`}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              ← {playerName}
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">
              Крива росту
            </h1>
            <p className="text-xs text-slate-500">
              {teamName} · {player.position} ·{" "}
              {player.sex === "male" ? "Хлопець" : "Дівчина"}
            </p>
          </div>
          <Link
            href="/growth/new"
            className="bg-brand-blue hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
          >
            📏 Новий вимір
          </Link>
        </div>

        <PlayerGrowthChart
          playerName={playerName}
          sex={player.sex}
          measurements={measurements}
          estimatedPhvAge={lastMat?.consensus_phv_age ?? null}
        />
      </div>
    </div>
  );
}
