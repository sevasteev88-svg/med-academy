import { cache } from "react";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPlayerSession } from "@/lib/player-auth";
import { canUserAccessTeam } from "./team-access";
import type { UserRole } from "@/types/database";

export type { UserRole };

export const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";

const VALID_ROLES = new Set<UserRole>(["admin", "doctor", "coach"]);

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  clubId: string;
  role: UserRole;
  teamId?: string | null;
  teamIds?: string[];
  mustChangePassword?: boolean;
};

async function fetchMemberRecord(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    const { data: member } = await supabase
      .from("club_members")
      .select("club_id, role, team_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return member;
  } catch {
    try {
      const { data: fallbackMember } = await supabase
        .from("club_members")
        .select("club_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      return fallbackMember;
    } catch {
      return null;
    }
  }
}

async function fetchProfileRecord(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, team_id")
      .eq("id", userId)
      .maybeSingle();
    return profile;
  } catch {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", userId)
        .maybeSingle();
      return profile;
    } catch {
      return null;
    }
  }
}

async function fetchCoachAssignments(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  try {
    const { data: assignments } = await supabase
      .from("coach_team_assignments")
      .select("team_id")
      .eq("coach_user_id", userId);
    return assignments ?? [];
  } catch {
    return [];
  }
}

async function fetchCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Паралельно отримуємо членство, профіль та закріплені команди тренера
  const [member, profile, assignments] = await Promise.all([
    fetchMemberRecord(supabase, user.id),
    fetchProfileRecord(supabase, user.id),
    fetchCoachAssignments(supabase, user.id),
  ]);

  // Fail-closed: без дійсного запису в club_members з валідною роллю доступ не надається.
  if (!member || !member.club_id || !VALID_ROLES.has(member.role as UserRole)) {
    return null;
  }

  const clubId = member.club_id;
  const role = member.role as UserRole;
  let teamId: string | null = (member as any).team_id || null;

  const fullNameFromProfile = profile?.full_name ?? "";
  if (!teamId && (profile as any)?.team_id) {
    teamId = (profile as any).team_id;
  }

  let fullName = fullNameFromProfile;
  if (!fullName && user.user_metadata?.full_name) {
    fullName = user.user_metadata.full_name;
  }

  const teamIds: string[] = assignments.map((a: any) => a.team_id).filter(Boolean);

  if (teamId && !teamIds.includes(teamId)) {
    teamIds.push(teamId);
  }
  if (!teamId && teamIds.length > 0) {
    teamId = teamIds[0];
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    clubId,
    role,
    teamId,
    teamIds,
    mustChangePassword: Boolean(user.user_metadata?.must_change_password),
  };
}

export const getCurrentUser = cache(fetchCurrentUser);

export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

export function isDoctor(role: UserRole): boolean {
  return role === "doctor" || role === "admin";
}

export function isCoach(role: UserRole): boolean {
  return role === "coach";
}

/**
 * Перевіряє, чи користувач автентифікований і має роль адміністратора клубу.
 */
export async function assertAdmin(): Promise<{ user: AppUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Не авторизовано. Будь ласка, увійдіть у систему." };
  }
  if (!isAdmin(user.role)) {
    return { error: "Недостатньо прав. Доступ лише для адміністраторів клубу." };
  }
  return { user };
}

/**
 * Перевіряє, чи користувач автентифікований і має доступ лікаря (doctor або admin).
 * Використовується в Server Actions для захисту медичних мутацій.
 */
export async function assertDoctor(): Promise<{ user: AppUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Не авторизовано. Будь ласка, увійдіть у систему." };
  }
  if (!isDoctor(user.role)) {
    return { error: "Недостатньо прав. Доступ лише для медичного штабу (лікаря)." };
  }
  return { user };
}

/**
 * Перевіряє наявність будь-якого автентифікованого користувача.
 */
export async function assertAuth(): Promise<{ user: AppUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Не авторизовано. Будь ласка, увійдіть у систему." };
  }
  return { user };
}

/**
 * Перевіряє, чи користувач має право керувати командою (doctor, admin, або coach для своїх команд).
 * Тренер бачить тільки призначені йому команди, doctor і admin — весь свій клуб.
 * При переданому teamId завжди звіряється приналежність команди до user.clubId.
 */
export async function assertTeamStaff(teamId?: string): Promise<{ user: AppUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Не авторизовано. Будь ласка, увійдіть у систему." };
  }

  if (!isDoctor(user.role) && !isCoach(user.role)) {
    return { error: "Недостатньо прав. Доступ лише для лікаря, адміністратора або тренера команди." };
  }

  if (teamId) {
    const admin = createAdminClient();
    const { data: team, error: teamErr } = await admin
      .from("teams")
      .select("id, club_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr || !team || team.club_id !== user.clubId) {
      return { error: "Недостатньо прав. Команда не належить вашому клубу." };
    }
  }

  // Адміністратор або лікар мають повний доступ до всіх команд свого клубу
  if (isDoctor(user.role)) {
    return { user };
  }

  // Тренер має доступ тільки до своїх призначених команд
  const coachTeams = user.teamIds && user.teamIds.length > 0
    ? user.teamIds
    : (user.teamId ? [user.teamId] : []);

  if (coachTeams.length === 0) {
    return { error: "Ваш обліковий запис очікує призначення вікової групи (команди) адміністратором або лікарем клубу." };
  }

  if (teamId && !coachTeams.includes(teamId)) {
    return { error: "Недостатньо прав. Тренер має доступ лише до своїх призначених команд." };
  }

  return { user };
}

/**
 * Перевіряє приналежність команди до клубу користувача та права доступу тренера.
 */
export async function assertTeamAccess(
  user: AppUser,
  teamId: string,
  options?: { allowCoach?: boolean }
): Promise<{ team: { id: string; club_id: string; name: string } } | { error: string }> {
  if (!teamId) {
    return { error: "Не вказано ID команди." };
  }

  const admin = createAdminClient();
  const { data: team, error } = await admin
    .from("teams")
    .select("id, club_id, name")
    .eq("id", teamId)
    .maybeSingle();

  if (error || !team || team.club_id !== user.clubId) {
    return { error: "Команду не знайдено або немає доступу в межах вашого клубу." };
  }

  if (isCoach(user.role)) {
    if (options?.allowCoach === false) {
      return { error: "Недостатньо прав. Доступ лише для лікаря або адміністратора." };
    }
    if (!canUserAccessTeam(user, team.id)) {
      return { error: "Недостатньо прав. Тренер має доступ лише до своїх призначених команд." };
    }
  } else if (!isDoctor(user.role)) {
    return { error: "Недостатньо прав." };
  }

  return { team };
}

/**
 * Перевіряє приналежність гравця до клубу користувача та права доступу тренера до його команди.
 */
export async function assertPlayerAccess(
  user: AppUser,
  playerId: string,
  options?: { allowCoach?: boolean }
): Promise<{ player: { id: string; club_id: string; team_id: string | null } } | { error: string }> {
  if (!playerId) {
    return { error: "Не вказано ID гравця." };
  }

  const admin = createAdminClient();
  const { data: player, error } = await admin
    .from("players")
    .select("id, club_id, team_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error || !player || player.club_id !== user.clubId) {
    return { error: "Гравця не знайдено або немає доступу в межах вашого клубу." };
  }

  if (isCoach(user.role)) {
    if (options?.allowCoach === false) {
      return { error: "Недостатньо прав. Доступ лише для лікаря або адміністратора." };
    }
    if (!canUserAccessTeam(user, player.team_id)) {
      return { error: "Недостатньо прав доступу до команди цього гравця." };
    }
  } else if (!isDoctor(user.role)) {
    return { error: "Недостатньо прав." };
  }

  return { player };
}

/**
 * Перевіряє, що всі передані teamIds належать вказаному clubId.
 */
export async function assertClubTeamsValid(
  clubId: string,
  teamIds: string[]
): Promise<{ validTeamIds: string[] } | { error: string }> {
  const unique = Array.from(new Set((teamIds || []).filter(Boolean)));
  if (unique.length === 0) {
    return { validTeamIds: [] };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teams")
    .select("id")
    .eq("club_id", clubId)
    .in("id", unique);

  if (error || !data || data.length !== unique.length) {
    return { error: "Одна або кілька команд не належать вашому клубу." };
  }

  return { validTeamIds: data.map((t) => t.id) };
}

/**
 * Перевіряє, що цільовий користувач (наприклад, тренер) є учасником того ж клубу.
 */
export async function assertMemberInUserClub(
  user: AppUser,
  targetUserId: string,
  options?: { allowedRoles?: UserRole[] }
): Promise<{ member: { user_id: string; club_id: string; role: UserRole } } | { error: string }> {
  if (!targetUserId) {
    return { error: "Не вказано ID користувача." };
  }

  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from("club_members")
    .select("user_id, club_id, role")
    .eq("club_id", user.clubId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error || !member) {
    return { error: "Користувача не знайдено у вашому клубі." };
  }

  if (options?.allowedRoles && !options.allowedRoles.includes(member.role as UserRole)) {
    return { error: "Роль користувача не відповідає вимогам операції." };
  }

  return {
    member: {
      user_id: member.user_id,
      club_id: member.club_id,
      role: member.role as UserRole,
    },
  };
}

/**
 * Універсальна авторизація для операцій, доступних і самому гравцю (або батькам за токеном),
 * і персоналу клубу (лікарю/адміну та, за дозволом, тренеру команди гравця).
 */
export async function assertPlayerOrStaffAccess(
  playerId: string,
  options?: { allowCoach?: boolean; parentToken?: string }
): Promise<
  | { actor: "player"; playerId: string }
  | { actor: "parent"; playerId: string; clubId: string }
  | { actor: "staff"; user: AppUser; player: { id: string; club_id: string; team_id: string | null } }
  | { error: string }
> {
  if (!playerId) {
    return { error: "Не вказано ID гравця." };
  }

  // 1. Сесія гравця (cookie)
  const playerSession = await getPlayerSession();
  if (playerSession && playerSession.playerId === playerId) {
    return { actor: "player", playerId };
  }

  // 2. Опціональний токен сімейного кабінету батьків
  if (options?.parentToken && options.parentToken.trim().length >= 16) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(options.parentToken.trim())
      .digest("hex");
    const admin = createAdminClient();
    const { data: tokenRow } = await admin
      .from("parent_portal_tokens")
      .select("player_id, club_id, is_active")
      .eq("token_hash", tokenHash)
      .eq("player_id", playerId)
      .eq("is_active", true)
      .maybeSingle();

    if (tokenRow) {
      return { actor: "parent", playerId, clubId: tokenRow.club_id };
    }
  }

  // 3. Сесія персоналу клубу
  const user = await getCurrentUser();
  if (user) {
    const access = await assertPlayerAccess(user, playerId, {
      allowCoach: options?.allowCoach ?? true,
    });
    if ("error" in access) {
      return { error: access.error };
    }
    return { actor: "staff", user, player: access.player };
  }

  return { error: "Не авторизовано. Увійдіть у систему або кабінет гравця." };
}

/**
 * Перевіряє, чи має користувач доступ до конкретної команди
 */
export const canAccessTeam = canUserAccessTeam;
