"use server";

import crypto from "crypto";
import { createAdminClient } from "../utils/supabase/admin.ts";
import { assertDoctor, assertAuth, assertTeamStaff } from "../lib/auth.ts";
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
import type {
  PlayerDevice,
  PlayerActivationToken,
  ActivationResult,
  TeamPlayerActivationSummary,
  GeneratedQrCard,
  PlayerActivationStatus,
} from "../types/player-device.ts";

async function safeRevalidatePath(path: string) {
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(path);
  } catch {}
}

/**
 * 1. Генерація одноразового QR-коду активації лікарем, адміністратором або тренером команди.
 * 128 біт випадкових даних, у БД лише SHA-256 хэш, строк 14 днів.
 * Старі невикористані токени цього гравця відкликаються.
 */
export async function generatePlayerActivationQrAction(playerId: string): Promise<{
  success: boolean;
  token?: string;
  tokenHash?: string;
  expiresAt?: string;
  activationUrl?: string;
  card?: GeneratedQrCard;
  error?: string;
}> {
  try {
    const auth = await assertTeamStaff();
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const user = auth.user;

    if (!playerId) {
      return { success: false, error: "Не вказано ID гравця" };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Отримуємо дані гравця та команди для картки
    const { data: player } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_id, teams ( name )")
      .eq("id", playerId)
      .maybeSingle();

    const fullName = player ? `${player.last_name} ${player.first_name}`.trim() : "Гравець";
    const teamName = (player as any)?.teams?.name || "Команда";

    // Якщо тренер генерує — перевіряємо команду
    if (user.role === "coach" && user.teamId && player?.team_id && user.teamId !== player.team_id) {
      return { success: false, error: "Тренер може генерувати QR-код лише для гравців своєї команди" };
    }

    // 2. Відкликаємо старі невикористані токени гравця
    await supabase
      .from("player_activation_tokens")
      .update({ used_at: nowIso })
      .eq("player_id", playerId)
      .is("used_at", null);

    for (const tok of memoryActivationTokens.values()) {
      if (tok.player_id === playerId && !tok.used_at) {
        tok.used_at = nowIso;
      }
    }

    // 3. 128 біт випадкових даних
    const rawToken = generateActivationToken();
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_MAX_AGE_SECONDS * 1000).toISOString();

    // Запис у базу даних player_activation_tokens
    const { error } = await supabase
      .from("player_activation_tokens")
      .insert({
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: user.id,
      });

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
        created_at: nowIso,
      });
    }

    // 7. Запис у audit_log: видача (БЕЗ самого токена)
    await logAudit({
      action: "issue_device_activation_token",
      entity: "player_activation_token",
      playerId: playerId,
      userId: user.id,
      meta: {
        expires_in_days: 365,
      },
    });

    const activationUrl = `/a/${rawToken}`;

    return {
      success: true,
      token: rawToken,
      tokenHash,
      expiresAt,
      activationUrl,
      card: {
        playerId,
        fullName,
        teamName,
        position: (player as any)?.position || undefined,
        token: rawToken,
        activationUrl,
      },
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

  // Перевірка терміну дії (365 днів)
  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  if (now > expiresAt) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(tokenHash, false);
    return {
      success: false,
      error: "Термін дії цього QR-коду закінчився (термін дії: 365 днів). Зверніться до тренера/лікаря для генерації нового коду.",
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
    deviceId,
    deviceSessionSecret,
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
    const authRes = await assertDoctor();
    if ("error" in authRes) {
      return { success: false, error: authRes.error };
    }
    const user = authRes.user;
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

/**
 * 8.3 Отримання статусу активації пристроїв по всіх гравцях команди
 * (для сторінки «Команда → QR-картки», доступної лікарю, адміну та тренеру)
 */
export async function getTeamActivationSummaryAction(teamId: string): Promise<{
  success: boolean;
  teamId?: string;
  teamName?: string;
  players?: TeamPlayerActivationSummary[];
  error?: string;
}> {
  try {
    const auth = await assertTeamStaff(teamId);
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }

    if (!teamId) {
      return { success: false, error: "Не вказано команду" };
    }

    const supabase = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Отримуємо назву команди
    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();

    const teamName = teamData?.name || "Команда";

    // 2. Отримуємо активних гравців цієї команди
    const { data: playersData, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, date_of_birth, team_id")
      .eq("team_id", teamId)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (pErr) {
      return { success: false, error: pErr.message };
    }

    const rawPlayers = playersData || [];
    const playerIds = rawPlayers.map((p) => p.id);

    if (playerIds.length === 0) {
      return { success: true, teamId, teamName, players: [] };
    }

    // 3. Активні пристрої гравців
    const { data: devicesData } = await supabase
      .from("player_devices")
      .select("*")
      .in("player_id", playerIds)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("last_seen_at", { ascending: false });

    const activeDeviceMap = new Map<string, PlayerDevice>();
    (devicesData || []).forEach((dev: any) => {
      if (!activeDeviceMap.has(dev.player_id)) {
        activeDeviceMap.set(dev.player_id, dev);
      }
    });

    for (const dev of memoryPlayerDevices.values()) {
      if (
        playerIds.includes(dev.player_id) &&
        !dev.revoked_at &&
        new Date(dev.expires_at) > now
      ) {
        if (!activeDeviceMap.has(dev.player_id)) {
          activeDeviceMap.set(dev.player_id, dev);
        }
      }
    }

    // 4. Останні токени активації
    const { data: tokensData } = await supabase
      .from("player_activation_tokens")
      .select("*")
      .in("player_id", playerIds)
      .order("created_at", { ascending: false });

    const latestTokenMap = new Map<string, PlayerActivationToken>();
    (tokensData || []).forEach((tok: any) => {
      if (!latestTokenMap.has(tok.player_id)) {
        latestTokenMap.set(tok.player_id, tok);
      }
    });

    for (const tok of memoryActivationTokens.values()) {
      if (playerIds.includes(tok.player_id)) {
        const existing = latestTokenMap.get(tok.player_id);
        if (!existing || new Date(tok.created_at) > new Date(existing.created_at)) {
          latestTokenMap.set(tok.player_id, tok);
        }
      }
    }

    // 5. Формуємо зведений статус
    const summaries: TeamPlayerActivationSummary[] = [];

    for (const player of rawPlayers) {
      const activeDev = activeDeviceMap.get(player.id);
      const latestTok = latestTokenMap.get(player.id);

      let status: PlayerActivationStatus = "not_issued";
      let statusLabelUa = "Не сформовано";

      if (activeDev) {
        status = "active";
        statusLabelUa = "Активовано";
      } else if (latestTok) {
        if (!latestTok.used_at && new Date(latestTok.expires_at) > now) {
          status = "pending";
          statusLabelUa = "Не активовано";
        } else {
          status = "revoked_or_expired";
          statusLabelUa = "Відкликано";
        }
      }

      let requiresParentConsent = false;
      let hasParentConsent = true;
      try {
        const consent = await getPlayerConsentSummary(player.id);
        requiresParentConsent = consent.isMinor;
        hasParentConsent = !consent.isMinor || Boolean(consent.scopes["data_processing"]?.status === "granted");
      } catch {}

      summaries.push({
        playerId: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        position: player.position,
        teamId: player.team_id,
        teamName,
        activationStatus: status,
        statusLabelUa,
        activeDeviceName: activeDev ? activeDev.device_name : null,
        lastSeenAt: activeDev ? activeDev.last_seen_at : null,
        tokenExpiresAt: latestTok && !latestTok.used_at ? latestTok.expires_at : null,
        requiresParentConsent,
        hasParentConsent,
      });
    }

    return {
      success: true,
      teamId,
      teamName,
      players: summaries,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Не вдалося отримати статус команди" };
  }
}

/**
 * 8.3 Пакетне формування карток для команди:
 * Для кожного активного гравця без діючої активації створюється новий токен (128 біт),
 * старі невикористані токени відкликаються.
 * Якщо forceAll === true — перегенеровуються для всіх гравців.
 */
export async function generateTeamActivationBatchAction(
  teamId: string,
  options?: { forceAll?: boolean }
): Promise<{
  success: boolean;
  teamId?: string;
  teamName?: string;
  count?: number;
  cards?: GeneratedQrCard[];
  error?: string;
}> {
  try {
    const auth = await assertTeamStaff(teamId);
    if ("error" in auth) {
      return { success: false, error: auth.error };
    }
    const user = auth.user;

    if (!teamId) {
      return { success: false, error: "Не вказано команду" };
    }

    const supabase = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Отримуємо інформацію про команду
    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();

    const teamName = teamData?.name || "Команда";

    // 2. Отримуємо активних гравців
    const { data: playersData, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, team_id")
      .eq("team_id", teamId)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (pErr || !playersData) {
      return { success: false, error: pErr?.message || "Гравців не знайдено" };
    }

    const playerIds = playersData.map((p) => p.id);
    if (playerIds.length === 0) {
      return { success: true, teamId, teamName, count: 0, cards: [] };
    }

    // 3. Перевіряємо, хто вже має діючу активацію (активні пристрої)
    const playersWithActiveDevice = new Set<string>();
    if (!options?.forceAll) {
      const { data: activeDevs } = await supabase
        .from("player_devices")
        .select("player_id")
        .in("player_id", playerIds)
        .is("revoked_at", null)
        .gt("expires_at", nowIso);

      (activeDevs || []).forEach((d: any) => playersWithActiveDevice.add(d.player_id));

      for (const dev of memoryPlayerDevices.values()) {
        if (playerIds.includes(dev.player_id) && !dev.revoked_at && new Date(dev.expires_at) > now) {
          playersWithActiveDevice.add(dev.player_id);
        }
      }
    }

    const eligiblePlayers = playersData.filter((p) => {
      if (options?.forceAll) return true;
      return !playersWithActiveDevice.has(p.id);
    });

    if (eligiblePlayers.length === 0) {
      return {
        success: true,
        teamId,
        teamName,
        count: 0,
        cards: [],
      };
    }

    const eligibleIds = eligiblePlayers.map((p) => p.id);

    // 4. Відкликаємо старі невикористані токени для цих гравців
    await supabase
      .from("player_activation_tokens")
      .update({ used_at: nowIso })
      .in("player_id", eligibleIds)
      .is("used_at", null);

    for (const tok of memoryActivationTokens.values()) {
      if (eligibleIds.includes(tok.player_id) && !tok.used_at) {
        tok.used_at = nowIso;
      }
    }

    // 5. Генеруємо нові токени для кожного гравця
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_MAX_AGE_SECONDS * 1000).toISOString();
    const rowsToInsert: any[] = [];
    const generatedCards: GeneratedQrCard[] = [];

    for (const player of eligiblePlayers) {
      const rawToken = generateActivationToken();
      const tokenHash = hashTokenSha256(rawToken);

      rowsToInsert.push({
        player_id: player.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_by: user.id,
      });

      const mockId = crypto.randomUUID();
      memoryActivationTokens.set(tokenHash, {
        id: mockId,
        player_id: player.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_by: user.id,
        created_at: nowIso,
      });

      generatedCards.push({
        playerId: player.id,
        fullName: `${player.last_name} ${player.first_name}`.trim(),
        teamName,
        position: player.position || undefined,
        token: rawToken,
        activationUrl: `/a/${rawToken}`,
      });
    }

    if (rowsToInsert.length > 0) {
      await supabase.from("player_activation_tokens").insert(rowsToInsert);
    }

    // 6. Аудит
    await logAudit({
      action: "issue_team_device_activation_tokens",
      entity: "team_activation_tokens",
      userId: user.id,
      meta: {
        team_id: teamId,
        team_name: teamName,
        tokens_count: generatedCards.length,
        force_all: Boolean(options?.forceAll),
      },
    });

    await safeRevalidatePath("/team/qr-cards");

    return {
      success: true,
      teamId,
      teamName,
      count: generatedCards.length,
      cards: generatedCards,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка пакетної генерації карток" };
  }
}
