"use client";

import { useState } from "react";
import {
  INJURY_TYPE_UA,
  LOCATION_UA,
  MECHANISM_UA,
  SEVERITY_UA,
} from "@/lib/constants";
import { GROWTH_PHASE_LABELS } from "@/lib/phv-calculator";

export type PatternsSummary = {
  totalInjuries: number;
  totalPlayers: number;
  uniqueInjuredPlayers: number;
  recurrenceCount: number;
  byType: Record<string, number>;
  byLocation: Record<string, number>;
  byMechanism: Record<string, number>;
  bySeverity: Record<string, number>;
  byPhase: Record<string, number>;
  maturationKnownCount: number;
  maturationUnknownCount: number;
  exposureMetrics?: {
    totalExposureHours: number;
    trainingExposureHours: number;
    matchExposureHours: number;
    overallIncidence: number | null;
    trainingIncidence: number | null;
    matchIncidence: number | null;
    hasSufficientData: boolean;
    displayLabel: string;
    trainingDisplayLabel: string;
    matchDisplayLabel: string;
  };
};

export type AggregatedPatternsData = {
  sampleSize: number;
  totalPlayers: number;
  uniqueInjuredPlayers: number;
  ageStats: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  byType: Record<string, number>;
  byLocation: Record<string, number>;
  byMechanism: Record<string, number>;
  bySeverity: Record<string, number>;
  maturation: {
    totalInjuries: number;
    knownCount: number;
    unknownCount: number;
    byPhase: Record<string, number>;
  };
  recurrencesSummary: {
    playersWithRecurrences: number;
    distribution: Record<string, number>;
    recurringLocations: string[];
  };
  teamStats: Array<{
    teamName: string;
    totalInjuries: number;
    totalPlayers: number;
    injuryRate: string;
  }>;
  exposureMetrics: {
    hasData: boolean;
    hours1000Rate: number | null;
    placeholderNote: string;
  };
};

export default function InjuryPatternsAI({
  aggregates,
  summary,
}: {
  aggregates: AggregatedPatternsData;
  summary: PatternsSummary;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch("/api/ai/injury-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Передаємо виключно знеособлені агрегати
        body: JSON.stringify({ aggregates }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Помилка аналізу");
        return;
      }
      setAnalysis(json.analysis);
    } catch {
      setError("Не вдалось зʼєднатись з сервером");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!analysis) return;
    await navigator.clipboard.writeText(analysis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const n = summary.totalInjuries;
  const noData = n === 0;
  const isSmallSample = n < 30;

  return (
    <div className="space-y-6">
      {/* Попередження при вибірці n < 30 */}
      {isSmallSample && !noData && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 shadow-sm">
          <span className="text-xl shrink-0 mt-0.5">⚠️</span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Розмір вибірки: n = {n} (&lt; 30)
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">
                Обмежена статистика
              </span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
              Описова статистика, не причинно-наслідкові висновки.
            </p>
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              При розмірі вибірки менше 30 випадків статистична потужність недостатня для встановлення
              достовірних причинних зв&apos;язків. Наведені показники відображають лише структуру зареєстрованих випадків.
            </p>
          </div>
        </div>
      )}

      {/* Якщо вибірка n >= 30 */}
      {!isSmallSample && !noData && (
        <div className="text-xs text-slate-400 bg-surface px-3.5 py-2 rounded-xl border border-slate-800 inline-flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>
            Розмір вибірки: <strong className="text-white font-mono font-bold">n = {n}</strong>{" "}
            (описовий статистичний масив)
          </span>
        </div>
      )}

      {/* Загальна статистика з плейсхолдером під 1000 годин */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MiniStat
          label="Всього травм (n)"
          value={summary.totalInjuries}
          color="text-white"
          subtitle={`Вибірка: n = ${n}`}
        />
        <MiniStat
          label="Травмованих"
          value={summary.uniqueInjuredPlayers}
          color="text-status-warn"
          subtitle="Унікальні гравці"
        />
        <MiniStat
          label="Рецидиви"
          value={summary.recurrenceCount}
          color="text-status-danger"
          subtitle="Гравці з ≥ 2 травмами"
        />
        {/* Показники експозиції та захворюваності на 1000 годин замість «травм на гравця» (задача 4.2) */}
        <MiniStat
          label="Травм на 1000 год"
          value={
            summary.exposureMetrics?.hasSufficientData && summary.exposureMetrics.overallIncidence != null
              ? `${summary.exposureMetrics.overallIncidence.toFixed(1)}`
              : "Недостатньо даних про експозицію"
          }
          color={
            summary.exposureMetrics?.hasSufficientData ? "text-amber-400" : "text-slate-400"
          }
          subtitle={
            summary.exposureMetrics?.hasSufficientData
              ? `Тренування: ${summary.exposureMetrics.trainingDisplayLabel} · Матчі: ${summary.exposureMetrics.matchDisplayLabel}`
              : "Потрібно внести години в меню Експозиція"
          }
          badge={
            summary.exposureMetrics?.hasSufficientData
              ? `${summary.exposureMetrics.totalExposureHours.toFixed(0)} год`
              : "Експозиція"
          }
        />
        <MiniStat
          label="Тренування / Матчі"
          value={
            summary.exposureMetrics?.hasSufficientData
              ? `${summary.exposureMetrics.trainingIncidence?.toFixed(1) ?? "—"} / ${summary.exposureMetrics.matchIncidence?.toFixed(1) ?? "—"}`
              : "—"
          }
          color="text-sky-300"
          subtitle={
            summary.exposureMetrics?.hasSufficientData
              ? `${summary.exposureMetrics.trainingExposureHours.toFixed(0)} год трен. / ${summary.exposureMetrics.matchExposureHours.toFixed(0)} год матч.`
              : "Недостатньо даних про експозицію"
          }
        />
      </div>

      {/* Розбивка по категоріях */}
      {!noData && (
        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownCard
            title="За локалізацією"
            data={summary.byLocation}
            labels={LOCATION_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За типом"
            data={summary.byType}
            labels={INJURY_TYPE_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За механізмом"
            data={summary.byMechanism}
            labels={MECHANISM_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За тяжкістю"
            data={summary.bySeverity}
            labels={SEVERITY_UA}
            total={summary.totalInjuries}
          />

          {/* За фазою матурації — без відсотків від неповної вибірки */}
          <MaturationBreakdownCard
            data={summary.byPhase}
            labels={GROWTH_PHASE_LABELS}
            knownCount={summary.maturationKnownCount}
            totalInjuries={summary.totalInjuries}
            unknownCount={summary.maturationUnknownCount}
            className="md:col-span-2"
          />
        </div>
      )}

      {/* Кнопка AI-аналізу */}
      {!analysis && (
        <button
          onClick={runAnalysis}
          disabled={loading || noData}
          className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-glow-sm text-sm"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <Spinner />
              ШІ аналізує агреговані патерни…
            </span>
          ) : noData ? (
            "Немає даних для аналізу"
          ) : (
            `🔍 Аналізувати патерни (вибірка: n = ${summary.totalInjuries} травм)`
          )}
        </button>
      )}

      {error && (
        <div className="bg-status-danger/10 border border-status-danger/20 rounded-xl p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Результат аналізу */}
      {analysis && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? "Аналізую…" : "🔄 Повторити"}
            </button>
            <button
              onClick={copyToClipboard}
              className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {copied ? "✓ Скопійовано" : "📋 Копіювати"}
            </button>
          </div>

          <div className="bg-surface rounded-xl border border-slate-800 p-6">
            <MarkdownRenderer content={analysis} />
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-xs font-semibold text-amber-300">
              ⚠️ Згенеровано ШІ на основі знеособлених агрегатів. Описова статистика, не медичний діагноз.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Компоненти ─────────────────────────────────────────────

function MiniStat({
  label,
  value,
  color,
  subtitle,
  badge,
}: {
  label: string;
  value: number | string;
  color: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold truncate">
            {label}
          </span>
          {badge && (
            <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
              {badge}
            </span>
          )}
        </div>
        <div className={`text-xl font-extrabold font-mono ${color}`}>{value}</div>
      </div>
      {subtitle && (
        <div className="text-[10px] text-slate-500 mt-1.5 font-medium leading-tight">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  data,
  labels,
  total,
  className = "",
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
  total: number;
  className?: string;
}) {
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <div className={`bg-surface rounded-xl border border-slate-800 p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-slate-400 mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([key, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{labels[key] ?? key}</span>
                <span className="text-slate-400 font-mono">
                  {count} <span className="text-slate-500">({pct}%)</span>
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-blue rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Блок «За фазою матурації»
 * Спеціально показує кількість травм з відомою фазою (наприклад, «4 з 7»)
 * БЕЗ відсотків від неповної вибірки, щоб не спотворювати статистичну інтерпретацію.
 */
function MaturationBreakdownCard({
  data,
  labels,
  knownCount,
  totalInjuries,
  unknownCount,
  className = "",
}: {
  data: Record<string, number>;
  labels: Record<string, string>;
  knownCount: number;
  totalInjuries: number;
  unknownCount: number;
  className?: string;
}) {
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <div className={`bg-surface rounded-xl border border-slate-800 p-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-300">За фазою матурації</h3>
          <p className="text-[11px] text-slate-500">
            Оцінка біологічного дозрівання на момент виникнення травми
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Фаза відома: {knownCount} з {totalInjuries}
          </span>
        </div>
      </div>

      <div className="space-y-2 mt-3">
        {sorted.map(([key, count]) => (
          <div
            key={key}
            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs"
          >
            <span className="text-slate-300 font-medium">{labels[key] ?? key}</span>
            <span className="text-white font-mono font-bold">
              {count} {formatCasesUA(count)}
            </span>
          </div>
        ))}

        {unknownCount > 0 && (
          <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/30 border border-dashed border-slate-800 text-xs text-slate-500">
            <span>Не визначено (відсутня оцінка PHV на момент травми)</span>
            <span className="font-mono font-medium text-slate-400">
              {unknownCount} {formatCasesUA(unknownCount)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-500">
        <span>ℹ️</span>
        <span>
          Відсотки не розраховуються через неповну вибірку (фаза відома для {knownCount} з {totalInjuries} травм).
        </span>
      </div>
    </div>
  );
}

function formatCasesUA(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return "випадків";
  if (rem > 1 && rem < 5) return "випадки";
  if (rem === 1) return "випадок";
  return "випадків";
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = content
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-800">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="text-sm text-slate-300 ml-4 mb-1 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="text-sm text-slate-300 ml-4 mb-1 list-decimal">$1. $2</li>')
    .replace(/\n\n/g, '</p><p class="text-sm text-slate-400 mb-3">')
    .replace(/\n/g, "<br/>");

  return (
    <div
      className="text-sm text-slate-400 leading-relaxed"
      dangerouslySetInnerHTML={{
        __html: `<p class="text-sm text-slate-400 mb-3">${html}</p>`,
      }}
    />
  );
}
