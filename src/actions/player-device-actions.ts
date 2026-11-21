"use server";

import crypto from "crypto";
import { createAdminClient } from "../utils/supabase/admin.ts";
import { assertDoctor, assertTeamStaff, assertPlayerAccess } from "../lib/auth.ts";
import { getPlayerConsentSummary } from "../lib/consents.ts";
import { logAudit } from "../lib/audit.ts";
import {
  generateActivationToken,
  hashTokenSha256,
  ACTIVATION_TOKEN_MAX_AGE_SECONDS,
  MAX_ACTIVE_DEVICES_PER_PLAYER,
  memoryActivationTokens,
  memoryPlayerDevices,
} from "../lib/player-device-auth.ts";
import type {
  PlayerDevice,
  PlayerActivationToken,
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

    const access = await assertPlayerAccess(user, playerId, { allowCoach: true });
    if ("error" in access) {
      return { success: false, error: access.error };
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Отримуємо дані гравця та команди для картки (у межах клубу користувача)
    const { data: player } = await supabase
      .from("players")
      .select("id, first_name, last_name, team_id, teams ( name )")
      .eq("id", playerId)
      .eq("club_id", user.clubId)
      .maybeSingle();

    if (!player) {
      return { success: false, error: "Гравця не знайдено" };
    }

    const fullName = `${player.last_name} ${player.first_name}`.trim();
    const teamName = (player as any)?.teams?.name || "Команда";

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
 * 5. Отримання списку активних пристроїв гравця для лікаря/адміністратора (максимум 2)
 */
export async function getPlayerActiveDevicesAction(playerId: string): Promise<{
  success: boolean;
  devices: PlayerDevice[];
  error?: string;
}> {
  try {
    const authRes = await assertDoctor();
    if ("error" in authRes) {
      return { success: false, devices: [], error: authRes.error };
    }
    if (!playerId) {
      return { success: false, devices: [], error: "Не вказано гравця" };
    }

    const access = await assertPlayerAccess(authRes.user, playerId, { allowCoach: false });
    if ("error" in access) {
      return { success: false, devices: [], error: access.error };
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

    const access = await assertPlayerAccess(user, playerId, { allowCoach: false });
    if ("error" in access) {
      return { success: false, error: access.error };
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

    const clubId = auth.user.clubId;
    const supabase = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Отримуємо назву команди
    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!teamData) {
      return { success: false, error: "Команду не знайдено у вашому клубі" };
    }

    const teamName = teamData.name || "Команда";

    // 2. Отримуємо активних гравців цієї команди
    const { data: playersData, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, date_of_birth, team_id")
      .eq("team_id", teamId)
      .eq("club_id", clubId)
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

    const clubId = user.clubId;
    const supabase = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Отримуємо інформацію про команду
    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!teamData) {
      return { success: false, error: "Команду не знайдено у вашому клубі" };
    }

    const teamName = teamData.name || "Команда";

    // 2. Отримуємо активних гравців
    const { data: playersData, error: pErr } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, team_id")
      .eq("team_id", teamId)
      .eq("club_id", clubId)
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
