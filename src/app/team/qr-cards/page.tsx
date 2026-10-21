import { redirect } from "next/navigation";
import { getCurrentUser, isDoctor, isCoach, DEFAULT_CLUB_ID } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getTeamActivationSummaryAction } from "@/actions/player-device-actions";
import TeamQrCardsClient from "@/components/team/TeamQrCardsClient";

export const metadata = {
  title: "QR-картки команди · ФК «Чорноморець»",
  description: "Генерація друкованих QR-карток для швидкої активації особистих кабінетів гравців",
};

export default async function TeamQrCardsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Сторінка доступна для doctor, admin та coach
  if (!isDoctor(user.role) && !isCoach(user.role)) {
    redirect("/");
  }

  const supabase = await createClient();

  // Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .order("sort_order", { ascending: true });

  let teams = (teamsData ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Якщо тренер має призначену команду, показуємо тільки її
  if (isCoach(user.role) && user.teamId) {
    const assignedTeam = teams.find((t) => t.id === user.teamId);
    if (assignedTeam) {
      teams = [assignedTeam];
    }
  }

  const initialTeamId = teams[0]?.id || "";

  // Отримуємо статус гравців початкової команди
  let initialPlayers: any[] = [];
  if (initialTeamId) {
    const summaryRes = await getTeamActivationSummaryAction(initialTeamId);
    if (summaryRes.success && summaryRes.players) {
      initialPlayers = summaryRes.players;
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <TeamQrCardsClient
          teams={teams}
          initialTeamId={initialTeamId}
          initialPlayers={initialPlayers}
          userRole={user.role as "doctor" | "coach" | "admin"}
          assignedTeamId={user.teamId}
        />
      </div>
    </div>
  );
}
