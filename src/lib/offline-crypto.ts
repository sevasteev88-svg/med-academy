/**
 * offline-crypto.ts — Сесійне шифрування AES-GCM 256-bit для черги IndexedDB
 * Працює універсально: як у браузері (Web Crypto API), так і в Node.js (node:crypto).
 */

import type { EncryptedPayload } from "@/types/offline";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const KEYSTORE_DB_NAME = "medacademy_offline_keystore";
const KEYSTORE_STORE = "keys";
const KEY_RECORD_ID = "clinical_outbox_aes_gcm_v1";

/**
 * Отримує або генерує ключ для шифрування локальної черги на пристрої.
 * У браузері неекстрагований CryptoKey зберігається в IndexedDB, щоб офлайн-черга
 * розшифровувалася після перезавантаження вкладки або PWA.
 */
let sessionKeyCache: CryptoKey | null = null;
let nodeSessionSecret: Buffer | null = null;

function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB unavailable"));
    }
    const req = window.indexedDB.open(KEYSTORE_DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(KEYSTORE_STORE)) {
        db.createObjectStore(KEYSTORE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersistedCryptoKey(): Promise<CryptoKey | null> {
  try {
    const db = await openKeystoreDb();
    return await new Promise<CryptoKey | null>((resolve) => {
      const tx = db.transaction(KEYSTORE_STORE, "readonly");
      const req = tx.objectStore(KEYSTORE_STORE).get(KEY_RECORD_ID);
      req.onsuccess = () => resolve((req.result as CryptoKey) || null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function savePersistedCryptoKey(key: CryptoKey): Promise<void> {
  try {
    const db = await openKeystoreDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(KEYSTORE_STORE, "readwrite");
      tx.objectStore(KEYSTORE_STORE).put(key, KEY_RECORD_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {}
}

export async function clearSessionCryptoKey(): Promise<void> {
  sessionKeyCache = null;
  nodeSessionSecret = null;
  try {
    const db = await openKeystoreDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(KEYSTORE_STORE, "readwrite");
      tx.objectStore(KEYSTORE_STORE).delete(KEY_RECORD_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {}
}

export async function getOrCreateSessionCryptoKey(): Promise<CryptoKey> {
  if (sessionKeyCache) return sessionKeyCache;

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const persisted = await loadPersistedCryptoKey();
    if (persisted) {
      sessionKeyCache = persisted;
      return persisted;
    }

    const generated = await window.crypto.subtle.generateKey(
      { name: ALGORITHM, length: 256 },
      false, // non-extractable for security
      ["encrypt", "decrypt"]
    );
    sessionKeyCache = generated;
    await savePersistedCryptoKey(generated);
    return generated;
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
