import type { UserRole } from "@/types/database";

export type TeamAccessUser = {
  id: string;
  role: UserRole | string;
  teamId?: string | null;
  teamIds?: string[];
};

export function isDoctorRole(role: string): boolean {
  return role === "doctor" || role === "admin";
}

export function isCoachRole(role: string): boolean {
  return role === "coach";
}

/**
 * Перевіряє, чи має користувач (лікар, адмін або тренер) доступ до вказаної команди.
 * - Лікарі та адміни мають доступ до всіх команд клубу.
 * - Тренери мають доступ виключно до закріплених за ними команд (teamIds).
 * - Якщо тренеру не призначено жодної команди, повертає false.
 */
export function canUserAccessTeam(
  user: TeamAccessUser | null | undefined,
  targetTeamId?: string | null
): boolean {
  if (!user) return false;
  if (isDoctorRole(user.role)) return true;
  if (!targetTeamId) return false;

  const coachTeams = user.teamIds && user.teamIds.length > 0
    ? user.teamIds
    : (user.teamId ? [user.teamId] : []);

  return coachTeams.includes(targetTeamId);
}
