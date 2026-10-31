/**
 * billing.ts — Бізнес-логіка, тарифи та хелпери перевірки підписок MedAcademy
 */

import crypto from "crypto";
import {
  PRICING_PLANS,
  type BillingPlanCode,
  type SubscriptionStatus,
  type PlayerSubscriptionStatusResult,
  type PaymentProvider,
} from "../types/billing.ts";

export { PRICING_PLANS };

/**
 * Перевіряє, чи підписка дає активний доступ до кабінету та анкет гравця
 */
export function isSubscriptionAccessGranted(params: {
  status: SubscriptionStatus;
  currentPeriodEnd: string | Date;
  gracePeriodEndsAt?: string | Date | null;
}): boolean {
  const now = new Date();
  const periodEnd = new Date(params.currentPeriodEnd);

  // 1. Активні або пробні або стипендіальні плани
  if (params.status === "active" || params.status === "trialing" || params.status === "comped") {
    return periodEnd >= now;
  }

  // 2. Скасовано, але поточний сплачений період ще не закінчився
  if (params.status === "canceled") {
    return periodEnd >= now;
  }

  // 3. Пільговий період при помилці списання (grace period)
  if (params.status === "past_due" && params.gracePeriodEndsAt) {
    const graceEnd = new Date(params.gracePeriodEndsAt);
    return graceEnd >= now;
  }

  // Усі інші статуси (unpaid, закінчений grace period) блокують доступ
  return false;
}

/**
 * Генерує унікальний номер замовлення для банку: MED-{PLAN}-{PLAYER_PREFIX}-{TIMESTAMP}
 */
export function generateOrderReference(playerId: string, planCode: BillingPlanCode): string {
  const shortId = playerId.replace(/-/g, "").slice(0, 8);
  const planPrefix = planCode === "annual_1500_uah" ? "ANN" : "MTH";
  const ts = Date.now().toString(36).toUpperCase();
  const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `MED-${planPrefix}-${shortId}-${ts}${randomSuffix}`;
}

/**
 * Повертає конфігурацію та ціну за кодом тарифного плану
 */
export function getPlanConfig(planCode: BillingPlanCode) {
  if (planCode === "annual_1500_uah") {
    return PRICING_PLANS.ANNUAL;
  }
  return PRICING_PLANS.MONTHLY;
}

/**
 * Розраховує дату закінчення наступного періоду
 */
export function calculateNextPeriodEnd(interval: "month" | "year", fromDate: Date = new Date()): Date {
  const d = new Date(fromDate);
  if (interval === "year") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/**
 * Розраховує 3-денний пільговий період для невдалого платежу
 */
export function calculateGracePeriodEnd(fromDate: Date = new Date()): Date {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 3);
  return d;
}

/**
 * Створює підпис WayForPay HMAC-MD5
 * string: merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;productName;productCount;productPrice
 */
export function generateWayForPaySignature(fields: string[], secretKey: string): string {
  const signString = fields.join(";");
  return crypto.createHmac("md5", secretKey).update(signString, "utf8").digest("hex");
}
