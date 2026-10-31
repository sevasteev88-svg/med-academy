"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertDoctor, assertAuth } from "@/lib/auth";
import { getPlayerSession } from "@/lib/player-auth";
import {
  PRICING_PLANS,
  generateOrderReference,
  getPlanConfig,
  isSubscriptionAccessGranted,
  calculateNextPeriodEnd,
  generateWayForPaySignature,
} from "@/lib/billing";
import type {
  BillingPlanCode,
  PaymentProvider,
  SubscriptionStatus,
  PlayerSubscriptionStatusResult,
} from "@/types/billing";

/**
 * Отримує статус підписки для поточного авторизованого гравця (з сесії пристрою)
 * або за явним playerId (для лікаря/адміна клубу).
 */
export async function getPlayerSubscriptionStatusAction(
  explicitPlayerId?: string
): Promise<{
  success: boolean;
  isAccessGranted: boolean;
  subscription: PlayerSubscriptionStatusResult | null;
  error?: string;
}> {
  let targetPlayerId = explicitPlayerId;

  // Якщо ID не передано, беремо з поточної сесії кабінету гравця
  if (!targetPlayerId) {
    const session = await getPlayerSession();
    if (session) {
      targetPlayerId = session.playerId;
    }
  }

  if (!targetPlayerId) {
    return {
      success: false,
      isAccessGranted: false,
      subscription: null,
      error: "Не знайдено ID гравця",
    };
  }

  const supabase = createAdminClient();

  const { data: sub, error } = await supabase
    .from("player_subscriptions")
    .select(
      "status, plan_code, amount_uah, billing_interval, current_period_end, grace_period_ends_at, card_last4, comped_reason"
    )
    .eq("player_id", targetPlayerId)
    .maybeSingle();

  if (error || !sub) {
    // Якщо запису ще немає (наприклад, щойно створений гравець) — за замовчуванням блокуємо або тріал
    return {
      success: true,
      isAccessGranted: false,
      subscription: null,
    };
  }

  const isGranted = isSubscriptionAccessGranted({
    status: sub.status as SubscriptionStatus,
    currentPeriodEnd: sub.current_period_end,
    gracePeriodEndsAt: sub.grace_period_ends_at,
  });

  return {
    success: true,
    isAccessGranted: isGranted,
    subscription: {
      status: sub.status as SubscriptionStatus,
      isActive: isGranted,
      planCode: sub.plan_code as BillingPlanCode,
      amountUah: Number(sub.amount_uah),
      billingInterval: sub.billing_interval as "month" | "year",
      currentPeriodEnd: sub.current_period_end,
      cardLast4: sub.card_last4,
      compedReason: sub.comped_reason,
    },
  };
}

/**
 * Створює платіжну сесію та генерує реквізити для оплати через WayForPay / Mono
 */
export async function createCheckoutSessionAction(params: {
  planCode: BillingPlanCode;
  playerId?: string;
  payerPhone?: string;
  payerEmail?: string;
  payerName?: string;
}) {
  let targetPlayerId = params.playerId;

  if (!targetPlayerId) {
    const session = await getPlayerSession();
    if (session) targetPlayerId = session.playerId;
  }

  if (!targetPlayerId) {
    return { success: false, error: "Не знайдено гравця для оформлення підписки" };
  }

  const supabase = createAdminClient();

  // Отримуємо клуб гравця
  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("id, club_id, first_name, last_name")
    .eq("id", targetPlayerId)
    .single();

  if (pErr || !player) {
    return { success: false, error: "Гравця не знайдено в базі клубу" };
  }

  const plan = getPlanConfig(params.planCode);
  const orderReference = generateOrderReference(targetPlayerId, params.planCode);

  // Створюємо запис у журналі транзакцій (pending)
  const { data: tx, error: txErr } = await supabase
    .from("payment_transactions")
    .insert({
      club_id: player.club_id,
      player_id: player.id,
      order_reference: orderReference,
      provider: "wayforpay" as PaymentProvider,
      amount_uah: plan.amountUah,
      currency: "UAH",
      status: "pending",
      payer_phone: params.payerPhone || null,
      payer_email: params.payerEmail || null,
      payment_method: "card",
    })
    .select("id, order_reference")
    .single();

  if (txErr) {
    return { success: false, error: "Помилка ініціалізації платежу: " + txErr.message };
  }

  // WayForPay Sandbox / Live параметри
  const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT || "test_merch_n1";
  const merchantDomain = process.env.NEXT_PUBLIC_APP_URL || "https://medacademy.app";
  const merchantSecret = process.env.WAYFORPAY_SECRET_KEY || "flk3409refn54t54t*FNJret";
  const orderDate = Math.floor(Date.now() / 1000).toString();
  const productName = `Паспорт здоров'я MedAcademy (${plan.name})`;
  const amountStr = plan.amountUah.toString();

  // Підпис форми
  const signatureFields = [
    merchantAccount,
    merchantDomain,
    orderReference,
    orderDate,
    amountStr,
    "UAH",
    productName,
    "1",
    amountStr,
  ];
  const signature = generateWayForPaySignature(signatureFields, merchantSecret);

  return {
    success: true,
    orderReference,
    amountUah: plan.amountUah,
    currency: "UAH",
    planName: plan.name,
    checkoutData: {
      merchantAccount,
      merchantDomainName: merchantDomain,
      merchantSignature: signature,
      orderReference,
      orderDate,
      amount: amountStr,
      currency: "UAH",
      productName: [productName],
      productPrice: [amountStr],
      productCount: ["1"],
      clientFirstName: params.payerName || player.first_name,
      clientLastName: player.last_name,
      clientEmail: params.payerEmail || "",
      clientPhone: params.payerPhone || "",
      serviceUrl: `${merchantDomain}/api/billing/webhook/wayforpay`,
      returnUrl: `${merchantDomain}/rehab-portal?payment=success&order=${orderReference}`,
    },
  };
}

/**
 * Присвоєння стипендіального безкоштовного статусу (квота директора/лікаря клубу)
 */
export async function grantCompedSubscriptionAction(params: {
  playerId: string;
  reason: string;
  daysDuration?: number;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = createAdminClient();
  const days = params.daysDuration || 90;
  const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // Отримуємо клуб гравця
  const { data: player } = await supabase
    .from("players")
    .select("club_id")
    .eq("id", params.playerId)
    .single();

  if (!player) {
    return { success: false, error: "Гравця не знайдено" };
  }

  const { error } = await supabase.from("player_subscriptions").upsert(
    {
      club_id: player.club_id,
      player_id: params.playerId,
      status: "comped",
      plan_code: "monthly_150_uah",
      amount_uah: 150.0,
      billing_interval: "month",
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd,
      comped_reason: params.reason || "Квота керівництва клубу",
      comped_by: auth.user.id,
      provider: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/players/${params.playerId}`);
  revalidatePath("/rehab-portal");
  return { success: true, message: `Надано стипендіальний доступ на ${days} днів` };
}
