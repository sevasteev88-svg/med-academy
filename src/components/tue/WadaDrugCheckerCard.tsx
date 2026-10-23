"use client";

import React, { useState } from "react";
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  FilePlus,
  ArrowRight,
  Info,
} from "lucide-react";
import { verifySubstanceOrBrand } from "@/lib/wada-prohibited-list";
import type { WadaCheckResult } from "@/types/wada";

interface WadaDrugCheckerCardProps {
  onOpenCreateTue?: (substance: string, wadaClass: string) => void;
}

const QUICK_SUGGESTIONS = [
  "Вентолін (Сальбутамол)",
  "Колдфлю (Псевдоефедрин)",
  "Дипроспан (Бетаметазон)",
  "Мілдронат (Мельдоній)",
  "Трамадол",
  "Дексаметазон",
  "Німесил",
  "Ібупрофен",
];

export function WadaDrugCheckerCard({ onOpenCreateTue }: WadaDrugCheckerCardProps) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WadaCheckResult>(() => verifySubstanceOrBrand(""));

  const handleSearch = (val: string) => {
    setQuery(val);
    const cleanSearch = val.replace(/\(.*?\)/, "").trim();
    setResult(verifySubstanceOrBrand(cleanSearch));
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span className="text-lg">🛡️</span> Антидопінговий чекер ліків (WADA / НАДЦ)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Миттєва перевірка діючої речовини або торгової марки ліків (Заборонений список WADA 2024–2026)
          </p>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
          Offline Instant Engine
        </span>
      </div>

      {/* Пошуковий інпут */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Введіть торгову марку або діючу речовину (напр., Вентолін, Колдфлю, Дексаметазон, Ібупрофен)..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition shadow-inner"
        />
        {query && (
          <button
            type="button"
            onClick={() => handleSearch("")}
            className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        )}
      </div>

      {/* Швидкі підказки */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-sky-400" /> Швидкий вибір:
        </span>
        {QUICK_SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleSearch(item)}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          >
            {item}
          </button>
        ))}
      </div>

      {/* Картка результату перевірки */}
      {query.trim().length >= 2 && (
        <div
          className={`p-4 rounded-xl border transition-all animate-in fade-in space-y-3 ${
            result.status === "prohibited_always"
              ? "bg-rose-950/40 border-rose-600/50"
              : result.status === "prohibited_in_competition"
              ? "bg-amber-950/40 border-amber-500/50"
              : result.status === "conditional_permitted"
              ? "bg-yellow-950/30 border-yellow-500/40"
              : "bg-emerald-950/30 border-emerald-500/40"
          }`}
        >
          {/* Статус-шапка */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {result.status === "prohibited_always" && (
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              {result.status === "prohibited_in_competition" && (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              {result.status === "conditional_permitted" && (
                <Info className="w-5 h-5 text-yellow-400 shrink-0" />
              )}
              {result.status === "permitted" && (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              <span className="text-sm font-bold text-white">{result.status_label}</span>
            </div>

            {result.record && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-200 font-mono">
                Клас: {result.record.wada_class}
              </span>
            )}
          </div>

          {/* Деталі знайденої речовини */}
          {result.record && (
            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400">Діюча речовина:</span>
                <span className="font-semibold text-slate-100">
                  {result.record.name_uk} ({result.record.name_en})
                </span>
                {result.matched_by === "brand" && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-400">
                    Збіг за брендом: {result.matched_name}
                  </span>
                )}
              </div>

              {result.record.brand_names_ua.length > 0 && (
                <div className="text-[11px] text-slate-400">
                  <span>Торгові марки в аптеках: </span>
                  <span className="text-slate-300">{result.record.brand_names_ua.join(", ")}</span>
                </div>
              )}

              {result.record.threshold_details && (
                <div className="text-[11px] text-yellow-300/90 pt-1 border-t border-slate-800">
                  ⚖️ {result.record.threshold_details}
                </div>
              )}

              {result.record.washout_period_hours && (
                <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    Рекомендований кліренс (період вимивання):{" "}
                    <strong>
                      {result.record.washout_period_hours} год (~
                      {(result.record.washout_period_hours / 24).toFixed(0)} дн.)
                    </strong>{" "}
                    до участі у матчах.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Рекомендація та дії */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              {result.recommendation}
            </p>

            {/* Кнопка створення TUE, якщо речовина заборонена */}
            {result.requires_tue && onOpenCreateTue && (
              <button
                type="button"
                onClick={() =>
                  onOpenCreateTue(
                    result.record?.name_uk || result.query,
                    result.record?.wada_class || "S-препарат"
                  )
                }
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition shrink-0"
              >
                <FilePlus className="w-4 h-4" />
                <span>Створити кейс TUE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
