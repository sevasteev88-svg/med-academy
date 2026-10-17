"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function deleteInjuryAction(injuryId: string, playerId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from("injuries").delete().eq("id", injuryId);
  if (error) return { error: error.message };

  await logAudit({
    action: "delete_injury",
    entity: "injury",
    entityId: injuryId,
    playerId,
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}`);
}
