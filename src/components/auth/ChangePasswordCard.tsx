"use client";

import { useActionState, useRef, useEffect } from "react";
import { changeFirstLoginPasswordAction, type AuthState } from "@/actions/auth-actions";

const INITIAL_STATE: AuthState = {};

export default function ChangePasswordCard({ userEmail }: { userEmail: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(changeFirstLoginPasswordAction, INITIAL_STATE);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>🔑</span>
            <span>Зміна пароля</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Поточний акаунт: <span className="text-slate-200 font-medium">{userEmail}</span>
          </p>
        </div>
      </div>

      <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="secNewPassword" className="block text-xs font-medium text-slate-300 mb-1">
            Новий пароль
          </label>
          <input
            id="secNewPassword"
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
          <label htmlFor="secConfirmPassword" className="block text-xs font-medium text-slate-300 mb-1">
            Підтвердьте новий пароль
          </label>
          <input
            id="secConfirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Повторіть пароль"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs">
            {state.error && <span className="text-rose-400">{state.error}</span>}
            {state.success && <span className="text-emerald-400">Пароль успішно оновлено!</span>}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 px-5 py-2 text-xs font-semibold text-white transition-colors"
          >
            {isPending ? "Збереження..." : "Оновити пароль"}
          </button>
        </div>
      </form>
    </div>
  );
}
