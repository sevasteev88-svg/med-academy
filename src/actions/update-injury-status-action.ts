"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertTeamStaff } from "@/lib/auth";

export async function updateInjuryStatusAction(
  injuryId: string,
  newStatus: string,
  actualReturnDate?: string
) {
  const supabase = await createClient();

  // Отримуємо травму та гравця для перевірки доступу тренера
  const { data: injury } = await supabase
    .from("injuries")
    .select("id, player_id, players(team_id)")
    .eq("id", injuryId)
    .single();

  const playerTeamId = (injury?.players as any)?.team_id || undefined;
  const auth = await assertTeamStaff(playerTeamId);
  if ("error" in auth) return { error: auth.error };

  const update: Record<string, any> = { status: newStatus };

  // Якщо закриваємо — ставимо дату повернення, якщо відкриваємо — скидаємо
  if (newStatus === "closed") {
    update.actual_return_date =
      actualReturnDate || new Date().toISOString().split("T")[0];
  } else {
    update.actual_return_date = null;
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
