"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  calculateCombinedRtp,
  isBamicTJunctionRisk,
} from "@/lib/rtp-calculator";
import type {
  BamicGrade,
  BamicLocation,
  ClassificationSystem,
  InjuryLocation,
  InjuryMechanism,
  InjurySeverity,
  InjurySide,
  InjuryType,
  MunichGrade,
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
  classificationSystem?: ClassificationSystem;
  munichGrade?: MunichGrade | null;
  bamicGrade?: BamicGrade | null;
  bamicLocation?: BamicLocation | null;
};

async function insertInjury(input: CreateInjuryInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const rtpPrediction = calculateCombinedRtp({
    munichGrade: input.munichGrade,
    bamicGrade: input.bamicGrade,
    bamicLocation: input.bamicLocation,
  });

  const isCriticalTJunction =
    input.bamicGrade != null &&
    input.bamicLocation != null &&
    isBamicTJunctionRisk(input.bamicGrade, input.bamicLocation);

  const { data, error } = await supabase
    .from("injuries")
    .insert({
      player_id: input.playerId,
      injury_type: input.injuryType,
      location: input.location,
      side: input.side,
      severity: isCriticalTJunction && input.severity !== "career_threatening" ? "severe" : input.severity,
      mechanism: input.mechanism,
      date_of_injury: input.dateOfInjury,
      expected_return_date: input.expectedReturnDate ?? null,
      description: input.description ?? null,
      status: "active",
      classification_system: input.classificationSystem ?? "none",
      munich_grade: input.munichGrade ?? null,
      bamic_grade: input.bamicGrade ?? null,
      bamic_location: input.bamicLocation ?? null,
      rtp_prediction: rtpPrediction ?? null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/[locale]/injuries", "page");
  revalidatePath("/[locale]/players/[id]", "page");
  revalidatePath("/injuries", "page");
  revalidatePath("/players/[id]", "page");

  return { data, rtpPrediction, isCriticalTJunction };
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
    classificationSystem: "none",
  });

  if ("error" in result && result.error) return { error: result.error };
  return { success: true };
}
