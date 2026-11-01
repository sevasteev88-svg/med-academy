/**
 * /injuries/new/page.tsx
 */

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import InjuryForm, { type InjuryFormInitialValues } from "@/components/injuries/InjuryForm";
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
  } = await searchParams;
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
    const { data: players } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_id, teams(name)")
      .is("archived_at", null)
      .order("last_name");

    return (
      <div className="min-h-screen bg-background text-gray-100 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
            <Link href="/" className="text-gray-500 hover:text-white transition-colors text-sm">
              ← Назад
            </Link>
            <h1 className="text-xl font-bold text-white">
              {isIllnessBool ? "Оформлення лікарняного / захворювання" : "Фіксація травми"}
            </h1>
          </div>
          <p className="text-gray-400 text-sm">Оберіть гравця:</p>
          <div className="space-y-2">
            {(players ?? []).map((p: any) => (
              <Link
                key={p.id}
                href={`/injuries/new?playerId=${p.id}${isIllnessBool ? "&isIllness=true" : ""}`}
                className="flex items-center justify-between bg-surface border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
              >
                <div>
                  <p className="font-medium text-white">{p.last_name} {p.first_name}</p>
                  {p.teams?.name && <p className="text-xs text-gray-500 mt-0.5">{p.teams.name}</p>}
                </div>
                <span className="text-gray-600 text-sm">→</span>
              </Link>
            ))}
            {(players ?? []).length === 0 && (
              <p className="text-gray-600 text-sm">Гравців не знайдено</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("id", playerId)
    .single();

  if (!player) redirect("/injuries/new");

  const playerName = `${player.last_name} ${player.first_name}`;

  return (
    <div className="min-h-screen bg-background text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4 border-b border-gray-800 pb-4">
          <Link
            href={`/players/${playerId}`}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            ← {playerName}
          </Link>
          <h1 className="text-xl font-bold text-white">
            {isIllnessBool ? "Оформлення лікарняного / захворювання" : "Фіксація травми"}
          </h1>
        </div>

        {/* onSuccess — без redirectOnSuccess, редирект всередині InjuryForm через useRouter */}
        <InjuryForm
          playerId={playerId}
          playerName={playerName}
          successRedirectUrl={`/players/${playerId}`}
          initialValues={initialValues}
        />
      </div>
    </div>
  );
}
