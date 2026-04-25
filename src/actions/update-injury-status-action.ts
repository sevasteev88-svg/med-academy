"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateInjuryStatusAction(
  injuryId: string,
  newStatus: string,
  actualReturnDate?: string
) {
  const supabase = await createClient();

  const update: Record<string, any> = { status: newStatus };

  // Якщо закриваємо — ставимо дату повернення
  if (newStatus === "closed") {
    update.actual_return_date =
      actualReturnDate || new Date().toISOString().split("T")[0];
  }

  const { error } = await supabase
    .from("injuries")
    .update(update)
    .eq("id", injuryId);

  if (error) return { error: error.message };

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  revalidatePath("/players");
  return { success: true };
}
