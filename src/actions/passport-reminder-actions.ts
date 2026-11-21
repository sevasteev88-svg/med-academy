"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import {
  assertTeamStaff,
  assertPlayerAccess,
  isCoach,
} from "@/lib/auth";
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
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, isSimulated: false, error: auth.error };
    }

    const access = await assertPlayerAccess(auth.user, params.playerId, {
      allowCoach: true,
    });
    if ("error" in access) {
      return { success: false, isSimulated: false, error: access.error };
    }

    const clubId = access.player.club_id || auth.user.clubId;
    const supabase = createAdminClient();

    // 1. Отримуємо дані гравця
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, club_id, team_id")
      .eq("id", params.playerId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (pErr || !player) {
      return { success: false, isSimulated: false, error: "Гравця не знайдено" };
    }

    // 2. Отримуємо дані клубу
    const { data: club } = await supabase
      .from("clubs")
      .select("id, name, settings")
      .eq("id", clubId)
      .maybeSingle();

    const clubName = club?.name || "ФК «Академія»";

    // 3. Отримуємо підписку гравця
    const { data: sub } = await supabase
      .from("player_subscriptions")
      .select("*")
      .eq("player_id", player.id)
      .eq("club_id", clubId)
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
      planAmountUah: sub ? Number(sub.amount_uah) : 200,
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
          signal: AbortSignal.timeout(15000),
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
    const scopedTeamId =
      params?.teamId && params.teamId !== "all" ? params.teamId : undefined;
    const auth = await assertTeamStaff(scopedTeamId);
    if ("error" in auth) {
      return {
        success: false,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        results: [],
        error: auth.error,
      };
    }

    const { user } = auth;
    const supabase = createAdminClient();
    const clubId = user.clubId;

    // 1. Отримуємо клуб та активних гравців команди/клубу паралельно
    let playersQuery = supabase
      .from("players")
      .select("id, first_name, last_name, team_id")
      .eq("club_id", clubId)
      .is("archived_at", null);

    if (scopedTeamId) {
      playersQuery = playersQuery.eq("team_id", scopedTeamId);
    } else if (isCoach(user.role)) {
      const coachTeamIds = user.teamIds ?? [];
      if (coachTeamIds.length === 0) {
        return {
          success: true,
          totalTargeted: 0,
          sentCount: 0,
          simulatedCount: 0,
          failedCount: 0,
          results: [],
        };
      }
      playersQuery = playersQuery.in("team_id", coachTeamIds);
    }

    const [clubRes, playersRes] = await Promise.all([
      supabase
        .from("clubs")
        .select("id, name, settings")
        .eq("id", clubId)
        .maybeSingle(),
      playersQuery,
    ]);

    const players = playersRes.data || [];
    if (players.length === 0) {
      return {
        success: true,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const club = clubRes.data;
    const clubName = club?.name || "ФК «Академія»";
    const paymentUrl =
      (club?.settings as any)?.monobank_jar_url ||
      process.env.NEXT_PUBLIC_MONOBANK_JAR_URL ||
      DEFAULT_MONOBANK_JAR_URL;

    // 2. Отримуємо підписки всіх гравців клубу/команди одним запитом
    const playerIds = players.map((p) => p.id);
    const { data: subs } = await supabase
      .from("player_subscriptions")
      .select("*")
      .eq("club_id", clubId)
      .in("player_id", playerIds);

    const subMap = new Map((subs || []).map((s) => [s.player_id, s]));

    // 3. Відбираємо гравців, яким потрібне нагадування
    const targets: Array<{
      player: (typeof players)[number];
      sub: any;
      daysLeft: number;
      currentPeriodEnd: string;
      urgency: ReturnType<typeof classifyPassportExpirationStatus>["urgency"];
    }> = [];
    const now = new Date();

    for (const p of players) {
      const s = subMap.get(p.id);
      const status = s?.status || "unpaid";
      if (status === "comped") continue;

      const end = s?.current_period_end || new Date(now.getTime() - 86400000).toISOString();
      const daysLeft = calculateDaysLeft(end, now);
      const classification = classifyPassportExpirationStatus(daysLeft, status);

      if (classification.shouldRemind) {
        targets.push({
          player: p,
          sub: s,
          daysLeft,
          currentPeriodEnd: end,
          urgency: classification.urgency,
        });
      }
    }

    if (targets.length === 0) {
      return {
        success: true,
        totalTargeted: 0,
        sentCount: 0,
        simulatedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    // 4. Пакетно завантажуємо батьків (guardians) та Telegram-прив'язки для цільових гравців
    const targetPlayerIds = targets.map((t) => t.player.id);
    const [guardiansRes, bindingsRes] = await Promise.all([
      supabase
        .from("guardians")
        .select("*")
        .in("player_id", targetPlayerIds)
        .order("is_primary", { ascending: false }),
      supabase
        .from("player_telegram_bindings")
        .select("player_id, telegram_chat_id")
        .in("player_id", targetPlayerIds)
        .eq("status", "active"),
    ]);

    const guardianByPlayer = new Map<string, any>();
    for (const g of guardiansRes.data || []) {
      if (g.player_id && !guardianByPlayer.has(g.player_id)) {
        guardianByPlayer.set(g.player_id, g);
      }
    }

    const tgChatByPlayer = new Map<string, string>();
    for (const b of bindingsRes.data || []) {
      if (b.player_id && b.telegram_chat_id && !tgChatByPlayer.has(b.player_id)) {
        tgChatByPlayer.set(b.player_id, b.telegram_chat_id);
      }
    }

    const isExplicitSimulate = params?.simulate === true;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    let sentCount = 0;
    let simulatedCount = 0;
    let failedCount = 0;
    const results: ParentReminderRecord[] = [];

    // 5. Відправляємо або симулюємо нагадування чанками по 5 паралельно
    const CHUNK_SIZE = 5;
    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      const chunk = targets.slice(i, i + CHUNK_SIZE);
      const chunkSettled = await Promise.allSettled(
        chunk.map(async (target) => {
          const { player, sub, daysLeft, currentPeriodEnd, urgency } = target;
          const primaryGuardian = guardianByPlayer.get(player.id) || null;
          const parentName =
            primaryGuardian?.full_name ||
            sub?.payer_name ||
            `Батьки ${player.last_name} ${player.first_name}`;
          const parentPhone = primaryGuardian?.phone || sub?.payer_phone || null;
          const telegramChatId =
            primaryGuardian?.telegram_chat_id || tgChatByPlayer.get(player.id) || null;

          const playerName = `${player.last_name} ${player.first_name}`;
          const expiryDateStr = currentPeriodEnd ? currentPeriodEnd.split("T")[0] : null;
          const messageText = buildPassportReminderTelegramMessage({
            parentName,
            playerName,
            clubName,
            daysLeft,
            expiryDateStr,
            paymentUrl,
            planAmountUah: sub ? Number(sub.amount_uah) : 200,
          });

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
            urgency,
            daysLeft,
            messageText,
            paymentUrl,
            sentAt,
          };

          if (!isStubMode && telegramChatId && botToken) {
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
                signal: AbortSignal.timeout(15000),
              });
              const tgData = await resp.json();
              if (!tgData.ok) {
                record.status = "failed";
                record.errorMessage = tgData.description || "Помилка Telegram API";
              }
            } catch (tgErr: any) {
              record.status = "failed";
              record.errorMessage = tgErr?.message || "Помилка зв'язку з Telegram";
            }
          }

          memoryParentPassportReminders.set(reminderId, record);

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
                      urgency,
                    },
                  ],
                },
                updated_at: sentAt,
              })
              .eq("id", sub.id);
          }

          return record;
        })
      );

      for (const settled of chunkSettled) {
        if (settled.status === "fulfilled") {
          const rec = settled.value;
          results.push(rec);
          if (rec.status === "sent") sentCount++;
          else if (rec.status === "simulated") simulatedCount++;
          else failedCount++;
        } else {
          failedCount++;
        }
      }
    }

    revalidatePath("/team/subscriptions");

    return {
      success: true,
      totalTargeted: targets.length,
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
