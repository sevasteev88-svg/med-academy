import crypto from "crypto";

let warnedPlayerSecret = false;
let warnedClubKey = false;

/**
 * Постійно-часове (timing-safe) порівняння секретних рядків через SHA-256 дайджести,
 * що виключає як таймінг-атаки, так і витік довжини секрету.
 */
export function verifyTimingSafeSecret(
  provided: string | null | undefined,
  expected: string
): boolean {
  if (!provided || !expected) return false;
  const providedDigest = crypto.createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Повертає серверний HMAC-секрет для підпису сесій гравця.
 * У production строго вимагає PLAYER_SESSION_SECRET (>= 32 символи) і не має фолбэку на публічні ключі.
 */
export function getPlayerSessionSecret(): string {
  const secret = process.env.PLAYER_SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error("PLAYER_SESSION_SECRET must be set (>= 32 chars) in production");
    }
    return secret;
  }

  if (secret) return secret;

  if (process.env.NODE_ENV === "development" && !warnedPlayerSecret) {
    warnedPlayerSecret = true;
    console.warn(
      "[security] PLAYER_SESSION_SECRET is not set; using non-production fallback key."
    );
  }

  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-dev-test-only-player-session-secret-not-for-prod"
  );
}

/**
 * Повертає 256-бітний майстер-ключ шифрування чутливих клубних налаштувань.
 * У production строго вимагає CLUB_SETTINGS_SECRET або PLAYER_SESSION_SECRET (>= 32 символи).
 */
export function getClubSettingsMasterKey(): Buffer {
  const secret = process.env.CLUB_SETTINGS_SECRET || process.env.PLAYER_SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret || secret.length < 32) {
      throw new Error(
        "CLUB_SETTINGS_SECRET (or PLAYER_SESSION_SECRET) must be set (>= 32 chars) in production"
      );
    }
    return crypto.createHash("sha256").update(secret).digest();
  }

  if (!secret && process.env.NODE_ENV === "development" && !warnedClubKey) {
    warnedClubKey = true;
    console.warn(
      "[security] CLUB_SETTINGS_SECRET is not set; using non-production fallback key."
    );
  }

  const effectiveSecret =
    secret ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-dev-test-only-club-settings-key-not-for-prod";

  return crypto.createHash("sha256").update(effectiveSecret).digest();
}

/**
 * Повертає секретний ключ мерчанта WayForPay (fail-closed у будь-якому середовищі).
 */
export function getWayForPaySecretKey(): string {
  const secret = process.env.WAYFORPAY_SECRET_KEY;
  if (!secret) {
    throw new Error("WAYFORPAY_SECRET_KEY is not configured");
  }
  return secret;
}

/**
 * Валідує внутрішній шлях редіректу для захисту від Open Redirect.
 */
export function getSafeRedirectPath(
  rawNext: string | null | undefined,
  requestOrigin: string,
  fallbackPath = "/coach-briefing"
): string {
  if (!rawNext) return fallbackPath;
  if (
    !rawNext.startsWith("/") ||
    rawNext.startsWith("//") ||
    rawNext.startsWith("/\\") ||
    /[\r\n\t]/.test(rawNext)
  ) {
    return fallbackPath;
  }

  try {
    const candidate = new URL(rawNext, requestOrigin);
    if (candidate.origin !== requestOrigin) {
      return fallbackPath;
    }
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallbackPath;
  }
}
