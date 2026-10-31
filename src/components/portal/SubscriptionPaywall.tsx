"use client";

import React, { useState, useTransition } from "react";
import { createCheckoutSessionAction } from "@/actions/billing-actions";
import type { BillingPlanCode } from "@/types/billing";

interface SubscriptionPaywallProps {
  playerName: string;
  teamName: string;
  playerId: string;
  subscription?: {
    status?: string;
    amount_uah?: number;
    current_period_end?: string;
    grace_period_ends_at?: string;
  } | null;
  onPaymentSuccess?: () => void;
}

export default function SubscriptionPaywall({
  playerName,
  teamName,
  playerId,
  subscription,
  onPaymentSuccess,
}: SubscriptionPaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanCode>("monthly_150_uah");
  const [isProcessing, startTransition] = useTransition();
  const [payerPhone, setPayerPhone] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openedJar, setOpenedJar] = useState(false);

  const isAnnual = selectedPlan === "annual_1500_uah";
  const currentAmount = isAnnual ? 1500 : 150;

  const handlePay = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await createCheckoutSessionAction({
          planCode: selectedPlan,
          playerId,
          payerPhone: payerPhone || undefined,
        });

        const jarUrl =
          (res as any).monobankUrl ||
          `https://send.monobank.ua/jar/jzGthBnmx?a=${currentAmount}&t=${encodeURIComponent(`Паспорт: ${playerName}`)}`;

        window.open(jarUrl, "_blank", "noopener,noreferrer");
        setOpenedJar(true);
      } catch (err: any) {
        setErrorMessage(err.message || "Помилка відкриття платіжної сторінки Monobank");
      }
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900/90 border border-amber-500/30 rounded-3xl p-5 sm:p-7 shadow-2xl backdrop-blur-xl text-slate-100 space-y-6">
      {/* Верхній статус-бейдж */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Очікує оплати підписки
          </span>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
          {teamName}
        </span>
      </div>

      {/* Заголовок та персоналізація */}
      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Паспорт здоров&apos;я: {playerName}
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Щоб відновити доступ до щоденного моніторингу готовності, анкет самопочуття та
          рекомендацій медичного штабу, поновіть підписку.
        </p>
      </div>

      {/* Вибір тарифного плану */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Щомісячний */}
        <button
          type="button"
          onClick={() => setSelectedPlan("monthly_150_uah")}
          className={`relative text-left p-4 rounded-2xl border transition-all ${
            !isAnnual
              ? "bg-sky-500/15 border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.2)]"
              : "bg-slate-800/40 border-slate-700/60 hover:border-slate-600"
          }`}
        >
          <div className="text-xs font-semibold text-slate-400 mb-1">Щомісячний план</div>
          <div className="text-xl font-black text-white">
            150 <span className="text-xs font-bold text-slate-400">грн / міс</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5">Помісячне списання</div>
        </button>

        {/* Річний */}
        <button
          type="button"
          onClick={() => setSelectedPlan("annual_1500_uah")}
          className={`relative text-left p-4 rounded-2xl border transition-all ${
            isAnnual
              ? "bg-emerald-500/15 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : "bg-slate-800/40 border-slate-700/60 hover:border-slate-600"
          }`}
        >
          <span className="absolute -top-2.5 right-3 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
            2 міс у подарунок
          </span>
          <div className="text-xs font-semibold text-slate-400 mb-1">Річний абонемент</div>
          <div className="text-xl font-black text-emerald-400">
            1 500 <span className="text-xs font-bold text-slate-400">грн / рік</span>
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-1.5">10 місяців замість 12</div>
        </button>
      </div>

      {/* Поле телефону батьків для квитанції */}
      <div className="space-y-1.5 pt-1">
        <label className="text-xs font-medium text-slate-300">
          Номер телефону батьків (для отримання чека):
        </label>
        <input
          type="tel"
          placeholder="+380 (__) ___-__-__"
          value={payerPhone}
          onChange={(e) => setPayerPhone(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-colors"
        />
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* Кнопка швидкої оплати через Monobank */}
      <button
        type="button"
        disabled={isProcessing}
        onClick={handlePay}
        className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 active:scale-[0.99] text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <span className="animate-spin text-base">⏳</span>
        ) : (
          <span>💳</span>
        )}
        <span>
          Оплатити {currentAmount} грн · Monobank / Apple Pay
        </span>
      </button>

      {/* Підказка після переходу до Банки */}
      {openedJar && (
        <div className="p-4 rounded-2xl bg-sky-950/60 border border-sky-500/40 text-xs space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-sky-300 font-bold">
            <span>✨</span>
            <span>Сторінку Monobank відкрито у новій вкладці!</span>
          </div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            У призначенні платежу перевірте коментар: <strong className="text-white bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">Паспорт: {playerName}</strong>
          </p>
          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80">
            <span>Після оплати доступ відкриється лікарем або автоматично.</span>
            <a
              href="https://t.me/+380935623945"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
            >
              <span>📩</span> Надіслати квитанцію
            </a>
          </div>
        </div>
      )}

      {/* Розширений перелік цінності для батьків */}
      <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800/90 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
            <span>🛡️</span> Що входить у підписку:
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-sky-950/60 border border-sky-800 text-sky-300 rounded-full font-bold">
            6 послуг
          </span>
        </div>

        <div className="space-y-2.5">
          {/* 1. Світлофор тренера */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              🟢
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Ранковий світлофор тренера</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Тренер щоранку бачить статус відновлення дитини перед виходом на поле та корегує навантаження.
              </p>
            </div>
          </div>

          {/* 2. Супровід лікаря */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              🩺
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Супровід спортивного лікаря</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Лікар бачить скарги на біль, оглядає карту тіла та надсилає персональні медичні рекомендації.
              </p>
            </div>
          </div>

          {/* 3. Профілактика травм */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              ⚡
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Профілактика надривів м&apos;язів</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Виявлення втоми, поганого сну та прихованого перенапруження за 24–48 год до появи травми.
              </p>
            </div>
          </div>

          {/* 4. Контроль росту PHV */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              📏
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Контроль стрибка росту (PHV)</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Захист колін та сухожиль (профілактика Осгуда-Шлаттера) під час фази швидкого росту дитини.
              </p>
            </div>
          </div>

          {/* 5. План реабілітації RTP */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              📋
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Покроковий протокол повернення (RTP)</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                При будь-якому пошкодженні — персональний комплекс вправ ЛФК для швидкого та безпечного відновлення.
              </p>
            </div>
          </div>

          {/* 6. Цифрова медкартка */}
          <div className="flex items-start gap-2.5 p-1 rounded-lg hover:bg-slate-900/40 transition-colors">
            <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
              🗂️
            </div>
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-200">Цифрова медкартка спортсмена</div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Безстроковий електронний архів: допуски, скринінги, історія відновлення та динаміка розвитку завжди з вами.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-500">
        🔒 Безпечна оплата через Monobank (Apple Pay, Google Pay або картка будь-якого банку України).
      </div>
    </div>
  );
}
