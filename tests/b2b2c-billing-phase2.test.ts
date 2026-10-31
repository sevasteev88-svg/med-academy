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

test("Фаза 2 — Білінг B2B2C, Еквайринг (WayForPay / Mono) та Soft-Lock", async (t) => {
  await t.test("1. Перевірка параметрів чекауту для батьків", () => {
    const dummyPlayerId = "879967e4-3a2c-4695-a23a-2db88dd68712"; // Амбрусієнко

    const monthlyPlan = getPlanConfig("monthly_150_uah");
    assert.equal(monthlyPlan.amountUah, 150);
    assert.equal(monthlyPlan.interval, "month");

    const annualPlan = getPlanConfig("annual_1500_uah");
    assert.equal(annualPlan.amountUah, 1500);
    assert.equal(annualPlan.interval, "year");

    const orderRef = generateOrderReference(dummyPlayerId, "monthly_150_uah");
    assert.ok(orderRef.startsWith("MED-MTH-"));
  });

  await t.test("2. Soft-lock: валідація блокування при несплаті", () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Неоплачений профіль (unpaid)
    assert.equal(
      isSubscriptionAccessGranted({
        status: "unpaid",
        currentPeriodEnd: pastDate,
      }),
      false,
      "unpaid статус повинен блокувати доступ"
    );

    // Сплив термін підписки (past_due) без діючого grace period
    assert.equal(
      isSubscriptionAccessGranted({
        status: "past_due",
        currentPeriodEnd: pastDate,
        gracePeriodEndsAt: pastDate,
      }),
      false,
      "past_due після grace period повинен блокувати доступ"
    );

    // Діючий пільговий період (grace period)
    const activeGrace = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(
      isSubscriptionAccessGranted({
        status: "past_due",
        currentPeriodEnd: pastDate,
        gracePeriodEndsAt: activeGrace,
      }),
      true,
      "під час пільгового періоду доступ надається"
    );

    // Діючий пілотний грант (comped) — як у діючих гравців команди
    assert.equal(
      isSubscriptionAccessGranted({
        status: "comped",
        currentPeriodEnd: futureDate,
      }),
      true,
      "comped статус надає повний безкоштовний доступ"
    );
  });

  await t.test("3. Вебхук WayForPay: перевірка розрахунку сигнатури відповіді accept", () => {
    const secret = "test_secret_12345";
    const orderRef = "MED-MTH-879967E4-XYZ123";
    const time = "1761912500";

    const fields = [orderRef, "accept", time];
    const signature = generateWayForPaySignature(fields, secret);

    assert.equal(typeof signature, "string");
    assert.equal(signature.length, 32); // MD5 hex
  });

  await t.test("4. Розрахунок продовження підписки після успішної оплати", () => {
    const fromDate = new Date("2026-11-01T12:00:00Z");

    const monthEnd = calculateNextPeriodEnd("month", fromDate);
    assert.equal(monthEnd.getUTCMonth(), 11); // грудень

    const yearEnd = calculateNextPeriodEnd("year", fromDate);
    assert.equal(yearEnd.getUTCFullYear(), 2027);

    const graceEnd = calculateGracePeriodEnd(fromDate);
    assert.equal(graceEnd.getUTCDate(), 4); // +3 дні
  });
});
