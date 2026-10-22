"use client";

import { useState, useEffect } from "react";
import {
  BIOMECHANICS_GUIDES,
  type BiomechanicsTestGuide,
} from "@/lib/biomechanics-guide";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialTestId?: BiomechanicsTestGuide["id"];
};

export default function BiomechanicsGuidanceModal({
  isOpen,
  onClose,
  initialTestId = "wblt",
}: Props) {
  const [selectedId, setSelectedId] = useState<BiomechanicsTestGuide["id"]>(initialTestId);

  useEffect(() => {
    if (initialTestId) {
      setSelectedId(initialTestId);
    }
  }, [initialTestId]);

  if (!isOpen) return null;

  const current = BIOMECHANICS_GUIDES[selectedId];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-slate-900 border border-blue-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-blue-900/30 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xl shrink-0">
              🦵
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Клінічне керівництво з біомеханічного скринінгу</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  FIFA / Aspetar PPE
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Методика виконання функціональних тестів, обладнання та критерії допуску
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-3 bg-slate-950/40 border-b border-blue-900/20 overflow-x-auto text-xs shrink-0">
          {(Object.keys(BIOMECHANICS_GUIDES) as BiomechanicsTestGuide["id"][]).map((id) => {
            const guide = BIOMECHANICS_GUIDES[id];
            const isActive = selectedId === id;
            return (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                    : "bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <span>{id === "wblt" ? "📐" : id === "thomas" ? "🛏️" : id === "hamstrings" ? "⚡" : "🤸"}</span>
                <span>{guide.shortTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed">
          {/* Title & Subtitle */}
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              {current.title}
            </h3>
            <p className="text-sky-400 text-xs mt-0.5">{current.subtitle}</p>
          </div>

          {/* Importance */}
          <div className="bg-blue-950/40 border border-blue-800/40 p-3.5 rounded-xl space-y-1">
            <div className="font-bold text-blue-300 flex items-center gap-1.5">
              <span>🎯</span> Чому це критично для футболіста:
            </div>
            <p className="text-slate-300">{current.importance}</p>
          </div>

          {/* Equipment */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <span>🛠️</span> Необхідне обладнання:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
              {current.equipment.map((eq, idx) => (
                <li key={idx}>{eq}</li>
              ))}
            </ul>
          </div>

          {/* Protocol */}
          <div className="space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <span>📋</span> Покроковий протокол виконання:
            </div>
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
              {current.protocol.map((step, idx) => (
                <div key={idx} className="text-slate-200 flex items-start gap-2">
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interpretation */}
          <div className="space-y-2">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <span>📊</span> Клінічна інтерпретація результатів:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>🟢</span> Норма (Допуск):
                </div>
                <div className="text-slate-300 text-[11px]">{current.interpretation.normal}</div>
              </div>

              {current.interpretation.borderline && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5">
                    <span>🟡</span> Межа / Під наглядом:
                  </div>
                  <div className="text-slate-300 text-[11px]">{current.interpretation.borderline}</div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1 sm:col-span-2">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <span>🔴</span> Високий ризик / Відхилення:
                </div>
                <div className="text-slate-300 text-[11px]">{current.interpretation.risk}</div>
              </div>
            </div>
          </div>

          {/* Clinical tips */}
          {current.clinicalTips && current.clinicalTips.length > 0 && (
            <div className="bg-slate-950/40 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>💡</span> Поради лікаря та типові помилки:
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                {current.clinicalTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-950/60 border-t border-blue-900/30 flex items-center justify-between text-xs text-slate-400">
          <span>Стандартизація оглядів СДЮШОР / Академії</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
}
