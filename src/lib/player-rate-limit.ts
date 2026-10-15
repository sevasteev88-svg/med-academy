interface AttemptRecord {
  count: number;
  lockedUntil: number | null; // timestamp in ms
}

// In-memory caches for IP and Player rate limiting
const ipAttempts = new Map<string, AttemptRecord>();
const playerAttempts = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes in ms

export interface RateLimitResult {
  isLocked: boolean;
  remainingAttempts: number;
  lockedUntilMinutes?: number;
}

/**
 * Проверяет, заблокирован ли IP или игрок.
 */
export function checkRateLimit(key: string, isIp = false): RateLimitResult {
  const store = isIp ? ipAttempts : playerAttempts;
  const now = Date.now();
  const record = store.get(key);

  if (!record) {
    return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
  }

  // Если был заблокирован, проверяем истекло ли время
  if (record.lockedUntil) {
    if (now < record.lockedUntil) {
      const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
      return { isLocked: true, remainingAttempts: 0, lockedUntilMinutes: remainingMinutes };
    } else {
      // Блокировка истекла - сбрасываем счетчик
      store.delete(key);
      return { isLocked: false, remainingAttempts: MAX_ATTEMPTS };
    }
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.count);
  return { isLocked: false, remainingAttempts: remaining };
}

/**
 * Фиксирует неудачную попытку ввода.
 */
export function recordFailedAttempt(key: string, isIp = false): RateLimitResult {
  const store = isIp ? ipAttempts : playerAttempts;
  const now = Date.now();
  const record = store.get(key) || { count: 0, lockedUntil: null };

  // Если уже заблокирован
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { isLocked: true, remainingAttempts: 0, lockedUntilMinutes: remainingMinutes };
  }

  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    store.set(key, record);
    return { isLocked: true, remainingAttempts: 0, lockedUntilMinutes: 15 };
  }

  store.set(key, record);
  return { isLocked: false, remainingAttempts: MAX_ATTEMPTS - record.count };
}

/**
 * Сбрасывает счетчик попыток при успешной авторизации.
 */
export function resetAttempts(key: string, isIp = false) {
  const store = isIp ? ipAttempts : playerAttempts;
  store.delete(key);
}
