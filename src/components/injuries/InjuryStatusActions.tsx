"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Calendar, Loader2 } from "lucide-react";
import { updateInjuryStatusAction } from "@/actions/update-injury-status-action";

interface Props {
  injuryId: string;
  status: string;
  actualReturnDate?: string | null;
  variant?: "hero" | "bottom";
}

export default function InjuryStatusActions({
  injuryId,
  status,
  actualReturnDate,
  variant = "hero",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showModal, setShowModal] = useState(false);
  const [returnDate, setReturnDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [error, setError] = useState<string | null>(null);

  const isClosed = status === "closed";

  const handleClose = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateInjuryStatusAction(injuryId, "closed", returnDate);
      if (res?.error) {
        setError(res.error);
      } else {
        setShowModal(false);
        router.refresh();
      }
    });
  };

  const handleReopen = () => {
    if (!confirm("Відкрити цю травму повторно як активну?")) return;
    setError(null);
    startTransition(async () => {
      const res = await updateInjuryStatusAction(injuryId, "active");
      if (res?.error) {
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  if (variant === "bottom") {
    if (isClosed) {
      return (
        <button
          onClick={handleReopen}
          disabled={isPending}
          className="flex-1 py-3 rounded-xl text-xs font-bold text-amber-300 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all text-center flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          <span>Відкрити повторно (Рецидив/Активна)</span>
        </button>
      );
    }

    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          disabled={isPending}
          className="flex-1 py-3 rounded-xl text-xs font-bold text-emerald-200 border border-emerald-500/35 bg-emerald-500/20 hover:bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all text-center flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Закрити травму (Допустити)</span>
        </button>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/30 p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
                <h3 className="font-bold text-base text-white">Закриття травми</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Травму буде переведено в статус «Закрита» (Допущений до гри). Вкажіть фактичну дату відновлення:
              </p>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Дата допуску / повернення:
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {error && (
                <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/25 p-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-xl text-xs text-slate-400 border border-slate-700 bg-slate-800/50 hover:bg-slate-800"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Підтвердити"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Hero variant
  if (isClosed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Повернувся: {actualReturnDate || "—"}
        </span>
        <button
          onClick={handleReopen}
          disabled={isPending}
          title="Відновити травму"
          className="text-xs text-slate-400 hover:text-amber-400 p-1.5 rounded-lg border border-slate-700/60 hover:border-amber-500/30 transition-colors"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isPending}
        className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs text-emerald-300 font-semibold transition-all flex items-center gap-1.5 shadow-sm"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>Закрити травму</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/30 p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="font-bold text-base text-white">Закриття травми</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Травму буде переведено в статус «Закрита» (Допущений до гри). Вкажіть фактичну дату відновлення:
            </p>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Дата допуску / повернення:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            {error && (
              <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/25 p-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isPending}
                className="flex-1 py-2 rounded-xl text-xs text-slate-400 border border-slate-700 bg-slate-800/50 hover:bg-slate-800"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
              >
                {isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Підтвердити"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
