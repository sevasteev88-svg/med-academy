"use client";

import React, { useState, useTransition } from "react";
import { markParentMessagesReadByCoachAction } from "@/actions/parent-portal-actions";
import {
  PARENT_MESSAGE_CATEGORY_META,
  type CoachParentAlertItem,
} from "@/types/parent-portal";

interface Props {
  initialAlerts?: CoachParentAlertItem[];
  selectedTeamId?: string;
}

export default function CoachParentAlertsBanner({
  initialAlerts = [],
  selectedTeamId,
}: Props) {
  const [alerts, setAlerts] = useState<CoachParentAlertItem[]>(initialAlerts);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  const visibleAlerts =
    selectedTeamId && selectedTeamId !== "all"
      ? alerts.filter((a) => a.teamId === selectedTeamId)
      : alerts;

  if (visibleAlerts.length === 0) {
    return null;
  }

  const handleMarkRead = (ids: string[]) => {
    if (ids.length === 0) return;
    setPendingIds((prev) => [...prev, ...ids]);
    startTransition(async () => {
      const res = await markParentMessagesReadByCoachAction(ids);
      if (!res.error) {
        setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
      }
      setPendingIds((prev) => prev.filter((id) => !ids.includes(id)));
    });
  };

  return (
    <section
      aria-label="Повідомлення від батьків"
      className="rounded-2xl bg-sky-950/35 border border-sky-500/35 p-3.5 sm:p-4 space-y-2.5 shadow-lg shadow-sky-950/20"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-base">👨‍👩‍👦</span>
          <h2 className="text-xs sm:text-sm font-black text-white tracking-tight">
            Повідомлення від батьків
          </h2>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
            {visibleAlerts.length} за 48 год
          </span>
        </div>

        {visibleAlerts.length > 1 && (
          <button
            type="button"
            disabled={pendingIds.length > 0}
            onClick={() => handleMarkRead(visibleAlerts.map((a) => a.id))}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            ✓ Ознайомлений з усіма
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visibleAlerts.map((alert) => {
          const meta = PARENT_MESSAGE_CATEGORY_META[alert.category];
          const isPending = pendingIds.includes(alert.id);
          return (
            <div
              key={alert.id}
              className={`rounded-xl border px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                alert.isMasked
                  ? "bg-amber-950/25 border-amber-500/30"
                  : "bg-slate-900/80 border-slate-800"
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-bold text-white">{alert.playerName}</span>
                  <span className="text-[11px] text-slate-400">({alert.teamName})</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-semibold text-sky-300 border border-slate-700">
                    <span>{meta?.icon}</span>
                    <span>{meta?.label || alert.category}</span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(alert.createdAt).toLocaleString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p
                  className={`text-xs leading-relaxed ${
                    alert.isMasked ? "text-amber-200 font-medium" : "text-slate-200"
                  }`}
                >
                  {alert.isMasked && <span className="mr-1">🛡️</span>}
                  {alert.displayText}
                </p>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => handleMarkRead([alert.id])}
                className="self-start sm:self-center shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition cursor-pointer"
              >
                {isPending ? "..." : "Ознайомлений"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
