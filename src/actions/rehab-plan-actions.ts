"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor, assertPlayerAccess, assertPlayerOrStaffAccess } from "@/lib/auth";
import type { PlayerCustomRehabPlan } from "@/types/exercise-library";

/**
 * Отримати активний план реабілітації для конкретного футболіста
 */
export async function getPlayerRehabPlanAction(playerId: string): Promise<PlayerCustomRehabPlan | null> {
  const access = await assertPlayerOrStaffAccess(playerId);
  if ("error" in access) {
    return null;
  }

  const supabase = await createClient();

  let query = supabase
    .from("rehab_plans")
    .select("id, player_id, target_injury_id, status, doctor_name, approved_by, approved_at, data, created_at")
    .eq("player_id", playerId);

  if (access.actor === "staff") {
    query = query.eq("club_id", access.user.clubId);
  } else if (access.actor === "parent") {
    query = query.eq("club_id", access.clubId);
  }

  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !rows || rows.length === 0) {
    return null;
  }

  const row = rows[0] as any;
  return {
    ...((row.data as PlayerCustomRehabPlan) || {}),
    id: row.data?.id || row.id,
    player_id: row.player_id,
    target_injury_id: row.target_injury_id ?? row.data?.target_injury_id,
    status: row.status ?? row.data?.status ?? "approved",
    doctor_name: row.doctor_name ?? row.data?.doctor_name,
    approved_by: row.approved_by ?? row.data?.approved_by,
    approved_at: row.approved_at ?? row.data?.approved_at,
    created_at: row.created_at ?? row.data?.created_at,
  };
}

/**
 * Зберегти сконструйований план ЛФК для футболіста
 */
export async function savePlayerRehabPlanAction(planData: Omit<PlayerCustomRehabPlan, "id" | "created_at">) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const playerAccess = await assertPlayerAccess(auth.user, planData.player_id, { allowCoach: false });
  if ("error" in playerAccess) return { error: playerAccess.error };

  const supabase = await createClient();

  const isApproved = planData.status === "approved";
  const doctorName = planData.approved_by || planData.doctor_name || auth.user.email || "Медичний штаб клубу";

  const plan: PlayerCustomRehabPlan = {
    ...planData,
    id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    status: planData.status || "approved",
    approved_by: isApproved ? doctorName : undefined,
    approved_at: isApproved ? (planData.approved_at || new Date().toISOString()) : undefined,
    created_at: new Date().toISOString(),
  };

  // Зберігаємо безпосередньо в rehab_plans (без фіктивної травми в injuries)
  const { data: inserted, error } = await supabase
    .from("rehab_plans")
    .insert({
      club_id: auth.user.clubId,
      player_id: planData.player_id,
      target_injury_id: planData.target_injury_id || null,
      date: new Date().toISOString().split("T")[0],
      status: plan.status,
      doctor_name: plan.doctor_name || null,
      approved_by: plan.approved_by || null,
      approved_at: plan.approved_at || null,
      data: plan,
    } as any)
    .select("id")
    .single();

  if (error) return { error: error.message };

  const savedPlan: PlayerCustomRehabPlan = {
    ...plan,
    id: inserted?.id || plan.id,
  };

  revalidatePath(`/players/${planData.player_id}`);
  revalidatePath("/rehab-portal");

  return { success: true, plan: savedPlan };
}
