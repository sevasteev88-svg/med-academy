"use client";

import {
  calculateReinjuryRisk,
  type ReinjuryRiskAssessment,
} from "@/lib/reinjury-risk-calculator";

type Props = {
  acwr?: number | null;
  wellnessScore?: number | null;
  growthPhase?: string | null;
  reinjuryCount?: number;
  playerName: string;
};

export default function ReinjuryRiskWidget({
  acwr,
  wellnessScore,
  growthPhase,
  reinjuryCount,
  playerName,
}: Props) {
  const assessment = calculateReinjuryRisk({
    acwr,
    wellnessScore,
    growthPhase,
    previousInjuriesCount: reinjuryCount,
  });

  return (
    <div className="bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🤖</span>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              AI-Аналітик ризику травми / рецидиву
            </h3>
            <p className="text-[11px] text-slate-400">
              Багатофакторна предиктивна модель (ACWR + Велнес + PHV + Анамнез)
            </p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-lg text-xs font-bold border font-mono ${assessment.badgeClass}`}
        >
          {assessment.score}% Ризик ({assessment.riskLevel.toUpperCase()})
        </span>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Імовірність виникнення / повторення травми</span>
          <span className="font-mono font-bold text-white">{assessment.score} / 100</span>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-blue-900/20">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              assessment.score >= 70
                ? "bg-red-500 shadow-glow-sm"
                : assessment.score >= 45
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${assessment.score}%` }}
          />
        </div>
      </div>

      {/* Contributing Factors */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase font-bold text-slate-400">
          Фактори впливу на ризик:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {assessment.factors.map((f, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                f.severity === "danger"
                  ? "bg-red-950/25 border-red-500/30 text-red-200"
                  : f.severity === "warning"
                  ? "bg-amber-950/25 border-amber-500/30 text-amber-200"
                  : "bg-slate-950/40 border-blue-900/20 text-slate-300"
              }`}
            >
              <div className="font-semibold">{f.title}</div>
              <div className="text-[10px] text-slate-400 mt-1">{f.impact}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Medical Recommendation */}
      <div className="bg-slate-950/60 p-3 rounded-xl border border-blue-900/20 text-xs text-slate-300 leading-relaxed">
        {assessment.recommendation}
      </div>
    </div>
  );
}
