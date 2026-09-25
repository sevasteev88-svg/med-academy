"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor } from "@/lib/auth";

export async function deleteInjuryAction(injuryId: string, playerId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from("injuries").delete().eq("id", injuryId);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}`);
}
