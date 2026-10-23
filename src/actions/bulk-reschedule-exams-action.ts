"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";

export async function bulkRescheduleExamsAction(
  injuryIds: string[],
  daysToAddOrTargetDate: number | string
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (!Array.isArray(injuryIds) || injuryIds.length === 0) {
    return { error: "Не вибрано жодного огляду для перенесення" };
  }

  let nextExamDate: string;
  if (typeof daysToAddOrTargetDate === "number") {
    nextExamDate = new Date(Date.now() + daysToAddOrTargetDate * 86400000)
      .toISOString()
      .split("T")[0];
  } else if (typeof daysToAddOrTargetDate === "string" && daysToAddOrTargetDate.trim()) {
    nextExamDate = daysToAddOrTargetDate.trim();
  } else {
    // За замовчуванням — на завтра (+1 день)
    nextExamDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("injuries")
    .update({ next_exam_date: nextExamDate })
    .in("id", injuryIds);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/exams/upcoming");
  revalidatePath("/");
  revalidatePath("/availability");
  revalidatePath("/injuries");

  return { success: true, count: injuryIds.length, nextExamDate };
}
