import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { sendCoachMorningDigestInternal, getCoachSession } from "@/lib/coach-telegram-server";
import { verifyTimingSafeSecret } from "@/lib/server-secrets";

export const dynamic = "force-dynamic";

function getPublicAppUrl(): string {
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  const vercelUrl = process.env.VERCEL_URL || "";
  const isLocal = (u: string) => u.includes("localhost") || u.includes("127.0.0.1");
  const raw =
    (envAppUrl && !(process.env.VERCEL && isLocal(envAppUrl)) ? envAppUrl : "") ||
    vercelProd ||
    vercelUrl ||
    envAppUrl;
  if (!raw) return "";
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 500 }
      );
    }
    const authHeader = req.headers.get("authorization");
    if (!verifyTimingSafeSecret(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = req.nextUrl.searchParams.get("mode") || "morning";
    const supabase = createAdminClient();
    const appUrl = getPublicAppUrl();

    const { data: bindings } = await supabase
      .from("coach_telegram_bindings")
      .select("coach_user_id, telegram_chat_id, club_id")
      .eq("status", "active");

    let sent = 0;
    for (const b of bindings || []) {
      try {
        if (mode === "evening") {
          const { botToken } = await getClubTelegramConfig(b.club_id);
          if (!botToken) continue;
          const session = await getCoachSession(b.coach_user_id, b.telegram_chat_id);
          const preferred = (session.session_draft as any)?.preferred_mode || "chat";
          const keyboard: any[][] = [];

          if (preferred === "miniapp" && appUrl.startsWith("https://")) {
            const miniAppUrl = b.club_id
              ? `${appUrl}/tg-coach?clubId=${encodeURIComponent(b.club_id)}`
              : `${appUrl}/tg-coach`;
            keyboard.push([{ text: "📱 Записати у Міні-додатку", web_app: { url: miniAppUrl } }]);
          }
          keyboard.push([{ text: "⏱️ Записати в чаті (15 сек)", callback_data: "coach_action_start_training" }]);

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: b.telegram_chat_id,
              text: "⚽ *Тренування вже завершилось?*\n\nВідмітьте навантаження команди — це займе 15 секунд:",
              parse_mode: "Markdown",
              reply_markup: { inline_keyboard: keyboard },
            }),
          });
          sent++;
        } else {
          await sendCoachMorningDigestInternal({
            coachUserId: b.coach_user_id,
            chatId: b.telegram_chat_id,
            clubId: b.club_id || undefined,
          });
          sent++;
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      mode,
      sent,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
