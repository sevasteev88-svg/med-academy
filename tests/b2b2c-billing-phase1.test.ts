import test from "node:test";
import assert from "node:assert/strict";
import {
  PRICING_PLANS,
  isSubscriptionAccessGranted,
  generateOrderReference,
  getPlanConfig,
  calculateNextPeriodEnd,
  calculateGracePeriodEnd,
  generateWayForPaySignature,
} from "../src/lib/billing.ts";

test("Фаза 1 — B2B2C Білінг та Підписки MedAcademy", async (t) => {
  await t.test("1. Тарифи та ціноутворення (150 грн/міс та 1500 грн/рік)", () => {
    // Щомісячний тариф
    assert.equal(PRICING_PLANS.MONTHLY.amountUah, 150);
    assert.equal(PRICING_PLANS.MONTHLY.code, "monthly_150_uah");
    assert.equal(PRICING_PLANS.MONTHLY.interval, "month");

    // Річний тариф (10 місяців + 2 у подарунок)
    assert.equal(PRICING_PLANS.ANNUAL.amountUah, 1500);
    assert.equal(PRICING_PLANS.ANNUAL.code, "annual_1500_uah");
    assert.equal(PRICING_PLANS.ANNUAL.interval, "year");
    assert.equal(PRICING_PLANS.ANNUAL.discountMonths, 2);

    // Перевірка конфігуратора планів
    assert.equal(getPlanConfig("monthly_150_uah").amountUah, 150);
    assert.equal(getPlanConfig("annual_1500_uah").amountUah, 1500);
  });

  await t.test("2. Логіка доступу (isSubscriptionAccessGranted) для різних статусів", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // 2.1 Активні підписки
    assert.equal(
      isSubscriptionAccessGranted({ status: "active", currentPeriodEnd: futureDate }),
      true,
      "Активна підписка з майбутньою датою надає доступ"
    );
    assert.equal(
      isSubscriptionAccessGranted({ status: "active", currentPeriodEnd: pastDate }),
      false,
      "Активна підписка, термін якої минув, не надає доступ"
    );

    // 2.2 Пробний період (trialing)
    assert.equal(
      isSubscriptionAccessGranted({ status: "trialing", currentPeriodEnd: futureDate }),
      true
    );

    // 2.3 Стипендіальний безкоштовний доступ (comped — для діючих гравців U-19)
    assert.equal(
      isSubscriptionAccessGranted({ status: "comped", currentPeriodEnd: futureDate }),
      true,
      "Стипендіат клубу (comped) має безперешкодний доступ"
    );

    // 2.4 Скасовано батьками, але ще не закінчився сплачений місяць
    assert.equal(
      isSubscriptionAccessGranted({ status: "canceled", currentPeriodEnd: futureDate }),
      true
    );
    assert.equal(
      isSubscriptionAccessGranted({ status: "canceled", currentPeriodEnd: pastDate }),
      false
    );

    // 2.5 Помилка оплати (past_due) з активним пільговим періодом (grace period)
    const graceFuture = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const graceExpired = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    assert.equal(
      isSubscriptionAccessGranted({
        status: "past_due",
        currentPeriodEnd: pastDate,
        gracePeriodEndsAt: graceFuture,
      }),
      true,
      "Під час grace period доступ надається"
    );

    assert.equal(
      isSubscriptionAccessGranted({
        status: "past_due",
        currentPeriodEnd: pastDate,
        gracePeriodEndsAt: graceExpired,
      }),
      false,
      "Після закінчення grace period доступ блокується"
    );

    // 2.6 Повне блокування (unpaid)
    assert.equal(
      isSubscriptionAccessGranted({ status: "unpaid", currentPeriodEnd: pastDate }),
      false,
      "Неоплачений акаунт (unpaid) заблокований"
    );
  });

  await t.test("3. Генерація унікального номера замовлення (orderReference)", () => {
    const playerId = "c9a0b123-4567-89ab-cdef-0123456789ab";
    const refMonthly = generateOrderReference(playerId, "monthly_150_uah");
    const refAnnual = generateOrderReference(playerId, "annual_1500_uah");

    assert.match(refMonthly, /^MED-MTH-[0-9a-f]{8}-[A-Z0-9]+$/);
    assert.match(refAnnual, /^MED-ANN-[0-9a-f]{8}-[A-Z0-9]+$/);
    assert.notEqual(refMonthly, refAnnual);
  });

  await t.test("4. Розрахунок наступного періоду та пільгового періоду", () => {
    const base = new Date("2026-11-01T10:00:00Z");

    const nextMonth = calculateNextPeriodEnd("month", base);
    assert.equal(nextMonth.getUTCMonth(), 11); // грудень

    const nextYear = calculateNextPeriodEnd("year", base);
    assert.equal(nextYear.getUTCFullYear(), 2027);

    const graceEnd = calculateGracePeriodEnd(base);
    assert.equal(graceEnd.getUTCDate(), 4); // +3 дні
  });

  await t.test("5. Криптографічний підпис WayForPay HMAC-MD5", () => {
    const secret = "flk3409refn54t54t*FNJret";
    const fields = ["test_merchant", "medacademy.app", "ORDER-123", "1761912000", "150", "UAH", "Підписка MedAcademy", "1", "150"];
    const sig = generateWayForPaySignature(fields, secret);
    assert.equal(typeof sig, "string");
    assert.equal(sig.length, 32); // MD5 hex
  });
});
