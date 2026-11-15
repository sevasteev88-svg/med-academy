"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { hasConsent } from "@/lib/consents";
import type { NutritionProfile } from "@/types/nutrition";

export async function saveNutritionAction(
  input: Omit<NutritionProfile, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const hasAnySupplements =
    input.supplements_creatine ||
    input.supplements_omega3 ||
    input.supplements_collagen_vit_c ||
    input.supplements_whey_protein ||
    input.supplements_iron ||
    Boolean(input.supplements_custom?.trim());

  if (hasAnySupplements) {
    const allowed = await hasConsent(input.player_id, "supplements");
    if (!allowed) {
      return {
        error:
          "Потрібна згода батьків (область: Спортивні добавки та нутриціологія).",
      };
    }
  }

  const supabase = await createClient();

  const record: NutritionProfile = {
    ...input,
    id: `nut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  // Зберігаємо безпосередньо в player_nutrition_profiles (без фіктивної травми в injuries)
  const { data: inserted, error } = await supabase
    .from("player_nutrition_profiles")
    .insert({
      club_id: auth.user.clubId,
      player_id: input.player_id,
      date: record.date,
      data: record,
    } as any)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const savedRecord: NutritionProfile = {
    ...record,
    id: inserted?.id || record.id,
  };

  revalidatePath(`/players/${input.player_id}`);

  return { success: true, profile: savedRecord };
}
