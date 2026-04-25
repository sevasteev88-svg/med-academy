import { createClient } from "@/utils/supabase/server";

export type UserRole = "doctor" | "coach";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? "",
    role: (profile?.role as UserRole) ?? "doctor",
  };
}

export function isDoctor(role: UserRole): boolean {
  return role === "doctor";
}

export function isCoach(role: UserRole): boolean {
  return role === "coach";
}
