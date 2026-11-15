import { NextResponse } from "next/server";
import { processTelegramWebhookUpdateAction } from "@/actions/telegram-actions";
import type { TelegramWebhookUpdate } from "@/types/telegram";

/**
 * Клубний Webhook для Telegram-бота конкретного клубу (напр. ДЮСШ-11).
 * Дозволяє кільком клубам використовувати різних Telegram-ботів без конфлікту.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await context.params;
    const update: TelegramWebhookUpdate = await request.json();

    const result = await processTelegramWebhookUpdateAction(update, clubId);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid update payload" },
      { status: 400 }
    );
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await context.params;
  return NextResponse.json({
    status: "active",
    service: "Club Telegram Bot Webhook for Med-Academy",
    clubId,
    time: new Date().toISOString(),
  });
}
