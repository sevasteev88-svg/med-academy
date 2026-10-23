"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  evaluateTueExpiry,
  type CreateTueCaseInput,
  type TueCase,
  type TueStatus,
  type TueStatusEvaluation,
} from "@/types/tue";

export type TueCaseWithPlayer = TueCase & {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    position: string;
    team_name?: string;
  };
  evaluation: TueStatusEvaluation;
};

export type TueActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Створення нового кейсу терапевтичного виключення (TUE)
 */
export async function createTueCaseAction(
  input: CreateTueCaseInput
): Promise<TueActionResult<TueCase>> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;

  if (!input.player_id || !input.substance.trim() || !input.reason.trim()) {
    return { success: false, error: "Будь ласка, заповніть обов'язкові поля: гравець, субстанція та діагноз" };
  }

  const supabase = await createClient();

  const newRecord = {
    club_id: user.clubId,
    player_id: input.player_id,
    substance: input.substance.trim(),
    wada_class: input.wada_class?.trim() || "S-препарат",
    reason: input.reason.trim(),
    status: (input.status || "підготовка") as TueStatus,
    submitted_at: input.submitted_at || null,
    valid_until: input.valid_until || null,
    document_url: input.document_url || null,
    notes: input.notes?.trim() || null,
    created_by: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: savedCase, error: insertError } = await supabase
    .from("tue_cases")
    .insert(newRecord as any)
    .select()
    .single();

  if (insertError || !savedCase) {
    console.error("[TUE] Insert error:", insertError?.message);
    return { success: false, error: `Помилка створення кейсу TUE: ${insertError?.message || "невідома"}` };
  }

  await logAudit({
    action: "create_tue_case",
    entity: "tue_case",
    entityId: savedCase.id,
    playerId: input.player_id,
    clubId: user.clubId,
    userId: user.id,
    meta: {
      substance: input.substance,
      wada_class: input.wada_class || "S-препарат",
      status: savedCase.status,
      valid_until: savedCase.valid_until,
    },
  });

  revalidatePath("/tue");
  revalidatePath(`/players/${input.player_id}`);
  return { success: true, data: savedCase as unknown as TueCase };
}

/**
 * Оновлення статусу, терміну дії або документів кейсу TUE
 */
export async function updateTueCaseAction(
  id: string,
  updates: Partial<Pick<TueCase, "status" | "valid_until" | "submitted_at" | "document_url" | "notes">>
): Promise<TueActionResult<void>> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  const { data: existingCase, error: fetchErr } = await supabase
    .from("tue_cases")
    .select("*")
    .eq("id", id)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (fetchErr || !existingCase) {
    return { success: false, error: "Кейс TUE не знайдено або відсутній доступ" };
  }

  const { error: updateError } = await supabase
    .from("tue_cases")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", id);

  if (updateError) {
    return { success: false, error: `Помилка оновлення кейсу TUE: ${updateError.message}` };
  }

  await logAudit({
    action: "update_tue_case",
    entity: "tue_case",
    entityId: id,
    playerId: existingCase.player_id,
    clubId: user.clubId,
    userId: user.id,
    meta: {
      previous_status: existingCase.status,
      new_status: updates.status || existingCase.status,
      valid_until: updates.valid_until ?? existingCase.valid_until,
    },
  });

  revalidatePath("/tue");
  revalidatePath(`/players/${existingCase.player_id}`);
  return { success: true, data: undefined };
}

/**
 * Отримання списку TUE-кейсів клубу з обчисленими 30-денними попередженнями
 */
export async function listClubTueCasesAction(
  playerId?: string
): Promise<TueActionResult<TueCaseWithPlayer[]>> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  let query = supabase
    .from("tue_cases")
    .select(`
      *,
      players(id, first_name, last_name, date_of_birth, position, teams(name))
    `)
    .eq("club_id", user.clubId);

  if (playerId) {
    query = query.eq("player_id", playerId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const casesWithEval: TueCaseWithPlayer[] = (data || []).map((row: any) => {
    const p = row.players || {};
    const evalResult = evaluateTueExpiry({
      status: row.status as TueStatus,
      valid_until: row.valid_until,
    });

    return {
      id: row.id,
      club_id: row.club_id,
      player_id: row.player_id,
      substance: row.substance,
      wada_class: row.wada_class,
      reason: row.reason,
      status: row.status,
      submitted_at: row.submitted_at,
      valid_until: row.valid_until,
      document_url: row.document_url,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      player: {
        id: p.id || row.player_id,
        first_name: p.first_name || "",
        last_name: p.last_name || "Гравець",
        date_of_birth: p.date_of_birth || "",
        position: p.position || "—",
        team_name: p.teams?.name || "",
      },
      evaluation: evalResult,
    };
  });

  return { success: true, data: casesWithEval };
}
