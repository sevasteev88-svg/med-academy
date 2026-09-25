"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";

export async function rescheduleExamAction(injuryId: string, nextExamDate: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (!injuryId || !nextExamDate) {
    return { error: "Необхідно вказати травму та нову дату огляду" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("injuries")
    .update({ next_exam_date: nextExamDate })
    .eq("id", injuryId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/exams/upcoming");
  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  revalidatePath("/availability");

  return { success: true };
}
