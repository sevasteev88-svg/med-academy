"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertAuth, assertDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import { revalidatePath } from "next/cache";

import {
  type MatchdayProtocolClubSettings,
  DEFAULT_PROTOCOL_SETTINGS,
} from "@/types/protocol";

/**
 * Отримує налаштування передматчевого протоколу клубу з public.clubs.settings->'matchday_protocol'
 */
export async function getMatchdayProtocolSettingsAction(
  clubId?: string
): Promise<MatchdayProtocolClubSettings> {
  const targetClubId = clubId || DEFAULT_CLUB_ID;
  const supabase = createAdminClient();

  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", targetClubId)
      .maybeSingle();

    const stored = (club as any)?.settings?.matchday_protocol;
    if (stored && typeof stored === "object") {
      return {
        title: typeof stored.title === "string" && stored.title.trim().length > 0
          ? stored.title.trim()
          : DEFAULT_PROTOCOL_SETTINGS.title,
        is_official: Boolean(stored.is_official),
        default_doctor_name: typeof stored.default_doctor_name === "string" && stored.default_doctor_name.trim().length > 0
          ? stored.default_doctor_name.trim()
          : DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
        default_coach_name: typeof stored.default_coach_name === "string" && stored.default_coach_name.trim().length > 0
          ? stored.default_coach_name.trim()
          : DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
      };
    }
  } catch {}

  return DEFAULT_PROTOCOL_SETTINGS;
}

/**
 * Зберігає оновлені налаштування передматчевого протоколу в public.clubs.settings
 */
export async function saveMatchdayProtocolSettingsAction(
  newSettings: Partial<MatchdayProtocolClubSettings>
): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const { data: club, error: fetchErr } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", targetClubId)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };

    const currentSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const currentProtocol = (currentSettings.matchday_protocol || {}) as Record<string, any>;

    const updatedProtocol: MatchdayProtocolClubSettings = {
      title: newSettings.title?.trim() || currentProtocol.title || DEFAULT_PROTOCOL_SETTINGS.title,
      is_official: newSettings.is_official !== undefined ? Boolean(newSettings.is_official) : Boolean(currentProtocol.is_official),
      default_doctor_name: newSettings.default_doctor_name?.trim() || currentProtocol.default_doctor_name || DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
      default_coach_name: newSettings.default_coach_name?.trim() || currentProtocol.default_coach_name || DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
    };

    const updatedSettings = {
      ...currentSettings,
      matchday_protocol: updatedProtocol,
    };

    const { error: updateErr } = await admin
      .from("clubs")
      .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
      .eq("id", targetClubId);

    if (updateErr) return { error: updateErr.message };

    revalidatePath("/reports/matchday");
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Помилка збереження налаштувань протоколу клубу." };
  }
}
