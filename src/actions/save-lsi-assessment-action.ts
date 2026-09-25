"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { LsiAssessmentRecord } from "@/types/lsi";

export async function saveLsiAssessmentAction(
  assessmentData: Omit<LsiAssessmentRecord, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const record: LsiAssessmentRecord = {
    ...assessmentData,
    id: `lsi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[LSI_ASSESSMENT] ${JSON.stringify(record)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: assessmentData.injury_id || (null as any),
    date: assessmentData.date,
    category: "functional_test",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  if (assessmentData.injury_id) {
    revalidatePath(`/injuries/${assessmentData.injury_id}`);
  }
  revalidatePath(`/players/${assessmentData.player_id}`);
  revalidatePath("/rtp");

  return { success: true, record };
}
