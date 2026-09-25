import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  calcDecimalAge,
  calcHeightVelocity,
  calcWeightVelocity,
} from "@/lib/phv-calculator";

const PlayerGrowthChart = dynamic(
  () => import("@/components/growth/PlayerGrowthChart"),
  {
    loading: () => (
      <div className="w-full bg-surface border border-blue-900/20 rounded-xl p-8 flex flex-col items-center justify-center min-h-[360px] animate-pulse">
        <div className="w-8 h-8 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Завантаження графіку динаміки росту...</span>
      </div>
    ),
  }
);

export default async function PlayerGrowthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [playerRes, anthroRes, matRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, sex, position, teams ( name )")
      .eq("id", id)
      .single(),
    supabase
      .from("anthropometry_logs")
      .select("id, date, height, weight, sitting_height")
      .eq("player_id", id)
      .order("date", { ascending: true }),
    supabase
      .from("maturation_assessments")
      .select(
        "anthropometry_log_id, consensus_offset, consensus_phv_age, growth_phase, height_velocity, weight_velocity"
      )
      .eq("player_id", id),
  ]);

  const { data: player, error } = playerRes;
  if (error || !player) notFound();

  const anthroRaw = anthroRes.data;
  const matRaw = matRes.data;

  // Мап матурації по anthropometry_log_id
  const matMap = new Map<string, any>();
  for (const m of matRaw ?? []) {
    matMap.set(m.anthropometry_log_id, m);
  }

  // Сортуємо виміри за датою
  const sortedAnthro = (anthroRaw ?? []).sort(
    (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Зводимо дані
  const measurements = sortedAnthro.map((a: any, index: number) => {
    const mat = matMap.get(a.id);
    const prev = index > 0 ? sortedAnthro[index - 1] : null;

    // Рахуємо актуальні значення velocity динамічно за поточними правилами
    let heightVelocity: number | null = null;
    let weightVelocity: number | null = null;

    if (prev) {
      heightVelocity = calcHeightVelocity(prev.height, prev.date, a.height, a.date);
      weightVelocity = calcWeightVelocity(prev.weight, prev.date, a.weight, a.date);
    }

    return {
      date: a.date,
      age: calcDecimalAge(player.date_of_birth, a.date),
      height: a.height,
      weight: a.weight,
      sittingHeight: a.sitting_height,
      consensusOffset: mat?.consensus_offset ?? null,
      growthPhase: mat?.growth_phase ?? null,
      heightVelocity,
      weightVelocity,
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
            href={`/growth/new?playerId=${id}`}
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
