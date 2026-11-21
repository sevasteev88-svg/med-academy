"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertDoctor, assertPlayerAccess } from "@/lib/auth";
import { hasConsent } from "@/lib/consents";
import {
  PLAYER_PHOTOS_BUCKET,
  parseDataUrlImage,
  formatStoragePhotoRef,
} from "@/lib/player-photo-utils";
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

  const parsed = parseDataUrlImage(input.photoUrl);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const uploadedAt = new Date().toISOString();

  // 1. Основний шлях: приватний Supabase Storage (player-photos) + players.photo_url
  try {
    const admin = createAdminClient();
    const storagePath = `${clubId}/${input.playerId}/avatar.${parsed.ext}`;

    const { error: uploadErr } = await admin.storage
      .from(PLAYER_PHOTOS_BUCKET)
      .upload(storagePath, parsed.buffer, {
        contentType: parsed.mimeType,
        upsert: true,
      });

    if (!uploadErr) {
      const storageRef = formatStoragePhotoRef(storagePath);
      const { error: updateErr } = await admin
        .from("players")
        .update({ photo_url: storageRef } as any)
        .eq("id", input.playerId)
        .eq("club_id", clubId);

      if (!updateErr) {
        const { data: signedData } = await admin.storage
          .from(PLAYER_PHOTOS_BUCKET)
          .createSignedUrl(storagePath, 3600);

        revalidatePath(`/players/${input.playerId}`);
        revalidatePath(`/players`);
        revalidatePath(`/availability`);
        revalidatePath(`/rtp`);

        return {
          success: true,
          photo: {
            id: photoId,
            player_id: input.playerId,
            photo_url: signedData?.signedUrl || input.photoUrl,
            uploaded_at: uploadedAt,
          } satisfies PlayerPhoto,
        };
      }
    }
  } catch (err) {
    console.warn("[savePlayerPhotoAction] Storage/players.photo_url fallback to injury_logs:", err);
  }

  // 2. Fallback якщо міграцію 20261121160000 ще не застосовано в Supabase
  const supabase = await createClient();

  const photoRecord: PlayerPhoto = {
    id: photoId,
    player_id: input.playerId,
    photo_url: input.photoUrl,
    uploaded_at: uploadedAt,
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
  revalidatePath(`/rtp`);

  return { success: true, photo: photoRecord };
}
