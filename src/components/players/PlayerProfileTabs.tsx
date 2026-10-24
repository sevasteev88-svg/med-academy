"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type TabKey = "overview" | "injuries" | "passport" | "profile";

interface PlayerProfileTabsProps {
  overview: React.ReactNode;
  injuries: React.ReactNode;
  passport: React.ReactNode;
  profile: React.ReactNode;
  activeInjuriesCount?: number;
  hasPendingConsents?: boolean;
}

const TABS: { id: TabKey; label: string; icon: string; shortLabel: string }[] = [
  { id: "overview", label: "Огляд & Статус", shortLabel: "Огляд", icon: "📌" },
  { id: "injuries", label: "Травми та Реабілітація", shortLabel: "Травми & Реаб.", icon: "🏥" },
  { id: "passport", label: "Медпаспорт та Огляди", shortLabel: "Медпаспорт", icon: "🩺" },
  { id: "profile", label: "Доступи, ШІ та Профіль", shortLabel: "Доступи & ШІ", icon: "⚙️" },
];

export default function PlayerProfileTabs({
  overview,
  injuries,
  passport,
  profile,
  activeInjuriesCount = 0,
  hasPendingConsents = false,
}: PlayerProfileTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as TabKey | null;
  const initialTab: TabKey =
    tabParam && ["overview", "injuries", "passport", "profile"].includes(tabParam)
      ? tabParam
      : "overview";

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (tabParam && ["overview", "injuries", "passport", "profile"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleSelectTab = (tabId: TabKey) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* Навігаційна панель вкладок */}
      <div className="sticky top-2 z-30 bg-slate-950/85 backdrop-blur-xl p-1.5 rounded-2xl border border-sky-500/25 shadow-xl shadow-slate-950/50">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none md:grid md:grid-cols-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                type="button"
                className={`flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap cursor-pointer select-none border ${
                  isActive
                    ? "bg-gradient-to-r from-sky-600/35 to-blue-600/35 text-white border-sky-400/40 shadow-md shadow-sky-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-850/60 border-transparent"
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="inline sm:hidden">{tab.shortLabel}</span>

                {/* Бейдж для вкладки травм */}
                {tab.id === "injuries" && activeInjuriesCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500/30 text-rose-300 border border-rose-500/40 animate-pulse">
                    {activeInjuriesCount}
                  </span>
                )}

                {/* Індикатор для вкладки доступів при потребі підписання згод */}
                {tab.id === "profile" && hasPendingConsents && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Контент активної вкладки */}
      <div className="tab-content transition-opacity duration-200">
        {activeTab === "overview" && <div className="space-y-6">{overview}</div>}
        {activeTab === "injuries" && <div className="space-y-6">{injuries}</div>}
        {activeTab === "passport" && <div className="space-y-6">{passport}</div>}
        {activeTab === "profile" && <div className="space-y-6">{profile}</div>}
      </div>
    </div>
  );
}
