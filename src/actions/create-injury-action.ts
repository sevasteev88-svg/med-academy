"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  InjuryLocation,
  InjuryMechanism,
  InjurySeverity,
  InjurySide,
  InjuryType,
} from "@/types/database";

export type CreateInjuryState = {
  error?: string;
  success?: boolean;
};

type CreateInjuryInput = {
  playerId: string;
  injuryType: InjuryType;
  location: InjuryLocation;
  side: InjurySide;
  severity: InjurySeverity;
  mechanism: InjuryMechanism;
  dateOfInjury: string;
  expectedReturnDate?: string;
  description?: string;
};

async function insertInjury(input: CreateInjuryInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data, error } = await supabase
    .from("injuries")
    .insert({
      player_id: input.playerId,
      injury_type: input.injuryType,
      location: input.location,
      side: input.side,
      severity: input.severity,
      mechanism: input.mechanism,
      date_of_injury: input.dateOfInjury,
      expected_return_date: input.expectedReturnDate ?? null,
      description: input.description ?? null,
      status: "active",
      // Класифікація (MLG-R/BAMIC/Munich) додається окремо через
      // класифікатор у картці травми — classify-injury-action.
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/injuries", "page");
  revalidatePath("/players/[id]", "page");
  revalidatePath("/", "page");

  return { data };
}

export async function createInjury(input: CreateInjuryInput) {
  return insertInjury(input);
}

export async function createInjuryAction(
  _state: CreateInjuryState,
  formData: FormData
): Promise<CreateInjuryState> {
  const playerId = formData.get("playerId") as string;
  const injuryType = formData.get("injuryType") as InjuryType;
  const location = formData.get("location") as InjuryLocation;
  const side = (formData.get("side") as InjurySide) ?? "left";
  const severity = formData.get("severity") as InjurySeverity;
  const mechanism = (formData.get("mechanism") as InjuryMechanism) ?? "non_contact";
  const dateOfInjury = formData.get("dateOfInjury") as string;
  const expectedReturnDate = (formData.get("expectedReturnDate") as string) || undefined;
  const description = (formData.get("description") as string) || undefined;

  if (!playerId || !injuryType || !location || !severity || !dateOfInjury) {
    return { error: "Заповніть усі обов'язкові поля" };
  }

  const result = await insertInjury({
    playerId, injuryType, location, side, severity, mechanism,
    dateOfInjury, expectedReturnDate, description,
  });

  if ("error" in result && result.error) return { error: result.error };
  return { success: true };
}
