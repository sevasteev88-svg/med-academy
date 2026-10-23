/**
 * offline.ts — Типи для офлайн-режиму, черги IndexedDB та вирішення конфліктів
 *
 * Відповідає вимогам:
 * - Форми: «Фіксувати травму», wellness, навантаження, призначення ліків
 * - Черга вихідних записів (Outbox) в IndexedDB з AES-GCM шифруванням
 * - Індикатор «Офлайн / Синхронізація»
 * - Стратегія вирішення конфліктів: Last-Write-Wins (LWW) із записом у журнал аудиту
 */

export type OfflineMutationType =
  | "injury"
  | "wellness"
  | "workload"
  | "prescription";

export type OfflineQueueStatus = "pending" | "syncing" | "failed" | "synced";

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string;         // base64 (12 bytes for AES-GCM)
  authTag?: string;   // base64
  version: "1.0";
}

export interface OfflineOutboxItem<T = any> {
  id: string; // client uuid
  type: OfflineMutationType;
  client_timestamp: string; // ISO 8601
  encrypted_data?: EncryptedPayload;
  plain_payload?: T; // Тимчасово у пам'яті перед шифруванням / після дешифрування
  retry_count: number;
  status: OfflineQueueStatus;
  last_error?: string | null;
  user_id?: string;
  club_id?: string;
}

export interface ConflictResolutionResult<T = any> {
  winner: "client" | "server";
  isConflict: boolean;
  resolvedPayload: T;
  clientTimestamp: string;
  serverTimestamp: string;
  reason: string;
}

export interface SyncBatchResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  conflictsResolved: number;
  details: Array<{
    id: string;
    type: OfflineMutationType;
    success: boolean;
    conflictResolved?: boolean;
    error?: string;
  }>;
}

export type NetworkConnectionState = "online" | "syncing" | "offline";
