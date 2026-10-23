/**
 * offline-crypto.ts — Сесійне шифрування AES-GCM 256-bit для черги IndexedDB
 * Працює універсально: як у браузері (Web Crypto API), так і в Node.js (node:crypto).
 */

import type { EncryptedPayload } from "@/types/offline";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM

/**
 * Отримує або генерує сесійний ключ для шифрування локальної черги на пристрої.
 * Ключ зберігається лише в оперативній пам'яті (in-memory) і зникає при закритті вкладки/сесії.
 */
let sessionKeyCache: CryptoKey | null = null;
let nodeSessionSecret: Buffer | null = null;

export async function getOrCreateSessionCryptoKey(): Promise<CryptoKey> {
  if (sessionKeyCache) return sessionKeyCache;

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    sessionKeyCache = await window.crypto.subtle.generateKey(
      { name: ALGORITHM, length: 256 },
      false, // non-extractable for security
      ["encrypt", "decrypt"]
    );
    return sessionKeyCache;
  }

  // Node.js fallback for tests
  const { webcrypto } = await import("node:crypto");
  sessionKeyCache = (await webcrypto.subtle.generateKey(
    { name: ALGORITHM, length: 256 },
    true,
    ["encrypt", "decrypt"]
  )) as unknown as CryptoKey;

  return sessionKeyCache;
}

/**
 * Шифрує довільний клінічний об'єкт у захищений EncryptedPayload
 */
export async function encryptClinicalPayload<T = any>(
  data: T,
  customKey?: CryptoKey
): Promise<EncryptedPayload> {
  const jsonString = JSON.stringify(data);
  const encoded = new TextEncoder().encode(jsonString);

  // Browser / WebCrypto execution
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const key = customKey || (await getOrCreateSessionCryptoKey());
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoded
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
      iv: btoa(String.fromCharCode(...iv)),
      version: "1.0",
    };
  }

  // Node.js environment (for tests and SSR)
  const { randomBytes, createCipheriv } = await import("node:crypto");
  if (!nodeSessionSecret) {
    nodeSessionSecret = randomBytes(32);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", nodeSessionSecret, iv);

  const ciphertext = Buffer.concat([cipher.update(Buffer.from(encoded)), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([ciphertext, tag]).toString("base64"),
    iv: iv.toString("base64"),
    version: "1.0",
  };
}

/**
 * Дешифрує EncryptedPayload назад у вихідний клінічний об'єкт
 */
export async function decryptClinicalPayload<T = any>(
  encrypted: EncryptedPayload,
  customKey?: CryptoKey
): Promise<T> {
  // Browser / WebCrypto execution
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const key = customKey || (await getOrCreateSessionCryptoKey());

    const cipherBytes = Uint8Array.from(atob(encrypted.ciphertext), (c) => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: ALGORITHM, iv: ivBytes },
      key,
      cipherBytes
    );

    const decryptedString = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decryptedString) as T;
  }

  // Node.js environment
  const { createDecipheriv } = await import("node:crypto");
  if (!nodeSessionSecret) {
    throw new Error("No session encryption key present in memory");
  }

  const iv = Buffer.from(encrypted.iv, "base64");
  const dataWithTag = Buffer.from(encrypted.ciphertext, "base64");

  // AES-GCM tag is the last 16 bytes
  const tag = dataWithTag.subarray(dataWithTag.length - 16);
  const ciphertext = dataWithTag.subarray(0, dataWithTag.length - 16);

  const decipher = createDecipheriv("aes-256-gcm", nodeSessionSecret, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
