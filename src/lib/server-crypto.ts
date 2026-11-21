/**
 * server-crypto.ts — Серверне шифрування чутливих клубних налаштувань (AES-256-GCM)
 * Використовується для надійного зберігання Telegram Bot Token та Chat ID в базі даних.
 */

import crypto from "crypto";
import { getClubSettingsMasterKey } from "./server-secrets.ts";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 біт

/**
 * Шифрує рядок секрету (токен, chat_id) у формат `ivHex:tagHex:cipherHex`
 */
export function encryptServerSecret(plainText: string): string {
  if (!plainText || plainText.trim().length === 0) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getClubSettingsMasterKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptWithKey(
  iv: Buffer,
  authTag: Buffer,
  encryptedHex: string,
  key: Buffer
): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Дешифрує рядок формату `ivHex:tagHex:cipherHex`
 */
export function decryptServerSecret(cipherString: string): string {
  if (!cipherString || !cipherString.includes(":")) return "";

  const parts = cipherString.split(":");
  if (parts.length !== 3) return "";

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  let primaryKey: Buffer | null = null;
  let lastError: unknown = null;

  try {
    primaryKey = getClubSettingsMasterKey();
    return decryptWithKey(iv, authTag, encryptedHex, primaryKey);
  } catch (err) {
    lastError = err;
  }

  // Read-only fallback for secrets encrypted before CLUB_SETTINGS_SECRET rotation
  const legacySecrets = [
    process.env.PLAYER_SESSION_SECRET,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "med-academy-club-settings-key-2026-safe-salt",
  ];

  for (const candidate of legacySecrets) {
    if (!candidate) continue;
    const legacyKey = crypto.createHash("sha256").update(candidate).digest();
    if (primaryKey && legacyKey.equals(primaryKey)) continue;

    try {
      const decrypted = decryptWithKey(iv, authTag, encryptedHex, legacyKey);
      console.warn(
        "[server-crypto] Decrypted legacy club secret; re-save club settings to rotate encryption key."
      );
      return decrypted;
    } catch {
      // try next legacy key
    }
  }

  console.error("Помилка дешифрування серверного секрету:", lastError);
  return "";
}

/**
 * Маскує значення секрету для показу у формі (наприклад: ••••••••a1B9)
 */
export function maskSecretValue(val: string): string {
  if (!val || val.length === 0) return "";
  if (val.length <= 4) return "••••";
  return `••••••••${val.slice(-4)}`;
}
