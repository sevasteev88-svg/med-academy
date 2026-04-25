"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/actions/auth-actions";
import Link from "next/link";
import Image from "next/image";

const inputClass = "w-full bg-surface border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(registerAction, {});

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image src="/logo-chr.png" alt="ФК Чорноморець" width={64} height={64} className="mx-auto rounded-full ring-2 ring-brand-blue/30 mb-4" />
          <h1 className="text-xl font-bold text-white">Реєстрація</h1>
          <p className="text-xs text-slate-500 mt-1">Створіть акаунт для доступу до системи</p>
        </div>

        <div className="bg-surface rounded-xl border border-blue-900/15 p-6">
          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Повне ім'я</label>
              <input name="fullName" required placeholder="Іванов Олександр" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Email</label>
              <input name="email" type="email" required placeholder="doctor@chornomorets.com" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Пароль (мін. 6 символів)</label>
              <input name="password" type="password" required minLength={6} placeholder="••••••" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Роль</label>
              <select name="role" className={inputClass} defaultValue="doctor">
                <option value="doctor">🩺 Лікар (повний доступ)</option>
                <option value="coach">⚽ Тренер (доступність гравців)</option>
              </select>
            </div>

            {state.error && (
              <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">{state.error}</div>
            )}

            <button type="submit" disabled={isPending}
              className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm">
              {isPending ? "Реєструємо..." : "Зареєструватися"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500">
          Вже є акаунт? <Link href="/login" className="text-brand-blue hover:text-brand-blue-light transition-colors">Увійти</Link>
        </p>
      </div>
    </div>
  );
}
