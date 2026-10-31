/**
 * billing.ts — Типи та константи підписок B2B2C для MedAcademy
 */

export type SubscriptionStatus =
  | "trialing"   // Безкоштовний пробний період
  | "active"     // Активна підписка
  | "past_due"   // Помилка списання, діє пільговий період
  | "canceled"   // Скасовано батьками (активна до кінця оплаченого терміну)
  | "unpaid"     // Заблоковано за несплату (soft-lock в кабінеті)
  | "comped";    // Безкоштовний доступ / стипендіат від керівництва

export type BillingPlanCode =
  | "monthly_150_uah"   // 150 грн / місяць
  | "annual_1500_uah";  // 1 500 грн / рік (10 місяців)

export type PaymentProvider =
  | "wayforpay"
  | "monobank"
  | "manual";

export type PaymentStatus =
  | "pending"
  | "success"
  | "failed"
  | "refunded";

export const PRICING_PLANS = {
  MONTHLY: {
    code: "monthly_150_uah" as BillingPlanCode,
    name: "Щомісячний план",
    amountUah: 150,
    interval: "month" as const,
    description: "Персональний паспорт здоров'я та щоденний моніторинг",
  },
  ANNUAL: {
    code: "annual_1500_uah" as BillingPlanCode,
    name: "Річний абонемент",
    amountUah: 1500,
    interval: "year" as const,
    discountMonths: 2,
    description: "10 місяців оплати + 2 місяці у подарунок",
  },
} as const;

export type PlayerSubscription = {
  id: string;
  club_id: string;
  player_id: string;
  status: SubscriptionStatus;
  plan_code: BillingPlanCode;
  amount_uah: number;
  currency: string;
  billing_interval: "month" | "year";
  current_period_start: string;
  current_period_end: string;
  trial_ends_at?: string | null;
  canceled_at?: string | null;
  grace_period_ends_at?: string | null;
  payer_name?: string | null;
  payer_phone?: string | null;
  payer_email?: string | null;
  provider: PaymentProvider;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  card_last4?: string | null;
  card_type?: string | null;
  comped_reason?: string | null;
  comped_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentTransaction = {
  id: string;
  subscription_id?: string | null;
  club_id: string;
  player_id: string;
  order_reference: string;
  provider: PaymentProvider;
  provider_transaction_id?: string | null;
  amount_uah: number;
  currency: string;
  status: PaymentStatus;
  failure_reason?: string | null;
  payer_phone?: string | null;
  payer_email?: string | null;
  payment_method?: string | null;
  raw_response?: Record<string, unknown>;
  paid_at?: string | null;
  created_at: string;
};

export type PlayerSubscriptionStatusResult = {
  status: SubscriptionStatus;
  isActive: boolean;
  planCode: BillingPlanCode;
  amountUah: number;
  billingInterval: "month" | "year";
  currentPeriodEnd: string;
  cardLast4?: string | null;
  compedReason?: string | null;
};
