"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { PlayerCustomRehabPlan } from "@/types/exercise-library";

/**
 * Отримати активний план реабілітації для конкретного футболіста
 */
export async function getPlayerRehabPlanAction(playerId: string): Promise<PlayerCustomRehabPlan | null> {
  const supabase = await createClient();

  const { data: logs, error } = await supabase
    .from("injury_logs")
    .select("note, created_at")
    .like("note", `[CUSTOM_REHAB_PLAN] %"player_id":"${playerId}"%`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !logs || logs.length === 0) {
    return null;
  }

  try {
    const raw = logs[0].note.replace("[CUSTOM_REHAB_PLAN] ", "");
    return JSON.parse(raw) as PlayerCustomRehabPlan;
  } catch {
    return null;
  }
}

/**
 * Зберегти сконструйований план ЛФК для футболіста
 */
export async function savePlayerRehabPlanAction(planData: Omit<PlayerCustomRehabPlan, "id" | "created_at">) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const plan: PlayerCustomRehabPlan = {
    ...planData,
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[CUSTOM_REHAB_PLAN] ${JSON.stringify(plan)}`;

  // Отримуємо або створюємо системну травму для зв'язку
  let targetInjuryId: string | null = null;
  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", planData.player_id)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (existingInj && existingInj.length > 0) {
    targetInjuryId = existingInj[0].id;
  } else {
    const { data: newInj } = await supabase
      .from("injuries")
      .insert({
        player_id: planData.player_id,
        date_of_injury: new Date().toISOString().split("T")[0],
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "План ЛФК / Реабілітація",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (newInj) targetInjuryId = newInj.id;
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
    date: new Date().toISOString().split("T")[0],
    category: "treatment",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${planData.player_id}`);
  revalidatePath("/rehab-portal");

  return { success: true, plan };
}
