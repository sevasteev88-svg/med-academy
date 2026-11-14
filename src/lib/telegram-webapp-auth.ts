import crypto from "crypto";

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedInitData {
  ok: true;
  user: TelegramWebAppUser;
  authDate: number;
}

export interface FailedInitData {
  ok: false;
  error: string;
}

/**
 * Перевіряє криптографічний підпис Telegram.WebApp.initData (HMAC-SHA256 згідно документації Telegram).
 * За замовчуванням приймає дані не старіші за 24 години.
 */
export function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): VerifiedInitData | FailedInitData {
  if (!initData || typeof initData !== "string") {
    return { ok: false, error: "Відсутні дані авторизації Telegram (initData)" };
  }
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN не налаштований на сервері" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "Відсутній підпис (hash) у initData" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? parseInt(authDateRaw, 10) : 0;
  if (!authDate || Number.isNaN(authDate)) {
    return { ok: false, error: "Некоректний auth_date" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && nowSec - authDate > maxAgeSeconds) {
    return { ok: false, error: "Сесія Telegram застаріла. Відкрийте міні-додаток повторно." };
  }

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") {
      pairs.push(`${key}=${value}`);
    }
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (hashBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hashBuf, expectedBuf)) {
    return { ok: false, error: "Невалідний підпис Telegram initData" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "Відсутні дані користувача в initData" };
  }

  try {
    const user = JSON.parse(userRaw) as TelegramWebAppUser;
    if (!user?.id) {
      return { ok: false, error: "Відсутній Telegram user.id" };
    }
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, error: "Помилка розбору користувача з initData" };
  }
}
