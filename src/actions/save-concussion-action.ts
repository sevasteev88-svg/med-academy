"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { ConcussionAssessment } from "@/types/concussion";

export async function saveConcussionAction(
  input: Omit<ConcussionAssessment, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const record: ConcussionAssessment = {
    ...input,
    id: `scat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[CONCUSSION] ${JSON.stringify(record)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: input.injury_id,
    date: input.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/injuries/${input.injury_id}`);

  return { success: true, assessment: record };
}
