import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ExposuresManager, { type TeamItem, type ExposureRecord } from "@/components/exposures/ExposuresManager";
import Link from "next/link";
import { Clock } from "lucide-react";

export const metadata = {
  title: "Експозиція та захворюваність · ФК «Чорноморець»",
  description: "Реєстр командного навантаження та розрахунок травматизму на 1000 годин",
};

export default async function ExposuresPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  // 1. Отримуємо команди та підрахунок гравців
  const [{ data: teamsRaw }, { data: playersRaw }, { data: exposuresRaw }, { data: injuriesRaw }] =
    await Promise.all([
      supabase.from("teams").select("id, name, sort_order").order("sort_order"),
      supabase.from("players").select("id, team_id").is("archived_at", null),
      supabase
        .from("exposures")
        .select(`
          id, team_id, date, type, minutes, players_count, notes, created_at,
          teams ( id, name )
        `)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("injuries")
        .select(`
          id, activity_type, date_of_injury,
          players ( team_id )
        `),
    ]);

  // Підрахунок кількості гравців на команду
  const playersCountMap = new Map<string, number>();
  for (const p of playersRaw ?? []) {
    if (p.team_id) {
      playersCountMap.set(p.team_id, (playersCountMap.get(p.team_id) || 0) + 1);
    }
  }

  const teams: TeamItem[] = (teamsRaw ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    playerCount: playersCountMap.get(t.id) || 20,
  }));

  const exposures: ExposureRecord[] = (exposuresRaw ?? []).map((e: any) => ({
    id: e.id,
    team_id: e.team_id,
    date: e.date,
    type: e.type === "match" ? "match" : "training",
    minutes: e.minutes ?? 0,
    players_count: e.players_count ?? 1,
    notes: e.notes ?? null,
    created_at: e.created_at,
    teams: e.teams ?? null,
  }));

  const injuries = (injuriesRaw ?? []).map((i: any) => ({
    id: i.id,
    team_id: i.players?.team_id ?? null,
    date_of_injury: i.date_of_injury,
    activity_type: i.activity_type ?? "training",
  }));

  return (
    <div className="relative min-h-screen text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-sky-500/15 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                Експозиція та захворюваність
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Реєстр людино-годин навантаження та епідеміологічний розрахунок травм на 1000 годин (UEFA / IOC)
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/reports/patterns"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-sky-400 border border-sky-500/25 transition"
            >
              🔍 Аналіз патернів
            </Link>
            <Link
              href="/"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
            >
              ← Дашборд
            </Link>
          </div>
        </div>

        {/* Manager Component */}
        <ExposuresManager
          teams={teams}
          initialExposures={exposures}
          injuries={injuries}
        />
      </div>
    </div>
  );
}
