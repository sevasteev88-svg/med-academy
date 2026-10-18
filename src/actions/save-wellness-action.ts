"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertAuth } from "@/lib/auth";
import {
  calculateWellnessReadiness,
  type WellnessScore,
  type WellnessSurvey,
} from "@/types/wellness";

type SaveWellnessInput = {
  playerId: string;
  date: string;
  sleepQuality: WellnessScore;
  fatigueLevel: WellnessScore;
  muscleSoreness: WellnessScore;
  stressLevel: WellnessScore;
  sorenessLocation?: string | null;
  notes?: string | null;
};

export async function saveWellnessSurveyAction(input: SaveWellnessInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  // Обчислення балу та статусу
  const readiness = calculateWellnessReadiness({
    sleep_quality: input.sleepQuality,
    fatigue_level: input.fatigueLevel,
    muscle_soreness: input.muscleSoreness,
    stress_level: input.stressLevel,
  });

  const payload: WellnessSurvey = {
    id: `well_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    date: input.date,
    sleep_quality: input.sleepQuality,
    fatigue_level: input.fatigueLevel,
    muscle_soreness: input.muscleSoreness,
    stress_level: input.stressLevel,
    soreness_location: input.sorenessLocation || null,
    total_score: readiness.total_score,
    readiness_status: readiness.readiness_status,
    notes: input.notes || null,
    created_at: new Date().toISOString(),
  };

  // 1. Спробуємо зберегти в спеціальну таблицю wellness_surveys (якщо вона створена в базі)
  const { error: directErr } = await supabase
    .from("wellness_surveys")
    .upsert({ ...payload, club_id: auth.user.clubId }, { onConflict: "player_id, date" } as any);

  // 1b. Також зберігаємо в нову таблицю wellness_entries (Етап 8.1)
  const wellnessEntryPayload = {
    id: payload.id,
    club_id: auth.user.clubId,
    player_id: input.playerId,
    date: input.date,
    sleep_quality: input.sleepQuality,
    fatigue: input.fatigueLevel,
    soreness: input.muscleSoreness,
    stress: input.stressLevel,
    sleep_hours: null,
    pain: false,
    pain_vas: null,
    pain_locations: input.sorenessLocation ? [input.sorenessLocation] : [],
    illness: false,
    comment: input.notes || null,
    submitted_at: payload.created_at,
    source: "staff",
  };

  try {
    await supabase
      .from("wellness_entries")
      .upsert(wellnessEntryPayload as any, { onConflict: "player_id, date" });
  } catch {}

  // 2. Якщо таблиці wellness_surveys немає або виникла помилка схеми —
  // надійно зберігаємо в існуючу таблицю injury_logs під категорією 'note' із маркером [WELLNESS]
  if (directErr) {
    // Зберігаємо у відкриту універсальну структуру логів
    const logNote = `[WELLNESS] ${JSON.stringify(payload)}`;
    await supabase.from("injury_logs").insert({
      club_id: auth.user.clubId,
      injury_id: null as any,
      date: input.date,
      category: "note",
      note: logNote,
    } as any);
  }

  // Завжди зберігаємо резервний [WELLNESS_ENTRY]
  try {
    await supabase.from("injury_logs").insert({
      club_id: auth.user.clubId,
      injury_id: null as any,
      date: input.date,
      category: "examination",
      note: `[WELLNESS_ENTRY] ${JSON.stringify(wellnessEntryPayload)}`,
    } as any);
  } catch {}

  revalidatePath("/wellness");
  revalidatePath("/availability");
  revalidatePath("/");
  revalidatePath(`/players/${input.playerId}`);

  return { success: true, survey: payload };
}
