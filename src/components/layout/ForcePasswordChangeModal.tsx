"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changeFirstLoginPasswordAction, type AuthState } from "@/actions/auth-actions";

const INITIAL_STATE: AuthState = {};

export default function ForcePasswordChangeModal({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(changeFirstLoginPasswordAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  if (state.success) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">
            Перший вхід · Безпека
          </p>
          <h2 className="text-lg font-bold text-white">Змініть тимчасовий пароль</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Ви увійшли в акаунт <span className="text-slate-200 font-medium">{userEmail}</span>.
            Встановіть власний постійний пароль (мінімум 8 символів).
          </p>
        </div>

        <form action={formAction} className="space-y-3">
          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-slate-300 mb-1">
              Новий пароль
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Мінімум 8 символів"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-slate-300 mb-1">
              Підтвердьте новий пароль
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Повторіть пароль"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {state.error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {isPending ? "Збереження..." : "Зберегти новий пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
