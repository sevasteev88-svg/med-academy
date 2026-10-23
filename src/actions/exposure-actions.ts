"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertAuth, DEFAULT_CLUB_ID } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { ExposureSessionType } from "@/types/database";

export type CreateExposureInput = {
  teamId: string;
  date: string;
  type: ExposureSessionType;
  minutes: number;
  playersCount: number;
  notes?: string;
};

export type BatchExposureEntry = {
  date: string;
  type: ExposureSessionType;
  minutes: number;
  playersCount: number;
  notes?: string;
};

export type CreateBatchExposuresInput = {
  teamId: string;
  entries: BatchExposureEntry[];
};

export async function createExposureAction(input: CreateExposureInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  const user = auth.user;

  if (!input.teamId) return { success: false, error: "Оберіть команду" };
  if (!input.date) return { success: false, error: "Вкажіть дату" };
  if (!input.minutes || input.minutes <= 0) return { success: false, error: "Тривалість має бути більше 0" };
  if (!input.playersCount || input.playersCount <= 0) return { success: false, error: "Кількість гравців має бути більше 0" };

  const supabase = await createClient();
  const clubId = user.clubId || DEFAULT_CLUB_ID;

  const { data, error } = await supabase
    .from("exposures")
    .insert({
      club_id: clubId,
      team_id: input.teamId,
      date: input.date,
      type: input.type,
      minutes: Number(input.minutes),
      players_count: Number(input.playersCount),
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: "create_exposure",
    entity: "exposures",
    entityId: data?.id ?? input.teamId,
    userId: user.id,
    clubId,
    meta: {
      teamId: input.teamId,
      date: input.date,
      type: input.type,
      minutes: input.minutes,
      playersCount: input.playersCount,
    },
  });

  revalidatePath("/exposures");
  revalidatePath("/");
  revalidatePath("/reports/patterns");
  return { success: true, exposure: data };
}

export async function createBatchExposuresAction(input: CreateBatchExposuresInput) {
  const auth = await assertAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  const user = auth.user;

  if (!input.teamId) return { success: false, error: "Оберіть команду" };
  if (!input.entries || input.entries.length === 0) {
    return { success: false, error: "Не вказано жодної сесії для збереження" };
  }

  const supabase = await createClient();
  const clubId = user.clubId || DEFAULT_CLUB_ID;

  const records = input.entries
    .filter((e) => e.date && e.minutes > 0 && e.playersCount > 0)
    .map((e) => ({
      club_id: clubId,
      team_id: input.teamId,
      date: e.date,
      type: e.type,
      minutes: Number(e.minutes),
      players_count: Number(e.playersCount),
      notes: e.notes?.trim() || null,
    }));

  if (records.length === 0) {
    return { success: false, error: "Усі сесії містять невалідні значення хвилин або гравців" };
  }

  const { data, error } = await supabase.from("exposures").insert(records).select();

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: "create_batch_exposures",
    entity: "exposures",
    entityId: input.teamId,
    userId: user.id,
    clubId,
    meta: {
      teamId: input.teamId,
      count: records.length,
      dates: records.map((r) => r.date),
    },
  });

  revalidatePath("/exposures");
  revalidatePath("/");
  revalidatePath("/reports/patterns");
  return { success: true, count: data?.length ?? records.length };
}

export async function deleteExposureAction(id: string) {
  const auth = await assertAuth();
  if ("error" in auth) return { success: false, error: auth.error };
  const user = auth.user;

  const supabase = await createClient();
  const clubId = user.clubId || DEFAULT_CLUB_ID;

  const { error } = await supabase
    .from("exposures")
    .delete()
    .eq("id", id)
    .eq("club_id", clubId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: "delete_exposure",
    entity: "exposures",
    entityId: id,
    userId: user.id,
    clubId,
  });

  revalidatePath("/exposures");
  revalidatePath("/");
  revalidatePath("/reports/patterns");
  return { success: true };
}
