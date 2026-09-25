"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor } from "@/lib/auth";

export async function deletePlayerAction(playerId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) return { error: error.message };
  revalidatePath("/players");
  revalidatePath("/");
  revalidatePath("/availability");
  redirect("/players");
}
