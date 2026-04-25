"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { REHAB_TEMPLATE } from "@/lib/constants";

export async function createRehabPhasesFromTemplate(injuryId: string) {
  const supabase = await createClient();
  const phases = REHAB_TEMPLATE.map((name, i) => ({
    injury_id: injuryId, name, sort_order: i,
    status: i === 0 ? "in_progress" : "planned",
    started_at: i === 0 ? new Date().toISOString().split("T")[0] : null,
  }));
  const { error } = await supabase.from("rehab_phases").insert(phases);
  if (error) return { error: error.message };
  revalidatePath(`/injuries/${injuryId}`);
  return { success: true };
}

export async function addCustomRehabPhase(injuryId: string, name: string, afterOrder: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("rehab_phases").insert({
    injury_id: injuryId, name: name.trim(), sort_order: afterOrder + 1, status: "planned",
  });
  if (error) return { error: error.message };
  revalidatePath(`/injuries/${injuryId}`);
  return { success: true };
}

export async function updateRehabPhaseStatus(phaseId: string, newStatus: string, injuryId: string) {
  const supabase = await createClient();
  const update: Record<string, any> = { status: newStatus };
  const today = new Date().toISOString().split("T")[0];
  if (newStatus === "in_progress") update.started_at = today;
  if (newStatus === "completed") update.completed_at = today;
  const { error } = await supabase.from("rehab_phases").update(update).eq("id", phaseId);
  if (error) return { error: error.message };
  revalidatePath(`/injuries/${injuryId}`);
  return { success: true };
}
