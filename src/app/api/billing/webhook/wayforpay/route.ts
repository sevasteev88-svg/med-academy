import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { calculateNextPeriodEnd, calculateGracePeriodEnd } from "@/lib/billing";
import type { PaymentStatus, SubscriptionStatus } from "@/types/billing";

function getMerchantSecret(): string {
  return process.env.WAYFORPAY_SECRET_KEY || "flk3409refn54t54t*FNJret";
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // WayForPay іноді надсилає payload як URL-encoded або JSON
      const formData = new URLSearchParams(rawBody);
      body = Object.fromEntries(formData.entries());
    }

    const {
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      cardPan,
      cardType,
      transactionStatus,
      reason,
      email,
      phone,
      merchantSignature,
    } = body;

    if (!orderReference) {
      return NextResponse.json({ error: "Missing orderReference" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Перевірка ідемпотентності (чи не оброблявся вже цей вебхук)
    const { data: existingHook } = await supabase
      .from("payment_webhooks")
      .select("id, is_success")
      .eq("provider", "wayforpay")
      .eq("order_reference", orderReference)
      .eq("signature", merchantSignature || "no-sig")
      .maybeSingle();

    const responseTime = Math.floor(Date.now() / 1000);
    const signFields = [orderReference, "accept", responseTime.toString()];
    const responseSignature = crypto
      .createHmac("md5", getMerchantSecret())
      .update(signFields.join(";"), "utf8")
      .digest("hex");

    if (existingHook) {
      // Вже оброблено — повертаємо підтвердження без повторних змін
      return NextResponse.json({
        orderReference,
        status: "accept",
        time: responseTime,
        signature: responseSignature,
      });
    }

    // 2. Фіксація вебхука в журналі payment_webhooks
    await supabase.from("payment_webhooks").insert({
      provider: "wayforpay",
      event_type: transactionStatus || "unknown",
      order_reference: orderReference,
      signature: merchantSignature || "no-sig",
      payload: body,
      is_success: transactionStatus === "Approved",
      error_message: transactionStatus === "Approved" ? null : reason || "Declined",
    });

    // 3. Знаходимо відповідну транзакцію в базі
    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("id, player_id, club_id, amount_uah")
      .eq("order_reference", orderReference)
      .maybeSingle();

    const isSuccess = transactionStatus === "Approved";
    const paymentStatus: PaymentStatus = isSuccess ? "success" : "failed";

    if (tx) {
      // Оновлюємо статус транзакції
      await supabase
        .from("payment_transactions")
        .update({
          status: paymentStatus,
          provider_transaction_id: authCode || null,
          failure_reason: isSuccess ? null : reason || "Declined",
          payer_email: email || null,
          payer_phone: phone || null,
          payment_method: cardType || "card",
          paid_at: isSuccess ? new Date().toISOString() : null,
          raw_response: body,
        })
        .eq("id", tx.id);

      // 4. Оновлення статусу підписки гравця
      if (isSuccess && tx.player_id) {
        // Визначаємо тривалість за сумою (1500 грн = рік, 150 грн = місяць)
        const isAnnual = Number(tx.amount_uah) >= 1400;
        const interval = isAnnual ? "year" : "month";
        const nextPeriodEnd = calculateNextPeriodEnd(interval);

        const cardLast4 = cardPan ? cardPan.replace(/[^0-9]/g, "").slice(-4) : null;

        await supabase.from("player_subscriptions").upsert(
          {
            club_id: tx.club_id,
            player_id: tx.player_id,
            status: "active" as SubscriptionStatus,
            plan_code: isAnnual ? "annual_1500_uah" : "monthly_150_uah",
            amount_uah: isAnnual ? 1500.0 : 150.0,
            billing_interval: interval,
            current_period_start: new Date().toISOString(),
            current_period_end: nextPeriodEnd.toISOString(),
            payer_email: email || null,
            payer_phone: phone || null,
            provider: "wayforpay",
            card_last4: cardLast4,
            card_type: cardType || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "player_id" }
        );
      } else if (!isSuccess && tx.player_id) {
        // При помилці списання виставляємо grace period на 3 дні
        const graceEnd = calculateGracePeriodEnd();
        await supabase
          .from("player_subscriptions")
          .update({
            status: "past_due" as SubscriptionStatus,
            grace_period_ends_at: graceEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("player_id", tx.player_id);
      }
    }

    // 5. Відповідь шлюзу згідно зі специфікацією WayForPay
    return NextResponse.json({
      orderReference,
      status: "accept",
      time: responseTime,
      signature: responseSignature,
    });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
