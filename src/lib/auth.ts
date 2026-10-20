import { createClient } from "@/utils/supabase/server";
import type { UserRole } from "@/types/database";

export type { UserRole };

export const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  clubId: string;
  role: UserRole;
  teamId?: string | null;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1. Спробуємо отримати членство в клубі та роль з club_members
  let clubId = DEFAULT_CLUB_ID;
  let role: UserRole = "doctor";
  let teamId: string | null = null;

  try {
    const { data: member } = await supabase
      .from("club_members")
      .select("club_id, role, team_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (member && member.club_id) {
      clubId = member.club_id;
      role = (member.role as UserRole) || "doctor";
      teamId = (member as any).team_id || null;
    }
  } catch {
    // Якщо колонка ще не додана або сталася помилка — пробуємо без team_id
    try {
      const { data: fallbackMember } = await supabase
        .from("club_members")
        .select("club_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (fallbackMember && fallbackMember.club_id) {
        clubId = fallbackMember.club_id;
        role = (fallbackMember.role as UserRole) || "doctor";
      }
    } catch {}
  }

  // 2. Отримуємо профіль користувача (ім'я)
  let fullName = "";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, team_id")
      .eq("id", user.id)
      .maybeSingle();

    fullName = profile?.full_name ?? "";
    if (!teamId && (profile as any)?.team_id) {
      teamId = (profile as any).team_id;
    }
    // Якщо club_members не знайдено, беремо роль з profiles
    if (!role && profile?.role) {
      role = (profile.role as UserRole) || "doctor";
    }
  } catch {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      fullName = profile?.full_name ?? "";
      if (!role && profile?.role) {
        role = (profile.role as UserRole) || "doctor";
      }
    } catch {}
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    clubId,
    role: role || "doctor",
    teamId,
  };
}

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
 * Перевіряє, чи користувач має право керувати командою (doctor, admin, або coach для своєї команди).
 * Тренер бачить тільки свою команду, doctor і admin весь клуб.
 */
export async function assertTeamStaff(teamId?: string): Promise<{ user: AppUser } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Не авторизовано. Будь ласка, увійдіть у систему." };
  }

  // Адміністратор або лікар мають повний доступ до всіх команд клубу
  if (isDoctor(user.role)) {
    return { user };
  }

  // Тренер має доступ тільки до своєї команди
  if (isCoach(user.role)) {
    if (teamId && user.teamId && user.teamId !== teamId) {
      return { error: "Недостатньо прав. Тренер має доступ лише до своєї команди." };
    }
    return { user };
  }

  return { error: "Недостатньо прав. Доступ лише для лікаря, адміністратора або тренера команди." };
}
