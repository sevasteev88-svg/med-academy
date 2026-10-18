const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Отримує поточну дату (YYYY-MM-DD) у заданому часовому поясі (за замовчуванням 'Europe/Kyiv').
 */
export function getClubDate(timezone: string = "Europe/Kyiv", date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

/**
 * Отримує налаштування часового поясу клубу з таблиці public.clubs (settings->>'timezone').
 */
export async function getClubTimezone(clubId: string = DEFAULT_CLUB_ID): Promise<string> {
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const tz = (club as any)?.settings?.timezone;
    if (tz && typeof tz === "string" && tz.trim().length > 0) {
      return tz.trim();
    }
  } catch {}

  return "Europe/Kyiv";
}

/**
 * Отримує часовий пояс клубу для конкретного гравця.
 */
export async function getPlayerClubTimezone(playerId: string): Promise<{ timezone: string; clubId: string }> {
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const supabase = createAdminClient();
    const { data: player } = await supabase
      .from("players")
      .select("club_id, clubs(settings)")
      .eq("id", playerId)
      .maybeSingle();

    const clubId = (player as any)?.club_id || DEFAULT_CLUB_ID;
    const tz = (player as any)?.clubs?.settings?.timezone;
    return {
      clubId,
      timezone: tz && typeof tz === "string" ? tz.trim() : "Europe/Kyiv",
    };
  } catch {}

  return {
    clubId: DEFAULT_CLUB_ID,
    timezone: "Europe/Kyiv",
  };
}
