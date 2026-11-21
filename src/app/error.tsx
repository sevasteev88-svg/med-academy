"use client";

import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[75vh] bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl bg-slate-900/90 border border-rose-500/30 p-6 sm:p-8 text-center space-y-5 shadow-2xl shadow-black/50">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-2xl">
          ⚠️
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-black text-white tracking-tight">
            Щось пішло не так
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Виникла тимчасова помилка під час завантаження сторінки або звернення до бази даних. Спробуйте повторити дію.
          </p>
        </div>

        {error?.digest && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
            <span>Код події:</span>
            <span className="text-sky-300">{error.digest}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
          >
            Спробувати ще раз
          </button>
          <Link
            href="/"
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
          >
            На головну
          </Link>
        </div>
      </div>
    </div>
  );
}
