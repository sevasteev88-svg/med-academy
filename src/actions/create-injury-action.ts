"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CreateInjuryState = {
  error?: string;
};

export async function createInjuryAction(
  _prev: CreateInjuryState,
  formData: FormData
): Promise<CreateInjuryState> {
  const supabase = await createClient();

  const playerId = formData.get("playerId") as string;
  const injuryType = formData.get("injuryType") as string;
  const location = formData.get("location") as string;
  const side = formData.get("side") as string;
  const severity = formData.get("severity") as string;
  const mechanism = formData.get("mechanism") as string;
  const vasScore = Number(formData.get("vasScore"));
  const dateOfInjury = formData.get("dateOfInjury") as string;
  const expectedReturnDate = formData.get("expectedReturnDate") as string;
  const description = formData.get("description") as string;

  if (!playerId || !injuryType || !location || !side || !severity || !dateOfInjury) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  const { data, error } = await supabase
    .from("injuries")
    .insert({
      player_id: playerId,
      injury_type: injuryType,
      location,
      side,
      severity,
      mechanism: mechanism || "non_contact",
      vas_score: vasScore,
      date_of_injury: dateOfInjury,
      expected_return_date: expectedReturnDate || null,
      description: description?.trim() || null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/players");
  redirect(`/injuries/${data.id}`);
}
