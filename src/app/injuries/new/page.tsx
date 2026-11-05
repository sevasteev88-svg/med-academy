/**
 * /injuries/new/page.tsx
 */

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import InjuryForm, { type InjuryFormInitialValues } from "@/components/injuries/InjuryForm";
import PlayerSelectionGrid, { type PlayerSelectionItem, type TeamOption } from "@/components/injuries/PlayerSelectionGrid";
import Link from "next/link";
import type {
  InjuryLocation,
  InjuryMechanism,
  InjuryOnset,
  InjuryOccurrence,
  InjurySeverity,
  InjurySide,
  InjuryType,
} from "@/types/database";

type Props = {
  searchParams: Promise<{
    playerId?: string;
    location?: string;
    side?: string;
    type?: string;
    vas?: string;
    date?: string;
    desc?: string;
    onset?: string;
    mechanism?: string;
    osiics?: string;
    isIllness?: string;
    teamId?: string;
  }>;
};

export default async function NewInjuryPage({ searchParams }: Props) {
  const {
    playerId,
    location,
    side,
    type,
    vas,
    date,
    desc,
    onset,
    mechanism,
    osiics,
    isIllness,
    teamId,
  } = await searchParams;

  const user = await getCurrentUser();
  const supabase = await createClient();

  const isIllnessBool = isIllness === "true" || (type === "other" && location === "other");

  const initialValues: InjuryFormInitialValues = {
    injuryType: (type as InjuryType) || (isIllnessBool ? "other" : undefined),
    location: (location as InjuryLocation) || (isIllnessBool ? "other" : undefined),
    side: (side as InjurySide) || (isIllnessBool ? "bilateral" : undefined),
    vasScore: vas !== undefined && vas !== "" ? Number(vas) : (isIllnessBool ? 0 : undefined),
    dateOfInjury: date || undefined,
    description: desc ? decodeURIComponent(desc) : undefined,
    onset: (onset as InjuryOnset) || (isIllnessBool ? "gradual" : undefined),
    mechanism: (mechanism as InjuryMechanism) || (isIllnessBool ? "non_contact" : undefined),
    osiicsCode: osiics || (isIllnessBool ? "INFC" : undefined),
    isIllness: isIllnessBool,
  };

  if (!playerId) {
    const isCoach = user?.role === "coach";
    const coachTeams = isCoach
      ? (user.teamIds && user.teamIds.length > 0 ? user.teamIds : (user.teamId ? [user.teamId] : []))
      : [];

    const [teamsRes, playersRes] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("players")
        .select(`
          id, first_name, last_name, position, date_of_birth, team_id,
          teams ( id, name ),
          injuries ( id, status, date_of_injury, injury_type )
        `)
        .is("archived_at", null)
        .order("last_name"),
    ]);

    const teamsList: TeamOption[] = (teamsRes.data ?? [])
      .filter((t: any) => !isCoach || coachTeams.length === 0 || coachTeams.includes(t.id));

    const playersList: PlayerSelectionItem[] = (playersRes.data ?? [])
      .filter((p: any) => !isCoach || coachTeams.length === 0 || (p.team_id && coachTeams.includes(p.team_id)))
      .map((p: any) => {
        const activeInjuries = (p.injuries ?? []).filter(
          (inj: any) => inj.status === "active" || inj.status === "rehabilitation"
        );
        const latestInjury = activeInjuries[0];

        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          position: p.position,
          date_of_birth: p.date_of_birth,
          team_id: p.team_id,
          team_name: p.teams?.name || null,
          active_injuries_count: activeInjuries.length,
          latest_injury_date: latestInjury?.date_of_injury || null,
          latest_injury_type: latestInjury?.injury_type || null,
        };
      });

    const extraParams: Record<string, string> = {};
    if (location) extraParams.location = location;
    if (side) extraParams.side = side;
    if (type) extraParams.type = type;
    if (vas) extraParams.vas = vas;
    if (date) extraParams.date = date;
    if (desc) extraParams.desc = desc;

    return (
      <div className="min-h-screen bg-background text-gray-100">
        <PlayerSelectionGrid
          players={playersList}
          teams={teamsList}
          isIllness={isIllnessBool}
          userRole={user?.role}
          initialTeamId={teamId}
          extraParams={extraParams}
        />
      </div>
    );
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, teams(name)")
    .eq("id", playerId)
    .single();

  if (!player) redirect("/injuries/new");

  const playerName = `${player.last_name} ${player.first_name}`;

  return (
    <div className="min-h-screen bg-background text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/injuries/new"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 hover:border-slate-700 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"
            >
              <span>←</span>
              <span>Обрати іншого гравця</span>
            </Link>
            <div className="h-4 w-px bg-gray-800" />
            <Link
              href={`/players/${playerId}`}
              className="text-xs text-sky-400 hover:underline font-medium"
            >
              Профіль: {playerName}
            </Link>
          </div>

          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <span>{isIllnessBool ? "🤒" : "⚡"}</span>
            <span>{isIllnessBool ? "Оформлення лікарняного" : "Фіксація травми"}</span>
            <span className="text-xs font-normal text-gray-400 font-mono">
              ({(player as any)?.teams?.name || "Команда"})
            </span>
          </h1>
        </div>

        <InjuryForm
          playerId={playerId}
          playerName={playerName}
          successRedirectUrl={`/players/${playerId}`}
          initialValues={initialValues}
          userRole={user?.role}
        />
      </div>
    </div>
  );
}
