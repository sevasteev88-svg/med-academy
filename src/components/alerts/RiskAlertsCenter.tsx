"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export interface RiskAlertItem {
  id: string;
  type: "acwr" | "wearable" | "phv" | "pain" | "hydration" | "overdue";
  severity: "critical" | "warning";
  playerId: string;
  playerName: string;
  teamName: string;
  position: string;
  photoUrl?: string | null;
  title: string;
  metric: string;
  mechanism: string;
  actionRequired: string;
  timestamp: string;
}

export default function RiskAlertsCenter({
  alerts,
  standaloneWidget = false,
}: {
  alerts: RiskAlertItem[];
  standaloneWidget?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "critical" | "warning">("all");
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const activeAlerts = alerts.filter((a) => !dismissed.includes(a.id));
  const filtered = activeAlerts.filter((a) => {
    if (filter === "critical") return a.severity === "critical";
    if (filter === "warning") return a.severity === "warning";
    return true;
  });

  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const warningCount = activeAlerts.filter((a) => a.severity === "warning").length;

  const dismissAlert = (id: string) => {
    setDismissed((prev) => [...prev, id]);
  };

  // If used as an embedded standalone widget on Dashboard
  if (standaloneWidget) {
    if (activeAlerts.length === 0) {
      return (
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm">
              ✅
            </span>
            <div>
              <h4 className="text-xs font-bold text-emerald-300">Критичних ризиків не виявлено</h4>
              <p className="text-[11px] text-slate-400">
                ACWR у безпечному коридорі (0.8–1.3), біометрія та велнес команди в нормі
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            Штатний режим
          </span>
        </div>
      );
    }

    return (
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-rose-500/30 backdrop-blur-md shadow-xl shadow-black/40 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-rose-500/20 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-base animate-pulse">
              🚨
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Центр Оперативних Ризиків та Сповіщень
                </h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {criticalCount} критичних · {warningCount} попереджень
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Автоматичний моніторинг спайків ACWR, падіння відновлення WHOOP та зон росту PHV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Всі ({activeAlerts.length})
            </button>
            <button
              onClick={() => setFilter("critical")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "critical"
                  ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🔴 Критичні ({criticalCount})
            </button>
            <button
              onClick={() => setFilter("warning")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filter === "warning"
                  ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🟡 Попередження ({warningCount})
            </button>
          </div>
        </div>

        {/* Alerts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                alert.severity === "critical"
                  ? "bg-rose-950/20 border-rose-500/30 hover:border-rose-400 shadow-md shadow-rose-950/20"
                  : "bg-amber-950/20 border-amber-500/30 hover:border-amber-400 shadow-md shadow-amber-950/20"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {alert.type === "acwr" && "⏱️"}
                      {alert.type === "wearable" && "⌚"}
                      {alert.type === "phv" && "📈"}
                      {alert.type === "pain" && "🩹"}
                      {alert.type === "hydration" && "💧"}
                      {alert.type === "overdue" && "⚠️"}
                    </span>
                    <div>
                      <Link
                        href={`/players/${alert.playerId}`}
                        className="text-xs font-bold text-white hover:text-sky-300 transition-colors block leading-tight"
                      >
                        {alert.playerName}
                      </Link>
                      <div className="text-[10px] text-slate-400">
                        {alert.teamName} · {alert.position}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      alert.severity === "critical"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {alert.metric}
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-200 mb-1 leading-snug">
                  {alert.title}
                </div>

                <p className="text-[11px] text-slate-400 leading-snug mb-2">
                  {alert.mechanism}
                </p>

                <div className="p-2 rounded-lg bg-slate-950/60 border border-white/5 text-[10px] space-y-1 mb-3">
                  <span className="font-bold text-sky-300 block">💡 Рекомендація штабу:</span>
                  <span className="text-slate-300 leading-snug block">{alert.actionRequired}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                <Link
                  href={`/players/${alert.playerId}`}
                  className="text-sky-400 hover:text-sky-300 font-semibold"
                >
                  Перейти в профіль →
                </Link>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Приховати
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Floating trigger button + Slide-over Drawer
  return (
    <>
      {/* Floating Bell Trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative w-9 h-9 rounded-xl bg-slate-900/90 border border-sky-500/30 hover:border-sky-400 flex items-center justify-center text-sm transition-all shadow-lg active:scale-95 group"
        title="Центр сповіщень та ризиків"
      >
        <span>🔔</span>
        {activeAlerts.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse">
            {activeAlerts.length}
          </span>
        )}
      </button>

      {/* Slide-over Drawer via Portal to escape sidebar overflow/filter */}
      {isOpen && mounted && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] overflow-hidden">
            {/* Clickable backdrop overlay */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity cursor-pointer"
              onClick={() => setIsOpen(false)}
              title="Натисніть для закриття"
              aria-label="Закрити сповіщення"
            />

            {/* Slide-over Drawer Container */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 pointer-events-none">
              <div className="w-screen max-w-md bg-slate-900 border-l border-sky-500/25 p-5 space-y-4 shadow-2xl flex flex-col justify-between pointer-events-auto">
                {/* Header */}
                <div className="pb-3 border-b border-sky-500/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔔</span>
                      <h3 className="text-base font-bold text-white">Сповіщення та Ризики</h3>
                    </div>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm transition-colors border border-white/10"
                      title="Закрити (Esc)"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Клікабельні фільтри */}
                  <div className="flex items-center gap-1.5 mt-3">
                    <button
                      onClick={() => setFilter("all")}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                        filter === "all"
                          ? "bg-slate-800 text-white font-bold border border-slate-700 shadow-sm"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                      }`}
                    >
                      Всі ({activeAlerts.length})
                    </button>
                    <button
                      onClick={() => setFilter("critical")}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        filter === "critical"
                          ? "bg-rose-500/25 text-rose-200 font-bold border-rose-500/50 shadow-sm shadow-rose-950"
                          : "text-rose-400/80 hover:text-rose-200 border-rose-500/20 hover:bg-rose-500/10"
                      }`}
                    >
                      🔴 Критичні ({criticalCount})
                    </button>
                    <button
                      onClick={() => setFilter("warning")}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all border ${
                        filter === "warning"
                          ? "bg-amber-500/25 text-amber-200 font-bold border-amber-500/50 shadow-sm shadow-amber-950"
                          : "text-amber-400/80 hover:text-amber-200 border-amber-500/20 hover:bg-amber-500/10"
                      }`}
                    >
                      🟡 Увага ({warningCount})
                    </button>
                  </div>
                </div>

                {/* Alerts List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                  {filtered.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center p-4">
                      <span className="text-3xl mb-2">🎉</span>
                      <p className="text-xs font-bold text-white">
                        {filter === "all"
                          ? "Усі показники в нормі"
                          : filter === "critical"
                          ? "Немає критичних ризиків"
                          : "Немає попереджень"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {filter === "all"
                          ? "Немає активних критичних ризиків по складу"
                          : "Усі гравці у безпечному коридорі для цієї категорії"}
                      </p>
                    </div>
                  ) : (
                    filtered.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                          alert.severity === "critical"
                            ? "bg-rose-950/30 border-rose-500/30"
                            : "bg-amber-950/30 border-amber-500/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/players/${alert.playerId}`}
                              onClick={() => setIsOpen(false)}
                              className="font-bold text-white hover:text-sky-300 transition-colors"
                            >
                              {alert.playerName}
                            </Link>
                            <div className="text-[10px] text-slate-400">
                              {alert.teamName} · {alert.position}
                            </div>
                          </div>
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              alert.severity === "critical"
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {alert.metric}
                          </span>
                        </div>

                        <div className="text-[11px] font-semibold text-slate-200">{alert.title}</div>
                        <p className="text-[10px] text-slate-400 leading-snug">{alert.mechanism}</p>

                        <div className="p-2 rounded-lg bg-slate-950/70 border border-white/5 text-[10px]">
                          <strong className="text-sky-300">Дія: </strong>
                          <span className="text-slate-300">{alert.actionRequired}</span>
                        </div>

                        <div className="flex items-center justify-between pt-1 text-[10px]">
                          <Link
                            href={`/players/${alert.playerId}`}
                            onClick={() => setIsOpen(false)}
                            className="text-sky-400 hover:text-sky-300 font-semibold"
                          >
                            Картка гравця →
                          </Link>
                          <button
                            onClick={() => dismissAlert(alert.id)}
                            className="text-slate-500 hover:text-slate-300"
                          >
                            Приховати
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-sky-500/15 flex items-center justify-between text-xs">
                  <Link
                    href="/workload"
                    onClick={() => setIsOpen(false)}
                    className="text-sky-400 hover:text-sky-300 font-semibold text-[11px]"
                  >
                    ⏱️ Моніторинг ACWR
                  </Link>
                  <Link
                    href="/rtp"
                    onClick={() => setIsOpen(false)}
                    className="text-sky-400 hover:text-sky-300 font-semibold text-[11px]"
                  >
                    🏃 Графік RTP
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
}
