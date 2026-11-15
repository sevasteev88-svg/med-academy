"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AuthState = { error?: string; success?: boolean };

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Заповніть всі поля" };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Невірний email або пароль" };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const role = formData.get("role") as string;

  if (!email || !password || !fullName) return { error: "Заповніть всі поля" };
  if (password.length < 6) return { error: "Пароль мінімум 6 символів" };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: role || "doctor" } },
  });

  if (error) return { error: error.message };

  if (data?.user?.id) {
    try {
      const adminSb = createAdminClient();
      await adminSb.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role: role || "doctor",
      });
      await adminSb.from("club_members").upsert(
        {
          user_id: data.user.id,
          club_id: DEFAULT_CLUB_ID,
          role: role || "doctor",
        },
        { onConflict: "user_id, club_id" }
      );
    } catch {}
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function changeFirstLoginPasswordAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Сесію завершено. Увійдіть повторно." };

  const newPassword = (formData.get("newPassword") as string) || "";
  const confirmPassword = (formData.get("confirmPassword") as string) || "";

  if (newPassword.length < 8) {
    return { error: "Новий пароль має містити щонайменше 8 символів" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Паролі не співпадають" };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { must_change_password: false },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
