"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor, assertPlayerAccess } from "@/lib/auth";
import { hasConsent } from "@/lib/consents";
import type { PlayerPhoto } from "@/types/photo";

export async function savePlayerPhotoAction(input: {
  playerId: string;
  photoUrl: string; // Base64 data URL
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const access = await assertPlayerAccess(auth.user, input.playerId, {
    allowCoach: false,
  });
  if ("error" in access) return { error: access.error };

  const clubId = access.player.club_id || auth.user.clubId;

  const allowed = await hasConsent(input.playerId, "photo");
  if (!allowed) {
    return { error: "Потрібна згода батьків (область: Фото профілю)." };
  }

  const supabase = await createClient();

  const photoRecord: PlayerPhoto = {
    id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    player_id: input.playerId,
    photo_url: input.photoUrl,
    uploaded_at: new Date().toISOString(),
  };

  const payload = `[PLAYER_PHOTO] ${JSON.stringify(photoRecord)}`;

  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", input.playerId)
    .eq("club_id", clubId)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  const targetInjuryId: string | null = existingInj?.[0]?.id ?? null;

  const { error } = await supabase.from("injury_logs").insert({
    club_id: clubId,
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
