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

  // Отримуємо або створюємо системний запис травми для прив'язки
  let targetInjuryId = assessmentData.injury_id || null;
  if (!targetInjuryId) {
    const { data: existingInj } = await supabase
      .from("injuries")
      .select("id")
      .eq("player_id", assessmentData.player_id)
      .order("date_of_injury", { ascending: false })
      .limit(1);

    if (existingInj && existingInj.length > 0) {
      targetInjuryId = existingInj[0].id;
    } else {
      const { data: newInj } = await supabase
        .from("injuries")
        .insert({
          player_id: assessmentData.player_id,
          date_of_injury: assessmentData.date,
          injury_type: "illness",
          location: "other",
          severity: "minor",
          status: "closed",
          description: "Тестування симетрії LSI / Динамометрія",
          vas_score: 0,
        } as any)
        .select("id")
        .single();

      if (newInj) targetInjuryId = newInj.id;
    }
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
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
