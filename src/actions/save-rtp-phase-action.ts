"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Не авторизовано" };
  }

  const payload: RtpPhaseLog = {
    injury_id: injuryId,
    phase,
    target_date: targetDate,
    doctor_note: doctorNote || "",
    criteria_met: criteriaMet || [],
    updated_at: new Date().toISOString(),
  };

  // 1. Зберігаємо у журнал injury_logs
  const { error: logErr } = await supabase.from("injury_logs").insert({
    injury_id: injuryId,
    player_id: playerId,
    category: "procedure",
    date: new Date().toISOString().split("T")[0],
    note: `[RTP_PHASE] ${JSON.stringify(payload)}`,
  });

  if (logErr) {
    return { error: `Помилка збереження RTP етапу: ${logErr.message}` };
  }

  // 2. Якщо перейшли на Фазу 4 чи 5, оновлюємо статус самої травми
  const updates: Record<string, any> = {};
  if (targetDate) {
    updates.expected_return_date = targetDate;
  }

  if (phase === 4) {
    updates.status = "rehabilitation";
  } else if (phase === 5 && closeInjury) {
    updates.status = "closed";
    updates.actual_return_date = new Date().toISOString().split("T")[0];
  } else if (phase < 4) {
    updates.status = "active";
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from("injuries")
      .update(updates)
      .eq("id", injuryId);

    if (updateErr) {
      console.warn("Could not update injury status directly:", updateErr.message);
    }
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
