"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { WearableBiometricsEntry, WearableDeviceType } from "@/types/wearables";

export async function saveWearableBiometricsAction(input: {
  playerId: string;
  deviceType: WearableDeviceType;
  date: string;
  recoveryScore: number;
  hrvRmssd: number;
  restingHr: number;
  sleepDurationHours: number;
  sleepEfficiencyPct: number;
  dayStrain?: number | null;
  deepSleepHours?: number | null;
  remSleepHours?: number | null;
  caloriesBurned?: number | null;
  source?: "api_sync" | "apple_health" | "manual";
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const record: WearableBiometricsEntry = {
    id: `wear_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    device_type: input.deviceType,
    date: input.date || new Date().toISOString().split("T")[0],
    recovery_score: Number(input.recoveryScore),
    hrv_rmssd: Number(input.hrvRmssd),
    resting_hr: Number(input.restingHr),
    sleep_duration_hours: Number(input.sleepDurationHours),
    sleep_efficiency_pct: Number(input.sleepEfficiencyPct),
    day_strain: input.dayStrain != null ? Number(input.dayStrain) : null,
    deep_sleep_hours: input.deepSleepHours != null ? Number(input.deepSleepHours) : null,
    rem_sleep_hours: input.remSleepHours != null ? Number(input.remSleepHours) : null,
    calories_burned: input.caloriesBurned != null ? Number(input.caloriesBurned) : null,
    source: input.source || "manual",
    created_at: new Date().toISOString(),
  };

  const payload = `[WEARABLE] ${JSON.stringify(record)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/wellness");
  revalidatePath("/availability");

  return { success: true, biometrics: record };
}
