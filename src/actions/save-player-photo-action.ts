"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { PlayerPhoto } from "@/types/photo";

export async function savePlayerPhotoAction(input: {
  playerId: string;
  photoUrl: string; // Base64 data URL
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const photoRecord: PlayerPhoto = {
    id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    photo_url: input.photoUrl,
    uploaded_at: new Date().toISOString(),
  };

  const payload = `[PLAYER_PHOTO] ${JSON.stringify(photoRecord)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: new Date().toISOString().split("T")[0],
    category: "note",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath(`/players`);
  revalidatePath(`/availability`);

  return { success: true, photo: photoRecord };
}
