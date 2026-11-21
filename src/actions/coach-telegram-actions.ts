"use server";

import crypto from "crypto";
import QRCode from "qrcode";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  assertAuth,
  assertMemberInUserClub,
  isDoctor,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashTokenSha256 } from "@/lib/telegram-auth";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { sendCoachMorningDigestInternal } from "@/lib/coach-telegram-server";
import type { CoachTelegramBinding } from "@/types/telegram";
import {
  memoryCoachTokens,
  memoryCoachBindings,
} from "@/lib/coach-telegram-state";

const COACH_TOKEN_EXPIRATION_SECONDS = 48 * 60 * 60; // 48 годин

/**
 * 1. Генерація посилання та QR-коду для прив'язки тренера до Telegram-бота
 */
export async function createCoachTelegramBindingLinkAction(coachUserId: string) {
  try {
    const auth = await assertAuth();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const currentUser = auth.user;

    if (!coachUserId) {
      return { success: false, error: "Не вказано ID тренера" };
    }

    if (!isDoctor(currentUser.role) && currentUser.id !== coachUserId) {
      return { success: false, error: "Недостатньо прав." };
    }

    const memberCheck = await assertMemberInUserClub(currentUser, coachUserId);
    if ("error" in memberCheck) {
      return { success: false, error: memberCheck.error };
    }

    const targetClubId = currentUser.clubId;
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

    // 2. Відкликаємо старі невикористані токени цього тренера у клубі
    try {
      await supabase
        .from("coach_telegram_tokens")
        .update({ used_at: nowIso })
        .eq("coach_user_id", coachUserId)
        .eq("club_id", targetClubId)
        .is("used_at", null);
    } catch {}

    for (const tok of memoryCoachTokens.values()) {
      if (tok.coach_user_id === coachUserId && tok.club_id === targetClubId && !tok.used_at) {
        tok.used_at = nowIso;
      }
    }

    // 3. Генеруємо 128-бітний токен
    const rawToken = crypto.randomBytes(16).toString("hex");
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + COACH_TOKEN_EXPIRATION_SECONDS * 1000).toISOString();

    try {
      await supabase.from("coach_telegram_tokens").insert({
        coach_user_id: coachUserId,
        club_id: targetClubId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: currentUser.id,
      });
    } catch {
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
    const { botUsername } = await getClubTelegramConfig(targetClubId);
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
      clubId: targetClubId,
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
    const auth = await assertAuth();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const currentUser = auth.user;

    if (!isDoctor(currentUser.role) && currentUser.id !== coachUserId) {
      return { success: false, error: "Недостатньо прав." };
    }

    const memberCheck = await assertMemberInUserClub(currentUser, coachUserId);
    if ("error" in memberCheck) {
      return { success: false, error: memberCheck.error };
    }

    const supabase = createAdminClient();

    try {
      const { data: binding } = await supabase
        .from("coach_telegram_bindings")
        .select("*")
        .eq("coach_user_id", coachUserId)
        .eq("club_id", currentUser.clubId)
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

    for (const b of memoryCoachBindings.values()) {
      if (
        b.coach_user_id === coachUserId &&
        b.club_id === currentUser.clubId &&
        b.status === "active"
      ) {
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
    const auth = await assertAuth();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const currentUser = auth.user;

    if (!isDoctor(currentUser.role) && currentUser.id !== coachUserId) {
      return { success: false, error: "Недостатньо прав." };
    }

    const memberCheck = await assertMemberInUserClub(currentUser, coachUserId);
    if ("error" in memberCheck) {
      return { success: false, error: memberCheck.error };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    try {
      await supabase
        .from("coach_telegram_bindings")
        .update({ status: "unlinked", unlinked_at: nowIso })
        .eq("coach_user_id", coachUserId)
        .eq("club_id", currentUser.clubId)
        .eq("status", "active");
    } catch {}

    for (const b of memoryCoachBindings.values()) {
      if (
        b.coach_user_id === coachUserId &&
        b.club_id === currentUser.clubId &&
        b.status === "active"
      ) {
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
 * 4. Відправка ранкового світлофора (Morning Digest) для тренера.
 * Клієнт не може передати довільний chatId — використовується лише прив'язаний акаунт у межах клубу.
 */
export async function sendCoachMorningDigestAction(params: {
  coachUserId: string;
  targetDate?: string;
}) {
  const auth = await assertAuth();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }
  const currentUser = auth.user;

  if (!isDoctor(currentUser.role) && currentUser.id !== params.coachUserId) {
    return { success: false, error: "Недостатньо прав." };
  }

  const memberCheck = await assertMemberInUserClub(currentUser, params.coachUserId);
  if ("error" in memberCheck) {
    return { success: false, error: memberCheck.error };
  }

  return sendCoachMorningDigestInternal({
    coachUserId: params.coachUserId,
    targetDate: params.targetDate,
  });
}
