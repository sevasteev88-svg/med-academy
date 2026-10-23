/**
 * offline-conflict.ts — Стратегія вирішення конфліктів Last-Write-Wins (LWW)
 * та генерація безпечного аудиту без витоку персональних даних.
 */

import type {
  ConflictResolutionResult,
  OfflineMutationType,
} from "@/types/offline";

/**
 * Порівнює клієнтську та серверну версію запису.
 * Стратегія: перемагає запис із пізнішою часовою міткою (Last Write Wins).
 */
export function resolveOfflineConflict<T extends Record<string, any>>(params: {
  entityType: OfflineMutationType;
  clientPayload: T;
  clientTimestamp: string;
  serverPayload: T | null;
  serverTimestamp?: string | null;
}): ConflictResolutionResult<T> {
  const { clientPayload, clientTimestamp, serverPayload, serverTimestamp } = params;

  // Якщо на сервері запису ще немає — конфлікту немає, перемагає клієнт
  if (!serverPayload || !serverTimestamp) {
    return {
      winner: "client",
      isConflict: false,
      resolvedPayload: clientPayload,
      clientTimestamp,
      serverTimestamp: "",
      reason: "Серверний запис відсутній, створено новий первинний запис",
    };
  }

  const clientTime = new Date(clientTimestamp).getTime();
  const serverTime = new Date(serverTimestamp).getTime();

  // Якщо клієнтський запис свіжіший або однаковий — клієнт перемагає
  if (clientTime >= serverTime) {
    return {
      winner: "client",
      isConflict: true,
      resolvedPayload: clientPayload,
      clientTimestamp,
      serverTimestamp,
      reason: `Офлайн-запис (${clientTimestamp}) новіший за серверний (${serverTimestamp}). Перезаписано за правилом Last-Write-Wins.`,
    };
  }

  // Якщо на сервері дані вже оновлені пізніше — залишаємо серверний запис
  return {
    winner: "server",
    isConflict: true,
    resolvedPayload: serverPayload,
    clientTimestamp,
    serverTimestamp,
    reason: `Серверний запис (${serverTimestamp}) новіший за офлайн (${clientTimestamp}). Офлайн зміну проігноровано.`,
  };
}

/**
 * Безпечні метадані для audit_log при вирішенні конфлікту
 * (Категорично без чутливих діагнозів, симптомів чи дозувань у meta)
 */
export function buildConflictAuditMeta(params: {
  entityType: OfflineMutationType;
  resolution: ConflictResolutionResult;
  entityId?: string;
  playerId?: string;
}): Record<string, unknown> {
  return {
    conflictType: params.entityType,
    winner: params.resolution.winner,
    clientTimestamp: params.resolution.clientTimestamp,
    serverTimestamp: params.resolution.serverTimestamp,
    rule: "last_write_wins",
    resolutionReason: params.resolution.reason,
  };
}
