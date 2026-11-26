import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthorizedPlayerCabinetData, getPlayerByPortalToken } from "@/actions/rehab-portal-action";
import RehabPortalClient from "@/components/portal/RehabPortalClient";
import {
  DEVICE_COOKIE_NAME,
  createPwaBootstrapToken,
  extractDeviceSessionPayloadForDbVerification,
  verifyDeviceSessionCookieValue,
} from "@/lib/player-device-auth";

export const dynamic = "force-dynamic";

async function getCurrentPwaBootstrapToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const deviceCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    if (!deviceCookie) return null;

    const parsed =
      verifyDeviceSessionCookieValue(deviceCookie) ||
      extractDeviceSessionPayloadForDbVerification(deviceCookie);
    if (!parsed) return null;

    return createPwaBootstrapToken(parsed.deviceId, parsed.sessionSecret, parsed.playerId);
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const pwaToken = await getCurrentPwaBootstrapToken();
  return {
    title: "Щоденне самопочуття · Кабінет гравця",
    description: "Особистий кабінет футболіста для щоденної оцінки самопочуття, сну та відновлення",
    manifest: pwaToken
      ? `/api/rehab-portal/manifest?k=${encodeURIComponent(pwaToken)}`
      : "/api/rehab-portal/manifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Кабінет гравця",
    },
  };
}

export default async function RehabPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; activated?: string; pwa?: string }>;
}) {
  const { token, activated, pwa } = await searchParams;
  const isJustActivated = Boolean(activated);

  // 1. Перевіряємо чи є вже валідна сесія в httpOnly cookie
  const sessionData = await getAuthorizedPlayerCabinetData();

  // Якщо сесії немає, але передано PWA bootstrap-токен (перший запуск ярлика на iOS) — відновлюємо cookie
  if (sessionData.unauthorized && pwa) {
    redirect(`/api/rehab-portal/pwa-entry?k=${encodeURIComponent(pwa)}`);
  }

  // Якщо сесія вже активна і токен/pwa є в URL — прибираємо їх з адресного рядка чистим редиректом
  if (sessionData.success && (token || pwa)) {
    redirect("/rehab-portal");
  }

  const pwaBootstrapToken = sessionData.success
    ? await getCurrentPwaBootstrapToken()
    : null;

  // 2. Якщо сесії немає, але передано персональний token — перевіряємо його валідність
  let playerPreview: { name: string; team: string; position: string } | null = null;
  if (sessionData.unauthorized && token) {
    const pl = await getPlayerByPortalToken(token);
    if (pl) {
      playerPreview = {
        name: pl.name,
        team: pl.team,
        position: pl.position,
      };
    }
  }

  return (
    <div className="min-h-screen text-slate-200 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Top minimal header */}
      <div className="max-w-md mx-auto w-full flex items-center justify-between pb-4 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/20 flex items-center justify-center text-xs">
            ⚽
          </div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Медичний штаб · Кабінет гравця
          </span>
        </div>
      </div>

      {/* Main Client Component */}
      <div className="flex-1 flex items-center justify-center">
        <RehabPortalClient
          initialSessionData={sessionData.success ? sessionData : null}
          tokenFromUrl={token || ""}
          playerPreview={playerPreview}
          isJustActivated={isJustActivated}
          pwaBootstrapToken={pwaBootstrapToken}
        />
      </div>

      {/* Footer */}
      <div className="max-w-md mx-auto w-full text-center pt-6 text-[10px] text-slate-600 font-mono">
        Штаб спортивної медицини · Всі права захищено
      </div>
    </div>
  );
}
