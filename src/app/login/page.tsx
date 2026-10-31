"use client";

import { useActionState, useState, useTransition } from "react";
import { loginAction, type AuthState } from "@/actions/auth-actions";
import { enterDemoClubAction } from "@/actions/demo-actions";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Card, { Button, Input } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(loginAction, {});
  const [isDemoPending, startDemoTransition] = useTransition();
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleEnterDemo = () => {
    setDemoError(null);
    startDemoTransition(async () => {
      const res = await enterDemoClubAction();
      if (res.success) {
        router.push("/");
        router.refresh();
      } else {
        setDemoError(res.error || "Не вдалося увійти в демо-клуб");
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image src="/logo-chr.png" alt="MedAcademy" width={64} height={64} className="mx-auto rounded-full ring-2 ring-brand-blue/30 mb-4" />
          <h1 className="text-xl font-bold text-white">Медичний штаб</h1>
          <p className="text-xs text-slate-400 mt-1">Вхід до системи спортивної медицини</p>
        </div>

        <Card className="p-6">
          <form action={formAction} className="space-y-4">
            <Input
              label="Email"
              name="email"
              type="email"
              required
              placeholder="doctor@medacademy.app"
            />
            <Input
              label="Пароль"
              name="password"
              type="password"
              required
              placeholder="••••••"
            />

            {state.error && (
              <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">
                {state.error}
              </div>
            )}

            <Button type="submit" isLoading={isPending} className="w-full">
              Увійти
            </Button>
          </form>
        </Card>

        {/* Швидкий вхід до Демо-Клубу для презентацій директорам */}
        <div className="space-y-2 pt-1">
          <div className="text-center">
            <span className="text-[11px] font-semibold text-slate-400">
              Для директорів, тренерів та інвесторів:
            </span>
          </div>

          <button
            type="button"
            onClick={handleEnterDemo}
            disabled={isPending || isDemoPending}
            className="w-full py-3.5 px-4 rounded-2xl border border-sky-500/40 bg-gradient-to-r from-sky-600/30 via-indigo-600/30 to-blue-600/30 hover:from-sky-600/45 hover:to-indigo-600/45 text-sky-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-sky-950/60 active:scale-95 text-center disabled:opacity-50"
          >
            <span className="text-base">⚽</span>
            <span>
              {isDemoPending
                ? "Підготовка ФК «Демо Академія»..."
                : "Увійти в ФК «Демо Академія» (1 клік)"}
            </span>
          </button>

          {demoError && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5 text-center">
              {demoError}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Link
            href="/rehab-portal"
            className="w-full py-3 px-4 rounded-xl border border-sky-500/30 bg-slate-900/80 hover:bg-slate-800 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 text-center"
          >
            <span>📱</span>
            <span>Вхід для футболістів клубу (PIN-код / QR)</span>
          </Link>

          <div className="text-center text-[11px] text-slate-500 bg-slate-900/50 border border-slate-800/80 rounded-xl p-3 leading-relaxed">
            🔒 Доступ для тренерів та медичного штабу надається виключно адміністрацією клубу.
          </div>
        </div>
      </div>
    </div>
  );
}
