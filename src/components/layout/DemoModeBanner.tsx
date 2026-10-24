"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetDemoClubAction } from "@/actions/demo-actions";

export default function DemoModeBanner({
  isDemoClub,
}: {
  isDemoClub: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!isDemoClub) return null;

  const handleReset = () => {
    startTransition(async () => {
      const res = await resetDemoClubAction();
      setConfirmOpen(false);
      if (res.success) {
        setToast("Демо-клуб та 26 вигаданих гравців успішно скинуто до початкового стану!");
        setTimeout(() => setToast(null), 4000);
        router.refresh();
      } else {
        alert(res.error || "Помилка скидання");
      }
    });
  };

  return (
    <>
      <div className="bg-gradient-to-r from-sky-950 via-slate-950 to-blue-950 border-b border-sky-500/30 px-3 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs shadow-md z-30 relative">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono text-[10px] font-bold border border-sky-500/30 shrink-0">
            ДЕМО-ДАНІ
          </span>
          <span className="text-slate-300 font-medium truncate">
            Клуб «Демо Академія» · 26 вигаданих гравців (жодних реальних футболістів)
          </span>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/30 hover:bg-sky-500/40 text-sky-200 hover:text-white font-semibold text-xs border border-sky-500/40 transition-all active:scale-95 disabled:opacity-50"
        >
          <span>🔄</span>
          <span>{isPending ? "Скидання..." : "Скинути демо"}</span>
        </button>
      </div>

      {/* Підтвердження скидання */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
              <span>⚠️</span>
              <span>Скинути демо-дані?</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Це очистить поточні записи клубу «Демо Академія» та відновить початковий чистий набір: 26 вигаданих гравців, 3 травми в лазареті, 2 на обмеженому режимі, графіки зросту, 6 тижнів навантаження та аптеку.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-600/30 active:scale-95"
              >
                {isPending ? "Відновлення..." : "Так, скинути"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Спливаюче сповіщення */}
      {toast && (
        <div className="fixed bottom-20 right-4 z-50 bg-emerald-500 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <span>✅</span>
          <span>{toast}</span>
        </div>
      )}
    </>
  );
}
