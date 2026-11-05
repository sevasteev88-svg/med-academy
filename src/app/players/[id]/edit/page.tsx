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

  const { data: anamnesisLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", "[INITIAL_ANAMNESIS]%")
    .order("created_at", { ascending: false })
    .limit(20);

  const initialAnamnesis = (anamnesisLogs || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[INITIAL_ANAMNESIS] ", "").replace("[INITIAL_ANAMNESIS]", "").trim();
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? parsed : null;
      } catch {
        return null;
      }
    })
    .find(Boolean) || null;

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
