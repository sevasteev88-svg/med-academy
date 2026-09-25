"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { PreSeasonScreening } from "@/types/screening";

export async function saveScreeningAction(screeningData: Omit<PreSeasonScreening, "id" | "created_at">) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const record: PreSeasonScreening = {
    ...screeningData,
    id: `ppe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[SCREENING] ${JSON.stringify(record)}`;

  // Зберігаємо у відкриту категорію логів
  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${record.player_id}`);
  revalidatePath("/players");
  revalidatePath("/availability");

  return { success: true, screening: record };
}
