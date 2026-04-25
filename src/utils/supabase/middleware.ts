import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Обновляет Supabase-сессию внутри middleware.
 *
 * Зачем: JWT-токен Supabase живёт ограниченное время.
 * Если не обновлять его при каждом запросе — пользователь
 * «разлогинится» посреди работы.
 *
 * Принимает request + response (уже обработанный next-intl),
 * прокидывает обновлённые cookies и возвращает response.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1. Ставим cookies на request (для downstream)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // 2. Ставим cookies на response (для браузера)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() триггерит рефреш токена, если он истёк.
  // Не используй getSession() — она не валидирует токен на сервере.
  await supabase.auth.getUser();

  return response;
}
