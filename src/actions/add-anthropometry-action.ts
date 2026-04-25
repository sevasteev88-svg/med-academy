"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type AddAnthroState = {
  error?: string;
  success?: boolean;
};

export async function addAnthropometryAction(
  _prev: AddAnthroState,
  formData: FormData
): Promise<AddAnthroState> {
  const supabase = await createClient();

  const playerId = formData.get("playerId") as string;
  const date = formData.get("date") as string;
  const height = parseFloat(formData.get("height") as string);
  const weight = parseFloat(formData.get("weight") as string);

  if (!playerId || !date || isNaN(height) || isNaN(weight)) {
    return { error: "Заповніть всі поля коректно" };
  }

  if (height < 100 || height > 220) {
    return { error: "Зріст має бути між 100 та 220 см" };
  }

  if (weight < 30 || weight > 150) {
    return { error: "Вага має бути між 30 та 150 кг" };
  }

  const { error } = await supabase.from("anthropometry_logs").insert({
    player_id: playerId,
    date,
    height,
    weight,
  });

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);
  return { success: true };
}
