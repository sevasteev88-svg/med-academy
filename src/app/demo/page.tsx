"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { enterDemoClubAction } from "@/actions/demo-actions";

export default function DemoLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoEnter = searchParams.get("auto") === "1";

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleEnterDemo = () => {
    setError(null);
    startTransition(async () => {
      const res = await enterDemoClubAction();
      if (res.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.error || "Не вдалося увійти до демо-клубу");
      }
    });
  };

  useEffect(() => {
    if (autoEnter) {
      handleEnterDemo();
    }
  }, [autoEnter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Верхній хедер */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between border-b border-slate-800/80 pb-4">
        <Link href="/login" className="flex items-center gap-2.5">
          <Image
            src="/logo-chr.png"
            alt="MedAcademy"
            width={36}
            height={36}
            className="rounded-full ring-2 ring-sky-500/30"
          />
          <span className="font-black text-white text-base tracking-tight">MedAcademy</span>
        </Link>
        <Link
          href="/login"
          className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          Звичайний вхід →
        </Link>
      </div>

      {/* Основний блок */}
      <div className="max-w-2xl mx-auto w-full my-auto py-8 space-y-8">
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold font-mono">
            <span>⚽</span>
            <span>ДЕМО-СТЕНД ДЛЯ ДИРЕКТОРІВ ТА ІНВЕСТОРІВ</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            ФК «Демо Академія»
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-lg mx-auto leading-relaxed">
            Повнофункціональний цифровий кабінет футбольної академії з наповненими даними для презентації керівництву.
          </p>
        </div>

        {/* Картка фіч */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1.5">
            <div className="text-lg">💳</div>
            <div className="font-bold text-white text-sm">B2B2C Підписки та Monobank</div>
            <p className="text-xs text-slate-400">
              21 активна підписка, 2 клубні квоти (стипендіати) та 3 профілі, що очікують оплати (soft-lock).
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1.5">
            <div className="text-lg">📲</div>
            <div className="font-bold text-white text-sm">Telegram-нагадування батькам</div>
            <p className="text-xs text-slate-400">
              Симуляція персональних сповіщень про закінчення дії паспорта з прямим посиланням на оплату.
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1.5">
            <div className="text-lg">🚦</div>
            <div className="font-bold text-white text-sm">Світлофор готовності (8.4)</div>
            <p className="text-xs text-slate-400">
              26 вигаданих футболістів (U-19, U-17, U-15), щоденний велнес та детекція перевтоми.
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-1.5">
            <div className="text-lg">🩹</div>
            <div className="font-bold text-white text-sm">Лазарет та RTP-етапи</div>
            <p className="text-xs text-slate-400">
              Гострі травми, фази реабілітації, жовті жилети (обмеження до 45 хв) та допуски.
            </p>
          </div>
        </div>

        {/* Кнопка входу */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleEnterDemo}
            disabled={isPending}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-600 to-blue-600 hover:from-sky-400 hover:via-indigo-500 hover:to-blue-500 text-white font-extrabold text-sm sm:text-base tracking-wide shadow-2xl shadow-sky-600/30 transition-all active:scale-98 flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <span>{isPending ? "⏳" : "🚀"}</span>
            <span>{isPending ? "Ініціалізація та вхід..." : "Увійти в Демо-Академію (1 клік)"}</span>
          </button>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs text-center font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <span>💡 Жодних паролів не потрібно — система автоматично відкриє демо-клуб</span>
          </div>
        </div>
      </div>

      {/* Футер */}
      <div className="max-w-4xl mx-auto w-full text-center text-xs text-slate-500 pt-6 border-t border-slate-800/80">
        MedAcademy SaaS · Спортивна медицина та підписки для футбольних академій
      </div>
    </div>
  );
}
