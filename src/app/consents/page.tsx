import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, isDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import {
  getActiveConsentDocuments,
  getPlayerConsentSummary,
} from "@/lib/consents";
import { getClubMessagingSettings } from "@/lib/messaging-adapter";
import ClubConsentsClient, {
  type ClubPlayerConsentRow,
} from "@/components/consents/ClubConsentsClient";

export const dynamic = "force-dynamic";

export default async function ClubConsentsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const clubId = user.clubId || DEFAULT_CLUB_ID;

  const [playersRes, teamsRes, activeDocuments, clubSettings] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, first_name, last_name, team_id, date_of_birth, teams(name)")
        .order("last_name", { ascending: true }),
      supabase
        .from("teams")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true }),
      getActiveConsentDocuments(clubId),
      getClubMessagingSettings(clubId),
    ]);

  const rawPlayers = playersRes.data || [];
  const teams = (teamsRes.data || []).map((t) => ({
    id: t.id,
    name: t.name,
  }));

  const rows: ClubPlayerConsentRow[] = await Promise.all(
    rawPlayers.map(async (p: any) => {
      const summary = await getPlayerConsentSummary(
        p.id,
        p.date_of_birth,
        clubId
      );
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        teamId: p.team_id,
        teamName: p.teams?.name || "Команда",
        dateOfBirth: p.date_of_birth,
        summary,
      };
    })
  );

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <ClubConsentsClient
          players={rows}
          teams={teams}
          activeDocuments={activeDocuments}
          clubSettings={clubSettings}
          isAdminOrDoctor={isDoctor(user.role)}
        />
      </div>
    </div>
  );
}
