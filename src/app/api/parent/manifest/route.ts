import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get("token")?.trim();
  const safeToken = rawToken && /^[a-zA-Z0-9_-]{8,128}$/.test(rawToken) ? rawToken : null;

  const startUrl = safeToken ? `/parent/${encodeURIComponent(safeToken)}` : "/parent";

  const manifest = {
    name: "Сімейний кабінет батьків · MedAcademy",
    short_name: "Кабінет батьків",
    description: "Статус медичного допуску, самопочуття, дозволи та зв'язок з лікарем клубу",
    id: startUrl,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#070A13",
    theme_color: "#070A13",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
