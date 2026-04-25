"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type AddExamState = { error?: string; success?: boolean };

export async function addExaminationAction(_prev: AddExamState, formData: FormData): Promise<AddExamState> {
  const supabase = await createClient();
  const injuryId = formData.get("injuryId") as string;
  const date = formData.get("date") as string;
  const vasScore = Number(formData.get("vasScore"));
  const edema = formData.get("edema") as string;
  const hematoma = formData.get("hematoma") as string;
  const rom = formData.get("rom") as string;
  const palpationPain = formData.get("palpationPain") as string;
  const muscleTone = formData.get("muscleTone") as string;
  const objectiveNote = (formData.get("objectiveNote") as string)?.trim();
  const subjectiveNote = (formData.get("subjectiveNote") as string)?.trim();

  if (!injuryId || !date) return { error: "Заповніть обов'язкові поля" };

  const { error } = await supabase.from("injury_examinations").insert({
    injury_id: injuryId, date, vas_score: vasScore,
    edema: edema || "none", hematoma: hematoma || "none", rom: rom || "full",
    palpation_pain: palpationPain || "none", muscle_tone: muscleTone || "normal",
    objective_note: objectiveNote || null, subjective_note: subjectiveNote || null,
  });
  if (error) return { error: error.message };

  await supabase.from("injuries").update({ vas_score: vasScore }).eq("id", injuryId);
  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  return { success: true };
}
