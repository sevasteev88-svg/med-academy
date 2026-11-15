"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";

export async function saveMedicalTreatmentAction(
  input: Omit<MedicalTreatmentEntry, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const entry: MedicalTreatmentEntry = {
    ...input,
    id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("medical_treatments")
    .insert({
      club_id: auth.user.clubId,
      player_id: input.player_id,
      injury_id: input.injury_id || null,
      date: input.date,
      category: input.category,
      title: input.title,
      dosage_or_params: input.dosage_or_params || null,
      duration_days: input.duration_days ?? null,
      duration_note: input.duration_note || null,
      reason: input.reason || null,
      doctor_name: input.doctor_name,
      wada_status: input.wada_status,
      doctor_wada_confirmed: Boolean(input.doctor_wada_confirmed),
      doctor_confirmation_note: input.doctor_confirmation_note || null,
      notes: input.notes || null,
      pharmacy_item_id: input.pharmacy_item_id || null,
      units_deducted: input.units_deducted ?? null,
      legacy_entry_id: entry.id,
      data: entry,
    } as any)
    .select("id")
    .single();

  if (error) return { error: error.message };

  entry.log_id = inserted?.id;

  await logAudit({
    action: "prescribe_treatment",
    entity: "pharmacy",
    entityId: entry.id,
    playerId: input.player_id,
    meta: {
      date: input.date,
      category: input.category,
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  if (input.injury_id) revalidatePath(`/injuries/${input.injury_id}`);
  revalidatePath(`/players/${input.player_id}`);

  return { success: true, treatment: entry };
}
