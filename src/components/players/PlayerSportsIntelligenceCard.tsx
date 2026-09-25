"use client";

import React, { useState } from "react";
import Card from "@/components/ui/Card";
import type { WearableBiometricsEntry } from "@/types/wearables";
import type { PreSeasonScreening } from "@/types/screening";
import type { NutritionProfile } from "@/types/nutrition";

interface PlayerContextData {
  id: string;
  name: string;
  age: number;
  position: string;
  team: string;
  maturation?: any;
  wearables?: WearableBiometricsEntry[];
  screening?: PreSeasonScreening[];
  nutrition?: NutritionProfile | null;
  injuries?: any[];
}

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export default function PlayerSportsIntelligenceCard({
  playerContext,
}: {
  playerContext: PlayerContextData;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick" | "chat">("quick");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const callAi = async (mode: "player-assessment" | "chat", query?: string) => {
    setLoading(true);
    const userText = query || "Комплексна 360° оцінка готовності";
    
    // Add user message if chat mode
    if (mode === "chat") {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: userText, timestamp: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) },
      ]);
    }

    try {
      const res = await fetch("/api/ai/sports-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          playerContext,
          userQuery: userText,
          conversationHistory: messages,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Помилка зв'язку з Gemini");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          timestamp: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setActiveTab("chat");
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `⚠️ Помилка: ${err.message || "Не вдалося отримати відповідь"}`,
          timestamp: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
      setInputQuery("");
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <Card className="border border-sky-500/20 bg-slate-900/60 backdrop-blur-md relative overflow-hidden shadow-xl shadow-sky-950/20">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-sky-500/15 gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-sky-500/30">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-wide">
                ШІ-Спортивний Консультант
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold uppercase">
                Gemini 2.5 Flash
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Комплексний аналіз навантаження, біометрії WHOOP/Apple, фази росту та ризиків
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-sky-500/20 text-xs">
          <button
            onClick={() => setActiveTab("quick")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === "quick"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            ⚡ Швидкі дії
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all relative ${
              activeTab === "chat"
                ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💬 Діалог {messages.length > 0 && `(${messages.length})`}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="pt-4 space-y-4 relative z-10">
        {/* Quick action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <button
            onClick={() => callAi("player-assessment")}
            disabled={loading}
            className="p-3 rounded-xl border border-sky-500/25 bg-slate-800/40 hover:bg-sky-950/40 hover:border-sky-400 text-left transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-sky-300 font-semibold text-xs mb-1">
              <span>🎯</span> Оцінка готовності 360°
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Аналіз відновлення, PHV та вердикт: повна готовність чи ліміти
            </p>
          </button>

          <button
            onClick={() =>
              callAi(
                "chat",
                "Зроби глибокий аналіз останніх показників HRV, сну та пульсу спокою (RHR) цього футболіста. Як вони співвідносяться з тренувальним навантаженням?"
              )
            }
            disabled={loading}
            className="p-3 rounded-xl border border-indigo-500/25 bg-slate-800/40 hover:bg-indigo-950/40 hover:border-indigo-400 text-left transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs mb-1">
              <span>⌚</span> Біометрія та ВНС
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Вплив показників WHOOP/Apple Watch на вегетативний баланс
            </p>
          </button>

          <button
            onClick={() =>
              callAi(
                "chat",
                "Склади персональний протокол прехабу (розминки та активації) перед сьогоднішнім тренуванням з урахуванням історії травм та зон росту."
              )
            }
            disabled={loading}
            className="p-3 rounded-xl border border-emerald-500/25 bg-slate-800/40 hover:bg-emerald-950/40 hover:border-emerald-400 text-left transition-all group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs mb-1">
              <span>🛡️</span> Індивідуальний прехаб
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              3-4 спеціальні вправи для активації слабких зон перед виходом на поле
            </p>
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 flex items-center gap-3 animate-pulse">
            <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-sky-200">
                Gemini аналізує біометрію, матурацію та історію травм...
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Генерація науково обґрунтованої клінічної відповіді
              </p>
            </div>
          </div>
        )}

        {/* Message history */}
        {messages.length > 0 && (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border text-xs leading-relaxed transition-all ${
                  m.role === "user"
                    ? "bg-slate-800/60 border-slate-700/60 ml-6 text-slate-200"
                    : "bg-slate-950/80 border-sky-500/30 shadow-lg shadow-sky-950/30 text-slate-100 mr-2"
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[10px]">
                  <span className="font-semibold flex items-center gap-1.5">
                    {m.role === "user" ? (
                      <span className="text-slate-400 font-mono">👤 Запит штабу</span>
                    ) : (
                      <span className="text-sky-400 font-bold flex items-center gap-1 font-mono">
                        <span>✨</span> ШІ-Асистент
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono">{m.timestamp}</span>
                    {m.role === "assistant" && (
                      <button
                        onClick={() => handleCopy(m.text, idx)}
                        className="text-slate-400 hover:text-sky-300 transition-colors p-1"
                        title="Скопіювати відповідь"
                      >
                        {copiedIdx === idx ? "✓ Скопійовано" : "📋 Копіювати"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="whitespace-pre-wrap font-sans text-xs space-y-2">
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Interactive Query Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputQuery.trim() && !loading) {
              callAi("chat", inputQuery.trim());
            }
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Запитайте будь-що: 'Чи можна давати повне навантаження?', 'Вправи при дискомфорті'..."
              disabled={loading}
              className="w-full bg-slate-950/70 border border-sky-500/25 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-all"
            />
            {inputQuery && (
              <button
                type="button"
                onClick={() => setInputQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="w-full sm:w-auto bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <span>Надіслати</span>
              <span>→</span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-rose-400 text-xs transition-all"
                title="Очистити історію діалогу"
              >
                🗑️
              </button>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}
