"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";

export async function updateVasAction(injuryId: string, newVas: number) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { error } = await supabase
    .from("injuries")
    .update({ vas_score: newVas })
    .eq("id", injuryId);

  if (error) return { error: error.message };

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/availability");
  return { success: true };
}
