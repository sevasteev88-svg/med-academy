import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { PlayerSessionPayload } from "@/types/rehab-portal";

const COOKIE_NAME = "rehab_player_session";
// Session expires in 7 days
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// Secret key for HMAC signing
function getSigningSecret(): string {
  const secret = process.env.PLAYER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "med-academy-portal-secure-salt";
  return secret;
}

/**
 * Генерирует криптографически стойкий случайный 6-значный PIN (100000 - 999999).
 */
export function generateRandom6DigitPin(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Генерирует случайный токен для персональной ссылки/QR игрока.
 */
export function generatePortalToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Хэширование PIN-кода с солью с помощью bcrypt.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

/**
 * Проверка введенного PIN с сохраненным хэшем.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) return false;
  return bcrypt.compare(pin, hash);
}

/**
 * Создание подписанного cookie-токена сессии.
 */
export function createSessionToken(payload: Omit<PlayerSessionPayload, "issuedAt" | "expiresAt">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: PlayerSessionPayload = {
    ...payload,
    issuedAt: now,
    expiresAt: now + SESSION_MAX_AGE_SECONDS,
  };

  const jsonStr = JSON.stringify(fullPayload);
  const encodedPayload = Buffer.from(jsonStr).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

/**
 * Валидация и парсинг токена сессии.
 */
export function verifySessionToken(token: string): PlayerSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as PlayerSessionPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.expiresAt && payload.expiresAt < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Сохранить сессию игрока в httpOnly cookie.
 */
export async function setPlayerSessionCookie(payload: Omit<PlayerSessionPayload, "issuedAt" | "expiresAt">) {
  const token = createSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Получить текущую валидную сессию игрока из cookies.
 * Проверяет сначала сессию пристрою (rehab_device_session) с моментальной проверкой отзыва в БД,
 * затем fallback на обычную сессию (rehab_player_session).
 */
export async function getPlayerSession(): Promise<PlayerSessionPayload | null> {
  const cookieStore = await cookies();

  // 1. Проверяем сессию пристрою (8.2 QR-активация пристрою на 90 дней)
  const deviceCookie = cookieStore.get("rehab_device_session")?.value;
  if (deviceCookie) {
    try {
      const { verifyDeviceSessionCookieValue } = await import("@/lib/player-device-auth");
      const { validateDeviceSessionRecord } = await import("@/actions/player-device-actions");
      const parsed = verifyDeviceSessionCookieValue(deviceCookie);
      if (parsed) {
        const validation = await validateDeviceSessionRecord(parsed.deviceId, parsed.sessionSecret);
        if (validation.valid && validation.playerId) {
          const now = Math.floor(Date.now() / 1000);
          return {
            playerId: validation.playerId,
            portalToken: "device_session",
            mustChangePin: false,
            issuedAt: now,
            expiresAt: now + 90 * 24 * 60 * 60,
          };
        } else {
          // Устройство отозвано (revoked) или истекло — моментально сбрасываем куки!
          cookieStore.set("rehab_device_session", "", { path: "/", maxAge: 0 });
          cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
          return null;
        }
      }
    } catch {
      // Игнорируем ошибку динамического импорта и продолжаем
    }
  }

  // 2. Стандартная сессия по PIN
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Удалить cookie сессии (logout).
 */
export async function clearPlayerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set("rehab_device_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Получение IP-адреса клиента для ограничения попыток (rate limiting).
 */
export async function getClientIp(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = headersList.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}
