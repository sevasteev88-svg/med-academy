import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTeamSubscriptionsAction } from "@/actions/billing-actions";
import TeamSubscriptionsClient from "@/components/team/TeamSubscriptionsClient";

export const dynamic = "force-dynamic";

export default async function TeamSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { teamId } = await searchParams;
  const res = await getTeamSubscriptionsAction({ teamId });

  if (!res.success) {
    return (
      <div className="min-h-screen text-slate-200 p-6 md:p-8 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md text-center space-y-3">
          <div className="text-3xl">⚠️</div>
          <h2 className="text-lg font-bold text-white">Доступ обмежено</h2>
          <p className="text-xs text-slate-400">{res.error || "Не вдалося отримати дані підписок"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <TeamSubscriptionsClient
          initialPlayers={res.players}
          teams={res.teams}
          initialStats={res.stats}
          monobankJarUrl={res.monobankJarUrl}
          currentTeamId={res.currentTeamId}
        />
      </div>
    </div>
  );
}
