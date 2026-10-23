"use server";

import { createClient } from "@/utils/supabase/server";
import { assertDoctor } from "@/lib/auth";
import type { OsiicsCode } from "@/types/database";

export type PastInjurySummary = {
  id: string;
  injury_type: string;
  location: string;
  side: string;
  date_of_injury: string;
  status: string;
  osiics_code?: string | null;
  description?: string | null;
};

/**
 * Отримати список минулих травм гравця для вибору зв'язку рецидиву
 */
export async function getPlayerPastInjuries(
  playerId: string,
  excludeInjuryId?: string
): Promise<PastInjurySummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from("injuries")
    .select("id, injury_type, location, side, date_of_injury, status, osiics_code, description")
    .eq("player_id", playerId)
    .order("date_of_injury", { ascending: false });

  if (excludeInjuryId) {
    query = query.neq("id", excludeInjuryId);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as PastInjurySummary[];
}

/**
 * Пошук кодів OSIICS у довіднику за кодом або назвою
 */
export async function searchOsiicsCodes(queryText: string): Promise<OsiicsCode[]> {
  const supabase = await createClient();
  const trimmed = queryText.trim();
  if (!trimmed) {
    const { data } = await supabase
      .from("osiics_codes")
      .select("*")
      .limit(20);
    return (data as OsiicsCode[]) ?? [];
  }

  const { data, error } = await supabase
    .from("osiics_codes")
    .select("*")
    .or(`code.ilike.%${trimmed}%,title.ilike.%${trimmed}%,anatomical_site.ilike.%${trimmed}%`)
    .limit(25);

  if (error || !data) return [];
  return data as OsiicsCode[];
}

export type ImportOsiicsResult = {
  success?: boolean;
  importedCount?: number;
  error?: string;
};

/**
 * Завантаження користувачем довідника OSIICS (CSV або JSON)
 */
export async function importOsiicsCodes(
  entries: Array<{
    code: string;
    title: string;
    category?: string | null;
    anatomical_site?: string | null;
    description?: string | null;
  }>
): Promise<ImportOsiicsResult> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (!entries || entries.length === 0) {
    return { error: "Немає записів для імпорту" };
  }

  const supabase = await createClient();

  const toInsert = entries
    .filter((e) => Boolean(e.code && e.title))
    .map((e) => ({
      club_id: auth.user.clubId,
      code: e.code.trim().toUpperCase(),
      title: e.title.trim(),
      category: e.category?.trim() || null,
      anatomical_site: e.anatomical_site?.trim() || null,
      description: e.description?.trim() || null,
    }));

  if (toInsert.length === 0) {
    return { error: "Жоден запис не містить обов'язкового коду та назви" };
  }

  const { data, error } = await supabase
    .from("osiics_codes")
    .insert(toInsert)
    .select("id");

  if (error) {
    return { error: error.message };
  }

  return {
    success: true,
    importedCount: data?.length ?? toInsert.length,
  };
}
