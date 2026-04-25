"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type AddLogState = { error?: string; success?: boolean };

export async function addInjuryLogAction(_prev: AddLogState, formData: FormData): Promise<AddLogState> {
  const supabase = await createClient();
  const injuryId = formData.get("injuryId") as string;
  const note = (formData.get("note") as string)?.trim();
  const date = formData.get("date") as string;
  const category = (formData.get("category") as string) || "note";
  if (!injuryId || !note) return { error: "Введіть текст запису" };
  const { error } = await supabase.from("injury_logs").insert({
    injury_id: injuryId, note, date: date || new Date().toISOString().split("T")[0], category,
  });
  if (error) return { error: error.message };
  revalidatePath(`/injuries/${injuryId}`);
  return { success: true };
}
