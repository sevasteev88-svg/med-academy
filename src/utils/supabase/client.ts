"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Создаёт браузерный Supabase-клиент.
 *
 * Используй ТОЛЬКО в Client Components ("use client").
 * Клиент автоматически подхватывает сессию из cookies браузера.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
