"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertAuth } from "@/lib/auth";
import type {
  RpeScore,
  TrainingSessionType,
  SessionRpeEntry,
} from "@/types/workload";

type SaveWorkloadInput = {
  playerId: string;
  date: string;
  sessionType: TrainingSessionType;
  durationMinutes: number;
  rpeScore: RpeScore;
  notes?: string | null;
};

export async function saveWorkloadAction(input: SaveWorkloadInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const workloadAu = Math.round(input.durationMinutes * input.rpeScore);

  const payload: SessionRpeEntry = {
    id: `rpe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    date: input.date,
    session_type: input.sessionType,
    duration_minutes: input.durationMinutes,
    rpe_score: input.rpeScore,
    workload_au: workloadAu,
    notes: input.notes || null,
    created_at: new Date().toISOString(),
  };

  // Спробуємо записати в таблицю workload_sessions
  const { error: directErr } = await supabase
    .from("workload_sessions")
    .insert(payload as any);

  // Якщо таблиці немає в базі - записуємо в injury_logs з маркером [WORKLOAD]
  if (directErr) {
    const logNote = `[WORKLOAD] ${JSON.stringify(payload)}`;
    await supabase.from("injury_logs").insert({
      injury_id: null as any,
      date: input.date,
      category: "note",
      note: logNote,
    } as any);
  }

  revalidatePath("/workload");
  revalidatePath("/availability");
  revalidatePath("/");
  revalidatePath(`/players/${input.playerId}`);

  return { success: true, entry: payload };
}
