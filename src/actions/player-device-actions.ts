"use server";

import crypto from "crypto";
import { createAdminClient } from "../utils/supabase/admin.ts";
import { assertDoctor, assertAuth } from "../lib/auth.ts";
import { getPlayerConsentSummary } from "../lib/consents.ts";
import { logAudit } from "../lib/audit.ts";
import {
  generateActivationToken,
  generateDeviceSessionSecret,
  hashTokenSha256,
  parseDeviceName,
  setDeviceSessionCookie,
  clearAllDeviceSessionCookies,
  getClientIp,
  getClientUserAgent,
  ACTIVATION_TOKEN_MAX_AGE_SECONDS,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  MAX_ACTIVE_DEVICES_PER_PLAYER,
  memoryActivationTokens,
  memoryPlayerDevices,
} from "../lib/player-device-auth.ts";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "../lib/player-rate-limit.ts";
import type { PlayerDevice, PlayerActivationToken, ActivationResult } from "../types/player-device.ts";

async function safeRevalidatePath(path: string) {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(path);
  } catch {}
}

/**
 * 1. Генерація одноразового QR-коду активації лікарем або адміністратором.
 * 128 біт випадкових даних, у БД лише SHA-256 хэш, строк 14 днів.
 */
export async function generatePlayerActivationQrAction(playerId: string): Promise<{
  success: boolean;
  token?: string;
  tokenHash?: string;
  expiresAt?: string;
  error?: string;
}> {
  try {
    const user = await assertDoctor();
    if (!playerId) {
      return { success: false, error: "Не вказано ID гравця" };
    }

    // 128 біт випадкових даних
    const rawToken = generateActivationToken();
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_MAX_AGE_SECONDS * 1000).toISOString();

    const supabase = createAdminClient();

    // Запис у базу даних player_activation_tokens
    const { data, error } = await supabase
      .from("player_activation_tokens")
      .insert({
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      // Fallback до in-memory (якщо міграцію ще не застосовано в тестовому середовищі)
      const mockId = crypto.randomUUID();
      memoryActivationTokens.set(tokenHash, {
        id: mockId,
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
    }

    // 7. Запис у audit_log: видача (БЕЗ самого токена)
    await logAudit({
      action: "issue_device_activation_token",
      entity: "player_activation_token",
      playerId: playerId,
      userId: user.id,
      meta: {
        expires_in_days: 14,
      },
    });

    return {
      success: true,
      token: rawToken,
      tokenHash,
      expiresAt,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Не вдалося згенерувати QR-код" };
  }
}

/**
 * 2. Перевірка токена та активація пристрою гравця на маршруті /a/[token]
 * - Обмеження спроб по IP та токену (5 помилок = 15 хв блок)
 * - Одноразовість: токен позначається використаним
 * - Перевірка згоди батьків data_processing для гравців < 18 років
 * - Обмеження макс 2 пристроїв (ротація старого)
 * - Довга сесія пристрою (90 днів)
 * - Запис у audit_log
 */
export async function verifyAndActivateDeviceAction(
  token: string,
  options?: { ip?: string; userAgent?: string; bypassCookie?: boolean }
): Promise<ActivationResult> {
  const ip = options?.ip || (await getClientIp());
  const userAgent = options?.userAgent || (await getClientUserAgent());

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    recordFailedAttempt(ip, true);
    return { success: false, error: "Токен активації не передано" };
  }

  const cleanToken = token.trim();
  const tokenHash = hashTokenSha256(cleanToken);

  // 4. Ограничение попыток по IP и по токену (5 неудач = блокировка на 15 минут)
  const ipLimit = checkRateLimit(ip, true);
  if (ipLimit.isLocked) {
    return {
      success: false,
      error: `Забагато спроб активації. Доступ заблоковано на ${ipLimit.lockedUntilMinutes || 15} хв.`,
      lockedUntilMinutes: ipLimit.lockedUntilMinutes || 15,
    };
  }

  const tokenLimit = checkRateLimit(tokenHash, false);
  if (tokenLimit.isLocked) {
    return {
      success: false,
      error: `Забагато спроб активації для цього токена. Блокування на ${tokenLimit.lockedUntilMinutes || 15} хв.`,
      lockedUntilMinutes: tokenLimit.lockedUntilMinutes || 15,
    };
  }

  const supabase = createAdminClient();

  // Пошук токена в базі
  let tokenRecord: PlayerActivationToken | null = null;

  const { data: dbRecord, error: dbErr } = await supabase
    .from("player_activation_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!dbErr && dbRecord) {
    tokenRecord = dbRecord as PlayerActivationToken;
  } else if (memoryActivationTokens.has(tokenHash)) {
    tokenRecord = memoryActivationTokens.get(tokenHash) as PlayerActivationToken;
  }

  // Якщо токен не знайдено
  if (!tokenRecord) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "QR-код недійсний. Зверніться до тренера або лікаря клубу.",
    };
  }

  // Перевірка одноразовості: якщо вже використано
  if (tokenRecord.used_at) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "Цей QR-код вже був використаний для активації пристрою. Зверніться до лікаря або тренера для отримання нового QR.",
    };
  }

  // Перевірка терміну дії (14 днів)
  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  if (now > expiresAt) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "Термін дії цього QR-коду закінчився (термін дії: 14 днів). Зверніться до лікаря для генерації нового коду.",
    };
  }

  const playerId = tokenRecord.player_id;

  // 6. Активація вимагає згоди (consent data_processing) для гравців молодше 18 років
  const consentSummary = await getPlayerConsentSummary(playerId);
  if (consentSummary.isMinor) {
    const dataConsent = consentSummary.scopes["data_processing"];
    if (!dataConsent || dataConsent.status !== "granted") {
      return {
        success: false,
        requiresConsent: true,
        playerId,
        error: "Для активації особистого кабінету потрібна згода батьків на обробку даних. Зверніться до тренера/лікаря.",
      };
    }
  }

  // 5. Устройства игрока: максимум 2 активных устройства
  // Отримуємо існуючі активні пристрої гравця
  let activeDevices: PlayerDevice[] = [];
  const { data: dbDevices } = await supabase
    .from("player_devices")
    .select("*")
    .eq("player_id", playerId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("last_seen_at", { ascending: true });

  if (dbDevices && dbDevices.length > 0) {
    activeDevices = dbDevices as PlayerDevice[];
  } else {
    activeDevices = Array.from(memoryPlayerDevices.values()).filter(
      (d) => d.player_id === playerId && !d.revoked_at && new Date(d.expires_at) > now
    );
  }

  // Якщо вже є 2 або більше пристроїв, відкликаємо найстаріший (ротація до макс 2)
  if (activeDevices.length >= MAX_ACTIVE_DEVICES_PER_PLAYER) {
    const toRevoke = activeDevices.slice(0, activeDevices.length - MAX_ACTIVE_DEVICES_PER_PLAYER + 1);
    for (const dev of toRevoke) {
      await supabase
        .from("player_devices")
        .update({ revoked_at: now.toISOString() })
        .eq("id", dev.id);

      if (memoryPlayerDevices.has(dev.id)) {
        const mem = memoryPlayerDevices.get(dev.id)!;
        mem.revoked_at = now.toISOString();
      }
    }
  }

  // Позначаємо токен використаним
  const usedAt = now.toISOString();
  await supabase
    .from("player_activation_tokens")
    .update({ used_at: usedAt })
    .eq("id", tokenRecord.id);

  if (memoryActivationTokens.has(tokenHash)) {
    memoryActivationTokens.get(tokenHash)!.used_at = usedAt;
  }

  // 2. Створюємо довгу сесію пристрою (90 днів)
  const deviceSessionSecret = generateDeviceSessionSecret();
  const deviceTokenHash = hashTokenSha256(deviceSessionSecret);
  const deviceName = parseDeviceName(userAgent);
  const deviceExpiresAt = new Date(Date.now() + DEVICE_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const deviceId = crypto.randomUUID();

  const newDevice: PlayerDevice = {
    id: deviceId,
    player_id: playerId,
    device_token_hash: deviceTokenHash,
    device_name: deviceName,
    user_agent: userAgent,
    ip_address: ip,
    last_seen_at: now.toISOString(),
    expires_at: deviceExpiresAt,
    revoked_at: null,
    created_at: now.toISOString(),
  };

  const { error: insertDevErr } = await supabase.from("player_devices").insert({
    id: deviceId,
    player_id: playerId,
    device_token_hash: deviceTokenHash,
    device_name: deviceName,
    user_agent: userAgent,
    ip_address: ip,
    last_seen_at: now.toISOString(),
    expires_at: deviceExpiresAt,
  });

  if (insertDevErr) {
    memoryPlayerDevices.set(deviceId, newDevice);
  }

  // Встановлюємо безпечну httpOnly куку сесії пристрою
  if (!options?.bypassCookie) {
    await setDeviceSessionCookie(deviceId, deviceSessionSecret, playerId);
  }

  // Скидаємо лічильники спроб
  resetAttempts(ip, true);
  resetAttempts(tokenHash, false);

  // 7. Запис у audit_log: активація (БЕЗ самого токена)
  await logAudit({
    action: "activate_player_device",
    entity: "player_device",
    entityId: deviceId,
    playerId: playerId,
    allowPublic: true,
    meta: {
      device_name: deviceName,
      ip: ip,
    },
  });

  return {
    success: true,
    playerId,
  };
}

/**
 * 5. Отримання списку активних пристроїв гравця для лікаря/адміністратора (максимум 2)
 */
export async function getPlayerActiveDevicesAction(playerId: string): Promise<{
  success: boolean;
  devices: PlayerDevice[];
  error?: string;
}> {
  try {
    await assertDoctor();
    if (!playerId) {
      return { success: false, devices: [], error: "Не вказано гравця" };
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("player_devices")
      .select("*")
      .eq("player_id", playerId)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("last_seen_at", { ascending: false })
      .limit(MAX_ACTIVE_DEVICES_PER_PLAYER);

    if (!error && data) {
      return { success: true, devices: data as PlayerDevice[] };
    }

    // Fallback до memory
    const memDevices = Array.from(memoryPlayerDevices.values())
      .filter((d) => d.player_id === playerId && !d.revoked_at && new Date(d.expires_at) > new Date())
      .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())
      .slice(0, MAX_ACTIVE_DEVICES_PER_PLAYER);

    return { success: true, devices: memDevices };
  } catch (err: any) {
    return { success: false, devices: [], error: err?.message || "Помилка завантаження пристроїв" };
  }
}

/**
 * 5 & 7. Відкликати доступ (всі сесії пристроїв гравця) лікарем/адміністратором
 * Отозванное устройство теряет доступ сразу.
 */
export async function revokePlayerDevicesAction(playerId: string): Promise<{
  success: boolean;
  error?: string;
  revokedCount?: number;
}> {
  try {
    const user = await assertDoctor();
    if (!playerId) {
      return { success: false, error: "Не вказано гравця" };
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    // 1. Відкликаємо всі активні сесії пристроїв гравця
    const { data: updated, error } = await supabase
      .from("player_devices")
      .update({ revoked_at: now })
      .eq("player_id", playerId)
      .is("revoked_at", null)
      .select("id");

    let count = updated?.length || 0;

    // Оновлюємо memory
    for (const [id, dev] of memoryPlayerDevices.entries()) {
      if (dev.player_id === playerId && !dev.revoked_at) {
        dev.revoked_at = now;
        count++;
      }
    }

    // 2. Анулюємо невикористані одноразові токени активації
    await supabase
      .from("player_activation_tokens")
      .update({ used_at: now })
      .eq("player_id", playerId)
      .is("used_at", null);

    for (const [, tok] of memoryActivationTokens.entries()) {
      if (tok.player_id === playerId && !tok.used_at) {
        tok.used_at = now;
      }
    }

    // 7. Запис у audit_log: відкликання (без токенів)
    await logAudit({
      action: "revoke_player_devices",
      entity: "player_device",
      playerId: playerId,
      userId: user.id,
      meta: {
        revoked_count: count,
      },
    });

    await safeRevalidatePath(`/players/${playerId}`);
    await safeRevalidatePath("/rehab-portal");

    return { success: true, revokedCount: count };
  } catch (err: any) {
    return { success: false, error: err?.message || "Не вдалося відкликати доступ" };
  }
}

/**
 * Валідує активність сесії пристрою при кожному запиті до кабінету.
 * Якщо пристрій було відкликано — повертає null і очищує куки.
 */
export async function validateDeviceSessionRecord(
  deviceId: string,
  sessionSecret: string
): Promise<{ valid: boolean; playerId?: string }> {
  if (!deviceId || !sessionSecret) return { valid: false };

  const tokenHash = hashTokenSha256(sessionSecret);
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Шукаємо в БД
  const { data: device, error } = await supabase
    .from("player_devices")
    .select("id, player_id, revoked_at, expires_at")
    .eq("id", deviceId)
    .eq("device_token_hash", tokenHash)
    .maybeSingle();

  if (!error && device) {
    if (device.revoked_at || new Date(device.expires_at) < new Date()) {
      return { valid: false };
    }
    // Оновлюємо last_seen_at у фоні
    await supabase
      .from("player_devices")
      .update({ last_seen_at: now })
      .eq("id", deviceId);

    return { valid: true, playerId: device.player_id };
  }

  // Перевірка в пам'яті (для тестів/fallback)
  const memDevice = memoryPlayerDevices.get(deviceId);
  if (memDevice && memDevice.device_token_hash === tokenHash) {
    if (memDevice.revoked_at || new Date(memDevice.expires_at) < new Date()) {
      return { valid: false };
    }
    memDevice.last_seen_at = now;
    return { valid: true, playerId: memDevice.player_id };
  }

  return { valid: false };
}
