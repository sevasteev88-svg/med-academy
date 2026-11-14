import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendCoachMorningDigestAction, getCoachSession } from "@/actions/coach-telegram-actions";

export const dynamic = "force-dynamic";

function getPublicAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";
  if (!raw) return "";
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = req.nextUrl.searchParams.get("mode") || "morning";
    const supabase = createAdminClient();
    const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    const appUrl = getPublicAppUrl();

    const { data: bindings } = await supabase
      .from("coach_telegram_bindings")
      .select("coach_user_id, telegram_chat_id")
      .eq("status", "active");

    let sent = 0;
    for (const b of bindings || []) {
      try {
        if (mode === "evening") {
          if (!botToken) continue;
          const session = await getCoachSession(b.coach_user_id, b.telegram_chat_id);
          const preferred = (session.session_draft as any)?.preferred_mode || "chat";
          const keyboard: any[][] = [];

          if (preferred === "miniapp" && appUrl.startsWith("https://")) {
            keyboard.push([{ text: "📱 Записати у Міні-додатку", web_app: { url: `${appUrl}/tg-coach` } }]);
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
          await sendCoachMorningDigestAction({
            coachUserId: b.coach_user_id,
            chatId: b.telegram_chat_id,
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
