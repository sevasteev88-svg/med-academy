import { createAdminClient } from "@/utils/supabase/admin";
import {
  MAX_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
  type RateLimitResult,
} from "@/lib/player-rate-limit";

function formatRateLimitKey(key: string, isIp: boolean): string {
  const clean = (key || "unknown").trim().slice(0, 120);
  return `${isIp ? "ip" : "target"}:${clean}`;
}

/**
 * Персистентна перевірка ліміту невдалих спроб через public.player_auth_ip_attempts
 * з автоматичним fallback на in-memory при збої/відсутності БД.
 */
export async function checkRateLimitPersistent(
  key: string,
  isIp = false
): Promise<RateLimitResult> {
  const dbKey = formatRateLimitKey(key, isIp);

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("player_auth_ip_attempts")
      .select("ip_address, failed_attempts, locked_until")
      .eq("ip_address", dbKey)
      .maybeSingle();

    if (error) {
      return checkRateLimit(key, isIp);
    }

    if (!data) {
      return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
    }

    const nowMs = Date.now();
    const lockedUntilMs = data.locked_until ? new Date(data.locked_until).getTime() : null;

    if (lockedUntilMs && lockedUntilMs > nowMs) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntilMinutes: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60000)),
      };
    }

    if (lockedUntilMs && lockedUntilMs <= nowMs) {
      await supabase.from("player_auth_ip_attempts").delete().eq("ip_address", dbKey);
      return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
    }

    const count = Number(data.failed_attempts || 0);
    return {
      isLocked: false,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - count),
    };
  } catch {
    return checkRateLimit(key, isIp);
  }
}

/**
 * Персистентна фіксація невдалої спроби входу у public.player_auth_ip_attempts.
 */
export async function recordFailedAttemptPersistent(
  key: string,
  isIp = false
): Promise<RateLimitResult> {
  const dbKey = formatRateLimitKey(key, isIp);

  try {
    const supabase = createAdminClient();
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const { data, error } = await supabase
      .from("player_auth_ip_attempts")
      .select("ip_address, failed_attempts, locked_until")
      .eq("ip_address", dbKey)
      .maybeSingle();

    if (error) {
      return recordFailedAttempt(key, isIp);
    }

    const existingLockedMs = data?.locked_until ? new Date(data.locked_until).getTime() : null;
    if (existingLockedMs && existingLockedMs > nowMs) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntilMinutes: Math.max(1, Math.ceil((existingLockedMs - nowMs) / 60000)),
      };
    }

    const baseCount = existingLockedMs && existingLockedMs <= nowMs ? 0 : Number(data?.failed_attempts || 0);
    const nextCount = baseCount + 1;
    const isNowLocked = nextCount >= MAX_ATTEMPTS;
    const lockedUntilIso = isNowLocked
      ? new Date(nowMs + LOCKOUT_DURATION_MS).toISOString()
      : null;

    if (data) {
      const { error: updErr } = await supabase
        .from("player_auth_ip_attempts")
        .update({
          failed_attempts: nextCount,
          locked_until: lockedUntilIso,
          updated_at: nowIso,
        })
        .eq("ip_address", dbKey);

      if (updErr) {
        return recordFailedAttempt(key, isIp);
      }
    } else {
      const { error: insErr } = await supabase
        .from("player_auth_ip_attempts")
        .insert({
          ip_address: dbKey,
          failed_attempts: nextCount,
          locked_until: lockedUntilIso,
          updated_at: nowIso,
        });

      if (insErr) {
        return recordFailedAttempt(key, isIp);
      }
    }

    if (isNowLocked) {
      return {
        isLocked: true,
        remainingAttempts: 0,
        lockedUntilMinutes: 15,
      };
    }

    return {
      isLocked: false,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - nextCount),
    };
  } catch {
    return recordFailedAttempt(key, isIp);
  }
}

/**
 * Скидає лічильник невдалих спроб після успішного входу або скидання PIN лікарем.
 */
export async function resetAttemptsPersistent(
  key: string,
  isIp = false
): Promise<void> {
  resetAttempts(key, isIp);
  const dbKey = formatRateLimitKey(key, isIp);

  try {
    const supabase = createAdminClient();
    await supabase.from("player_auth_ip_attempts").delete().eq("ip_address", dbKey);
  } catch {}
}
