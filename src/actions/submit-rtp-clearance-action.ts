"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";

export type RtpCriteriaState = {
  // Клінічні тести
  noPalpationPain: boolean;
  fullPainfreeRom: boolean;
  noEffusionOrSwelling: boolean;

  // Силові тести (динамометрія)
  strengthDeficitLessThan10Pct: boolean;
  eccentricControlPassed: boolean;

  // Специфічні функціональні тести на полі
  maximalSprint30mPassed: boolean;
  changeOfDirectionPassed: boolean;
  fullTrainingSessionCompleted: boolean;

  // Психологічна готовність
  psychologicalReadinessPassed: boolean;

  doctorNote?: string;
};

export async function submitRtpClearanceAction(
  injuryId: string,
  criteria: RtpCriteriaState,
  closeInjuryNow: boolean
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const totalCriteria = 9;
  const passedCriteria = [
    criteria.noPalpationPain,
    criteria.fullPainfreeRom,
    criteria.noEffusionOrSwelling,
    criteria.strengthDeficitLessThan10Pct,
    criteria.eccentricControlPassed,
    criteria.maximalSprint30mPassed,
    criteria.changeOfDirectionPassed,
    criteria.fullTrainingSessionCompleted,
    criteria.psychologicalReadinessPassed,
  ].filter(Boolean).length;

  const clearancePercentage = Math.round((passedCriteria / totalCriteria) * 100);
  const isFullyCleared = passedCriteria === totalCriteria;

  // Зберігаємо протокол допуску в injury_logs
  const clearanceLog = {
    injury_id: injuryId,
    date: new Date().toISOString().split("T")[0],
    category: "examination",
    note: `[RTP_CLEARANCE] Результат допуску: ${passedCriteria}/${totalCriteria} (${clearancePercentage}%). Лікар: ${auth.user.fullName || auth.user.email}. ${criteria.doctorNote ? `Примітка: ${criteria.doctorNote}` : ""}`,
  };

  await supabase.from("injury_logs").insert(clearanceLog as any);

  // Якщо лікар підтвердив повний допуск і закриття травми
  if (closeInjuryNow) {
    const today = new Date().toISOString().split("T")[0];
    const { error: updateErr } = await supabase
      .from("injuries")
      .update({
        status: "closed",
        actual_return_date: today,
        vas_score: 0,
      })
      .eq("id", injuryId);

    if (updateErr) {
      return { error: updateErr.message };
    }
  }

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/availability");
  revalidatePath("/exams/upcoming");
  revalidatePath("/");

  return {
    success: true,
    passedCriteria,
    totalCriteria,
    clearancePercentage,
    isFullyCleared,
  };
}
