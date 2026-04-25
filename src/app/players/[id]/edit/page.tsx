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

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href={`/players/${id}`} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← {player.last_name} {player.first_name}
        </Link>

        <h1 className="text-lg font-bold text-white tracking-tight">
          Редагувати гравця
        </h1>

        <EditPlayerForm player={player} teams={teams ?? []} />
      </div>
    </div>
  );
}
