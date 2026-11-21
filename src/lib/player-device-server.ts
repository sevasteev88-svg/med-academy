import crypto from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPlayerConsentSummary } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import {
  generateDeviceSessionSecret,
  hashTokenSha256,
  parseDeviceName,
  setDeviceSessionCookie,
  getClientIp,
  getClientUserAgent,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  MAX_ACTIVE_DEVICES_PER_PLAYER,
  memoryActivationTokens,
  memoryPlayerDevices,
} from "@/lib/player-device-auth";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "@/lib/player-rate-limit";
import type {
  PlayerDevice,
  PlayerActivationToken,
  ActivationResult,
} from "@/types/player-device";

/**
 * Серверна активація пристрою за одноразовим 128-бітним токеном (QR).
 * Викликається виключно серверним Route Handler `/a/[token]` (не є Server Action).
 */
export async function verifyAndActivateDeviceInternal(
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

  if (!tokenRecord) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "QR-код недійсний. Зверніться до тренера або лікаря клубу.",
    };
  }

  if (tokenRecord.used_at) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "Цей QR-код вже був використаний для активації пристрою. Зверніться до лікаря або тренера для отримання нового QR.",
    };
  }

  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  if (now > expiresAt) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "Термін дії цього QR-коду закінчився. Зверніться до тренера/лікаря для генерації нового коду.",
    };
  }

  const playerId = tokenRecord.player_id;

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

  const usedAt = now.toISOString();
  await supabase
    .from("player_activation_tokens")
    .update({ used_at: usedAt })
    .eq("id", tokenRecord.id);

  if (memoryActivationTokens.has(tokenHash)) {
    memoryActivationTokens.get(tokenHash)!.used_at = usedAt;
  }

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

  if (!options?.bypassCookie) {
    await setDeviceSessionCookie(deviceId, deviceSessionSecret, playerId);
  }

  resetAttempts(ip, true);
  resetAttempts(tokenHash, false);

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
    deviceId,
    deviceSessionSecret,
  };
}

/**
 * Валідує активність сесії пристрою при кожному запиті до кабінету (не є Server Action).
 */
export async function validateDeviceSessionRecord(
  deviceId: string,
  sessionSecret: string
): Promise<{ valid: boolean; playerId?: string }> {
  if (!deviceId || !sessionSecret) return { valid: false };

  const tokenHash = hashTokenSha256(sessionSecret);
  const supabase = createAdminClient();
  const now = new Date().toISOString();

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
    await supabase
      .from("player_devices")
      .update({ last_seen_at: now })
      .eq("id", deviceId);

    return { valid: true, playerId: device.player_id };
  }

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
