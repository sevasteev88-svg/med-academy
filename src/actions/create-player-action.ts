"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CreatePlayerState = {
  error?: string;
  success?: boolean;
};

export async function createPlayerAction(
  _prev: CreatePlayerState,
  formData: FormData
): Promise<CreatePlayerState> {
  const supabase = await createClient();

  const teamId = formData.get("teamId") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const dateOfBirth = formData.get("dateOfBirth") as string;
  const sex = formData.get("sex") as string;
  const position = formData.get("position") as string;
  const dominantLeg = formData.get("dominantLeg") as string;
  const dominantArm = formData.get("dominantArm") as string;

  if (!teamId || !firstName || !lastName || !dateOfBirth || !position) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  const { error } = await supabase.from("players").insert({
    team_id: teamId,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    date_of_birth: dateOfBirth,
    sex: sex === "female" ? "female" : "male",
    position,
    dominant_leg: dominantLeg || "right",
    dominant_arm: dominantArm || "right",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/players");
  revalidatePath("/");
  redirect("/players");
}
