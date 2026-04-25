"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AuthState = { error?: string };

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

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role: role || "doctor" } },
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
