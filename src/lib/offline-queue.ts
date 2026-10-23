/**
 * offline-queue.ts — Клієнтська черга вихідних мутацій (Outbox) в IndexedDB
 * з шифруванням та реактивними подіями для UI.
 */

import type { OfflineOutboxItem } from "@/types/offline.ts";
import { encryptClinicalPayload, decryptClinicalPayload } from "./offline-crypto.ts";

const DB_NAME = "medacademy_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "outbox";

// In-memory fallback для SSR або середовищ без IndexedDB (Vitest / Node.js)
const memoryStore = new Map<string, OfflineOutboxItem>();

function isBrowserIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("medacademy-offline-queue-changed"));
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowserIndexedDbAvailable()) {
      return reject(new Error("IndexedDB not available"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Додає новий клінічний запис до зашифрованої черги IndexedDB
 */
export async function enqueueOfflineItem<T = any>(
  item: Omit<OfflineOutboxItem<T>, "encrypted_data" | "retry_count" | "status"> & {
    plain_payload: T;
  }
): Promise<OfflineOutboxItem<T>> {
  // 1. Шифруємо клінічні дані перед записом на диск
  const encrypted = await encryptClinicalPayload(item.plain_payload);

  const fullItem: OfflineOutboxItem<T> = {
    ...item,
    encrypted_data: encrypted,
    retry_count: 0,
    status: "pending",
  };

  // Видаляємо відкриті дані з пам'яті збереженого об'єкта
  const itemToStore = { ...fullItem };
  delete itemToStore.plain_payload;

  if (!isBrowserIndexedDbAvailable()) {
    memoryStore.set(item.id, fullItem);
    notifyQueueChanged();
    return fullItem;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(itemToStore);

    req.onsuccess = () => {
      notifyQueueChanged();
      resolve(fullItem);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Отримує всі записи з черги з дешифруванням клінічних даних для синхронізації
 */
export async function getOfflineQueue(): Promise<OfflineOutboxItem[]> {
  if (!isBrowserIndexedDbAvailable()) {
    return Array.from(memoryStore.values());
  }

  const db = await openDatabase();
  const rawItems: OfflineOutboxItem[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  // Дешифруємо payload для кожного запису
  const decryptedItems: OfflineOutboxItem[] = [];
  for (const it of rawItems) {
    if (it.encrypted_data) {
      try {
        const plain = await decryptClinicalPayload(it.encrypted_data);
        decryptedItems.push({ ...it, plain_payload: plain });
      } catch {
        decryptedItems.push(it);
      }
    } else {
      decryptedItems.push(it);
    }
  }

  return decryptedItems;
}

/**
 * Отримує кількість невивантажених записів у черзі
 */
export async function getOfflineQueueCount(): Promise<number> {
  if (!isBrowserIndexedDbAvailable()) {
    return memoryStore.size;
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();

      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Видаляє успішно синхронізований запис із черги IndexedDB
 */
export async function removeOfflineItem(id: string): Promise<void> {
  if (!isBrowserIndexedDbAvailable()) {
    memoryStore.delete(id);
    notifyQueueChanged();
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => {
      notifyQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Очищує всю чергу (наприклад, після повного синку або скидання сесії)
 */
export async function clearOfflineQueue(): Promise<void> {
  if (!isBrowserIndexedDbAvailable()) {
    memoryStore.clear();
    notifyQueueChanged();
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();

    req.onsuccess = () => {
      notifyQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}
