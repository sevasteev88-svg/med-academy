"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type UpdateInjuryState = { error?: string };

export async function updateInjuryAction(_prev: UpdateInjuryState, formData: FormData): Promise<UpdateInjuryState> {
  const supabase = await createClient();
  const injuryId = formData.get("injuryId") as string;
  const injuryType = formData.get("injuryType") as string;
  const location = formData.get("location") as string;
  const side = formData.get("side") as string;
  const severity = formData.get("severity") as string;
  const mechanism = formData.get("mechanism") as string;
  const dateOfInjury = formData.get("dateOfInjury") as string;
  const expectedReturnDate = formData.get("expectedReturnDate") as string;
  const description = formData.get("description") as string;

  if (!injuryId || !injuryType || !location || !side || !severity || !dateOfInjury) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  const { error } = await supabase.from("injuries").update({
    injury_type: injuryType, location, side, severity,
    mechanism: mechanism || "non_contact", date_of_injury: dateOfInjury,
    expected_return_date: expectedReturnDate || null,
    description: description?.trim() || null,
  }).eq("id", injuryId);

  if (error) return { error: error.message };
  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  revalidatePath("/players");
  redirect(`/injuries/${injuryId}`);
}
