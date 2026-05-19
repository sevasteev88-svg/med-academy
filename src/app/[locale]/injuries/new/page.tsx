// src/app/[locale]/injuries/new/page.tsx
// Server Component — завантажує список гравців, передає у форму

import { createClient } from "@/utils/supabase/server";
import InjuryFormClient from "./InjuryFormClient";

export default async function NewInjuryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  // Всі гравці з командами
  const { data: rawPlayers } = await supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      teams ( name )
    `)
    .order("last_name", { ascending: true });

  const players = (rawPlayers ?? []).map((p: any) => ({
    id:         p.id,
    first_name: p.first_name,
    last_name:  p.last_name,
    team:       p.teams?.name ?? "—",
  }));

  return <InjuryFormClient players={players} locale={locale} />;
}
