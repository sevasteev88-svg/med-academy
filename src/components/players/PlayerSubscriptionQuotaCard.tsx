"use client";

import { useState, useTransition } from "react";
import {
  grantCompedSubscriptionAction,
  revokeCompedSubscriptionAction,
  recordManualParentPaymentAction,
} from "@/actions/billing-actions";
import type { SubscriptionStatus, BillingPlanCode } from "@/types/billing";

interface SubscriptionData {
  status: SubscriptionStatus;
  isActive: boolean;
  planCode?: BillingPlanCode | string;
  amountUah?: number;
  billingInterval?: string;
  currentPeriodEnd?: string;
  compedReason?: string | null;
  compedBy?: string | null;
}

interface Props {
  playerId: string;
  playerName: string;
  initialSubscription?: SubscriptionData | null;
  userRole?: string;
}

const PRESET_REASONS = [
  "Рішення керівництва / директора академії",
  "Соціальна квота (багатодітна родина)",
  "Спортивна стипендія клубу (топ-талант)",
  "Тестовий пілотний період",
];

export default function PlayerSubscriptionQuotaCard({
  playerId,
  playerName,
  initialSubscription,
  userRole,
}: Props) {
  const isCoach = userRole === "coach";
  const [sub, setSub] = useState<SubscriptionData | null>(initialSubscription || null);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payPlan, setPayPlan] = useState<BillingPlanCode>("monthly_150_uah");
  const [payMethod, setPayMethod] = useState("Переказ на картку Monobank");
  const [days, setDays] = useState(90);
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isComped = sub?.status === "comped";
  const isActive = sub?.status === "active";
  const isUnpaid = !sub || sub.status === "unpaid" || sub.status === "past_due";

  const getDaysLeft = (dateStr?: string) => {
    if (!dateStr) return 0;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const handleConfirmParentPayment = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await recordManualParentPaymentAction({
        playerId,
        planCode: payPlan,
        paymentNote: payMethod,
      });

      if (res.success) {
        const isAnn = payPlan === "annual_1500_uah";
        const futureDate = new Date();
        if (isAnn) futureDate.setFullYear(futureDate.getFullYear() + 1);
        else futureDate.setMonth(futureDate.getMonth() + 1);

        setSub({
          status: "active",
          isActive: true,
          planCode: payPlan,
          amountUah: isAnn ? 1500 : 150,
          currentPeriodEnd: futureDate.toISOString(),
          compedReason: payMethod,
        });
        setIsPayModalOpen(false);
        setMessage({ type: "success", text: res.message || "Оплату батьків успішно підтверджено!" });
      } else {
        setMessage({ type: "error", text: res.error || "Не вдалося зафіксувати оплату" });
      }
    });
  };

  const handleGrantQuota = () => {
    setMessage(null);
    startTransition(async () => {
      const finalReason = customReason.trim() ? customReason.trim() : reason;
      const res = await grantCompedSubscriptionAction({
        playerId,
        reason: finalReason,
        daysDuration: days,
      });

      if (res.success) {
        setSub({
          status: "comped",
          isActive: true,
          planCode: "monthly_150_uah",
          amountUah: 150,
          currentPeriodEnd: new Date(Date.now() + days * 86400000).toISOString(),
          compedReason: finalReason,
        });
        setIsModalOpen(false);
        setMessage({ type: "success", text: `Квоту успішно надано на ${days} днів!` });
      } else {
        setMessage({ type: "error", text: res.error || "Не вдалося надати квоту" });
      }
    });
  };

  const handleRevokeQuota = () => {
    if (!confirm(`Перевести гравця ${playerName} на самостійну оплату батьків? Його кабінет буде м'яко заблоковано до моменту оплати.`)) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const res = await revokeCompedSubscriptionAction({ playerId });
      if (res.success) {
        setSub((prev) => (prev ? { ...prev, status: "unpaid", isActive: false } : null));
        setMessage({ type: "success", text: "Квоту скасовано. Гравця переведено на оплату батьків." });
      } else {
        setMessage({ type: "error", text: res.error || "Не вдалося скасувати квоту" });
      }
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Шапка картки */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-base">
            🎟️
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Паспорт здоров&apos;я та Підписка B2B2C</h3>
            <p className="text-xs text-slate-400">Управління доступом та клубними квотами</p>
          </div>
        </div>

        {/* Статус-бейдж */}
        <div>
          {isCoach ? (
            sub?.isActive ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Активний профіль
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Очікує оплати (Soft-lock)
              </span>
            )
          ) : (
            <>
              {isComped && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Квота клубу (Безкоштовно)
                </span>
              )}
              {isActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  Оплачено батьками
                </span>
              )}
              {isUnpaid && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Очікує оплати (Soft-lock)
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
          }`}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Опис стану підписки */}
      <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 text-xs space-y-2">
        {isCoach ? (
          sub?.isActive ? (
            <div className="space-y-1.5 text-slate-300">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Статус паспорта:</span>
                <span className="font-semibold text-emerald-300">Доступ відкрито</span>
              </div>
              {sub.currentPeriodEnd && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Діє до:</span>
                  <span className="font-semibold text-white">
                    {new Date(sub.currentPeriodEnd).toLocaleDateString("uk-UA")} (залишилось {getDaysLeft(sub.currentPeriodEnd)} дн.)
                  </span>
                </div>
              )}
              <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                Гравець має активний доступ до свого кабінету та щоденних анкет велнесу.
              </p>
            </div>
          ) : (
            <div className="text-slate-400 space-y-1">
              <p className="text-amber-300/90 font-medium">⚠️ Вхід у кабінет обмежено (Soft-lock)</p>
              <p className="text-[11px]">
                Очікується оплата за цифровий медичний паспорт. У світлофорі готовності цей гравець відображається сірим бейджем «Очікує оплати».
              </p>
            </div>
          )
        ) : isComped ? (
          <>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Причина квоти:</span>
              <span className="font-semibold text-emerald-300">{sub.compedReason || "Квота клубу"}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Діє до:</span>
              <span className="font-semibold text-white">
                {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("uk-UA") : "—"} (залишилось {getDaysLeft(sub.currentPeriodEnd)} дн.)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
              Гравець має повний доступ до щоденних анкет самопочуття без необхідності щомісячної оплати батьками.
            </p>
          </>
        ) : isActive ? (
          <>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">План оплати:</span>
              <span className="font-semibold text-sky-300">
                {sub?.planCode === "annual_1500_uah" ? "1 500 грн / рік" : "150 грн / місяць"}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Оплачено до:</span>
              <span className="font-semibold text-white">
                {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("uk-UA") : "—"}
              </span>
            </div>
          </>
        ) : (
          <div className="text-slate-400 space-y-1">
            <p className="text-amber-300/90 font-medium">⚠️ Підписка не активна</p>
            <p className="text-[11px]">
              Вхід у кабінет гравця заблоковано екраном оплати. У світлофорі готовності тренера цей гравець відображається сірим бейджем «Очікує оплати».
            </p>
          </div>
        )}
      </div>

      {/* Кнопки дій */}
      {isCoach ? (
        <div className="text-[11px] text-slate-500 italic pt-1">
          Керування доступом та фінансовим обліком здійснюється медичним штабом клубу.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {/* Кнопка 1: Підтвердити реальну оплату батьків */}
          <button
            type="button"
            onClick={() => setIsPayModalOpen(true)}
            disabled={isPending}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-bold text-xs tracking-wide shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>💳</span>
            <span>{isActive ? "Продовжити оплату батьків" : "Підтвердити оплату батьків"}</span>
          </button>

          {/* Кнопка 2: Надати безкоштовну квоту клубу */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            disabled={isPending}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>🎁</span>
            <span>{isComped ? "Змінити квоту клубу" : "Надати квоту клубу (безкоштовно)"}</span>
          </button>

          {/* Кнопка 3: Скасування доступу / переведення на Soft-lock */}
          {(isComped || isActive) && (
            <button
              type="button"
              onClick={handleRevokeQuota}
              disabled={isPending}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-400 font-medium text-xs border border-slate-800 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>🔒</span>
              <span>{isComped ? "Скасувати квоту" : "Скасувати доступ"}</span>
            </button>
          )}
        </div>
      )}

      {/* Модальне вікно підтвердження оплати батьків */}
      {!isCoach && isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h4 className="font-bold text-sm text-white">Підтвердження оплати: {playerName}</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Вибір суми та плану */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Оберіть сплачений тариф:</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPayPlan("monthly_150_uah")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    payPlan === "monthly_150_uah"
                      ? "bg-sky-500/20 border-sky-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-400">1 місяць</div>
                  <div className="text-base font-black text-white">150 грн</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPayPlan("annual_1500_uah")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    payPlan === "annual_1500_uah"
                      ? "bg-emerald-500/20 border-emerald-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-400">1 рік (12 міс)</div>
                  <div className="text-base font-black text-emerald-300">1 500 грн</div>
                </button>
              </div>
            </div>

            {/* Спосіб надходження коштів */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Спосіб переказу / примітка:</label>
              <div className="space-y-1.5">
                {[
                  "Переказ на картку Monobank",
                  "Переказ на картку ПриватБанк",
                  "Оплата на розрахунковий рахунок (IBAN)",
                  "Готівка тренеру",
                ].map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer text-xs text-slate-300 hover:border-slate-700"
                  >
                    <input
                      type="radio"
                      name="pay-method"
                      checked={payMethod === m}
                      onChange={() => setPayMethod(m)}
                      className="text-emerald-500 focus:ring-0"
                    />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Дії */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmParentPayment}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg disabled:opacity-50"
              >
                {isPending ? "Зарахування..." : "Зарахувати платіж і відкрити доступ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно призначення квоти */}
      {!isCoach && isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎁</span>
                <h4 className="font-bold text-sm text-white">Квота клубу: {playerName}</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Вибір тривалості */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Тривалість квоти:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { d: 30, label: "1 міс (30 дн)" },
                  { d: 90, label: "3 міс (90 дн)" },
                  { d: 180, label: "6 міс (180 дн)" },
                  { d: 365, label: "1 рік (365 дн)" },
                ].map((item) => (
                  <button
                    key={item.d}
                    type="button"
                    onClick={() => setDays(item.d)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all ${
                      days === item.d
                        ? "bg-sky-500/20 border-sky-500 text-sky-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Причина квоти */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Причина надання:</label>
              <div className="space-y-1.5">
                {PRESET_REASONS.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 text-xs text-slate-300 transition-colors"
                  >
                    <input
                      type="radio"
                      name="quota-reason"
                      checked={reason === r && !customReason}
                      onChange={() => {
                        setReason(r);
                        setCustomReason("");
                      }}
                      className="text-sky-500 focus:ring-0"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>

              <input
                type="text"
                placeholder="Або вкажіть іншу причину..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            {/* Кнопки дій модалки */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleGrantQuota}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg disabled:opacity-50"
              >
                {isPending ? "Збереження..." : "Підтвердити надання"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
