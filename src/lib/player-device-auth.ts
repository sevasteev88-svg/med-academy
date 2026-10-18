import crypto from "crypto";
import type { PlayerDevice } from "../types/player-device.ts";

export const DEVICE_COOKIE_NAME = "rehab_device_session";
export const DEVICE_SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 днів
export const ACTIVATION_TOKEN_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // 14 днів
export const MAX_ACTIVE_DEVICES_PER_PLAYER = 2; // Максимум 2 активні пристрої

/**
 * Отримує секретний ключ для підпису сесійних токенів
 */
function getSigningSecret(): string {
  return process.env.PLAYER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "med-academy-portal-secure-salt";
}

/**
 * Генерує криптографічно стійкий 128-бітний токен активації (16 байт = 32 hex-символи)
 */
export function generateActivationToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Генерує криптографічно стійкий токен довготривалої сесії пристрою (256 біт = 32 байти)
 */
export function generateDeviceSessionSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Розраховує SHA-256 хэш токена
 */
export function hashTokenSha256(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Парсить зрозумілу назву пристрою з User-Agent
 */
export function parseDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return "Невідомий пристрій";
  const ua = userAgent.toLowerCase();

  let os = "Пристрій";
  if (ua.includes("iphone")) os = "iPhone";
  else if (ua.includes("ipad")) os = "iPad";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("macintosh") || ua.includes("mac os")) os = "Mac";
  else if (ua.includes("windows")) os = "Windows PC";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "";
  if (ua.includes("crios") || (ua.includes("chrome") && !ua.includes("edg"))) browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("firefox") || ua.includes("fxios")) browser = "Firefox";
  else if (ua.includes("edg")) browser = "Edge";
  else browser = "Браузер";

  return `${os} (${browser})`;
}

/**
 * Отримання IP-адреси клієнта з заголовків
 */
export async function getClientIp(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headersList = await headers();
    const forwardedFor = headersList?.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
    const realIp = headersList?.get("x-real-ip");
    if (realIp) return realIp.trim();
  } catch {}
  return "127.0.0.1";
}

/**
 * Отримання User-Agent з заголовків
 */
export async function getClientUserAgent(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headersList = await headers();
    return headersList?.get("user-agent") || "";
  } catch {}
  return "";
}

/**
 * Створює підписаний токен куки для сесії пристрою: deviceId.sessionToken.signature
 */
export function createDeviceSessionCookieValue(deviceId: string, sessionSecret: string, playerId: string): string {
  const payloadStr = JSON.stringify({ deviceId, sessionSecret, playerId, iat: Math.floor(Date.now() / 1000) });
  const encoded = Buffer.from(payloadStr).toString("base64url");
  const signature = crypto.createHmac("sha256", getSigningSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/**
 * Валідує підпис та повертає вміст куки сесії пристрою
 */
export function verifyDeviceSessionCookieValue(cookieVal: string): { deviceId: string; sessionSecret: string; playerId: string } | null {
  if (!cookieVal || !cookieVal.includes(".")) return null;
  const [encoded, signature] = cookieVal.split(".");
  if (!encoded || !signature) return null;

  const expectedSig = crypto.createHmac("sha256", getSigningSecret()).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const raw = Buffer.from(encoded, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.deviceId || !parsed.sessionSecret || !parsed.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Встановлює довготривалу безпечну httpOnly куку для пристрою (90 днів)
 */
export async function setDeviceSessionCookie(deviceId: string, sessionSecret: string, playerId: string) {
  try {
    const { cookies } = await import("next/headers");
    const cookieVal = createDeviceSessionCookieValue(deviceId, sessionSecret, playerId);
    const cookieStore = await cookies();

    // Основна кука пристрою (90 днів)
    cookieStore.set(DEVICE_COOKIE_NAME, cookieVal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
    });

    // Також встановлюємо стандартну сесію гравця для повної зворотної сумісності з кабінетом
    const standardPayload = {
      playerId,
      portalToken: "device_session",
      mustChangePin: false,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + DEVICE_SESSION_MAX_AGE_SECONDS,
    };
    const jsonStr = JSON.stringify(standardPayload);
    const encodedPayload = Buffer.from(jsonStr).toString("base64url");
    const signature = crypto.createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");

    cookieStore.set("rehab_player_session", `${encodedPayload}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
    });
  } catch {}
}

/**
 * Очищує сесійні куки пристрою та гравця
 */
export async function clearAllDeviceSessionCookies() {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.set(DEVICE_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    cookieStore.set("rehab_player_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {}
}

/**
 * Резервне in-memory сховище активних пристроїв та токенів
 * (використовується для юніт-тестів та як fallback якщо міграція ще не застосована в БД)
 */
export const memoryActivationTokens = new Map<string, {
  id: string;
  player_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
}>();

export const memoryPlayerDevices = new Map<string, PlayerDevice>();

/**
 * Очищення тестової пам'яті (для юніт-тестів)
 */
export function clearMemoryStoresForTesting() {
  memoryActivationTokens.clear();
  memoryPlayerDevices.clear();
}
