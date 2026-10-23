"use client";

import { useState, useEffect, useRef } from "react";
import { searchOsiicsCodes, importOsiicsCodes } from "@/actions/osiics-actions";
import type { OsiicsCode } from "@/types/database";

type Props = {
  value: string;
  onChange: (code: string) => void;
};

export default function OsiicsPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<OsiicsCode[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Import state
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (text: string) => {
    setQuery(text);
    onChange(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchOsiicsCodes(text);
        setResults(data);
        setIsOpen(true);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  };

  const handleSelectCode = (item: OsiicsCode) => {
    setQuery(item.code);
    onChange(item.code);
    setIsOpen(false);
  };

  const handleImportSubmit = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportStatus(null);

    try {
      // Спроба розпарсити як JSON або як CSV (code,title,category,anatomical_site)
      let parsedEntries: Array<{ code: string; title: string; category?: string; anatomical_site?: string; description?: string }> = [];

      const trimmed = importText.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        parsedEntries = JSON.parse(trimmed);
      } else {
        const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          // Якщо перший рядок заголовок (code, title...)
          if (line.toLowerCase().startsWith("code,") || line.toLowerCase().startsWith("код,")) continue;
          const parts = line.split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
          if (parts[0] && parts[1]) {
            parsedEntries.push({
              code: parts[0],
              title: parts[1],
              category: parts[2] || undefined,
              anatomical_site: parts[3] || undefined,
              description: parts[4] || undefined,
            });
          }
        }
      }

      if (parsedEntries.length === 0) {
        setImportStatus("Помилка: не знайдено валідних рядків (формат: КОД, НАЗВА)");
        return;
      }

      const res = await importOsiicsCodes(parsedEntries);
      if (res.error) {
        setImportStatus(`Помилка імпорту: ${res.error}`);
      } else {
        setImportStatus(`Успішно імпортовано ${res.importedCount} кодів!`);
        setTimeout(() => {
          setShowImportModal(false);
          setImportStatus(null);
          setImportText("");
        }, 1500);
      }
    } catch (e: any) {
      setImportStatus(`Помилка парсингу: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-1.5" ref={wrapperRef}>
      <div className="flex justify-between items-center">
        <label className="block text-xs text-gray-400">
          Код класифікатора OSIICS <span className="text-[10px] text-gray-500">(опціонально)</span>
        </label>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="text-[11px] text-brand-blue hover:text-sky-300 transition-colors flex items-center gap-1"
        >
          <span>📥</span>
          <span>Завантажити довідник</span>
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Введіть код або діагноз (напр. TMHM або розтягнення)..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue font-mono uppercase"
        />

        {isSearching && (
          <div className="absolute right-3 top-2.5 text-xs text-gray-400 animate-spin">
            ⏳
          </div>
        )}

        {isOpen && results.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-slate-900 border border-sky-500/30 rounded-xl shadow-2xl divide-y divide-gray-800">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectCode(item)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-sky-500/15 transition-colors flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/60 mr-2">
                    {item.code}
                  </span>
                  <span className="text-white font-medium">{item.title}</span>
                  {item.category && (
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {item.category} {item.anatomical_site ? `· ${item.anatomical_site}` : ""}
                    </span>
                  )}
                </div>
                <span className="text-gray-500 text-[10px] mt-0.5 whitespace-nowrap">Обрати</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        Поле вільне. Якщо довідник не завантажено або коду немає у базі, можна ввести власний код вручну.
      </p>

      {/* Модальне вікно імпорту довідника */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📚</span> Імпорт довідника кодів OSIICS
              </h4>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-gray-300 space-y-2">
              <p>
                Вставте коди у форматі <strong>CSV</strong> (КОД, НАЗВА, КАТЕГОРІЯ, ЛОКАЛІЗАЦІЯ) або <strong>JSON</strong>:
              </p>
              <pre className="bg-black/40 p-2.5 rounded-lg text-[11px] text-sky-300 font-mono border border-gray-800 overflow-x-auto">
{`TMHM, Надрив двоголового м'яза стегна, М'язи, Стегно
KJAA, Розрив передньої хрестоподібної зв'язки, Зв'язки, Коліно
AAAC, Розтягнення латеральних зв'язок гомілкостопа, Зв'язки, Гомілкостоп`}
              </pre>
            </div>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={6}
              placeholder="Вставте рядки CSV або масив JSON..."
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-white font-mono focus:outline-none focus:border-brand-blue resize-none"
            />

            {importStatus && (
              <div className={`p-2.5 rounded-lg text-xs font-medium ${
                importStatus.includes("Успішно")
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}>
                {importStatus}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs border border-gray-700 rounded-lg text-gray-400 hover:text-white"
              >
                Закрити
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isImporting || !importText.trim()}
                className="px-4 py-2 text-xs bg-brand-blue hover:bg-sky-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
              >
                {isImporting ? "Імпортуємо..." : "Імпортувати коди"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
