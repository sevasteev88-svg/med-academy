import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import WellnessFormClient from "@/components/wellness/WellnessFormClient";

export default async function WellnessPage({
  searchParams,
}: {
  searchParams: Promise<{ playerId?: string }>;
}) {
  const { playerId } = await searchParams;
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, teams ( name )")
    .order("last_name", { ascending: true });

  const playerList = (players as any) ?? [];

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-blue-900/15 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/availability"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Доступність
              </Link>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1">
              Ранковий моніторинг готовності (Wellness)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Шкала Hooper-Mackinnon: сон, втома, крепатура, стрес
            </p>
          </div>
          <Link
            href="/wellness/kiosk"
            className="px-3.5 py-2 rounded-xl bg-brand-blue/20 hover:bg-brand-blue text-brand-blue-light hover:text-white border border-brand-blue/40 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <span>📱</span>
            <span>Kiosk Mode</span>
          </Link>
        </div>

        <WellnessFormClient
          players={playerList}
          defaultPlayerId={playerId}
        />
      </div>
    </div>
  );
}
