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

  // Отримуємо або створюємо системний запис у injuries для уникнення порушення NOT NULL constraint
  let targetInjuryId: string | null = null;
  const { data: activeInjuries } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", input.player_id)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (activeInjuries && activeInjuries.length > 0) {
    targetInjuryId = activeInjuries[0].id;
  } else {
    const { data: newInjury, error: createInjErr } = await supabase
      .from("injuries")
      .insert({
        player_id: input.player_id,
        date_of_injury: record.date,
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Нутриціологічний профіль / Санація",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (!createInjErr && newInjury) {
      targetInjuryId = newInjury.id;
    }
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${input.player_id}`);

  return { success: true, profile: record };
}
