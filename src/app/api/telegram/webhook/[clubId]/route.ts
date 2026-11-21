import { NextResponse } from "next/server";
import { processTelegramWebhookUpdate } from "@/lib/telegram-webhook-server";
import { createAdminClient } from "@/utils/supabase/admin";
import { decryptServerSecret } from "@/lib/server-crypto";
import { verifyTimingSafeSecret } from "@/lib/server-secrets";
import type { TelegramWebhookUpdate } from "@/types/telegram";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!clubId || !UUID_REGEX.test(clubId)) {
      return NextResponse.json({ ok: false, error: "Invalid clubId" }, { status: 400 });
    }

    let expectedSecret = "";
    try {
      const admin = createAdminClient();
      const { data: club } = await admin
        .from("clubs")
        .select("settings")
        .eq("id", clubId)
        .maybeSingle();

      const encryptedSecret = (club as { settings?: { telegram?: { encrypted_webhook_secret?: string } } } | null)
        ?.settings?.telegram?.encrypted_webhook_secret;
      if (encryptedSecret) {
        expectedSecret = decryptServerSecret(encryptedSecret);
      }
    } catch {
      // Fallback до глобального секрету буде перевірено нижче
    }

    if (!expectedSecret) {
      expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
    }

    if (!expectedSecret) {
      return NextResponse.json(
        { ok: false, error: "Webhook secret is not configured" },
        { status: 500 }
      );
    }

    const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!verifyTimingSafeSecret(providedSecret, expectedSecret)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const update: TelegramWebhookUpdate = await request.json();

    const result = await processTelegramWebhookUpdate(update, clubId);

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
