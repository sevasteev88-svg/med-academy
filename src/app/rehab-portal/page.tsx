import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import RehabPortalClient from "@/components/portal/RehabPortalClient";

export const metadata = {
  title: "Медичний Портал Гравця · ФК «Чорноморець»",
  description: "Особистий кабінет травмованого футболіста для щоденного звіту про біль та відновлення",
};

export default async function RehabPortalPage() {
  const supabase = await createClient();

  // Отримуємо всіх травмованих гравців
  const { data: injuriesData } = await supabase
    .from("injuries")
    .select(`
      id,
      location,
      description,
      injury_type,
      players!inner (
        id,
        first_name,
        last_name,
        position,
        teams (
          name
        )
      )
    `)
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  // Унікальні гравці
  const seenPlayers = new Set<string>();
  const injuredPlayers = (injuriesData || [])
    .map((inj: any) => {
      const pl = inj.players;
      if (!pl || seenPlayers.has(pl.id)) return null;
      seenPlayers.add(pl.id);

      return {
        id: pl.id,
        name: `${pl.last_name} ${pl.first_name}`,
        team: pl.teams?.name || "Академія",
        position: pl.position,
        diagnosis: inj.description || inj.injury_type || "Травма",
        location: inj.location,
      };
    })
    .filter(Boolean) as any[];

  return (
    <div className="min-h-screen text-slate-200 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top minimal header */}
      <div className="max-w-md mx-auto w-full flex items-center justify-between pb-4">
        <Link
          href="/"
          className="text-xs text-slate-500 hover:text-sky-300 transition-colors flex items-center gap-1"
        >
          <span>←</span> На головну
        </Link>
        <span className="text-[10px] font-mono text-slate-500">
          FC Chornomorets Medical Portal
        </span>
      </div>

      {/* Main Client Component */}
      <div className="flex-1 flex items-center justify-center">
        <RehabPortalClient injuredPlayers={injuredPlayers} />
      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pt-6 text-[10px] text-slate-600 font-mono">
        Штаб спортивної медицини ФК «Чорноморець» · Всі права захищено
      </div>
    </div>
  );
}
