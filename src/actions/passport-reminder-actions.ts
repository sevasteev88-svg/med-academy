"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUser, DEFAULT_CLUB_ID } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  calculateDaysLeft,
  classifyPassportExpirationStatus,
  buildPassportReminderTelegramMessage,
  memoryParentPassportReminders,
  type ParentReminderRecord,
} from "@/lib/passport-reminder";
import { DEFAULT_MONOBANK_JAR_URL } from "@/types/billing";

export interface SendReminderResult {
  success: boolean;
  isSimulated: boolean;
  record?: ParentReminderRecord;
  error?: string;
}

export interface BulkReminderResult {
  success: boolean;
  totalTargeted: number;
  sentCount: number;
  simulatedCount: number;
  failedCount: number;
  results: ParentReminderRecord[];
  error?: string;
}

/**
 * Відправляє або симулює Telegram-нагадування батькам окремого гравця
 */
export async function sendParentPassportReminderAction(params: {
  playerId: string;
  simulate?: boolean;
}): Promise<SendReminderResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, isSimulated: false, error: "Не авторизовано" };
    }

    const supabase = createAdminClient();

    // 1. Отримуємо дані гравця
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, club_id, team_id")
      .eq("id", params.playerId)
      .maybeSingle();

    if (pErr || !player) {
      return { success: false, isSimulated: false, error: "Гравця не знайдено" };
    }

    // 2. Отримуємо дані клубу
    const { data: club } = await supabase
      .from("clubs")
      .select("id, name, settings")
      .eq("id", player.club_id)
      .maybeSingle();

    const clubName = club?.name || "ФК «Академія»";

    // 3. Отримуємо підписку гравця
    const { data: sub } = await supabase
      .from("player_subscriptions")
      .select("*")
      .eq("player_id", player.id)
      .maybeSingle();

    const now = new Date();
    const currentPeriodEnd = sub?.current_period_end || new Date(now.getTime() - 86400000).toISOString();
    const daysLeft = calculateDaysLeft(currentPeriodEnd, now);
    const classification = classifyPassportExpirationStatus(daysLeft, sub?.status || "unpaid");

    if (classification.urgency === "comped") {
      return {
        success: false,
        isSimulated: false,
        error: "Гравець є стипендіатом (квота клубу) і не потребує нагадування про оплату.",
      };
    }

    // 4. Отримуємо контактні дані батьків (із guardians або з player_subscriptions)
    const { data: guardians } = await supabase
      .from("guardians")
      .select("*")
      .eq("player_id", player.id)
      .order("is_primary", { ascending: false });

    const primaryGuardian = guardians && guardians.length > 0 ? guardians[0] : null;

    const parentName =
      primaryGuardian?.full_name || sub?.payer_name || `Батьки ${player.last_name} ${player.first_name}`;
    const parentPhone = primaryGuardian?.phone || sub?.payer_phone || null;
    let telegramChatId = primaryGuardian?.telegram_chat_id || null;

    // Якщо немає chat_id у guardian, перевіряємо прив'язку в player_telegram_bindings
    if (!telegramChatId) {
      const { data: binding } = await supabase
        .from("player_telegram_bindings")
        .select("telegram_chat_id")
        .eq("player_id", player.id)
        .eq("status", "active")
        .maybeSingle();

      if (binding?.telegram_chat_id) {
        telegramChatId = binding.telegram_chat_id;
      }
    }

    const playerName = `${player.last_name} ${player.first_name}`;
    const expiryDateStr = currentPeriodEnd ? currentPeriodEnd.split("T")[0] : null;
    const paymentUrl =
      (club?.settings as any)?.monobank_jar_url ||
      process.env.NEXT_PUBLIC_MONOBANK_JAR_URL ||
      DEFAULT_MONOBANK_JAR_URL;

    const messageText = buildPassportReminderTelegramMessage({
      parentName,
      playerName,
      clubName,
      daysLeft,
      expiryDateStr,
      paymentUrl,
      planAmountUah: sub ? Number(sub.amount_uah) : 150,
    });

    const isExplicitSimulate = params.simulate === true;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const isStubMode =
      isExplicitSimulate ||
      !botToken ||
      process.env.NODE_ENV !== "production" ||
      !telegramChatId;

    const reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sentAt = new Date().toISOString();

    const record: ParentReminderRecord = {
      id: reminderId,
      playerId: player.id,
      playerName,
      parentName,
      parentPhone,
      telegramChatId: telegramChatId || `sim_chat_${player.id.slice(-6)}`,
      status: isStubMode ? "simulated" : "sent",
      urgency: classification.urgency,
      daysLeft,
      messageText,
      paymentUrl,
      sentAt,
    };

    if (!isStubMode && telegramChatId && botToken) {
      // LIVE відправка через Telegram Bot API
      try {
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: messageText,
            parse_mode: "HTML",
            disable_web_page_preview: false,
          }),
        });

        const tgData = await resp.json();
        if (!tgData.ok) {
          record.status = "failed";
          record.errorMessage = tgData.description || "Помилка Telegram API";
        }
      } catch (tgErr: any) {
        record.status = "failed";
        record.errorMessage = tgErr.message || "Помилка зв'язку з Telegram";
      }
    }

    // Фіксація в in-memory сховищі
    memoryParentPassportReminders.set(reminderId, record);

    // Оновлення метаданих у player_subscriptions для аудиту клубу
    if (sub) {
      const currentMeta = (sub.metadata || {}) as Record<string, any>;
      const pastReminders = Array.isArray(currentMeta.reminders) ? currentMeta.reminders : [];
      await supabase
        .from("player_subscriptions")
        .update({
          metadata: {
            ...currentMeta,
            last_reminder_at: sentAt,
            reminders_count: pastReminders.length + 1,
            reminders: [
              ...pastReminders,
              {
                id: reminderId,
                sent_at: sentAt,
                status: record.status,
                days_left: daysLeft,
                urgency: classification.urgency,
              },
            ],
          },
          updated_at: sentAt,
        })
        .eq("id", sub.id);
    }

    revalidatePath("/team/subscriptions");

    return {
      success: record.status !== "failed",
      isSimulated: isStubMode,
      record,
      error: record.errorMessage,
    };
  } catch (err: any) {
    return {
      success: false,
      isSimulated: false,
      error: err.message || "Помилка відправки нагадування",
    };
  }
}

/**
 * Масова відправка (або симуляція) нагадувань усім батькам, чиї підписки прострочені або спливають <= 7 днів
 */
export async function sendBulkParentPassportRemindersAction(params?: {
  teamId?: string;
  simulate?: boolean;
}): Promise<BulkReminderResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        results: [],
        error: "Не авторизовано",
      };
    }

    const supabase = createAdminClient();
    const clubId = user.clubId || DEFAULT_CLUB_ID;

    // Отримуємо всіх гравців клубу / команди
    let query = supabase.from("players").select("id").eq("club_id", clubId).is("archived_at", null);
    if (params?.teamId && params.teamId !== "all") {
      query = query.eq("team_id", params.teamId);
    }

    const { data: players } = await query;
    if (!players || players.length === 0) {
      return {
        success: true,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    // Отримуємо підписки
    const playerIds = players.map((p) => p.id);
    const { data: subs } = await supabase
      .from("player_subscriptions")
      .select("player_id, status, current_period_end")
      .in("player_id", playerIds);

    const subMap = new Map((subs || []).map((s) => [s.player_id, s]));

    // Відбираємо гравців, яким потрібне нагадування
    const targetPlayerIds: string[] = [];
    const now = new Date();

    for (const p of players) {
      const s = subMap.get(p.id);
      const status = s?.status || "unpaid";
      if (status === "comped") continue;

      const end = s?.current_period_end || new Date(now.getTime() - 86400000).toISOString();
      const daysLeft = calculateDaysLeft(end, now);
      const classification = classifyPassportExpirationStatus(daysLeft, status);

      if (classification.shouldRemind) {
        targetPlayerIds.push(p.id);
      }
    }

    let sentCount = 0;
    let simulatedCount = 0;
    let failedCount = 0;
    const results: ParentReminderRecord[] = [];

    for (const pid of targetPlayerIds) {
      const res = await sendParentPassportReminderAction({
        playerId: pid,
        simulate: params?.simulate,
      });

      if (res.record) {
        results.push(res.record);
        if (res.record.status === "sent") sentCount++;
        else if (res.record.status === "simulated") simulatedCount++;
        else failedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: true,
      totalTargeted: targetPlayerIds.length,
      sentCount,
      simulatedCount,
      failedCount,
      results,
    };
  } catch (err: any) {
    return {
      success: false,
      totalTargeted: 0,
      sentCount: 0,
      simulatedCount: 0,
      failedCount: 0,
      results: [],
      error: err.message || "Помилка масової відправки нагадувань",
    };
  }
}
