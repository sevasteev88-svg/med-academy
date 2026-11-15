import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditPlayerForm from "@/components/players/EditPlayerForm";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !player) return notFound();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, category")
    .order("sort_order", { ascending: true });

  const { data: anamnesisRows } = await supabase
    .from("player_anamnesis")
    .select("*")
    .eq("player_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestAnamnesisRow = anamnesisRows?.[0] as any;
  const initialAnamnesis = latestAnamnesisRow
    ? {
        ...((latestAnamnesisRow.data as Record<string, any>) || {}),
        player_id: latestAnamnesisRow.player_id,
        jersey_number: latestAnamnesisRow.jersey_number ?? latestAnamnesisRow.data?.jersey_number ?? null,
        phone: latestAnamnesisRow.phone ?? latestAnamnesisRow.data?.phone ?? null,
        blood_type: latestAnamnesisRow.blood_type ?? latestAnamnesisRow.data?.blood_type ?? null,
        allergies: latestAnamnesisRow.allergies ?? latestAnamnesisRow.data?.allergies ?? null,
        past_injuries: latestAnamnesisRow.past_injuries ?? latestAnamnesisRow.data?.past_injuries ?? null,
        initial_height:
          latestAnamnesisRow.initial_height != null
            ? Number(latestAnamnesisRow.initial_height)
            : latestAnamnesisRow.data?.initial_height ?? null,
        initial_weight:
          latestAnamnesisRow.initial_weight != null
            ? Number(latestAnamnesisRow.initial_weight)
            : latestAnamnesisRow.data?.initial_weight ?? null,
        created_at: latestAnamnesisRow.created_at,
      }
    : null;

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-xl mx-auto space-y-6">
        <Link href={`/players/${id}`} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← {player.last_name} {player.first_name}
        </Link>

        <h1 className="text-lg font-bold text-white tracking-tight">
          Редагувати гравця
        </h1>

        <EditPlayerForm player={player} teams={teams ?? []} initialAnamnesis={initialAnamnesis} />
      </div>
    </div>
  );
}
