"use client";

import { useState } from "react";

type ReportData = {
  activeInjuries: any[];
  rehabInjuries: any[];
  upcomingReturns: any[];
  maturationAlerts: any[];
  totalPlayers: number;
  availablePlayers: number;
  unavailablePlayers: number;
};

export default function WeeklyReportAI({ data }: { data: ReportData }) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generateReport() {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/ai/weekly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Помилка генерації звіту");
        return;
      }

      setReport(json.report);
    } catch {
      setError("Не вдалось зʼєднатись з сервером");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Статистика вхідних даних */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Активні травми" value={data.activeInjuries.length} color="text-status-danger" />
        <MiniStat label="Реабілітація" value={data.rehabInjuries.length} color="text-status-warn" />
        <MiniStat label="PHV/Ризик" value={data.maturationAlerts.length} color="text-status-warn" />
        <MiniStat
          label="Доступність"
          value={`${data.availablePlayers}/${data.totalPlayers}`}
          color="text-status-ok"
        />
      </div>

      {/* Кнопка генерації */}
      {!report && (
        <button
          onClick={generateReport}
          disabled={loading}
          className="w-full bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-brand-blue/20 text-sm"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <Spinner />
              Claude аналізує дані…
            </span>
          ) : (
            "🤖 Згенерувати тижневий звіт"
          )}
        </button>
      )}

      {error && (
        <div className="bg-status-danger/10 border border-status-danger/20 rounded-xl p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Звіт */}
      {report && (
        <div className="space-y-4">
          {/* Тулбар */}
          <div className="flex gap-3">
            <button
              onClick={generateReport}
              disabled={loading}
              className="border border-slate-800 text-slate-400 hover:bg-slate-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {loading ? "Генерую…" : "🔄 Перегенерувати"}
            </button>
            <button
              onClick={copyToClipboard}
              className="border border-slate-800 text-slate-400 hover:bg-slate-800 font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              {copied ? "✓ Скопійовано" : "📋 Копіювати"}
            </button>
          </div>

          {/* Рендер Markdown */}
          <div className="bg-surface rounded-xl border border-slate-800 p-6 prose-report">
            <MarkdownRenderer content={report} />
          </div>

          {/* Дисклеймер */}
          <p className="text-[11px] text-slate-600 text-center">
            Звіт згенеровано AI (Claude) на основі даних системи.
            Перевірте інформацію перед відправкою тренерському штабу.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Допоміжні компоненти ───────────────────────────────────

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

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
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

/** Простий рендер Markdown → HTML */
function MarkdownRenderer({ content }: { content: string }) {
  const html = content
    // Заголовки
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-white mt-6 mb-3 pb-2 border-b border-slate-800">$1</h2>')
    // Жирний
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // Списки
    .replace(/^- (.+)$/gm, '<li class="text-sm text-slate-300 ml-4 mb-1 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="text-sm text-slate-300 ml-4 mb-1 list-decimal">$1. $2</li>')
    // Параграфи
    .replace(/\n\n/g, '</p><p class="text-sm text-slate-400 mb-3">')
    // Лінійні переноси
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
