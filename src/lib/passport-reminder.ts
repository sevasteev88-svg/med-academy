/**
 * passport-reminder.ts — Бізнес-логіка розрахунку термінів дії цифрового медичного паспорта
 * та формування Telegram-нагадувань для батьків гравців (B2B2C).
 */

import type { SubscriptionStatus } from "@/types/billing";

export type PassportExpirationUrgency = "expired" | "critical" | "warning" | "active" | "comped";

export interface PassportExpirationClassification {
  urgency: PassportExpirationUrgency;
  daysLeft: number;
  label: string;
  shouldRemind: boolean;
  color: "rose" | "amber" | "yellow" | "emerald" | "sky";
}

export interface ParentReminderRecord {
  id: string;
  playerId: string;
  playerName: string;
  parentName: string;
  parentPhone?: string | null;
  telegramChatId: string | null;
  status: "sent" | "simulated" | "failed";
  urgency: PassportExpirationUrgency;
  daysLeft: number;
  messageText: string;
  paymentUrl: string;
  sentAt: string;
  errorMessage?: string;
}

// In-memory сховище для тестування та симуляції відправки без живого Telegram-бота
export const memoryParentPassportReminders = new Map<string, ParentReminderRecord>();

export function clearParentPassportRemindersMemory(): void {
  memoryParentPassportReminders.clear();
}

/**
 * Розраховує кількість днів до закінчення терміну дії підписки/паспорта
 */
export function calculateDaysLeft(
  periodEndDate: string | Date,
  fromDate: Date = new Date()
): number {
  const end = new Date(periodEndDate).getTime();
  const from = fromDate.getTime();
  const diffMs = end - from;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Класифікує стан підписки на медичний паспорт для визначення необхідності нагадування батькам
 */
export function classifyPassportExpirationStatus(
  daysLeft: number,
  status: SubscriptionStatus
): PassportExpirationClassification {
  if (status === "comped") {
    return {
      urgency: "comped",
      daysLeft,
      label: "Клубна квота (безкоштовно)",
      shouldRemind: false,
      color: "emerald",
    };
  }

  if (status === "unpaid" || daysLeft < 0) {
    return {
      urgency: "expired",
      daysLeft,
      label: "Термін дії вичерпано (Soft-lock)",
      shouldRemind: true,
      color: "rose",
    };
  }

  if (daysLeft === 0) {
    return {
      urgency: "critical",
      daysLeft: 0,
      label: "Спливає сьогодні",
      shouldRemind: true,
      color: "amber",
    };
  }

  if (daysLeft <= 3) {
    const daysWord = daysLeft === 1 ? "день" : "дні";
    return {
      urgency: "critical",
      daysLeft,
      label: `Спливає через ${daysLeft} ${daysWord}`,
      shouldRemind: true,
      color: "amber",
    };
  }

  if (daysLeft <= 7) {
    return {
      urgency: "warning",
      daysLeft,
      label: `Спливає через ${daysLeft} дн.`,
      shouldRemind: true,
      color: "yellow",
    };
  }

  return {
    urgency: "active",
    daysLeft,
    label: `Діє ще ${daysLeft} дн.`,
    shouldRemind: false,
    color: "sky",
  };
}

/**
 * Формує текст персонального повідомлення батькам у Telegram
 * Суворо дотримується лікарської таємниці: жодних діагнозів або медичних подробиць!
 */
export function buildPassportReminderTelegramMessage(params: {
  parentName?: string | null;
  playerName: string;
  clubName: string;
  daysLeft: number;
  expiryDateStr?: string | null;
  paymentUrl: string;
  planAmountUah?: number;
}): string {
  const greeting = params.parentName
    ? `Шановний(а) ${params.parentName}!`
    : "Шановні батьки!";

  let statusPhrase: string;
  if (params.daysLeft < 0) {
    const passedDays = Math.abs(params.daysLeft);
    const passedText =
      passedDays === 1 ? "1 день" : passedDays <= 4 ? `${passedDays} дні` : `${passedDays} днів`;
    statusPhrase = `термін дії цифрового медичного паспорта гравця закінчився (${passedText} тому). Вхід до медичного кабінету та моніторингу готовності тимчасово обмежено.`;
  } else if (params.daysLeft === 0) {
    statusPhrase = "сьогодні останній день дії цифрового медичного паспорта гравця.";
  } else {
    const daysWord =
      params.daysLeft === 1
        ? "1 день"
        : params.daysLeft <= 4
        ? `${params.daysLeft} дні`
        : `${params.daysLeft} днів`;
    statusPhrase = `через ${daysWord}${params.expiryDateStr ? ` (${params.expiryDateStr})` : ""} закінчується термін дії цифрового медичного паспорта гравця.`;
  }

  const amountText = params.planAmountUah ? `${params.planAmountUah} грн` : "150 грн/міс";

  return [
    `⚽ <b>ФК «${params.clubName}» — Паспорт здоров'я</b>`,
    "",
    greeting,
    "",
    `Повідомляємо, що у футболіста <b>${params.playerName}</b> ${statusPhrase}`,
    "",
    "📋 <b>Чому це важливо для юного спортсмена:</b>",
    "• Офіційний медичний допуск до тренувань та ігор чемпіонату",
    "• Щоденний моніторинг серцево-судинного навантаження (HRV / ACWR)",
    "• Ранковий світлофор готовності та своєчасний захист від перевтоми",
    "",
    `💳 <b>Швидка оплата онлайн (${amountText}):</b>`,
    `🔗 <a href="${params.paymentUrl}">${params.paymentUrl}</a>`,
    "",
    `З повагою, медичний штаб ФК «${params.clubName}»`,
  ].join("\n");
}

/**
 * Локальна симуляція відправки нагадування батькам (для тестів та демо-режиму без реального бота)
 */
export function simulateParentPassportReminder(params: {
  player: { id: string; firstName: string; lastName: string; clubId?: string };
  clubName?: string;
  subscription?: {
    status: SubscriptionStatus;
    currentPeriodEnd: string;
    amountUah?: number;
    payerName?: string | null;
    payerPhone?: string | null;
  } | null;
  guardian?: {
    fullName: string;
    phone?: string | null;
    telegramChatId?: string | null;
  } | null;
  paymentUrl?: string;
}): { success: boolean; record?: ParentReminderRecord; error?: string } {
  const {
    player,
    clubName = "Демо Академія",
    subscription,
    guardian,
    paymentUrl = "https://send.monobank.ua/jar/jzGthBnmx",
  } = params;

  const now = new Date();
  const currentPeriodEnd = subscription?.currentPeriodEnd || new Date(now.getTime() - 86400000).toISOString();
  const daysLeft = calculateDaysLeft(currentPeriodEnd, now);
  const classification = classifyPassportExpirationStatus(daysLeft, subscription?.status || "unpaid");

  if (classification.urgency === "comped") {
    return {
      success: false,
      error: "Гравець є стипендіатом (квота клубу) і не потребує нагадування про оплату.",
    };
  }

  const parentName =
    guardian?.fullName || subscription?.payerName || `Батьки ${player.lastName} ${player.firstName}`;
  const parentPhone = guardian?.phone || subscription?.payerPhone || null;
  const telegramChatId = guardian?.telegramChatId || `sim_chat_${player.id.slice(-6)}`;
  const playerName = `${player.lastName} ${player.firstName}`;
  const expiryDateStr = currentPeriodEnd ? currentPeriodEnd.split("T")[0] : null;

  const messageText = buildPassportReminderTelegramMessage({
    parentName,
    playerName,
    clubName,
    daysLeft,
    expiryDateStr,
    paymentUrl,
    planAmountUah: subscription?.amountUah || 150,
  });

  const reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sentAt = now.toISOString();

  const record: ParentReminderRecord = {
    id: reminderId,
    playerId: player.id,
    playerName,
    parentName,
    parentPhone,
    telegramChatId,
    status: "simulated",
    urgency: classification.urgency,
    daysLeft,
    messageText,
    paymentUrl,
    sentAt,
  };

  memoryParentPassportReminders.set(reminderId, record);

  return {
    success: true,
    record,
  };
}

/**
 * Локальна масова симуляція нагадувань для списку гравців
 */
export function simulateBulkParentPassportReminders(params: {
  players: Array<{
    id: string;
    firstName: string;
    lastName: string;
    clubId?: string;
    subscription?: {
      status: SubscriptionStatus;
      currentPeriodEnd: string;
      amountUah?: number;
      payerName?: string | null;
      payerPhone?: string | null;
    } | null;
    guardian?: {
      fullName: string;
      phone?: string | null;
      telegramChatId?: string | null;
    } | null;
  }>;
  clubName?: string;
  paymentUrl?: string;
}): {
  success: boolean;
  totalTargeted: number;
  simulatedCount: number;
  failedCount: number;
  results: ParentReminderRecord[];
} {
  const { players, clubName, paymentUrl } = params;
  const now = new Date();

  // Фільтруємо гравців, чий термін спливає (<= 7 днів або unpaid)
  const targeted = players.filter((p) => {
    const status = p.subscription?.status || "unpaid";
    if (status === "comped") return false;
    const end = p.subscription?.currentPeriodEnd || new Date(now.getTime() - 86400000).toISOString();
    const days = calculateDaysLeft(end, now);
    const cls = classifyPassportExpirationStatus(days, status);
    return cls.shouldRemind;
  });

  const results: ParentReminderRecord[] = [];
  let simulatedCount = 0;
  let failedCount = 0;

  for (const pl of targeted) {
    const res = simulateParentPassportReminder({
      player: pl,
      clubName,
      subscription: pl.subscription,
      guardian: pl.guardian,
      paymentUrl,
    });

    if (res.success && res.record) {
      results.push(res.record);
      simulatedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    success: true,
    totalTargeted: targeted.length,
    simulatedCount,
    failedCount,
    results,
  };
}
