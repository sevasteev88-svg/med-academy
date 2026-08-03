"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type AddExamState = { error?: string; success?: boolean };

export async function addExaminationAction(
  _prev: AddExamState,
  formData: FormData
): Promise<AddExamState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Не авторизовано" };

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

  // Дії над травмою (не частина огляду)
  const newStatus = formData.get("newStatus") as string;
  const nextExamDate = formData.get("nextExamDate") as string;

  if (!injuryId || !date) return { error: "Заповніть обов'язкові поля" };

  // 1. Зберігаємо структурований огляд
  const { error: examErr } = await supabase.from("injury_examinations").insert({
    injury_id: injuryId,
    date,
    vas_score: vasScore,
    edema: edema || "none",
    hematoma: hematoma || "none",
    rom: rom || "full",
    palpation_pain: palpationPain || "none",
    muscle_tone: muscleTone || "normal",
    objective_note: objectiveNote || null,
    subjective_note: subjectiveNote || null,
  });

  if (examErr) return { error: examErr.message };

  // 2. Оновлюємо травму: поточний ВАШ, статус, дата повернення
  const injuryUpdate: Record<string, unknown> = { vas_score: vasScore };
  if (newStatus) {
    injuryUpdate.status = newStatus;
    if (newStatus === "closed") {
      injuryUpdate.actual_return_date = new Date().toISOString().split("T")[0];
    }
  }
  if (nextExamDate) {
    injuryUpdate.next_exam_date = nextExamDate;
  }

  await supabase.from("injuries").update(injuryUpdate).eq("id", injuryId);

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/injuries");
  revalidatePath("/");
  return { success: true };
}
