import { NextResponse } from "next/server";
import { processTelegramWebhookUpdate } from "@/lib/telegram-webhook-server";
import { verifyTimingSafeSecret } from "@/lib/server-secrets";
import type { TelegramWebhookUpdate } from "@/types/telegram";

/**
 * Webhook для отримання команд від Telegram-бота (п. 8.7).
 * Обробляє команди /start <token>, /stop, /unbind, /status.
 */
export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not configured" },
        { status: 500 }
      );
    }

    const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!verifyTimingSafeSecret(providedSecret, expectedSecret)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const update: TelegramWebhookUpdate = await request.json();

    const result = await processTelegramWebhookUpdate(update);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid update payload" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Telegram Bot Webhook for Med-Academy",
    time: new Date().toISOString(),
  });
}
