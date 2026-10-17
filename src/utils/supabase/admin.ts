import { createClient } from "@supabase/supabase-js";

/**
 * Створює безпечний серверний адміністративний клієнт Supabase (service_role).
 *
 * УВАГА З БЕЗПЕКИ:
 * - Використовувати ВИКЛЮЧНО на стороні сервера (Server Actions / Route Handlers).
 * - Ніколи не імпортувати в Client Components ("use client").
 * - Використовується для операцій порталу гравця (/rehab-portal) після перевірки
 *   сесійного токена та PIN, що дозволяє тримати таблиці повністю закритими від anon-доступу в RLS.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing in environment variables.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
