/**
 * server-crypto.ts — Серверне шифрування чутливих клубних налаштувань (AES-256-GCM)
 * Використовується для надійного зберігання Telegram Bot Token та Chat ID в базі даних.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 біт

function getMasterKey(): Buffer {
  const secret =
    process.env.CLUB_SETTINGS_SECRET ||
    process.env.PLAYER_SESSION_SECRET ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "med-academy-club-settings-key-2026-safe-salt";

  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Шифрує рядок секрету (токен, chat_id) у формат `ivHex:tagHex:cipherHex`
 */
export function encryptServerSecret(plainText: string): string {
  if (!plainText || plainText.trim().length === 0) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Дешифрує рядок формату `ivHex:tagHex:cipherHex`
 */
export function decryptServerSecret(cipherString: string): string {
  if (!cipherString || !cipherString.includes(":")) return "";

  const parts = cipherString.split(":");
  if (parts.length !== 3) return "";

  try {
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const key = getMasterKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Помилка дешифрування серверного секрету:", err);
    return "";
  }
}

/**
 * Маскує значення секрету для показу у формі (наприклад: ••••••••a1B9)
 */
export function maskSecretValue(val: string): string {
  if (!val || val.length === 0) return "";
  if (val.length <= 4) return "••••";
  return `••••••••${val.slice(-4)}`;
}
