import { createClient } from "@/utils/supabase/server";
import AnthropometryForm from "@/components/growth/AnthropometryForm";

export default async function NewMeasurementPage() {
  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, sex")
    .order("last_name");

  return (
    <div className="min-h-screen bg-background text-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">
          Антропометричний огляд
        </h1>
        <AnthropometryForm players={players ?? []} />
      </div>
    </div>
  );
}
