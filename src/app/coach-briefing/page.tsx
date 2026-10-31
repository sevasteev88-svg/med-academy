import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlayerAvailability } from "@/lib/availability";
import CoachBriefingClient, { BriefingPlayer } from "@/components/coach/CoachBriefingClient";

export default async function CoachBriefingPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Якщо тренер ще не закріплений за жодною командою
  if (user?.role === "coach") {
    const coachTeams = user.teamIds && user.teamIds.length > 0
      ? user.teamIds
      : (user.teamId ? [user.teamId] : []);

    if (coachTeams.length === 0) {
      return (
        <div className="min-h-[80vh] flex items-center justify-center p-4">
          <div className="p-8 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center space-y-3 max-w-md">
            <div className="text-4xl mb-2">⏳</div>
            <h2 className="text-lg font-bold text-white">Очікування призначення команди</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Ваш профіль зареєстровано з роллю «Тренер». Для перегляду гравців та тактичного брифінгу адміністратор або головний лікар клубу має закріпити за вами вікову групу (команду).
            </p>
          </div>
        </div>
      );
    }
  }

  // 1. Отримуємо команди клубу для фільтрів
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, category, sort_order")
    .eq("club_id", user?.clubId || DEFAULT_CLUB_ID)
    .order("sort_order", { ascending: true });

  let teams = (teamsData ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Якщо це тренер, обмежуємо список команд тільки його призначеними
  if (user?.role === "coach") {
    const coachTeams = user.teamIds && user.teamIds.length > 0
      ? user.teamIds
      : (user.teamId ? [user.teamId] : []);
    teams = teams.filter((t) => coachTeams.includes(t.id));
  }

  // 2. Єдине джерело доступності гравців
  const availabilityReport = await getPlayerAvailability();

  let briefingPlayers: BriefingPlayer[] = availabilityReport.players.map((p) => ({
    id: p.id,
    name: p.fullName,
    position: p.position,
    team_id: p.team_id || "",
    team_name: p.team_name ?? "—",
    category: p.team_category ?? "academy",
    status: p.status,
    restriction_notes: p.restriction_notes,
    max_minutes: p.max_minutes,
    injury_summary: p.injury_summary,
  }));

  // Якщо тренер — показуємо тільки гравців його команд
  if (user?.role === "coach") {
    const coachTeams = user.teamIds && user.teamIds.length > 0
      ? user.teamIds
      : (user.teamId ? [user.teamId] : []);
    briefingPlayers = briefingPlayers.filter((p) => coachTeams.includes(p.team_id));
  }

  return <CoachBriefingClient teams={teams} players={briefingPlayers} />;
}
