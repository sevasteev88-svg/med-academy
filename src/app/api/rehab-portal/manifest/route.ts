import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const rawK = request.nextUrl.searchParams.get("k")?.trim();
  const safeK = rawK && /^[a-zA-Z0-9_.-]{20,512}$/.test(rawK) ? rawK : null;

  const startUrl = safeK
    ? `/api/rehab-portal/pwa-entry?k=${encodeURIComponent(safeK)}`
    : "/rehab-portal";

  const manifest = {
    name: "Кабінет гравця · MedAcademy",
    short_name: "Кабінет гравця",
    description: "Щоденне самопочуття та особистий медичний кабінет гравця",
    id: "/rehab-portal",
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
