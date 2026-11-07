"use server";

import crypto from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertTeamStaff, assertDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getTelegramBotUsername, hashTokenSha256 } from "@/lib/telegram-auth";
import type { CoachTelegramBinding, CoachTelegramSessionDraft } from "@/types/telegram";
import type { TrainingSessionType, RpeScore } from "@/types/workload";

const COACH_TOKEN_EXPIRATION_SECONDS = 48 * 60 * 60; // 48 годин

import {
  memoryCoachTokens,
  memoryCoachBindings,
  memoryCoachSessions,
} from "@/lib/coach-telegram-state";

/**
 * 1. Генерація посилання та QR-коду для прив'язки тренера до Telegram-бота
 */
export async function createCoachTelegramBindingLinkAction(coachUserId: string) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const currentUser = auth.user;
    const targetClubId = currentUser.clubId || DEFAULT_CLUB_ID;

    if (!coachUserId) {
      return { success: false, error: "Не вказано ID тренера" };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Отримуємо дані тренера
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", coachUserId)
      .maybeSingle();

    if (!coachProfile) {
      return { success: false, error: "Профіль тренера не знайдено" };
    }

    // 2. Відкликаємо старі невикористані токени цього тренера
    try {
      await supabase
        .from("coach_telegram_tokens")
        .update({ used_at: nowIso })
        .eq("coach_user_id", coachUserId)
        .is("used_at", null);
    } catch {}

    for (const tok of memoryCoachTokens.values()) {
      if (tok.coach_user_id === coachUserId && !tok.used_at) {
        tok.used_at = nowIso;
      }
    }

    // 3. Генеруємо 128-бітний токен
    const rawToken = crypto.randomBytes(16).toString("hex");
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + COACH_TOKEN_EXPIRATION_SECONDS * 1000).toISOString();

    // Спроба зберегти в таблицю coach_telegram_tokens
    try {
      await supabase.from("coach_telegram_tokens").insert({
        coach_user_id: coachUserId,
        club_id: targetClubId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: currentUser.id,
      });
    } catch {
      // In-memory fallback
      memoryCoachTokens.set(tokenHash, {
        id: crypto.randomUUID(),
        coach_user_id: coachUserId,
        club_id: targetClubId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_at: nowIso,
      });
    }

    // 4. Формуємо deep-link виду: https://t.me/<bot>?start=coach_<token>
    const botUsername = getTelegramBotUsername();
    const deepLink = `https://t.me/${botUsername}?start=coach_${rawToken}`;

    const qrDataUrl = await QRCode.toDataURL(deepLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });

    await logAudit({
      action: "issue_coach_telegram_token",
      entity: "coach_telegram_tokens",
      userId: currentUser.id,
      meta: { coachUserId, expires_in_hours: 48 },
    });

    return {
      success: true,
      rawToken,
      deepLink,
      qrDataUrl,
      expiresAt,
      coachName: coachProfile.full_name || coachProfile.email,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка створення посилання прив'язки" };
  }
}

/**
 * 2. Отримання статусу прив'язки тренера до Telegram
 */
export async function getCoachTelegramStatusAction(coachUserId: string) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    const supabase = createAdminClient();

    // Перевірка в БД
    try {
      const { data: binding } = await supabase
        .from("coach_telegram_bindings")
        .select("*")
        .eq("coach_user_id", coachUserId)
        .eq("status", "active")
        .maybeSingle();

      if (binding) {
        return {
          success: true,
          isLinked: true,
          binding: binding as CoachTelegramBinding,
        };
      }
    } catch {}

    // In-memory fallback
    for (const b of memoryCoachBindings.values()) {
      if (b.coach_user_id === coachUserId && b.status === "active") {
        return {
          success: true,
          isLinked: true,
          binding: b,
        };
      }
    }

    return {
      success: true,
      isLinked: false,
      binding: null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка перевірки статусу" };
  }
}

/**
 * 3. Відв'язка тренера від Telegram
 */
export async function unlinkCoachTelegramAction(coachUserId: string) {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    try {
      await supabase
        .from("coach_telegram_bindings")
        .update({ status: "unlinked", unlinked_at: nowIso })
        .eq("coach_user_id", coachUserId)
        .eq("status", "active");
    } catch {}

    for (const b of memoryCoachBindings.values()) {
      if (b.coach_user_id === coachUserId && b.status === "active") {
        b.status = "unlinked";
        b.unlinked_at = nowIso;
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка відв'язки Telegram" };
  }
}

/**
 * 4. Відправка утреннего светофора (Morning Digest) для тренера
 */
export async function sendCoachMorningDigestAction(params: {
  coachUserId: string;
  chatId?: string;
  targetDate?: string;
}) {
  const supabase = createAdminClient();
  const dateStr = params.targetDate || new Date().toISOString().split("T")[0];

  try {
    // 1. Отримуємо прив'язку тренера
    let chatId = params.chatId;
    if (!chatId) {
      const { data: binding } = await supabase
        .from("coach_telegram_bindings")
        .select("telegram_chat_id")
        .eq("coach_user_id", params.coachUserId)
        .eq("status", "active")
        .maybeSingle();

      chatId = binding?.telegram_chat_id;
    }

    if (!chatId) {
      return { success: false, error: "Тренер не підключений до Telegram" };
    }

    // 2. Знаходимо команди, призначені тренеру
    const { data: assignments } = await supabase
      .from("coach_team_assignments")
      .select("team_id, teams ( id, name )")
      .eq("coach_user_id", params.coachUserId);

    let assignedTeams: { id: string; name: string }[] = [];
    if (assignments && assignments.length > 0) {
      assignedTeams = assignments
        .filter((a) => a.teams)
        .map((a: any) => ({ id: a.teams.id, name: a.teams.name }));
    } else {
      // Перевіряємо в club_members.team_id
      const { data: member } = await supabase
        .from("club_members")
        .select("team_id, teams ( id, name )")
        .eq("user_id", params.coachUserId)
        .maybeSingle();

      if (member?.team_id && member.teams) {
        assignedTeams = [{ id: member.team_id, name: (member.teams as any).name }];
      }
    }

    if (assignedTeams.length === 0) {
      // Якщо команда не призначена, беремо першу команду клубу або виводимо повідомлення
      const { data: anyTeam } = await supabase.from("teams").select("id, name").limit(1).maybeSingle();
      if (anyTeam) assignedTeams = [anyTeam];
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { success: false, error: "TELEGRAM_BOT_TOKEN не налаштовано" };
    }

    // 3. Формуємо зведення для кожної команди
    for (const team of assignedTeams) {
      // Отримуємо всіх активних гравців цієї команди
      const { data: players } = await supabase
        .from("players")
        .select("id, first_name, last_name, status")
        .eq("team_id", team.id)
        .neq("status", "archived")
        .order("last_name", { ascending: true });

      const teamPlayers = players || [];
      const playerIds = teamPlayers.map((p) => p.id);

      // Отримуємо сьогоднішні велнес-записи
      const { data: wellnessRecords } = await supabase
        .from("wellness_entries")
        .select("*")
        .in("player_id", playerIds)
        .eq("date", dateStr);

      const wellnessMap = new Map<string, any>();
      (wellnessRecords || []).forEach((w) => wellnessMap.set(w.player_id, w));

      const redGroup: { name: string; note: string }[] = [];
      const yellowGroup: { name: string; note: string }[] = [];
      const greenGroup: string[] = [];
      const pendingGroup: string[] = [];

      for (const p of teamPlayers) {
        const pName = `${p.last_name} ${p.first_name ? p.first_name[0] + "." : ""}`.trim();
        const w = wellnessMap.get(p.id);

        if (!w) {
          pendingGroup.push(pName);
          continue;
        }

        // Оцінка стану (світлофор)
        const painScore = Number(w.soreness_score || w.pain_score || 0);
        const fatigueScore = Number(w.fatigue_score || 0);
        const sleepHours = Number(w.sleep_hours || 8);
        const readinessPct = Number(w.readiness_score || 75);

        // Червоний прапорець: біль > 3, сон < 5 годин, або readiness < 45%
        if (painScore >= 4 || sleepHours <= 5 || readinessPct < 45 || w.has_injury_alert) {
          const reasons: string[] = [];
          if (painScore >= 4) reasons.push(`біль ${painScore}/10`);
          if (sleepHours <= 5) reasons.push(`сон ${sleepHours} год`);
          if (w.injury_description) reasons.push(w.injury_description);
          redGroup.push({
            name: pName,
            note: reasons.length > 0 ? reasons.join(", ") : "високий рівень втоми",
          });
        } else if (painScore === 3 || fatigueScore >= 4 || (readinessPct >= 45 && readinessPct < 65)) {
          yellowGroup.push({
            name: pName,
            note: fatigueScore >= 4 ? "підвищена втома" : "дискомфорт у м'язах",
          });
        } else {
          greenGroup.push(pName);
        }
      }

      // 4. Формуємо текст повідомлення
      let message = `📋 *Ранковий стан команди: ${team.name}*\n`;
      message += `📅 Дата: *${dateStr}*\n\n`;

      if (redGroup.length > 0) {
        message += `🔴 *ОБМЕЖЕННЯ / РИЗИК ТРАВМИ (${redGroup.length}):*\n`;
        redGroup.forEach((item) => {
          message += `• *${item.name}* — ${item.note}\n`;
        });
        message += `_Рекомендація: консультація лікаря або індивідуальна робота._\n\n`;
      } else {
        message += `🔴 *Обмеження / біль:* немає 🎉\n\n`;
      }

      if (yellowGroup.length > 0) {
        message += `🟡 *Підвищена втома (${yellowGroup.length}):*\n`;
        yellowGroup.forEach((item) => {
          message += `• *${item.name}* (${item.note})\n`;
        });
        message += `\n`;
      }

      message += `🟢 *Готові до повного навантаження:* ${greenGroup.length} із ${teamPlayers.length}\n`;

      if (pendingGroup.length > 0) {
        message += `⚪ *Ще не заповнили анкету (${pendingGroup.length}):*\n`;
        message += `_${pendingGroup.slice(0, 8).join(", ")}${pendingGroup.length > 8 ? ` та ще ${pendingGroup.length - 8}` : ""}_\n`;
      }

      // Кнопки для швидкої взаємодії
      const inlineKeyboard = [
        [
          { text: "🔄 Оновити дані", callback_data: `coach_refresh_digest:${team.id}` },
          { text: "⏱️ Записати тренування", callback_data: `coach_start_training:${team.id}` },
        ],
        [
          { text: "🏠 Головне меню", callback_data: "coach_main_menu" },
        ],
      ];

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: inlineKeyboard },
        }),
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка відправки ранкового дайджесту" };
  }
}

/**
 * 5. Обробка покрокового збереження тренування в БД (workload_sessions + exposures)
 */
export async function finalizeCoachTrainingSession(
  coachUserId: string,
  chatId: string,
  draft: CoachTelegramSessionDraft
) {
  const supabase = createAdminClient();
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  try {
    const targetDate = draft.date || new Date().toISOString().split("T")[0];
    const duration = draft.duration_minutes || 90;
    const rpe = (draft.rpe_score ?? 5) as RpeScore;
    const sessionType = draft.session_type || "training_team";

    let teamId = draft.team_id;
    if (!teamId) {
      const { data: member } = await supabase
        .from("club_members")
        .select("team_id")
        .eq("user_id", coachUserId)
        .maybeSingle();
      teamId = member?.team_id;
    }

    if (!teamId) {
      const { data: team } = await supabase.from("teams").select("id").limit(1).maybeSingle();
      teamId = team?.id;
    }

    if (!teamId) {
      throw new Error("Не знайдено команду тренера");
    }

    // Отримуємо гравців команди
    const { data: players } = await supabase
      .from("players")
      .select("id, first_name, last_name, club_id")
      .eq("team_id", teamId)
      .neq("status", "archived");

    const teamPlayers = players || [];
    const clubId = teamPlayers[0]?.club_id || DEFAULT_CLUB_ID;
    const teamSessionId = `tg_sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const notesSummary = [
      draft.surface ? `Покриття: ${draft.surface}` : null,
      draft.incident === "injury" ? "⚠️ Зафіксовано травму на тренуванні" : "Без травм",
      draft.notes ? `Коментар тренера: ${draft.notes}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    // Створюємо записи workload_sessions для гравців
    for (const player of teamPlayers) {
      await supabase.from("workload_sessions").insert({
        player_id: player.id,
        team_id: teamId,
        date: targetDate,
        duration_minutes: duration,
        rpe_score: rpe,
        coach_rpe: rpe,
        session_type: sessionType,
        team_session_id: teamSessionId,
        attendance_status: "present",
        notes: notesSummary,
      });

      // Запис у таблицю exposures
      await supabase.from("exposures").insert({
        club_id: clubId,
        player_id: player.id,
        date: targetDate,
        exposure_type: sessionType === "match" ? "match" : "training",
        minutes: duration,
        workload_session_id: teamSessionId,
        notes: notesSummary,
      });
    }

    // Очищаємо сесію тренера
    await resetCoachSession(coachUserId, chatId);

    // Відправляємо успішне повідомлення
    if (botToken) {
      const typeLabels: Record<string, string> = {
        training_team: "🏃 Командне тренування",
        match: "⚽ Офіційний матч",
        gym_strength: "🏋️ Силовий зал",
        recovery: "🧘 Відновлювальне заняття",
        individual_rehab: "🩹 Реабілітація",
      };

      const successText =
        `✅ *Тренування успішно зафіксовано!*\n\n` +
        `📌 *Тип:* ${typeLabels[sessionType] || sessionType}\n` +
        `⏱️ *Тривалість:* ${duration} хв\n` +
        `⚡ *Навантаження (RPE):* ${rpe}/10 (Об'єм: ${duration * rpe} AU)\n` +
        `👥 *Гравців у складі:* ${teamPlayers.length}\n` +
        (draft.surface ? `🌱 *Покриття:* ${draft.surface}\n` : "") +
        (draft.notes ? `📝 *Замітка:* ${draft.notes}\n` : "") +
        `\n_Дані автоматично синхронізовано з кабінетом аналітики та лікаря клубу._`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: successText,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📋 Переглянути стан команди", callback_data: `coach_refresh_digest:${teamId}` }],
              [{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }],
            ],
          },
        }),
      });
    }

    return { success: true, teamSessionId, playersCount: teamPlayers.length };
  } catch (err: any) {
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `❌ Не вдалося зберегти тренування: ${err?.message || "Помилка"}. Будь ласка, спробуйте знову.`,
          reply_markup: {
            inline_keyboard: [[{ text: "🏠 Головне меню", callback_data: "coach_main_menu" }]],
          },
        }),
      });
    }
    return { success: false, error: err?.message };
  }
}

/**
 * 6. Очищення або отримання стану сесії тренера
 */
export async function getCoachSession(coachUserId: string, chatId: string) {
  const supabase = createAdminClient();
  try {
    const { data } = await supabase
      .from("coach_telegram_sessions")
      .select("*")
      .eq("coach_user_id", coachUserId)
      .maybeSingle();

    if (data) {
      return {
        current_step: data.current_step,
        session_draft: (data.session_draft || {}) as CoachTelegramSessionDraft,
      };
    }
  } catch {}

  const mem = memoryCoachSessions.get(chatId);
  return mem || { current_step: "idle", session_draft: {} };
}

export async function updateCoachSession(
  coachUserId: string,
  chatId: string,
  step: string,
  draftUpdates: Partial<CoachTelegramSessionDraft>
) {
  const supabase = createAdminClient();
  const current = await getCoachSession(coachUserId, chatId);
  const updatedDraft = { ...current.session_draft, ...draftUpdates };

  try {
    await supabase.from("coach_telegram_sessions").upsert(
      {
        coach_user_id: coachUserId,
        telegram_chat_id: chatId,
        current_step: step,
        session_draft: updatedDraft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_chat_id" }
    );
  } catch {}

  memoryCoachSessions.set(chatId, {
    current_step: step,
    session_draft: updatedDraft,
  });

  return { current_step: step, session_draft: updatedDraft };
}

export async function resetCoachSession(coachUserId: string, chatId: string) {
  const supabase = createAdminClient();
  try {
    await supabase
      .from("coach_telegram_sessions")
      .delete()
      .eq("telegram_chat_id", chatId);
  } catch {}

  memoryCoachSessions.delete(chatId);
}
