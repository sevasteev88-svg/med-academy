"use server";
// src/actions/classify-injury-action.ts
// Збереження детальної класифікації травми (MLG-R + BAMIC + Munich) у нові колонки.

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  MlgrMuscle, MlgrMechanism, MlgrLocation, MlgrGrade,
  BamicGrade, BamicLocation, MunichType, RtpRisk,
} from "@/types/database";

// Те, що повертає компонент класифікатора
export type ClassifyInjuryInput = {
  injuryId: string;
  dateOfInjury: string; // ISO, для розрахунку expected_return_date

  // MLG-R
  mlgrMuscle: MlgrMuscle | "";
  mlgrMechanism: MlgrMechanism | "";
  mlgrLocation: MlgrLocation | "";
  mlgrGrade: MlgrGrade | null;
  mlgrHasR: boolean;
  mlgrCsaPct: number | null;
  mlgrReinjury: number;
  mlgrCode: string | null;

  // BAMIC
  bamicGrade: string;       // "0a".."4" або ""
  bamicLocation: BamicLocation | "";
  bamicCode: string | null;

  // Munich
  munichType: MunichType | "";

  // RTP
  rtpMinDays: number | null;
  rtpMaxDays: number | null;
  rtpRisk: RtpRisk | null;
};

export type ClassifyInjuryState = { error?: string; success?: boolean };

// BAMIC grade у БД — smallint (0-4). Витягуємо число з "2c"-подібних ключів.
function bamicGradeToSmallint(bamicGrade: string): BamicGrade | null {
  if (!bamicGrade) return null;
  // "0a","0b" → 0; "1".."4" → число
  const num = parseInt(bamicGrade, 10);
  if (isNaN(num)) return null;
  if (num < 0 || num > 4) return null;
  return num as BamicGrade;
}

export async function classifyInjury(
  input: ClassifyInjuryInput
): Promise<ClassifyInjuryState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Не авторизовано" };

  // Розрахунок очікуваної дати повернення (від дати травми + min днів RTP)
  let expectedReturnDate: string | null = null;
  if (input.rtpMinDays != null && input.dateOfInjury) {
    const d = new Date(input.dateOfInjury);
    d.setDate(d.getDate() + input.rtpMinDays);
    expectedReturnDate = d.toISOString().split("T")[0];
  }

  const updatePayload: Record<string, unknown> = {
    // MLG-R
    mlgr_muscle:    input.mlgrMuscle || null,
    mlgr_mechanism: input.mlgrMechanism || null,
    mlgr_location:  input.mlgrLocation || null,
    mlgr_grade:     input.mlgrGrade,
    mlgr_has_r:     input.mlgrHasR,
    mlgr_csa_pct:   input.mlgrCsaPct,
    mlgr_reinjury:  input.mlgrReinjury,
    mlgr_code:      input.mlgrCode,

    // BAMIC
    bamic_grade:    bamicGradeToSmallint(input.bamicGrade),
    bamic_location: input.bamicLocation || null,
    bamic_code:     input.bamicCode,

    // Munich
    munich_type:    input.munichType || null,

    // RTP
    rtp_min_days:   input.rtpMinDays,
    rtp_max_days:   input.rtpMaxDays,
    rtp_risk:       input.rtpRisk,

    // Прапорець
    is_classified:  true,
  };

  // Оновлюємо expected_return_date лише якщо порахували
  if (expectedReturnDate) {
    updatePayload.expected_return_date = expectedReturnDate;
  }

  const { error } = await supabase
    .from("injuries")
    .update(updatePayload)
    .eq("id", input.injuryId);

  if (error) return { error: error.message };

  revalidatePath(`/injuries/${input.injuryId}`);
  revalidatePath("/injuries");
  revalidatePath("/");

  return { success: true };
}
