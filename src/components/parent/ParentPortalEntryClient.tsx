"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QrScannerModal from "@/components/portal/QrScannerModal";

function extractParentHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/\/parent\/([a-zA-Z0-9_-]{8,128})/);
  if (match) {
    return `/parent/${match[1]}`;
  }

  if (/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
    return `/parent/${trimmed}`;
  }

  return null;
}

export default function ParentPortalEntryClient() {
  const [linkInput, setLinkInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("med_parent_portal_token");
      if (saved && /^[a-zA-Z0-9_-]{8,128}$/.test(saved.trim())) {
        window.location.replace(`/parent/${saved.trim()}`);
      }
    } catch {}
  }, []);

  const handleOpenHref = useCallback((raw: string) => {
    const href = extractParentHref(raw);
    if (!href) {
      setError("Не вдалося розпізнати сімейне посилання. Перевірте посилання або QR-код від лікаря.");
      return;
    }
    setError(null);
    window.location.href = href;
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleOpenHref(linkInput);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <QrScannerModal
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScan={(decoded) => {
          setShowQrScanner(false);
          handleOpenHref(decoded);
        }}
        title="Сканувати QR-код батьків"
      />

      <div className="max-w-md w-full p-6 rounded-3xl bg-slate-900/90 border border-sky-500/25 space-y-5 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-2xl">
            👨‍👩‍👦
          </div>
          <h1 className="text-lg font-black text-white">
            Сімейний кабінет батьків
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Відскануйте QR-код або вставте персональне посилання, яке надав лікар чи тренер клубу.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowQrScanner(true);
          }}
          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-600/25 active:scale-95"
        >
          <span>📷</span>
          <span>Відсканувати QR-код камерою</span>
        </button>

        <form onSubmit={handleFormSubmit} className="space-y-2.5">
          <label className="text-[11px] font-semibold text-slate-400 block">
            Або вставте сімейне посилання:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value);
                setError(null);
              }}
              placeholder="https://.../parent/..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono"
            />
            <button
              type="submit"
              disabled={!linkInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold text-xs transition-colors shrink-0"
            >
              Увійти
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs text-center">
            {error}
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 text-center">
          <Link href="/privacy" className="text-[11px] text-sky-400 hover:underline">
            Політика конфіденційності
          </Link>
        </div>
      </div>
    </div>
  );
}
