"use client";

import { useState } from "react";

type InjuryData = {
  injuryType: string;
  location: string;
  side: string;
  severity: string;
  mechanism: string;
  vasScore: number;
  description: string | null;
};

type MaturationData = {
  growthPhase: string;
  consensusOffset: number;
  estimatedPhvAge: number;
  riskZone: string;
  heightVelocity: number | null;
} | null;

type PreviousInjury = {
  injuryType: string;
  location: string;
  side: string;
  severity: string;
  dateOfInjury: string;
  daysMissed: number | null;
  status: string;
};

type Props = {
  playerName: string;
  age: number;
  sex: string;
  position: string;
  teamName: string;
  injury: InjuryData;
  maturation: MaturationData;
  previousInjuries: PreviousInjury[];
};

export default function InjuryAIAssistant({
  playerName,
  age,
  sex,
  position,
  teamName,
  injury,
  maturation,
  previousInjuries,
}: Props) {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function getRecommendation() {
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      const res = await fetch("/api/ai/injury-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName,
          age,
          sex,
          position,
          teamName,
          injury,
          maturation,
          previousInjuries,
        }),
      });

      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setError(`Невалідна відповідь сервера`);
        return;
      }

      if (!res.ok) {
        setError(json.error || `Помилка ${res.status}`);
        return;
      }

      if (!json.recommendation) {
        setError("Claude не повернув рекомендації. Перевірте ANTHROPIC_API_KEY.");
        return;
      }

      setRecommendation(json.recommendation);
    } catch (err: any) {
      setError(`Помилка зʼєднання: ${err?.message ?? "невідомо"}`);
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!recommendation) return;
    await navigator.clipboard.writeText(recommendation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {!recommendation && (
        <button
          onClick={getRecommendation}
          disabled={loading}
          className="w-full bg-gradient-to-r from-brand-blue to-blue-700 hover:from-blue-600 hover:to-blue-800 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-brand-blue/20 text-sm"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-3">
              <Spinner />
              Claude аналізує травму та профіль гравця…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🤖 AI-асистент: отримати рекомендації
            </span>
          )}
        </button>
      )}

      {/* Контекст що аналізується */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <InfoPill label="Гравець" value={playerName} />
          <InfoPill label="Вік" value={`${age.toFixed(1)} р.`} />
          <InfoPill
            label="Матурація"
            value={maturation ? maturation.growthPhase.toUpperCase() : "—"}
          />
          <InfoPill
            label="Попередні"
            value={`${previousInjuries.length} травм`}
          />
        </div>
      )}

      {error && (
        <div className="bg-status-danger/10 border border-status-danger/20 rounded-xl p-4 text-sm text-status-danger">
          {error}
        </div>
      )}

      {recommendation && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={getRecommendation}
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
            <MarkdownRenderer content={recommendation} />
          </div>

          <p className="text-[11px] text-slate-600 text-center">
            Рекомендації згенеровано AI (Claude) на основі профілю гравця.
            Фінальне клінічне рішення — за лікарем.
          </p>
        </div>
      )}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] text-slate-600 uppercase">{label}</div>
      <div className="text-slate-300 font-medium">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
