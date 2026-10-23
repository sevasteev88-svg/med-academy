import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { WadaDrugCheckerCard } from "@/components/tue/WadaDrugCheckerCard";
import { TueManagementSection } from "@/components/tue/TueManagementSection";
import { listClubTueCasesAction } from "@/actions/tue-actions";

export default async function TueDashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Отримуємо гравців клубу для вибору в модалці створення
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, position")
    .eq("club_id", user?.clubId || "")
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  const casesRes = await listClubTueCasesAction();
  const tueCases = casesRes.success ? casesRes.data : [];

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-sky-500/15">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Антидопінговий контроль та TUE
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Єдиний центр антидопінгової безпеки клубу: перевірка ліків WADA/НАДЦ, облік терапевтичних виключень та контроль 30-денних термінів
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/pharmacy"
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              💊 Клубна аптека
            </Link>
            <Link
              href="/players"
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              👥 Реєстр гравців
            </Link>
          </div>
        </div>

        {/* 1. Швидкий пошук та чекер WADA Prohibited List */}
        <WadaDrugCheckerCard />

        {/* 2. Журнал кейсів TUE та контроль термінів */}
        <TueManagementSection
          initialCases={tueCases}
          playersList={players || []}
        />
      </div>
    </div>
  );
}
