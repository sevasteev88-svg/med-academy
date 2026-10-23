"use client";

import { useState, useTransition } from "react";
import { verifyMfaChallengeAction } from "@/actions/mfa-actions";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (code: string, isRecovery: boolean) => void;
  title?: string;
  description?: string;
};

export default function MfaStepUpModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Підтвердження безпеки (2FA Step-up)",
  description = "Для виконання цієї операції введіть 6-значний код із додатка-автентифікатора:",
}: Props) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setError(null);
    startTransition(async () => {
      const res = await verifyMfaChallengeAction({
        code: code.trim(),
        isRecoveryCode: useRecovery,
      });

      if (res.success) {
        onSuccess(code.trim(), useRecovery);
        onClose();
      } else {
        setError(res.error || "Невірний код перевірки");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-sky-500/30 p-6 space-y-5 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-sky-500/15 pb-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-xl shadow-inner">
            🛡️
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              {useRecovery ? "Резервний одноразовий код відновлення:" : "6-значний код TOTP:"}
            </label>
            <input
              type="text"
              autoFocus
              maxLength={useRecovery ? 20 : 6}
              placeholder={useRecovery ? "xxxx-xxxx-xx" : "123456"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-slate-950 border border-sky-500/40 rounded-xl p-3 text-center text-xl tracking-widest text-white font-mono font-bold focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode("");
                setError(null);
              }}
              className="text-xs text-sky-400 hover:underline"
            >
              {useRecovery ? "← Використати 6-значний код" : "Немає доступу до телефону? Ввести резервний код"}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending || !code.trim()}
              className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {isPending ? "Перевірка..." : "Підтвердити дію"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
