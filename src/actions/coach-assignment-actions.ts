"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { assertDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export type CoachTeamInfo = {
  id: string;
  name: string;
  category: "youth" | "academy";
};

export type ClubCoachItem = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  createdAt: string;
  assignedTeamIds: string[];
  assignedTeams: CoachTeamInfo[];
  isAwaitingAssignment: boolean;
};

export type GetClubCoachesResult = {
  success: boolean;
  coaches: ClubCoachItem[];
  allTeams: CoachTeamInfo[];
  error?: string;
};

/**
 * Отримує список усіх зареєстрованих тренерів клубу та їхні закріплені команди.
 * Доступно лише для лікаря або адміністратора клубу.
 */
export async function getClubCoachesAction(): Promise<GetClubCoachesResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return {
      success: false,
      coaches: [],
      allTeams: [],
      error: auth.error,
    };
  }

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    // 1. Отримуємо всі команди клубу
    const { data: teamsData, error: teamsErr } = await admin
      .from("teams")
      .select("id, name, category, sort_order")
      .eq("club_id", targetClubId)
      .order("sort_order", { ascending: true });

    if (teamsErr) {
      return { success: false, coaches: [], allTeams: [], error: teamsErr.message };
    }

    const allTeams: CoachTeamInfo[] = (teamsData || []).map((t) => ({
      id: t.id,
      name: t.name,
      category: (t.category as "youth" | "academy") || "academy",
    }));

    const teamsMap = new Map<string, CoachTeamInfo>();
    allTeams.forEach((t) => teamsMap.set(t.id, t));

    // 2. Отримуємо всіх користувачів із роллю 'coach' у цьому клубі
    const { data: members, error: membersErr } = await admin
      .from("club_members")
      .select("user_id, role, team_id, created_at")
      .eq("club_id", targetClubId)
      .eq("role", "coach");

    if (membersErr) {
      return { success: false, coaches: [], allTeams, error: membersErr.message };
    }

    if (!members || members.length === 0) {
      return { success: true, coaches: [], allTeams };
    }

    const userIds = members.map((m) => m.user_id);

    // 3. Отримуємо профілі тренерів
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    const profilesMap = new Map<string, { full_name: string; email: string }>();
    (profiles || []).forEach((p) => {
      profilesMap.set(p.id, {
        full_name: p.full_name || "",
        email: p.email || "",
      });
    });

    // 4. Отримуємо всі призначення команд із coach_team_assignments
    let assignments: Array<{ coach_user_id: string; team_id: string }> = [];
    try {
      const { data: ctaData } = await admin
        .from("coach_team_assignments")
        .select("coach_user_id, team_id")
        .eq("club_id", targetClubId)
        .in("coach_user_id", userIds);

      if (ctaData) {
        assignments = ctaData;
      }
    } catch {}

    const coachTeamsMap = new Map<string, Set<string>>();
    assignments.forEach((a) => {
      if (!coachTeamsMap.has(a.coach_user_id)) {
        coachTeamsMap.set(a.coach_user_id, new Set());
      }
      coachTeamsMap.get(a.coach_user_id)?.add(a.team_id);
    });

    // 5. Формуємо підсумковий список тренерів
    const coaches: ClubCoachItem[] = members.map((m) => {
      const profile = profilesMap.get(m.user_id);
      const assignedSet = coachTeamsMap.get(m.user_id) || new Set<string>();

      // Враховуємо також legacy team_id з club_members, якщо є
      if (m.team_id) {
        assignedSet.add(m.team_id);
      }

      const assignedTeamIds = Array.from(assignedSet);
      const assignedTeams = assignedTeamIds
        .map((tid) => teamsMap.get(tid))
        .filter((t): t is CoachTeamInfo => Boolean(t));

      return {
        userId: m.user_id,
        fullName: profile?.full_name || "Тренер без імені",
        email: profile?.email || "",
        role: m.role,
        createdAt: m.created_at,
        assignedTeamIds,
        assignedTeams,
        isAwaitingAssignment: assignedTeamIds.length === 0,
      };
    });

    // Сортуємо: спочатку ті, хто очікує призначення команди
    coaches.sort((a, b) => {
      if (a.isAwaitingAssignment && !b.isAwaitingAssignment) return -1;
      if (!a.isAwaitingAssignment && b.isAwaitingAssignment) return 1;
      return a.fullName.localeCompare(b.fullName);
    });

    return {
      success: true,
      coaches,
      allTeams,
    };
  } catch (err: any) {
    return {
      success: false,
      coaches: [],
      allTeams: [],
      error: err.message || "Помилка завантаження списку тренерів.",
    };
  }
}

/**
 * Оновлює призначені команди (вікові групи) для конкретного тренера клубу.
 * Дозволяє призначати декілька команд, змінювати команди при переводі тренера,
 * або тимчасово знімати всі команди.
 */
export async function updateCoachTeamAssignmentsAction(input: {
  coachUserId: string;
  teamIds: string[];
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { coachUserId, teamIds } = input;
  if (!coachUserId) {
    return { success: false, error: "Не вказано ідентифікатор тренера." };
  }

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    // 1. Перевіряємо, чи цей користувач дійсно є тренером у цьому клубі
    const { data: member, error: memberErr } = await admin
      .from("club_members")
      .select("user_id, role")
      .eq("club_id", targetClubId)
      .eq("user_id", coachUserId)
      .maybeSingle();

    if (memberErr || !member) {
      return { success: false, error: "Тренера не знайдено в цьому клубі." };
    }

    // 2. Видаляємо всі попередні призначення в coach_team_assignments
    await admin
      .from("coach_team_assignments")
      .delete()
      .eq("club_id", targetClubId)
      .eq("coach_user_id", coachUserId);

    // 3. Вставляємо нові призначення, якщо вибрано хоча б одну команду
    const uniqueTeamIds = Array.from(new Set(teamIds.filter(Boolean)));
    if (uniqueTeamIds.length > 0) {
      const insertRows = uniqueTeamIds.map((tid) => ({
        club_id: targetClubId,
        coach_user_id: coachUserId,
        team_id: tid,
        assigned_by: auth.user.id,
      }));

      const { error: insertErr } = await admin
        .from("coach_team_assignments")
        .insert(insertRows);

      if (insertErr) {
        return { success: false, error: `Помилка збереження призначень: ${insertErr.message}` };
      }
    }

    // 4. Оновлюємо основний team_id у club_members та profiles для зворотної сумісності
    const primaryTeamId = uniqueTeamIds[0] || null;
    await admin
      .from("club_members")
      .update({ team_id: primaryTeamId })
      .eq("club_id", targetClubId)
      .eq("user_id", coachUserId);

    try {
      await admin
        .from("profiles")
        .update({ team_id: primaryTeamId })
        .eq("id", coachUserId);
    } catch {}

    // 5. Логуємо подію в системний аудит
    await logAudit({
      action: "update_coach_teams",
      entity: "auth",
      entityId: coachUserId,
      meta: {
        assignedCount: uniqueTeamIds.length,
        teamIds: uniqueTeamIds,
        assignedBy: auth.user.id,
      },
    });

    // 6. Інвалідуємо кеш усіх ключових сторінок
    revalidatePath("/admin/club-settings");
    revalidatePath("/players");
    revalidatePath("/coach-briefing");
    revalidatePath("/team/readiness");
    revalidatePath("/training");
    revalidatePath("/availability");
    revalidatePath("/rtp");
    revalidatePath("/wellness");

    const countText = uniqueTeamIds.length === 0
      ? "Доступ знято (очікує призначення команди)"
      : `Призначено ${uniqueTeamIds.length} команд(и)`;

    return {
      success: true,
      message: `Команди тренера успішно оновлено. ${countText}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Помилка при збереженні команд тренера.",
    };
  }
}
