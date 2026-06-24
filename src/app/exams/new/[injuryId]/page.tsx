// src/app/exams/new/[injuryId]/page.tsx
// Server Component — завантажує дані, передає у Client Component

import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import ExamFormClient from "./ExamFormClient";

export default async function ExamPage({
  params,
}: {
  params: Promise<{ injuryId: string }>;
}) {
  const { injuryId } = await params;
  const supabase = await createClient();

  // Завантажуємо травму з даними гравця
  const { data: injury } = await supabase
    .from("injuries")
    .select(`
      id,
      location,
      injury_type,
      date_of_injury,
      status,
      players (
        first_name,
        last_name,
        teams ( name )
      )
    `)
    .eq("id", injuryId)
    .single();

  if (!injury) notFound();

  const p = injury.players as any;
  const playerName = p ? `${p.last_name} ${p.first_name}` : "—";
  const teamName = p?.teams?.name ?? "";
  const days = Math.floor(
    (Date.now() - new Date(injury.date_of_injury).getTime()) / 86400000
  );
  const injuryInfo = `${teamName} · ${injury.location} · з ${new Date(injury.date_of_injury).toLocaleDateString("uk-UA")} · ${days} дн.`;

  // Попередні логи
  const { data: prevLogs } = await supabase
    .from("injury_logs")
    .select("date, note")
    .eq("injury_id", injuryId)
    .order("date", { ascending: false })
    .limit(3);

  return (
    <ExamFormClient
      injuryId={injuryId}
      playerName={playerName}
      injuryInfo={injuryInfo}
      prevLogs={prevLogs ?? []}
    />
  );
}
