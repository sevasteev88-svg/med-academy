"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getOfflineQueue,
  getOfflineQueueCount,
  removeOfflineItem,
} from "@/lib/offline-queue";
import { syncOfflineBatchAction } from "@/actions/offline-sync-actions";

export default function OfflineSyncStatusBadge() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);

  const [isSyncing, startSync] = useTransition();

  const updateStatus = async () => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    const count = await getOfflineQueueCount();
    setQueueCount(count);
  };

  const triggerSync = () => {
    if (isSyncing) return;

    startSync(async () => {
      setSyncStatusText("Отримання черги...");
      const items = await getOfflineQueue();
      if (items.length === 0) {
        setSyncStatusText("Черга порожня");
        setQueueCount(0);
        return;
      }

      setSyncStatusText(`Синхронізація ${items.length} записів...`);
      const res = await syncOfflineBatchAction(items);

      if (res.success && res.result) {
        // Видаляємо успішно синхронізовані записи з локальної черги
        for (const detail of res.result.details) {
          if (detail.success) {
            await removeOfflineItem(detail.id);
          }
        }

        const remaining = await getOfflineQueueCount();
        setQueueCount(remaining);
        setSyncStatusText(
          `Синхронізовано: ${res.result.succeeded}${
            res.result.conflictsResolved ? ` (${res.result.conflictsResolved} конфліктів вирішено LWW)` : ""
          }`
        );
      } else {
        setSyncStatusText(res.error || "Помилка синхронізації");
      }
    });
  };

  useEffect(() => {
    updateStatus();

    const handleOnline = () => {
      setIsOnline(true);
      // Автосинхронізація при відновленні зв'язку
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChanged = () => {
      updateStatus();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("medacademy-offline-queue-changed", handleQueueChanged);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("medacademy-offline-queue-changed", handleQueueChanged);
    };
  }, []);

  return (
    <div className="relative inline-block text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-bold text-[11px] transition shadow-sm ${
          !isOnline
            ? "bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse"
            : queueCount > 0
            ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        }`}
        title="Статус з'єднання та черга офлайн-синхронізації"
      >
        <span className={`w-2 h-2 rounded-full ${!isOnline ? "bg-rose-400" : queueCount > 0 ? "bg-amber-400 animate-ping" : "bg-emerald-400"}`} />
        <span>
          {!isOnline
            ? `Офлайн ${queueCount > 0 ? `(${queueCount})` : ""}`
            : isSyncing
            ? "Синхронізація..."
            : queueCount > 0
            ? `Черга: ${queueCount}`
            : "Онлайн"}
        </span>
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-sky-500/30 p-4 space-y-3 shadow-2xl z-50 text-xs text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <span>{isOnline ? "🟢 Мережа підключена" : "🔴 Офлайн-режим"}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-400">
            <div>
              Стан черги:{" "}
              <strong className="text-white font-mono">
                {queueCount} зашифрованих записів
              </strong>
            </div>
            <div>
              Безпека: <span className="text-emerald-400">Zero-PII Cache (AES-GCM)</span>
            </div>
            <div>
              Конфлікти: <span className="text-sky-300">Last-Write-Wins (LWW)</span>
            </div>
          </div>

          {syncStatusText && (
            <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
              {syncStatusText}
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={triggerSync}
              disabled={isSyncing || queueCount === 0 || !isOnline}
              className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow transition disabled:opacity-40"
            >
              {isSyncing ? "Синхронізація..." : "Синхронізувати зараз"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
