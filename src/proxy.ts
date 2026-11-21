import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set(["/login", "/register", "/privacy", "/demo"]);

const PUBLIC_PREFIX_PATHS = [
  "/rehab-portal",
  "/parent/",
  "/consent/",
  "/a/",
  "/auth/",
  "/tg-coach",
  "/api/tg-coach",
  "/api/telegram/webhook",
  "/api/billing/webhook/",
  "/api/cron/",
];

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(path)) return true;
  return PUBLIC_PREFIX_PATHS.some((prefix) => path.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Публічні сторінки та зовнішні інтеграції (портали, вебхуки з підписами, cron з CRON_SECRET)
  if (isPublicPath(path)) {
    if (user && (path === "/login" || path === "/register")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // Захищені API маршрути: повертаємо 401 JSON замість HTML-редіректу на /login
  if (!user) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|logo-chr.png|hero-bg.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
