import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDaysLeft,
  classifyPassportExpirationStatus,
  buildPassportReminderTelegramMessage,
  simulateParentPassportReminder,
  simulateBulkParentPassportReminders,
  memoryParentPassportReminders,
  clearParentPassportRemindersMemory,
} from "../src/lib/passport-reminder.ts";
import { DEMO_PLAYERS, DEMO_SUBSCRIPTIONS, DEMO_GUARDIANS } from "../src/lib/demo-generator.ts";

test("Етап 3 — Telegram-нагадування батькам про закінчення терміну дії паспорта (B2B2C)", async (t) => {
  t.beforeEach(() => {
    clearParentPassportRemindersMemory();
  });

  await t.test("1. Розрахунок термінів (calculateDaysLeft)", () => {
    const baseDate = new Date("2026-10-31T12:00:00Z");

    // Майбутня дата (+5 днів)
    const futureDate = "2026-11-05T12:00:00Z";
    assert.equal(calculateDaysLeft(futureDate, baseDate), 5);

    // Минула дата (-10 днів)
    const pastDate = "2026-10-21T12:00:00Z";
    assert.equal(calculateDaysLeft(pastDate, baseDate), -10);

    // Сьогодні
    const todayDate = "2026-10-31T12:00:00Z";
    assert.equal(calculateDaysLeft(todayDate, baseDate), 0);
  });

  await t.test("2. Класифікація термінів та потреба в нагадуванні (classifyPassportExpirationStatus)", () => {
    // 2.1 Клубна квота (comped) — ніколи не надсилати нагадування про оплату
    const comped = classifyPassportExpirationStatus(-5, "comped");
    assert.equal(comped.urgency, "comped");
    assert.equal(comped.shouldRemind, false);

    // 2.2 Неоплачений / прострочений (unpaid або daysLeft < 0)
    const unpaid = classifyPassportExpirationStatus(-11, "unpaid");
    assert.equal(unpaid.urgency, "expired");
    assert.equal(unpaid.shouldRemind, true);
    assert.equal(unpaid.color, "rose");

    // 2.3 Спливає сьогодні (0 днів)
    const todayExp = classifyPassportExpirationStatus(0, "active");
    assert.equal(todayExp.urgency, "critical");
    assert.equal(todayExp.shouldRemind, true);
    assert.match(todayExp.label, /сьогодні/);

    // 2.4 Спливає через 2 дні (critical <= 3 дні)
    const soonExp = classifyPassportExpirationStatus(2, "active");
    assert.equal(soonExp.urgency, "critical");
    assert.equal(soonExp.shouldRemind, true);

    // 2.5 Спливає через 6 днів (warning <= 7 днів)
    const warnExp = classifyPassportExpirationStatus(6, "active");
    assert.equal(warnExp.urgency, "warning");
    assert.equal(warnExp.shouldRemind, true);

    // 2.6 Активна підписка з тривалим запасом (> 7 днів) — не турбувати батьків
    const activeOk = classifyPassportExpirationStatus(25, "active");
    assert.equal(activeOk.urgency, "active");
    assert.equal(activeOk.shouldRemind, false);
  });

  await t.test("3. Шаблон повідомлення в Telegram (buildPassportReminderTelegramMessage)", () => {
    const msg = buildPassportReminderTelegramMessage({
      parentName: "Петро Миколайович Лисенко",
      playerName: "Назар Лисенко",
      clubName: "Демо Академія",
      daysLeft: -16,
      expiryDateStr: "2026-10-15",
      paymentUrl: "https://send.monobank.ua/jar/jzGthBnmx",
      planAmountUah: 150,
    });

    // Перевірка змісту
    assert.ok(msg.includes("Петро Миколайович Лисенко"), "Містить звернення до батьків");
    assert.ok(msg.includes("Назар Лисенко"), "Містить ім'я футболіста");
    assert.ok(msg.includes("Демо Академія"), "Містить назву клубу");
    assert.ok(msg.includes("https://send.monobank.ua/jar/jzGthBnmx"), "Містить платіжне посилання");
    assert.ok(msg.includes("150 грн"), "Містить суму тарифу");

    // Захист лікарської таємниці: жодних клінічних даних!
    assert.doesNotMatch(msg, /травм|розрив|діагноз|мрт|узд|біль|укол/i);
  });

  await t.test("4. Симуляція нагадування для окремого гравця (simulateParentPassportReminder)", () => {
    // Демо-гравець Назар Лисенко (U-19, unpaid)
    const unpaidPlayer = DEMO_PLAYERS[8]; // Лисенко
    const sub = DEMO_SUBSCRIPTIONS.find((s) => s.player_id === unpaidPlayer.id);
    const guardian = DEMO_GUARDIANS.find((g) => g.player_id === unpaidPlayer.id);

    const res = simulateParentPassportReminder({
      player: {
        id: unpaidPlayer.id,
        firstName: unpaidPlayer.first_name,
        lastName: unpaidPlayer.last_name,
      },
      clubName: "ФК «Демо Академія»",
      subscription: sub
        ? {
            status: sub.status,
            currentPeriodEnd: sub.current_period_end,
            amountUah: sub.amount_uah,
            payerName: sub.payer_name,
            payerPhone: sub.payer_phone,
          }
        : null,
      guardian: guardian
        ? {
            fullName: guardian.full_name,
            phone: guardian.phone,
            telegramChatId: guardian.telegram_chat_id,
          }
        : null,
      paymentUrl: "https://send.monobank.ua/jar/jzGthBnmx",
    });

    assert.equal(res.success, true);
    assert.ok(res.record, "Повертає сформований запис нагадування");
    assert.equal(res.record?.playerId, unpaidPlayer.id);
    assert.equal(res.record?.playerName, `${unpaidPlayer.last_name} ${unpaidPlayer.first_name}`);
    assert.ok(res.record?.messageText.includes("Лисенко"));
    assert.equal(res.record?.status, "simulated");
    assert.equal(res.record?.telegramChatId, guardian?.telegram_chat_id);

    // Перевіряємо збереження в пам'яті
    assert.equal(memoryParentPassportReminders.size, 1);
  });

  await t.test("5. Заборона нагадування про оплату для стипендіатів клубу (comped)", () => {
    // Гравець #7 (Шевчук Данило) — comped
    const compedPlayer = DEMO_PLAYERS[6];
    const sub = DEMO_SUBSCRIPTIONS.find((s) => s.player_id === compedPlayer.id);

    const res = simulateParentPassportReminder({
      player: {
        id: compedPlayer.id,
        firstName: compedPlayer.first_name,
        lastName: compedPlayer.last_name,
      },
      clubName: "ФК «Демо Академія»",
      subscription: sub
        ? {
            status: sub.status,
            currentPeriodEnd: sub.current_period_end,
            amountUah: sub.amount_uah,
          }
        : null,
    });

    assert.equal(res.success, false);
    assert.match(res.error || "", /стипендіатом|квота клубу/);
  });

  await t.test("6. Масова симуляція нагадувань боржникам (simulateBulkParentPassportReminders)", () => {
    // Формуємо повний список гравців демо-клубу
    const allDemoPlayersWithSubs = DEMO_PLAYERS.map((p) => {
      const sub = DEMO_SUBSCRIPTIONS.find((s) => s.player_id === p.id);
      const guardian = DEMO_GUARDIANS.find((g) => g.player_id === p.id);
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        subscription: sub
          ? {
              status: sub.status,
              currentPeriodEnd: sub.current_period_end,
              amountUah: sub.amount_uah,
              payerName: sub.payer_name,
              payerPhone: sub.payer_phone,
            }
          : null,
        guardian: guardian
          ? {
              fullName: guardian.full_name,
              phone: guardian.phone,
              telegramChatId: guardian.telegram_chat_id,
            }
          : null,
      };
    });

    const res = simulateBulkParentPassportReminders({
      players: allDemoPlayersWithSubs,
      clubName: "ФК «Демо Академія»",
      paymentUrl: "https://send.monobank.ua/jar/jzGthBnmx",
    });

    assert.equal(res.success, true);
    // Відбирає прострочених (3 unpaid) + тих, у кого термін спливає <= 7 днів (2 гравці) = 5
    assert.equal(res.totalTargeted, 5, "Відбирає 3 прострочених та 2 гравців з терміном <= 7 днів");
    assert.equal(res.simulatedCount, 5, "Всі 5 адресатів успішно пройшли симуляцію");
    assert.equal(res.failedCount, 0);

    const targetedNames = res.results.map((r) => r.playerName);
    assert.ok(targetedNames.some((n) => n.includes("Лисенко")), "Лисенко в списку");
    assert.ok(targetedNames.some((n) => n.includes("Павленко")), "Павленко в списку");
    assert.ok(targetedNames.some((n) => n.includes("Дяченко")), "Дяченко в списку");

    for (const item of res.results) {
      assert.equal(item.status, "simulated");
      assert.ok(item.messageText.length > 50);
      assert.ok(item.paymentUrl.includes("monobank.ua"));
      assert.ok(item.telegramChatId?.startsWith("504123"));
    }
  });
});
