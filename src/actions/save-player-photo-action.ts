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

  // Отримуємо або створюємо системний запис травми для зв'язку
  let targetInjuryId: string | null = null;
  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", input.playerId)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (existingInj && existingInj.length > 0) {
    targetInjuryId = existingInj[0].id;
  } else {
    const { data: newInj } = await supabase
      .from("injuries")
      .insert({
        player_id: input.playerId,
        date_of_injury: new Date().toISOString().split("T")[0],
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Фото профілю гравця",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (newInj) targetInjuryId = newInj.id;
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
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
