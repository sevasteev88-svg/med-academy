import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import RehabPortalClient from "@/components/portal/RehabPortalClient";

export const metadata = {
  title: "Медичний Портал Гравця · ФК «Чорноморець»",
  description: "Особистий кабінет травмованого футболіста для щоденного звіту про біль та відновлення",
};

export default async function RehabPortalPage() {
  const supabase = await createClient();

  // Отримуємо всіх гравців клубу (здорових та травмованих)
  const { data: playersData } = await supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      position,
      teams (
        name
      ),
      injuries (
        id,
        location,
        description,
        injury_type,
        status,
        date_of_injury
      )
    `)
    .order("last_name", { ascending: true });

  const allPlayers = (playersData || []).map((pl: any) => {
    const activeInjuries = (pl.injuries || []).filter(
      (i: any) => i.status === "active" || i.status === "rehabilitation"
    );
    const primaryInj = activeInjuries[0];

    return {
      id: pl.id,
      name: `${pl.last_name} ${pl.first_name}`,
      team: pl.teams?.name || "Академія",
      position: pl.position,
      diagnosis: primaryInj ? (primaryInj.description || primaryInj.injury_type || "Травма") : "Здоровий (Основна група)",
      location: primaryInj ? primaryInj.location : "full_fit",
      isInjured: Boolean(primaryInj),
    };
  });

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
        <RehabPortalClient injuredPlayers={allPlayers} />
      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pt-6 text-[10px] text-slate-600 font-mono">
        Штаб спортивної медицини ФК «Чорноморець» · Всі права захищено
      </div>
    </div>
  );
}
