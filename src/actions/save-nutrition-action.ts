"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { NutritionProfile } from "@/types/nutrition";

export async function saveNutritionAction(
  input: Omit<NutritionProfile, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const record: NutritionProfile = {
    ...input,
    id: `nut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[NUTRITION] ${JSON.stringify(record)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${input.player_id}`);

  return { success: true, profile: record };
}
