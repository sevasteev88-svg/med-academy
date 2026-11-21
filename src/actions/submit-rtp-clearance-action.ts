"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import {
  calculateRtpClearanceStats,
  RTP_PROFILES,
  type RtpCriteriaState,
  type RtpProfileId,
} from "@/lib/rtp-profiles";

export type { RtpCriteriaState, RtpProfileId };

export async function submitRtpClearanceAction(
  injuryId: string,
  criteria: RtpCriteriaState,
  closeInjuryNow: boolean,
  profileId?: RtpProfileId
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { data: injCheck } = await supabase
    .from("injuries")
    .select("id")
    .eq("id", injuryId)
    .eq("club_id", auth.user.clubId)
    .maybeSingle();

  if (!injCheck) {
    return { error: "Травму не знайдено або доступ заборонено" };
  }

  const candidateProfile = profileId || criteria.profileId || "base";
  const activeProfileId: RtpProfileId =
    candidateProfile in RTP_PROFILES ? (candidateProfile as RtpProfileId) : "base";

  const { passedCriteria, totalCriteria, clearancePercentage, isFullyCleared } =
    calculateRtpClearanceStats(activeProfileId, criteria);

  // Зберігаємо протокол допуску в injury_logs (збережено profileId + зворотна сумісність)
  const clearancePayload = {
    injury_id: injuryId,
    profileId: activeProfileId,
    passedCriteria,
    totalCriteria,
    clearancePercentage,
    isFullyCleared,
    criteria: {
      ...criteria,
      profileId: activeProfileId,
    },
    doctorName: auth.user.fullName || auth.user.email,
    date: new Date().toISOString(),
  };

  const clearanceLog = {
    club_id: auth.user.clubId,
    injury_id: injuryId,
    date: new Date().toISOString().split("T")[0],
    category: "examination",
    note: `[RTP_CLEARANCE] ${JSON.stringify(clearancePayload)}`,
  };

  const { error: insertErr } = await supabase.from("injury_logs").insert(clearanceLog as any);
  if (insertErr) {
    return { error: `Помилка збереження: ${insertErr.message}` };
  }

  // Якщо лікар підтвердив повний допуск і закриття травми
  if (closeInjuryNow) {
    const today = new Date().toISOString().split("T")[0];
    const { error: updateErr } = await supabase
      .from("injuries")
      .update({
        status: "closed",
        actual_return_date: today,
        vas_score: 0,
      })
      .eq("id", injuryId)
      .eq("club_id", auth.user.clubId);

    if (updateErr) {
      return { error: updateErr.message };
    }
  }

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/availability");
  revalidatePath("/exams/upcoming");
  revalidatePath("/rtp");
  revalidatePath("/");

  return {
    success: true,
    profileId: activeProfileId,
    passedCriteria,
    totalCriteria,
    clearancePercentage,
    isFullyCleared,
  };
}
