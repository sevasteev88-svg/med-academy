import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import AddPlayerForm from "@/components/players/AddPlayerForm";

export default async function NewPlayerPage() {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, category")
    .order("sort_order", { ascending: true });

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href="/players" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← Реєстр гравців
        </Link>

        <h1 className="text-lg font-bold text-white tracking-tight">
          Додати гравця
        </h1>

        <AddPlayerForm teams={teams ?? []} />
      </div>
    </div>
  );
}
