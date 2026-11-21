import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  calculateNextPeriodEnd,
  calculateGracePeriodEnd,
  generateWayForPaySignature,
  verifyWayForPayWebhookSignature,
} from "@/lib/billing";
import type { PaymentStatus, SubscriptionStatus } from "@/types/billing";

export async function POST(request: NextRequest) {
  try {
    const merchantSecret = process.env.WAYFORPAY_SECRET_KEY;
    if (!merchantSecret) {
      return NextResponse.json(
        { error: "Payment gateway secret is not configured" },
        { status: 500 }
      );
    }

    const rawBody = await request.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // WayForPay іноді надсилає payload як URL-encoded або JSON
      const formData = new URLSearchParams(rawBody);
      body = Object.fromEntries(formData.entries());
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    // 0. Обов'язкова перевірка HMAC-MD5 підпису WayForPay ДО будь-яких операцій з БД
    if (!verifyWayForPayWebhookSignature(body, merchantSecret)) {
      return NextResponse.json({ error: "Invalid merchantSignature" }, { status: 403 });
    }

    const {
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
    const responseSignature = generateWayForPaySignature(
      [String(orderReference), "accept", responseTime.toString()],
      merchantSecret
    );

    if (existingHook) {
      // Вже оброблено — повертаємо підтвердження без повторних змін
      return NextResponse.json({
        orderReference,
        status: "accept",
        time: responseTime,
        signature: responseSignature,
      });
    }

    // 2. Знаходимо відповідну транзакцію в базі та перевіряємо суму/валюту при успішній оплаті
    const { data: tx } = await supabase
      .from("payment_transactions")
      .select("id, player_id, club_id, amount_uah")
      .eq("order_reference", orderReference)
      .maybeSingle();

    const isSuccess = transactionStatus === "Approved";
    if (tx && isSuccess) {
      const paidAmount = Number(amount);
      const expectedAmount = Number(tx.amount_uah);
      const normalizedCurrency = String(currency || "").toUpperCase();
      if (
        !Number.isFinite(paidAmount) ||
        Math.abs(paidAmount - expectedAmount) >= 0.01 ||
        normalizedCurrency !== "UAH"
      ) {
        console.warn("WayForPay amount/currency mismatch:", {
          orderReference,
          paidAmount,
          expectedAmount,
          normalizedCurrency,
        });
        return NextResponse.json(
          { error: "Amount or currency mismatch" },
          { status: 400 }
        );
      }
    }

    // 3. Фіксація вебхука в журналі payment_webhooks
    await supabase.from("payment_webhooks").insert({
      provider: "wayforpay",
      event_type: transactionStatus || "unknown",
      order_reference: orderReference,
      signature: merchantSignature || "no-sig",
      payload: body,
      is_success: isSuccess,
      error_message: isSuccess ? null : reason || "Declined",
    });

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
        // Визначаємо тривалість за сумою (2000 грн = рік, 200 грн = місяць)
        const isAnnual = Number(tx.amount_uah) >= 1800;
        const interval = isAnnual ? "year" : "month";
        const nextPeriodEnd = calculateNextPeriodEnd(interval);

        const cardLast4 = cardPan ? cardPan.replace(/[^0-9]/g, "").slice(-4) : null;

        await supabase.from("player_subscriptions").upsert(
          {
            club_id: tx.club_id,
            player_id: tx.player_id,
            status: "active" as SubscriptionStatus,
            plan_code: isAnnual ? "annual_2000_uah" : "monthly_200_uah",
            amount_uah: isAnnual ? 2000.0 : 200.0,
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
