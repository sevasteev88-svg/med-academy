"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor, assertPlayerAccess, assertTeamAccess } from "@/lib/auth";
import { normalizePosition, toDbPositionEn } from "@/lib/dictionaries";

export type UpdatePlayerState = {
  error?: string;
};

export async function updatePlayerAction(
  _prev: UpdatePlayerState,
  formData: FormData
): Promise<UpdatePlayerState> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const playerId = formData.get("playerId") as string;
  const teamId = formData.get("teamId") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const dateOfBirth = formData.get("dateOfBirth") as string;
  const sex = formData.get("sex") as string;
  const position = formData.get("position") as string;
  const dominantLeg = formData.get("dominantLeg") as string;
  const dominantArm = formData.get("dominantArm") as string;

  if (!playerId || !teamId || !firstName || !lastName || !dateOfBirth || !position) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  const playerAccess = await assertPlayerAccess(auth.user, playerId, { allowCoach: false });
  if ("error" in playerAccess) return { error: playerAccess.error };

  const teamAccess = await assertTeamAccess(auth.user, teamId, { allowCoach: false });
  if ("error" in teamAccess) return { error: teamAccess.error };

  const baseUpdate = {
    team_id: teamId,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    date_of_birth: dateOfBirth,
    sex: sex === "female" ? "female" : "male",
    dominant_leg: dominantLeg || "right",
    dominant_arm: dominantArm || "right",
  };

  let { error } = await supabase
    .from("players")
    .update({ ...baseUpdate, position: toDbPositionEn(position) })
    .eq("id", playerId)
    .eq("club_id", auth.user.clubId);

  if (error?.message?.includes("chk_player_canonical_position")) {
    const retry = await supabase
      .from("players")
      .update({ ...baseUpdate, position: normalizePosition(position) })
      .eq("id", playerId)
      .eq("club_id", auth.user.clubId);
    error = retry.error;
  }

  if (error) return { error: error.message };

  // Оновлюємо / додаємо первинний анамнез, якщо заповнено
  const jerseyNumber = formData.get("jerseyNumber") as string | null;
  const phone = formData.get("phone") as string | null;
  const bloodType = formData.get("bloodType") as string | null;
  const allergies = formData.get("allergies") as string | null;
  const pastInjuries = formData.get("pastInjuries") as string | null;

  const hasAnamnesis =
    Boolean(jerseyNumber?.trim()) ||
    Boolean(phone?.trim()) ||
    Boolean(bloodType?.trim()) ||
    Boolean(allergies?.trim()) ||
    Boolean(pastInjuries?.trim());

  if (hasAnamnesis) {
    const anamnesisPayload = {
      player_id: playerId,
      jersey_number: jerseyNumber?.trim() || null,
      phone: phone?.trim() || null,
      blood_type: bloodType?.trim() || null,
      allergies: allergies?.trim() || null,
      past_injuries: pastInjuries?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      await supabase.from("player_anamnesis").insert({
        club_id: auth.user.clubId,
        player_id: playerId,
        date: new Date().toISOString().split("T")[0],
        jersey_number: anamnesisPayload.jersey_number,
        phone: anamnesisPayload.phone,
        blood_type: anamnesisPayload.blood_type,
        allergies: anamnesisPayload.allergies,
        past_injuries: anamnesisPayload.past_injuries,
        data: anamnesisPayload,
      } as any);
    } catch (e) {
      console.warn("Помилка оновлення анамнезу:", e);
    }
  }

  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  redirect(`/players/${playerId}`);
}
