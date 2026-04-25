import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import AddInjuryForm from "@/components/injuries/AddInjuryForm";

export default async function NewInjuryPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const { player: preselectedPlayerId } = await searchParams;
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, category, sort_order, players ( id, first_name, last_name )")
    .order("sort_order", { ascending: true });

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-lg mx-auto space-y-6">
        <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← Дашборд
        </Link>

        <h1 className="text-lg font-bold text-white tracking-tight">
          Фіксація травми
        </h1>

        <AddInjuryForm
          teams={teams ?? []}
          preselectedPlayerId={preselectedPlayerId}
        />
      </div>
    </div>
  );
}
