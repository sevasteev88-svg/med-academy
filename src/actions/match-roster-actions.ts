"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertAuth, DEFAULT_CLUB_ID } from "@/lib/auth";
import { canUserAccessTeam, isDoctorRole } from "@/lib/team-access";
import type { MatchdayRoster } from "@/types/roster";
import { revalidatePath } from "next/cache";

export type SaveRosterResult = {
  success?: boolean;
  roster?: MatchdayRoster;
  error?: string;
};

/**
 * Отримує збережену заявку на матч для вказаної команди та дати
 */
export async function getMatchdayRosterAction(
  teamName: string,
  matchDate?: string
): Promise<{ roster: MatchdayRoster | null; error?: string }> {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { roster: null, error: auth.error };
  }

  const { user } = auth;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();
  const date = matchDate || new Date().toISOString().split("T")[0];

  // Перевірка прав тренера: шукаємо команду за назвою для звірки teamId
  if (user.role === "coach") {
    const { data: teamData } = await admin
      .from("teams")
      .select("id, name")
      .eq("name", teamName)
      .maybeSingle();

    if (teamData && !canUserAccessTeam(user, teamData.id)) {
      return {
        roster: null,
        error: "У вас немає доступу до цієї вікової категорії (команди).",
      };
    }
  }

  // 1. Спробуємо прочитати з окремої таблиці match_rosters
  try {
    let query = admin
      .from("match_rosters")
      .select("*")
      .eq("club_id", clubId)
      .eq("team_name", teamName)
      .order("match_date", { ascending: false })
      .limit(1);

    if (matchDate) {
      query = query.eq("match_date", matchDate);
    }

    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      return {
        roster: {
          id: data.id,
          clubId: data.club_id,
          teamId: data.team_id,
          teamName: data.team_name,
          matchDate: data.match_date,
          opponent: data.opponent,
          location: data.location || undefined,
          formation: data.formation || "4-3-3",
          starters: Array.isArray(data.starters) ? data.starters : [],
          substitutes: Array.isArray(data.substitutes) ? data.substitutes : [],
          tacticalNotes: data.tactical_notes || undefined,
          updatedAt: data.updated_at,
          createdBy: data.created_by,
        },
      };
    }
  } catch (err: any) {
    // Таблиця може ще не існувати до накату міграції — продовжуємо до fallback
  }

  // 2. Fallback: збереження у налаштуваннях клубу (clubs.settings.matchday_rosters)
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const storedMap = (club as any)?.settings?.matchday_rosters;
    if (storedMap && typeof storedMap === "object") {
      const key = `${teamName}_${date}`;
      const found = storedMap[key] || storedMap[teamName];
      if (found) {
        return { roster: found };
      }
    }
  } catch {}

  return { roster: null };
}

/**
 * Зберігає заявку та розстановку на матч (Стартовий склад XI, Запасні, номери, тактичні нотатки)
 */
export async function saveMatchdayRosterAction(
  roster: MatchdayRoster
): Promise<SaveRosterResult> {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const { user } = auth;
  const clubId = user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  // Перевірка доступу тренера
  if (user.role === "coach") {
    let targetTeamId = roster.teamId;
    if (!targetTeamId) {
      const { data: teamData } = await admin
        .from("teams")
        .select("id")
        .eq("name", roster.teamName)
        .maybeSingle();
      targetTeamId = teamData?.id;
    }

    if (targetTeamId && !canUserAccessTeam(user, targetTeamId)) {
      return {
        error: "У вас немає прав на зміну заявки для цієї команди.",
      };
    }
  }

  // Знаходимо team_id якщо не передано
  let resolvedTeamId = roster.teamId;
  if (!resolvedTeamId) {
    const { data: t } = await admin
      .from("teams")
      .select("id")
      .eq("name", roster.teamName)
      .maybeSingle();
    resolvedTeamId = t?.id;
  }

  const nowIso = new Date().toISOString();
  const matchDate = roster.matchDate || nowIso.split("T")[0];

  // 1. Спроба збереження в таблицю match_rosters
  try {
    // Перевіряємо чи є вже запис на цю дату для цієї команди
    const { data: existing } = await admin
      .from("match_rosters")
      .select("id")
      .eq("club_id", clubId)
      .eq("team_name", roster.teamName)
      .eq("match_date", matchDate)
      .maybeSingle();

    let savedData: any = null;

    if (existing?.id) {
      const { data, error } = await admin
        .from("match_rosters")
        .update({
          team_id: resolvedTeamId,
          opponent: roster.opponent,
          location: roster.location || null,
          formation: roster.formation || "4-3-3",
          starters: roster.starters,
          substitutes: roster.substitutes,
          tactical_notes: roster.tacticalNotes || null,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (!error && data) savedData = data;
    } else {
      const { data, error } = await admin
        .from("match_rosters")
        .insert({
          club_id: clubId,
          team_id: resolvedTeamId,
          team_name: roster.teamName,
          match_date: matchDate,
          opponent: roster.opponent,
          location: roster.location || null,
          formation: roster.formation || "4-3-3",
          starters: roster.starters,
          substitutes: roster.substitutes,
          tactical_notes: roster.tacticalNotes || null,
          created_by: user.id,
          updated_at: nowIso,
        })
        .select()
        .single();

      if (!error && data) savedData = data;
    }

    if (savedData) {
      revalidatePath("/reports/matchday");
      return {
        success: true,
        roster: {
          ...roster,
          id: savedData.id,
          updatedAt: savedData.updated_at,
        },
      };
    }
  } catch (err: any) {
    // Fallback якщо таблиці ще нема
  }

  // 2. Fallback: збереження у clubs.settings
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const currentSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const currentRosters = (currentSettings.matchday_rosters || {}) as Record<string, any>;

    const key = `${roster.teamName}_${matchDate}`;
    currentRosters[key] = {
      ...roster,
      updatedAt: nowIso,
      createdBy: user.id,
    };

    // Також зберігаємо як останній актуальний склад команди
    currentRosters[roster.teamName] = currentRosters[key];

    const { error: updateErr } = await admin
      .from("clubs")
      .update({
        settings: {
          ...currentSettings,
          matchday_rosters: currentRosters,
        },
      })
      .eq("id", clubId);

    if (updateErr) {
      return { error: `Не вдалося зберегти заявку: ${updateErr.message}` };
    }

    revalidatePath("/reports/matchday");
    return {
      success: true,
      roster: {
        ...roster,
        updatedAt: nowIso,
      },
    };
  } catch (err: any) {
    return { error: `Помилка збереження заявки: ${err?.message || "Невідома помилка"}` };
  }
}
