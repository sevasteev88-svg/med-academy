"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertTeamStaff, assertPlayerAccess } from "@/lib/auth";
import {
  type HydrationSession,
  calculateHydrationMetrics,
  type UrineColorLevel,
} from "@/types/hydration";

type SaveHydrationInput = {
  playerId: string;
  date: string;
  sessionName: string;
  durationMinutes: number;
  temperatureCelsius?: number | null;
  weightBeforeKg: number;
  weightAfterKg: number;
  fluidConsumedLiters: number;
  urineColorBefore?: UrineColorLevel | null;
  notes?: string | null;
};

export async function saveHydrationAction(input: SaveHydrationInput) {
  const auth = await assertTeamStaff();
  if ("error" in auth) return { error: auth.error };

  const access = await assertPlayerAccess(auth.user, input.playerId, {
    allowCoach: true,
  });
  if ("error" in access) return { error: access.error };

  const clubId = access.player.club_id || auth.user.clubId;
  const supabase = await createClient();

  const metrics = calculateHydrationMetrics({
    weightBefore: input.weightBeforeKg,
    weightAfter: input.weightAfterKg,
    fluidConsumedLiters: input.fluidConsumedLiters,
    durationMinutes: input.durationMinutes,
  });

  const record: HydrationSession = {
    id: `hyd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    date: input.date,
    session_name: input.sessionName,
    duration_minutes: input.durationMinutes,
    temperature_celsius: input.temperatureCelsius ?? null,
    weight_before_kg: input.weightBeforeKg,
    weight_after_kg: input.weightAfterKg,
    fluid_consumed_liters: input.fluidConsumedLiters,
    urine_color_before: input.urineColorBefore ?? null,
    weight_loss_kg: metrics.weightLossKg,
    weight_loss_pct: metrics.weightLossPct,
    sweat_rate_liters_per_hour: metrics.sweatRateLph,
    recommended_fluid_replacement_ml: metrics.replacementMl,
    status: metrics.status,
    notes: input.notes ?? null,
    created_at: new Date().toISOString(),
  };

  const payload = `[HYDRATION] ${JSON.stringify(record)}`;

  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", input.playerId)
    .eq("club_id", clubId)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  const targetInjuryId: string | null = existingInj?.[0]?.id ?? null;

  const { error } = await supabase.from("injury_logs").insert({
    club_id: clubId,
    injury_id: targetInjuryId,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath("/hydration");
  revalidatePath(`/players/${input.playerId}`);

  return { success: true, session: record };
}
