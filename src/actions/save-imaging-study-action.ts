"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";

export type ImagingStudy = {
  id: string;
  injury_id: string;
  modality: "mri" | "ultrasound" | "xray" | "ct";
  date: string;
  facility: string; // e.g., "Клініка Св. Катерини", "Інто-Сана", "Медичний центр ФК"
  radiologist_conclusion: string;
  image_url?: string | null;
  created_at: string;
};

export async function saveImagingStudyAction(input: {
  injuryId: string;
  modality: "mri" | "ultrasound" | "xray" | "ct";
  date: string;
  facility: string;
  radiologistConclusion: string;
  imageUrl?: string | null;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const study: ImagingStudy = {
    id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    injury_id: input.injuryId,
    modality: input.modality,
    date: input.date,
    facility: input.facility,
    radiologist_conclusion: input.radiologistConclusion,
    image_url: input.imageUrl || null,
    created_at: new Date().toISOString(),
  };

  const payload = `[IMAGING] ${JSON.stringify(study)}`;

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: input.injuryId,
    date: input.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath(`/injuries/${input.injuryId}`);
  return { success: true, study };
}
