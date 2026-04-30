"use client";

import { useState } from "react";

type Summary = {
  totalInjuries: number;
  totalPlayers: number;
  uniqueInjuredPlayers: number;
  recurrenceCount: number;
  byType: Record<string, number>;
  byLocation: Record<string, number>;
  byMechanism: Record<string, number>;
  bySeverity: Record<string, number>;
  byPhase: Record<string, number>;
};

const TYPE_UA: Record<string, string> = {
  muscular: "М'язова", ligament: "Зв'язкова", bone: "Кісткова",
  tendon: "Сухожилкова", cartilage: "Хрящова", concussion: "Струс мозку",
  contusion: "Забій", other: "Інше",
};
const LOC_UA: Record<string, string> = {
  knee: "Коліно", ankle: "Гомілковостоп", shoulder: "Плече", hip: "Стегно (кульш.)",
  thigh: "Стегно", calf: "Гомілка", foot: "Стопа", groin: "Пах",
  back: "Спина", neck: "Шия", wrist: "Зап'ясток", head: "Голова", other: "Інше",
};
const MECH_UA: Record<string, string> = {
  contact: "Контактна", non_contact: "Безконтактна", overuse: "Перевантаження",
};
const SEV_UA: Record<string, string> = {
  minimal: "Мінімальна", mild: "Легка", moderate: "Середня",
  severe: "Тяжка", career_threatening: "Критична",
};
const PHASE_UA: Record<string, string> = {
  pre_phv: "Pre-PHV", phv: "PHV", post_phv: "Post-PHV",
};

export default function InjuryPatternsAI({
  data,
  summary,
}: {
  data: any;
  summary: Summary;
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
        body: JSON.stringify(data),
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

  const noData = summary.totalInjuries === 0;

  return (
    <div className="space-y-6">
      {/* Загальна статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Всього травм" value={summary.totalInjuries} color="text-white" />
        <MiniStat label="Травмованих гравців" value={summary.uniqueInjuredPlayers} color="text-status-warn" />
        <MiniStat label="Рецидиви" value={summary.recurrenceCount} color="text-status-danger" />
        <MiniStat
          label="Травм / гравець"
          value={
            summary.totalPlayers > 0
              ? (summary.totalInjuries / summary.totalPlayers).toFixed(1)
              : "—"
          }
          color="text-slate-300"
        />
      </div>

      {/* Розбивка по категоріях */}
      {!noData && (
        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownCard
            title="За локалізацією"
            data={summary.byLocation}
            labels={LOC_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За типом"
            data={summary.byType}
            labels={TYPE_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За механізмом"
            data={summary.byMechanism}
            labels={MECH_UA}
            total={summary.totalInjuries}
          />
          <BreakdownCard
            title="За тяжкістю"
            data={summary.bySeverity}
            labels={SEV_UA}
            total={summary.totalInjuries}
          />
          {Object.keys(summary.byPhase).length > 0 && (
            <BreakdownCard
              title="За фазою матурації"
              data={summary.byPhase}
              labels={PHASE_UA}
              total={Object.values(summary.byPhase).reduce((a, b) => a + b, 0)}
              className="md:col-span-2"
            />
          )}
        </div>
      )}

      {/* Кнопка AI-аналізу */}
      {!analysis && (
        <button
          onClick={runAnalysis}
          disabled={loading || noData}
          className="w-full bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-brand-blue/20 text-sm"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <Spinner />
              Claude аналізує патерни…
            </span>
          ) : noData ? (
            "Немає даних для аналізу"
          ) : (
            `🔍 Аналізувати патерни (${summary.totalInjuries} травм)`
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
              className="border border-slate-800 text-slate-400 hover:bg-slate-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? "Аналізую…" : "🔄 Повторити"}
            </button>
            <button
              onClick={copyToClipboard}
              className="border border-slate-800 text-slate-400 hover:bg-slate-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {copied ? "✓ Скопійовано" : "📋 Копіювати"}
            </button>
          </div>

          <div className="bg-surface rounded-xl border border-slate-800 p-6">
            <MarkdownRenderer content={analysis} />
          </div>

          <p className="text-[11px] text-slate-600 text-center">
            Аналіз згенеровано AI (Claude). Кореляції потребують клінічної інтерпретації.
          </p>
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
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-slate-800 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">
        {label}
      </div>
      <div className={`text-xl font-extrabold font-mono ${color}`}>{value}</div>
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
      <h3 className="text-xs font-semibold text-slate-500 mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([key, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{labels[key] ?? key}</span>
                <span className="text-slate-500 font-mono">
                  {count} ({pct}%)
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

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
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
