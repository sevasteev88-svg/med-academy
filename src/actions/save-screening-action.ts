"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  type PreSeasonScreening,
  calcFootballSeason,
  SCREENING_RANGES,
} from "@/types/screening";

export async function saveScreeningAction(
  screeningData: Omit<PreSeasonScreening, "id" | "created_at">
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  // 1. Обов'язкова валідація основних полів
  if (!screeningData.date || !screeningData.date.trim()) {
    return { error: "Вкажіть дату проведення скринінгу." };
  }

  if (!screeningData.examiner_doctor || !screeningData.examiner_doctor.trim()) {
    return { error: "Вкажіть П.І.Б. лікаря / комісії, що проводили огляд." };
  }

  if (!screeningData.overall_status) {
    return { error: "Оберіть статус допуску за результатами скринінгу." };
  }

  // Висновок обов'язковий (або restrictions_notes, або для non-cleared статусів обов'язковий коментар)
  const conclusionText = screeningData.restrictions_notes?.trim();
  if (!conclusionText) {
    return { error: "Вкажіть медичний висновок лікаря (поле «Обмеження / Висновок лікаря»)." };
  }

  // 2. Валідація фізіологічних діапазонів (якщо поля заповнені)
  const errors: string[] = [];

  const { bpSystolic, bpDiastolic, hrRest, wblt, hamstrings, beighton, hemoglobin, ferritin, vitaminD } = SCREENING_RANGES;

  if (screeningData.cardio_bp_systolic != null) {
    if (screeningData.cardio_bp_systolic < bpSystolic.min || screeningData.cardio_bp_systolic > bpSystolic.max) {
      errors.push(`Систолічний АТ повинен бути в діапазоні ${bpSystolic.min}–${bpSystolic.max} мм рт. ст.`);
    }
  }

  if (screeningData.cardio_bp_diastolic != null) {
    if (screeningData.cardio_bp_diastolic < bpDiastolic.min || screeningData.cardio_bp_diastolic > bpDiastolic.max) {
      errors.push(`Діастолічний АТ повинен бути в діапазоні ${bpDiastolic.min}–${bpDiastolic.max} мм рт. ст.`);
    }
    if (
      screeningData.cardio_bp_systolic != null &&
      screeningData.cardio_bp_diastolic >= screeningData.cardio_bp_systolic
    ) {
      errors.push("Діастолічний АТ не може бути більшим або рівним систолічному.");
    }
  }

  if (screeningData.cardio_hr_rest != null) {
    if (screeningData.cardio_hr_rest < hrRest.min || screeningData.cardio_hr_rest > hrRest.max) {
      errors.push(`Пульс спокою повинен бути в діапазоні ${hrRest.min}–${hrRest.max} уд/хв.`);
    }
  }

  if (screeningData.ortho_ankle_lunge_wblt_left != null) {
    if (screeningData.ortho_ankle_lunge_wblt_left < wblt.min || screeningData.ortho_ankle_lunge_wblt_left > wblt.max) {
      errors.push(`WBLT лівого гомілкостопа повинен бути в межах ${wblt.min}–${wblt.max} см.`);
    }
  }

  if (screeningData.ortho_ankle_lunge_wblt_right != null) {
    if (screeningData.ortho_ankle_lunge_wblt_right < wblt.min || screeningData.ortho_ankle_lunge_wblt_right > wblt.max) {
      errors.push(`WBLT правого гомілкостопа повинен бути в межах ${wblt.min}–${wblt.max} см.`);
    }
  }

  if (screeningData.ortho_hamstrings_90_90_left != null) {
    if (screeningData.ortho_hamstrings_90_90_left < hamstrings.min || screeningData.ortho_hamstrings_90_90_left > hamstrings.max) {
      errors.push(`Кут дефіциту hamstrings (ліва) повинен бути в межах ${hamstrings.min}–${hamstrings.max}°.`);
    }
  }

  if (screeningData.ortho_hamstrings_90_90_right != null) {
    if (screeningData.ortho_hamstrings_90_90_right < hamstrings.min || screeningData.ortho_hamstrings_90_90_right > hamstrings.max) {
      errors.push(`Кут дефіциту hamstrings (права) повинен бути в межах ${hamstrings.min}–${hamstrings.max}°.`);
    }
  }

  if (screeningData.ortho_beighton_hypermobility_score != null) {
    if (screeningData.ortho_beighton_hypermobility_score < beighton.min || screeningData.ortho_beighton_hypermobility_score > beighton.max) {
      errors.push(`Шкала Бейтона повинна бути в діапазоні ${beighton.min}–${beighton.max} балів.`);
    }
  }

  if (screeningData.lab_hemoglobin != null) {
    if (screeningData.lab_hemoglobin < hemoglobin.min || screeningData.lab_hemoglobin > hemoglobin.max) {
      errors.push(`Гемоглобін повинен бути в діапазоні ${hemoglobin.min}–${hemoglobin.max} г/л.`);
    }
  }

  if (screeningData.lab_ferritin != null) {
    if (screeningData.lab_ferritin < ferritin.min || screeningData.lab_ferritin > ferritin.max) {
      errors.push(`Феритин повинен бути в діапазоні ${ferritin.min}–${ferritin.max} нг/мл.`);
    }
  }

  if (screeningData.lab_vitamin_d != null) {
    if (screeningData.lab_vitamin_d < vitaminD.min || screeningData.lab_vitamin_d > vitaminD.max) {
      errors.push(`Вітамін D повинен бути в діапазоні ${vitaminD.min}–${vitaminD.max} нг/мл.`);
    }
  }

  if (errors.length > 0) {
    return { error: errors.join(" ") };
  }

  // 3. Автоматичний сезон від дати (початок 1 липня)
  const computedSeason = calcFootballSeason(screeningData.date);

  const supabase = await createClient();

  const record: PreSeasonScreening = {
    ...screeningData,
    season: computedSeason,
    examiner_doctor: screeningData.examiner_doctor.trim(),
    restrictions_notes: conclusionText,
    id: `ppe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };

  const payload = `[SCREENING] ${JSON.stringify(record)}`;

  // Отримуємо або створюємо системний запис у injuries для уникнення порушення NOT NULL constraint
  let targetInjuryId: string | null = null;
  const { data: activeInjuries } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", record.player_id)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (activeInjuries && activeInjuries.length > 0) {
    targetInjuryId = activeInjuries[0].id;
  } else {
    const { data: newInjury, error: createInjErr } = await supabase
      .from("injuries")
      .insert({
        club_id: auth.user.clubId,
        player_id: record.player_id,
        date_of_injury: record.date,
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Передсезонний скринінг / Медогляд",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (!createInjErr && newInjury) {
      targetInjuryId = newInjury.id;
    }
  }

  // Зберігаємо у відкриту категорію логів
  const { error } = await supabase.from("injury_logs").insert({
    club_id: auth.user.clubId,
    injury_id: targetInjuryId,
    date: record.date,
    category: "examination",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  await logAudit({
    action: "save_screening",
    entity: "screening",
    entityId: record.id,
    playerId: record.player_id,
    meta: {
      date: record.date,
      season: record.season,
      overall_status: record.overall_status,
      ecg: record.cardio_ecg_rest,
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath(`/players/${record.player_id}`);
  revalidatePath("/players");
  revalidatePath("/availability");
  revalidatePath("/reports/matchday");
  revalidatePath("/coach-briefing");

  return { success: true, screening: record };
}
