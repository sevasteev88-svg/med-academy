"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertDoctor, assertAuth, assertTeamStaff } from "@/lib/auth";
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
  const isCustomMerchant = Boolean(process.env.WAYFORPAY_MERCHANT_ACCOUNT);
  const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT || "test_merch_n1";
  const merchantDomain = isCustomMerchant
    ? (process.env.NEXT_PUBLIC_APP_URL || "https://medacademy.app")
    : "www.market.ua"; // Стандартний домен для тестового мерчанта test_merch_n1 у WayForPay
  const merchantSecret = process.env.WAYFORPAY_SECRET_KEY || "flk3409refn54t54t*fnstp6";
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

  const jarBase = process.env.NEXT_PUBLIC_MONOBANK_JAR_URL || "https://send.monobank.ua/jar/jzGthBnmx";
  const commentText = `Паспорт здоров'я: ${player.last_name} ${player.first_name}`;
  const monobankUrl = `${jarBase}?a=${plan.amountUah}&t=${encodeURIComponent(commentText)}`;

  return {
    success: true,
    orderReference,
    amountUah: plan.amountUah,
    currency: "UAH",
    planName: plan.name,
    monobankUrl,
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
 * Присвоєння стипендіального безкоштовного статусу (квота директора/тренера/лікаря клубу)
 */
export async function grantCompedSubscriptionAction(params: {
  playerId: string;
  reason: string;
  daysDuration?: number;
}) {
  const auth = await assertTeamStaff();
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
  revalidatePath("/team/readiness");
  return { success: true, message: `Надано стипендіальний доступ на ${days} днів` };
}

/**
 * Скасування стипендіальної квоти (переведення на обов'язкову оплату батьків)
 */
export async function revokeCompedSubscriptionAction(params: {
  playerId: string;
}) {
  const auth = await assertTeamStaff();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = createAdminClient();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("player_subscriptions")
    .update({
      status: "unpaid",
      current_period_end: pastDate,
      comped_reason: null,
      comped_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("player_id", params.playerId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/players/${params.playerId}`);
  revalidatePath("/rehab-portal");
  revalidatePath("/team/readiness");
  return { success: true, message: "Квоту скасовано. Гравця переведено на оплату батьків." };
}

/**
 * Ручне підтвердження оплати від батьків (переказ на картку клубу/Монобанку)
 */
export async function recordManualParentPaymentAction(params: {
  playerId: string;
  planCode: BillingPlanCode;
  paymentNote?: string;
}) {
  const auth = await assertTeamStaff();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = createAdminClient();
  const plan = getPlanConfig(params.planCode);
  const now = new Date();
  const periodEnd = calculateNextPeriodEnd(
    params.planCode === "annual_1500_uah" ? "year" : "month",
    now
  ).toISOString();

  // 1. Отримуємо клуб гравця
  const { data: player, error: pErr } = await supabase
    .from("players")
    .select("id, club_id, first_name, last_name")
    .eq("id", params.playerId)
    .single();

  if (pErr || !player) {
    return { success: false, error: "Гравця не знайдено" };
  }

  // 2. Встановлюємо статус 'active'
  const { error: subErr } = await supabase.from("player_subscriptions").upsert(
    {
      club_id: player.club_id,
      player_id: params.playerId,
      status: "active",
      plan_code: params.planCode,
      amount_uah: plan.amountUah,
      billing_interval: params.planCode === "annual_1500_uah" ? "year" : "month",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      provider: "manual",
      comped_reason: params.paymentNote || "Оплачено батьками (переказ на картку)",
      comped_by: auth.user.id,
      updated_at: now.toISOString(),
    },
    { onConflict: "player_id" }
  );

  if (subErr) {
    return { success: false, error: subErr.message };
  }

  // 3. Фіксуємо платіж у журналі транзакцій
  const orderRef = generateOrderReference(params.playerId, params.planCode);
  await supabase.from("payment_transactions").insert({
    club_id: player.club_id,
    player_id: params.playerId,
    order_reference: orderRef,
    provider: "manual",
    amount_uah: plan.amountUah,
    currency: "UAH",
    status: "success",
    payment_method: "card_transfer",
    payment_system: "Manual/Card",
    transaction_date: now.toISOString(),
  });

  revalidatePath(`/players/${params.playerId}`);
  revalidatePath("/rehab-portal");
  revalidatePath("/team/readiness");
  return {
    success: true,
    message: `Оплату підтверджено (${plan.name}). Доступ активний до ${new Date(periodEnd).toLocaleDateString("uk-UA")}`,
  };
}

/**
 * Отримує зведені дані про підписки та фінанси команди/клубу
 */
export async function getTeamSubscriptionsAction(params?: {
  teamId?: string;
}) {
  const auth = await assertTeamStaff(params?.teamId);
  if ("error" in auth) {
    return {
      success: false,
      error: auth.error,
      players: [],
      teams: [],
      stats: {
        totalPlayers: 0,
        activePaidCount: 0,
        compedCount: 0,
        unpaidCount: 0,
        totalMonthlyRevenueUah: 0,
        collectionRatePercent: 0,
      },
      monobankJarUrl: "https://send.monobank.ua/jar/jzGthBnmx",
    };
  }

  const supabase = createAdminClient();
  const clubId = auth.user.clubId || "00000000-0000-0000-0000-000000000001";

  // 1. Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name")
    .eq("club_id", clubId)
    .order("name");

  const teams = teamsData || [];

  // 2. Отримуємо активних гравців
  let playerQuery = supabase
    .from("players")
    .select("id, first_name, last_name, position, team_id, teams ( id, name )")
    .eq("club_id", clubId)
    .is("archived_at", null)
    .order("last_name");

  if (params?.teamId && params.teamId !== "all") {
    playerQuery = playerQuery.eq("team_id", params.teamId);
  }

  const { data: playersData, error: pErr } = await playerQuery;

  if (pErr || !playersData) {
    return {
      success: false,
      error: pErr?.message || "Не вдалося отримати гравців",
      players: [],
      teams: [],
      stats: {
        totalPlayers: 0,
        activePaidCount: 0,
        compedCount: 0,
        unpaidCount: 0,
        totalMonthlyRevenueUah: 0,
        collectionRatePercent: 0,
      },
      monobankJarUrl: "https://send.monobank.ua/jar/jzGthBnmx",
    };
  }

  // 3. Отримуємо всі підписки гравців клубу
  const playerIds = playersData.map((p) => p.id);
  const { data: subsData } = await supabase
    .from("player_subscriptions")
    .select("*")
    .in("player_id", playerIds.length > 0 ? playerIds : ["00000000-0000-0000-0000-000000000000"]);

  const subMap = new Map((subsData || []).map((s) => [s.player_id, s]));

  let activePaidCount = 0;
  let compedCount = 0;
  let unpaidCount = 0;
  let totalMonthlyRevenueUah = 0;

  const players = playersData.map((p) => {
    const sub = subMap.get(p.id);
    let isActive = false;
    let status: SubscriptionStatus = "unpaid";

    if (sub) {
      status = sub.status as SubscriptionStatus;
      isActive = isSubscriptionAccessGranted({
        status,
        currentPeriodEnd: sub.current_period_end,
        gracePeriodEndsAt: sub.grace_period_ends_at,
      });
    }

    if (isActive) {
      if (status === "active") {
        activePaidCount++;
        totalMonthlyRevenueUah += sub?.billing_interval === "year" ? Math.round(1500 / 12) : 150;
      } else if (status === "comped") {
        compedCount++;
      }
    } else {
      unpaidCount++;
    }

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      position: p.position,
      teamId: p.team_id,
      teamName: (p.teams as any)?.name || "Без команди",
      subscription: sub
        ? {
            status,
            planCode: sub.plan_code,
            amountUah: Number(sub.amount_uah),
            billingInterval: sub.billing_interval,
            currentPeriodEnd: sub.current_period_end,
            compedReason: sub.comped_reason,
            compedBy: sub.comped_by,
            isActive,
          }
        : null,
    };
  });

  const totalPlayers = players.length;
  const collectionRatePercent =
    totalPlayers > 0 ? Math.round(((activePaidCount + compedCount) / totalPlayers) * 100) : 0;

  const monobankJarUrl =
    process.env.NEXT_PUBLIC_MONOBANK_JAR_URL || "https://send.monobank.ua/jar/jzGthBnmx";

  return {
    success: true,
    players,
    teams,
    currentTeamId: params?.teamId || "all",
    stats: {
      totalPlayers,
      activePaidCount,
      compedCount,
      unpaidCount,
      totalMonthlyRevenueUah,
      collectionRatePercent,
    },
    monobankJarUrl,
  };
}
