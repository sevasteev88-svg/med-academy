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
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-sky-500/15 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/availability"
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold transition-colors"
              >
                ← Доступність
              </Link>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Ранковий Wellness
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Шкала Hooper-Mackinnon: сон, втома, крепатура, стрес
            </p>
          </div>
          <Link
            href="/wellness/kiosk"
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)] text-xs font-bold transition-all flex items-center gap-1.5"
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
