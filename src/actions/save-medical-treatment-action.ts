"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
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

  const payload = `[TREATMENT] ${JSON.stringify(entry)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: input.injury_id || (null as any),
    date: input.date,
    category: "treatment",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  if (input.injury_id) revalidatePath(`/injuries/${input.injury_id}`);
  revalidatePath(`/players/${input.player_id}`);

  return { success: true, treatment: entry };
}
