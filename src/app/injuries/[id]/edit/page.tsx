import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditInjuryForm from "@/components/injuries/EditInjuryForm";
import { INJURY_TYPE_UA, LOCATION_UA } from "@/lib/constants";

export default async function EditInjuryPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: injury, error } = await supabase.from("injuries").select("*, players!inner ( first_name, last_name )").eq("id", id).single();
  if (error || !injury) return notFound();
  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8"><div className="max-w-lg mx-auto space-y-6">
      <Link href={`/injuries/${id}`} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← {INJURY_TYPE_UA[injury.injury_type]} — {LOCATION_UA[injury.location]} ({injury.players.last_name})</Link>
      <h1 className="text-lg font-bold text-white tracking-tight">Редагувати травму</h1>
      <EditInjuryForm injury={injury} />
    </div></div>
  );
}
