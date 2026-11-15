"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { type LsiAssessmentRecord, validateLsiRecord } from "@/types/lsi";

export async function saveLsiAssessmentAction(
  assessmentData: Omit<LsiAssessmentRecord, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  // Валідація обов'язкових полів: кінцівка та тип травми
  const validation = validateLsiRecord(assessmentData);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const supabase = await createClient();

  const record: LsiAssessmentRecord = {
    ...assessmentData,
    id: `lsi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  // Зберігаємо безпосередньо в lsi_assessments (без фіктивної травми в injuries)
  const { data: inserted, error } = await supabase
    .from("lsi_assessments")
    .insert({
      club_id: auth.user.clubId,
      player_id: assessmentData.player_id,
      injury_id: assessmentData.injury_id || null,
      date: assessmentData.date,
      injury_type: assessmentData.injury_type,
      tested_limb: assessmentData.tested_limb,
      evaluator_name: assessmentData.evaluator_name,
      doctor_signature: assessmentData.doctor_signature,
      protocol_source: assessmentData.protocol_source,
      phase_clearance: assessmentData.phase_clearance,
      overall_lsi_percent: assessmentData.overall_lsi_percent,
      criteria_met: Boolean(assessmentData.criteria_met),
      status: assessmentData.status,
      doctor_verdict: assessmentData.doctor_verdict,
      notes: assessmentData.notes || null,
      data: record,
    } as any)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const savedRecord: LsiAssessmentRecord = {
    ...record,
    id: inserted?.id || record.id,
  };

  if (assessmentData.injury_id) {
    revalidatePath(`/injuries/${assessmentData.injury_id}`);
  }
  revalidatePath(`/players/${assessmentData.player_id}`);
  revalidatePath("/rtp");

  return { success: true, record: savedRecord };
}
