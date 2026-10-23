"use client";

import {
  calculateReinjuryRisk,
  REINJURY_RISK_DISCLAIMER,
  type ReinjuryRiskAssessment,
} from "@/lib/reinjury-risk-calculator";

type Props = {
  playerName: string;
  // 1. Зріст / PHV
  heightMeasurementsCount12m?: number;
  growthPhase?: string | null;
  hasPhvRecorded?: boolean;

  // 2. Навантаження (потрібно >= 28 днів)
  workloadDaysMonitored?: number;
  acwr?: number | null;

  // 3. Велнес (потрібно >= 7 днів)
  wellnessDaysRecorded?: number;
  wellnessScore?: number | null;

  // Додаткові фактори
  reinjuryCount?: number;
  hasActiveDiscomfort?: boolean;
};

export default function ReinjuryRiskWidget({
  playerName,
  heightMeasurementsCount12m,
  growthPhase,
  hasPhvRecorded,
  workloadDaysMonitored,
  acwr,
  wellnessDaysRecorded,
  wellnessScore,
  reinjuryCount,
  hasActiveDiscomfort,
}: Props) {
  const assessment: ReinjuryRiskAssessment = calculateReinjuryRisk({
    heightMeasurementsCount12m,
    growthPhase,
    hasPhvRecorded,
    workloadDaysMonitored,
    acwr,
    wellnessDaysRecorded,
    wellnessScore,
    previousInjuriesCount: reinjuryCount,
    hasActiveDiscomfort,
  });

  return (
    <div className="bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🤖</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-white tracking-tight">
                AI-Аналітик ризику та готовності
              </h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-sky-300">
                {assessment.disclaimer}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Моніторинг навантаження, відновлення (sRPE + Hooper-Mackinnon + PHV)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold border font-mono tracking-wide ${assessment.badgeClass}`}
          >
            {assessment.categoryLabelUa}
          </span>
        </div>
      </div>

      {/* Case 1: Недостатньо даних */}
      {assessment.isInsufficientData ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <span className="text-amber-400">⚠️</span>
              <span>Недостатньо даних для формування об&apos;єктивної оцінки</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Згідно з протоколами моніторингу навантаження (Gabbett &amp; Aspetar), розрахунок виконується виключно при мінімальному наборі спостережень. Для футболіста <strong>{playerName}</strong> бракує:
            </p>

            <ul className="space-y-1.5 pt-1">
              {assessment.missingDataReasons.map((reason, idx) => (
                <li
                  key={idx}
                  className="text-xs text-slate-300 flex items-start gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800"
                >
                  <span className="text-red-400 font-bold shrink-0">✕</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-950/40 p-3 rounded-xl border border-blue-900/20 text-xs text-slate-400 leading-relaxed">
            {assessment.recommendation}
          </div>
        </div>
      ) : (
        /* Case 2: Достатньо даних -> Категорія та фактори */
        <div className="space-y-4">
          {/* Category Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              assessment.riskCategory === "high"
                ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                : assessment.riskCategory === "moderate"
                ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">
                {assessment.riskCategory === "high"
                  ? "🔴"
                  : assessment.riskCategory === "moderate"
                  ? "🟡"
                  : "🟢"}
              </span>
              <div>
                <div className="text-xs font-black uppercase tracking-wider">
                  Категорія: {assessment.categoryLabelUa} ризик
                </div>
                <div className="text-[11px] opacity-80">
                  {assessment.disclaimer} · базується на ACWR, щоденному велнесі та PHV
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono opacity-70">
              {assessment.factors.length} фактор(и)
            </span>
          </div>

          {/* Contributing Factors */}
          <div className="space-y-2">
            <div className="text-[11px] uppercase font-bold text-slate-400 flex items-center justify-between">
              <span>Зафіксовані фактори навантаження та готовності:</span>
              <span className="text-[10px] text-slate-500 font-normal">
                (орієнтовна оцінка стану)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {assessment.factors.map((f, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border flex flex-col justify-between ${
                    f.severity === "danger"
                      ? "bg-red-950/25 border-red-500/30 text-red-200"
                      : f.severity === "warning"
                      ? "bg-amber-950/25 border-amber-500/30 text-amber-200"
                      : "bg-slate-950/50 border-blue-900/20 text-slate-300"
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <span>
                      {f.severity === "danger"
                        ? "⚠️"
                        : f.severity === "warning"
                        ? "⚡"
                        : "✓"}
                    </span>
                    <span>{f.title}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {f.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-blue-900/20 text-xs text-slate-300 leading-relaxed">
            <strong className="text-sky-300 block mb-1">Медико-тренерська рекомендація:</strong>
            {assessment.recommendation}
          </div>
        </div>
      )}

      {/* Footer Disclaimer */}
      <div className="text-[10px] text-slate-500 border-t border-blue-900/20 pt-2 flex items-center justify-between">
        <span>
          * {REINJURY_RISK_DISCLAIMER}. Дані індикатори не є діагнозом та використовуються для оптимізації тренувального навантаження.
        </span>
      </div>
    </div>
  );
}
