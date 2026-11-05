"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertTeamStaff, DEFAULT_CLUB_ID } from "@/lib/auth";
import type { RtpPhaseLog, RtpPhaseNumber } from "@/types/rtp";

export async function saveRtpPhaseAction({
  injuryId,
  playerId,
  phase,
  targetDate,
  doctorNote,
  criteriaMet,
  closeInjury = false,
}: {
  injuryId: string;
  playerId: string;
  phase: RtpPhaseNumber;
  targetDate: string;
  doctorNote?: string;
  criteriaMet?: string[];
  closeInjury?: boolean;
}) {
  const supabase = await createClient();

  // 1. Отримуємо інформацію про травму та команду гравця для перевірки прав
  const { data: injury, error: injErr } = await supabase
    .from("injuries")
    .select("id, club_id, player_id, description, status, players(team_id)")
    .eq("id", injuryId)
    .single();

  if (injErr || !injury) {
    return { error: "Травму не знайдено або доступ обмежено" };
  }

  const playerTeamId = (injury?.players as any)?.team_id || undefined;
  const auth = await assertTeamStaff(playerTeamId);
  if ("error" in auth) {
    return { error: auth.error };
  }

  const clubId = injury.club_id || auth.user.clubId || DEFAULT_CLUB_ID;

  const payload: RtpPhaseLog = {
    injury_id: injuryId,
    phase,
    target_date: targetDate,
    doctor_note: doctorNote || "",
    criteria_met: criteriaMet || [],
    updated_at: new Date().toISOString(),
  };

  // 2. Зберігаємо у журнал injury_logs (з явним зазначенням club_id)
  const { error: logErr } = await supabase.from("injury_logs").insert({
    club_id: clubId,
    injury_id: injuryId,
    category: "procedure",
    date: new Date().toISOString().split("T")[0],
    note: `[RTP_PHASE] ${JSON.stringify(payload)}`,
  });

  if (logErr) {
    console.warn("Could not insert into injury_logs:", logErr.message);
  }

  // 3. Оновлюємо статус самої травми та зберігаємо тег фази в description
  const updates: Record<string, any> = {};
  if (targetDate) {
    updates.expected_return_date = targetDate;
  }

  // Оновлюємо тег [RTP_PHASE:X] у description для 100% гарантованого збереження
  let desc = injury.description || "";
  desc = desc.replace(/\[RTP_PHASE:\d\]\s*/g, "").trim();
  updates.description = `[RTP_PHASE:${phase}] ${desc}`.trim();

  if (phase === 4) {
    updates.status = "rehabilitation";
  } else if (phase === 5 && closeInjury) {
    updates.status = "closed";
    updates.actual_return_date = new Date().toISOString().split("T")[0];
  } else if (phase === 5) {
    updates.status = "rehabilitation";
  } else if (phase < 4) {
    updates.status = "active";
  }

  const { error: updateErr } = await supabase
    .from("injuries")
    .update(updates)
    .eq("id", injuryId);

  if (updateErr && logErr) {
    return { error: `Помилка збереження RTP етапу: ${updateErr.message}` };
  }

  // Revalidate relevant pages
  revalidatePath("/rtp");
  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/availability");
  revalidatePath("/coach-briefing");
  revalidatePath("/");

  return { success: true };
}
