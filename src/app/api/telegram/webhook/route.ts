import { NextResponse } from "next/server";
import { processTelegramWebhookUpdateAction } from "@/actions/telegram-actions";
import type { TelegramWebhookUpdate } from "@/types/telegram";

/**
 * Webhook для отримання команд від Telegram-бота (п. 8.7).
 * Обробляє команди /start <token>, /stop, /unbind, /status.
 */
export async function POST(request: Request) {
  try {
    const update: TelegramWebhookUpdate = await request.json();

    const result = await processTelegramWebhookUpdateAction(update);

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
