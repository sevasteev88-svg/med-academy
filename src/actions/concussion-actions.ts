"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import {
  type ConcussionCase,
  type ConcussionBaseline,
  type ConcussionStageNumber,
  type ConcussionMechanism,
  type RedFlagItem,
  validateStageTransition,
} from "@/types/concussion";

/**
 * 1. Створення передсезонного бейзлайну (Baseline SCAT6)
 */
export async function createConcussionBaselineAction(input: {
  player_id: string;
  season: string;
  date: string;
  examiner_doctor: string;
  baseline_symptoms_count: number;
  baseline_severity_score: number;
  baseline_sac_score: number;
  baseline_bess_errors: number;
  notes?: string;
}): Promise<{ success?: boolean; baseline?: ConcussionBaseline; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("concussion_baselines")
    .insert({
      club_id: auth.profile.club_id,
      player_id: input.player_id,
      season: input.season,
      date: input.date,
      examiner_doctor: input.examiner_doctor,
      baseline_symptoms_count: input.baseline_symptoms_count,
      baseline_severity_score: input.baseline_severity_score,
      baseline_sac_score: input.baseline_sac_score,
      baseline_bess_errors: input.baseline_bess_errors,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/players/${input.player_id}`);
  return { success: true, baseline: data as ConcussionBaseline };
}

/**
 * 2. Отримання останнього бейзлайну гравця
 */
export async function getPlayerConcussionBaselineAction(
  playerId: string
): Promise<{ baseline?: ConcussionBaseline | null; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("concussion_baselines")
    .select("*")
    .eq("player_id", playerId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return { baseline: data as ConcussionBaseline | null };
}

/**
 * 3. Реєстрація гострого випадку струсу мозку
 */
export async function createConcussionCaseAction(input: {
  player_id: string;
  injury_id?: string | null;
  incident_date: string;
  incident_time?: string;
  mechanism: ConcussionMechanism;
  mechanism_description?: string;
  has_red_flags: boolean;
  red_flags: RedFlagItem[];
  symptom_count: number;
  symptom_severity: number;
  sac_score?: number;
  bess_errors?: number;
  baseline_id?: string | null;
  initial_doctor_signature: string;
}): Promise<{ success?: boolean; concussionCase?: ConcussionCase; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  // Початковий запис у stage_history: Ступінь 1 (24-48 год спокою)
  const initialHistory = [
    {
      stage: 1 as ConcussionStageNumber,
      date: input.incident_date,
      doctor_signature_name: input.initial_doctor_signature,
      is_symptom_free_24h: false,
      symptoms_noted: [`Гострий дебют: ${input.symptom_count} симптомів`],
      notes: "Початок обов'язкового періоду симптом-обмеженого фізичного та когнітивного спокою.",
    },
  ];

  const { data, error } = await supabase
    .from("concussion_cases")
    .insert({
      club_id: auth.profile.club_id,
      player_id: input.player_id,
      injury_id: input.injury_id || null,
      baseline_id: input.baseline_id || null,
      incident_date: input.incident_date,
      incident_time: input.incident_time || null,
      mechanism: input.mechanism,
      mechanism_description: input.mechanism_description || null,
      has_red_flags: input.has_red_flags,
      red_flags: input.red_flags,
      symptom_count: input.symptom_count,
      symptom_severity: input.symptom_severity,
      sac_score: input.sac_score || null,
      bess_errors: input.bess_errors || null,
      current_stage: 1,
      stage_history: initialHistory,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Також додаємо запис в injury_logs якщо передано injury_id
  if (input.injury_id) {
    await supabase.from("injury_logs").insert({
      injury_id: input.injury_id,
      date: input.incident_date,
      category: "examination",
      note: `[CONCUSSION_INIT] Зафіксовано струс мозку. Механізм: ${input.mechanism}. Симптомів: ${input.symptom_count}. Ступінь GRTP: 1 (Спокій). Гравець заблокований як недоступний.`,
    });
    revalidatePath(`/injuries/${input.injury_id}`);
  }

  revalidatePath(`/players/${input.player_id}`);
  return { success: true, concussionCase: data as ConcussionCase };
}

/**
 * 4. Оновлення ступеня повернення (GRTP) з клінічною валідацією
 */
export async function updateConcussionStageAction(input: {
  case_id: string;
  target_stage: ConcussionStageNumber;
  is_symptom_free_24h: boolean;
  symptoms_noted: string[];
  doctor_signature_name: string;
  medical_clearance_granted?: boolean;
  notes?: string;
}): Promise<{
  success?: boolean;
  next_stage?: ConcussionStageNumber;
  action_reason?: string;
  error?: string;
  concussionCase?: ConcussionCase;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  // Завантажуємо поточний стан кейсу
  const { data: existingCase, error: fetchErr } = await supabase
    .from("concussion_cases")
    .select("*")
    .eq("id", input.case_id)
    .single();

  if (fetchErr || !existingCase) {
    return { error: "Кейс струсу мозку не знайдено" };
  }

  const currentCase = existingCase as ConcussionCase;

  // Клінічна валідація переходу (відкат при появі симптомів, вимога підпису, медичний допуск)
  const validation = validateStageTransition({
    currentStage: currentCase.current_stage,
    targetStage: input.target_stage,
    isSymptomFree24h: input.is_symptom_free_24h,
    symptomsNoted: input.symptoms_noted,
    doctorSignatureName: input.doctor_signature_name,
    medicalClearanceGranted: input.medical_clearance_granted,
  });

  const nextStage = validation.nextStage;
  const isClosing = validation.allowed && input.target_stage === 6 && input.medical_clearance_granted;

  const newHistoryEntry = {
    stage: nextStage,
    date: new Date().toISOString().split("T")[0],
    doctor_signature_name: input.doctor_signature_name,
    is_symptom_free_24h: input.is_symptom_free_24h,
    symptoms_noted: input.symptoms_noted,
    medical_clearance_granted: input.medical_clearance_granted || false,
    notes: input.notes
      ? `${input.notes} | ${validation.actionReason}`
      : validation.actionReason,
  };

  const updatedHistory = [...(currentCase.stage_history || []), newHistoryEntry];

  const updatePayload: Record<string, any> = {
    current_stage: nextStage,
    stage_history: updatedHistory,
    status: isClosing ? "closed" : nextStage > 1 ? "recovering" : "active",
    updated_at: new Date().toISOString(),
  };

  if (isClosing) {
    updatePayload.closed_at = new Date().toISOString();
    updatePayload.closed_by = input.doctor_signature_name;
  }

  const { data: updatedCase, error: updateErr } = await supabase
    .from("concussion_cases")
    .update(updatePayload)
    .eq("id", input.case_id)
    .select()
    .single();

  if (updateErr) {
    return { error: updateErr.message };
  }

  // Запис у журнал травми якщо прив'язана
  if (currentCase.injury_id) {
    await supabase.from("injury_logs").insert({
      injury_id: currentCase.injury_id,
      date: new Date().toISOString().split("T")[0],
      category: "examination",
      note: `[CONCUSSION_STAGE] ${validation.actionReason}`,
    });
    revalidatePath(`/injuries/${currentCase.injury_id}`);
  }

  revalidatePath(`/players/${currentCase.player_id}`);

  return {
    success: validation.allowed,
    next_stage: nextStage,
    action_reason: validation.actionReason,
    error: validation.error,
    concussionCase: updatedCase as ConcussionCase,
  };
}

/**
 * 5. Отримання активного кейсу струсу гравця
 */
export async function getActiveConcussionCaseAction(
  playerId: string
): Promise<{ concussionCase?: ConcussionCase | null; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("concussion_cases")
    .select("*")
    .eq("player_id", playerId)
    .in("status", ["active", "recovering"])
    .order("incident_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message };
  return { concussionCase: data as ConcussionCase | null };
}
