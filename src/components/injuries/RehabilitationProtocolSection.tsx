"use client";

import { useState } from "react";
import { getClinicalProtocol } from "@/lib/clinical-protocols";

type Props = {
  injuryType: string;
  location: string;
  side: string;
  severity: string;
  mechanism: string;
  vasScore?: number | null;
  bamicCode?: string | null;
  bamicLocation?: string | null;
  mlgrCode?: string | null;
  munichType?: string | null;
  reinjuryCount?: number;
  playerName: string;
  teamName: string;
  position: string;
  age: number;
};

export default function RehabilitationProtocolSection({
  injuryType,
  location,
  side,
  severity,
  mechanism,
  vasScore,
  bamicCode,
  bamicLocation,
  mlgrCode,
  munichType,
  reinjuryCount = 0,
  playerName,
  teamName,
  position,
  age,
}: Props) {
  const [activeTab, setActiveTab] = useState<"clinical" | "ai">("clinical");
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // AI Assistant state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Отримуємо клінічний протокол для поточної травми
  const protocol = getClinicalProtocol({
    injuryType,
    location,
    bamicLocation,
    reinjuryCount,
  });

  const currentPhase = protocol.phases.find((p) => p.phaseNumber === selectedPhase) || protocol.phases[0];

  async function fetchAiRecommendation() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/injury-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName,
          age,
          sex: "male",
          position,
          teamName,
          injury: {
            injuryType,
            location,
            side,
            severity,
            mechanism,
            vasScore: vasScore ?? 5,
            description: `MLG-R: ${mlgrCode ?? "—"}, BAMIC: ${bamicCode ?? "—"}, Munich: ${munichType ?? "—"}`,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Не вдалося отримати відповідь від AI");
      } else {
        setAiRecommendation(data.recommendation);
      }
    } catch (err: any) {
      setAiError(err.message || "Помилка мережі при запиті до AI");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="bg-slate-900/85 border border-blue-900/25 rounded-xl overflow-hidden mb-4 transition-all">
      {/* Шапка секції з можливістю згортання */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 bg-slate-950/40 cursor-pointer border-b border-blue-900/15 hover:bg-slate-950/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <div>
            <div className="text-[13px] font-semibold text-slate-200">
              Протокол реабілітації та AI-Асистент
            </div>
            <div className="text-[10px] text-slate-500">
              Гайдлайни FC Barcelona / Aspetar + Індивідуальний прогноз AI
            </div>
          </div>
        </div>
        <button
          type="button"
          className="text-xs text-blue-400 font-mono px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20"
        >
          {isOpen ? "Згорнути ▲" : "Розгорнути ▼"}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4">
          {/* Перемикач вкладок */}
          <div className="flex rounded-lg bg-slate-950/80 p-1 border border-blue-900/20">
            <button
              type="button"
              onClick={() => setActiveTab("clinical")}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${
                activeTab === "clinical"
                  ? "bg-blue-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🏥 Клінічний протокол (Aspetar / Barca)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${
                activeTab === "ai"
                  ? "bg-purple-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              🤖 AI-Асистент (Персональний план)
            </button>
          </div>

          {/* ══════════ ВКЛАДКА 1: КЛІНІЧНИЙ ПРОТОКОЛ ══════════ */}
          {activeTab === "clinical" && (
            <div className="space-y-4">
              {/* Коротка довідка */}
              <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/20 text-xs">
                <div className="font-semibold text-blue-300 mb-1">{protocol.title}</div>
                <div className="text-slate-400 text-[11px] mb-2">{protocol.basis}</div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{protocol.summary}</p>

                {protocol.keyRisks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-900/30">
                    <span className="text-[10px] uppercase font-bold text-amber-400">Ключові ризики:</span>
                    <ul className="list-disc list-inside text-[11px] text-amber-200/90 mt-1 space-y-0.5">
                      {protocol.keyRisks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Навігація по фазах */}
              <div className="grid grid-cols-4 gap-1.5">
                {protocol.phases.map((ph) => {
                  const isCur = selectedPhase === ph.phaseNumber;
                  return (
                    <button
                      key={ph.phaseNumber}
                      type="button"
                      onClick={() => setSelectedPhase(ph.phaseNumber)}
                      className={`py-2 px-1 rounded-lg border text-center transition-all ${
                        isCur
                          ? "border-blue-400 bg-blue-600/25 text-white font-bold"
                          : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      <div className="text-[11px]">Фаза {ph.phaseNumber}</div>
                      <div className="text-[9px] text-slate-500">{ph.durationRange}</div>
                    </button>
                  );
                })}
              </div>

              {/* Деталі обраної фази */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                  <div className="text-xs font-bold text-white">{currentPhase.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">
                    {currentPhase.durationRange}
                  </span>
                </div>

                {/* Цілі фази */}
                <div>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block mb-1">
                    🎯 Цілі фази:
                  </span>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {currentPhase.goals.map((g, idx) => (
                      <li key={idx}>{g}</li>
                    ))}
                  </ul>
                </div>

                {/* Дозволені активності */}
                <div>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-green-400 block mb-1">
                    ✅ Дозволені вправи та активності:
                  </span>
                  <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                    {currentPhase.allowedActivities.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>

                {/* Заборонені рухи */}
                {currentPhase.prohibitedActivities.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-red-400 block mb-1">
                      ⛔ Суворо обмежити / уникати:
                    </span>
                    <ul className="list-disc list-inside text-xs text-red-200/80 space-y-1">
                      {currentPhase.prohibitedActivities.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Критерії переходу на наступний етап */}
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-400 block mb-1">
                    🏁 Критерії завершення фази (Exit Criteria):
                  </span>
                  <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
                    {currentPhase.exitCriteria.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Чек-лист повернення до гри */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-green-900/30">
                <span className="text-[11px] font-bold text-green-400 uppercase tracking-wider block mb-2">
                  🏆 Фінальний чек-лист повернення в гру (Return to Play):
                </span>
                <div className="space-y-1.5">
                  {protocol.returnToPlayChecklist.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-green-400 font-bold">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════ ВКЛАДКА 2: AI АСИСТЕНТ ══════════ */}
          {activeTab === "ai" && (
            <div className="space-y-3">
              {!aiRecommendation && (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    AI-Асистент проаналізує профіль футболіста ({playerName}, {age} р., {position}),
                    класифікацію травми (BAMIC {bamicCode || "—"}, Munich {munichType || "—"}) та динаміку болю,
                    згенерувавши індивідуальні вказівки для тренера та лікаря.
                  </p>
                  <button
                    type="button"
                    onClick={fetchAiRecommendation}
                    disabled={aiLoading}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
                  >
                    {aiLoading ? "AI аналізує травму..." : "✨ Згенерувати рекомендації через AI"}
                  </button>
                </div>
              )}

              {aiError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  <span className="font-bold">⚠️ Помилка: </span>
                  {aiError}
                </div>
              )}

              {aiRecommendation && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-900/30 text-xs text-slate-300 leading-relaxed whitespace-pre-line space-y-2">
                  <div className="flex justify-between items-center border-b border-purple-900/20 pb-2 mb-2">
                    <span className="text-purple-300 font-bold">✨ Відповідь AI-Асистента:</span>
                    <button
                      type="button"
                      onClick={fetchAiRecommendation}
                      className="text-[10px] text-purple-400 hover:text-purple-200 underline"
                    >
                      Оновити розрахунок
                    </button>
                  </div>
                  {aiRecommendation}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
