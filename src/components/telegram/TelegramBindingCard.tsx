"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  createTelegramBindingLinkAction,
  unlinkPlayerTelegramAction,
} from "@/actions/telegram-actions";
import type { PlayerTelegramBinding, TelegramBindingEligibility } from "@/types/telegram";

type Props = {
  playerId: string;
  playerName: string;
  initialBinding?: PlayerTelegramBinding | null;
  initialEligibility?: TelegramBindingEligibility;
};

export default function TelegramBindingCard({
  playerId,
  playerName,
  initialBinding,
  initialEligibility,
}: Props) {
  const [binding, setBinding] = useState<PlayerTelegramBinding | null>(initialBinding || null);
  const [eligibility] = useState<TelegramBindingEligibility | undefined>(initialEligibility);
  const [deepLinkData, setDeepLinkData] = useState<{
    deepLink: string;
    qrDataUrl: string;
    expiresAt: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const isMinorWithoutConsent = eligibility?.isMinor && !eligibility.hasParentConsent;

  const handleGenerateLink = () => {
    startTransition(async () => {
      setStatusMessage(null);
      const res = await createTelegramBindingLinkAction(playerId);
      if (!res.success) {
        setStatusMessage({
          type: "error",
          text: res.error || "Не вдалося згенерувати QR-код прив'язки",
        });
      } else {
        setDeepLinkData({
          deepLink: res.deepLink!,
          qrDataUrl: res.qrDataUrl!,
          expiresAt: res.expiresAt!,
        });
        setStatusMessage({
          type: "success",
          text: "Одноразовий QR-код та посилання згенеровано! Дійсний 48 годин.",
        });
      }
    });
  };

  const handleUnlink = () => {
    if (!confirm("Ви впевнені, що хочете відв'язати Telegram від цього гравця?")) {
      return;
    }

    startTransition(async () => {
      setStatusMessage(null);
      const res = await unlinkPlayerTelegramAction(playerId);
      if (!res.success) {
        setStatusMessage({
          type: "error",
          text: res.error || "Не вдалося відв'язати Telegram",
        });
      } else {
        setBinding(null);
        setDeepLinkData(null);
        setStatusMessage({
          type: "success",
          text: "Прив'язку до Telegram успішно скасовано в один клік.",
        });
      }
    });
  };

  const copyToClipboard = async () => {
    if (deepLinkData?.deepLink) {
      await navigator.clipboard.writeText(deepLinkData.deepLink);
      setStatusMessage({ type: "info", text: "📋 Посилання скопійовано в буфер обміну!" });
    }
  };

  return (
    <div className="bg-slate-900/90 border border-sky-500/20 rounded-2xl p-5 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">✈️</span>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Telegram-сповіщення та нагадування
              {binding ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  ● Активно
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  ○ Не підключено
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ранкові нагадування про анкету самопочуття без медичних даних
            </p>
          </div>
        </div>

        {binding && (
          <button
            onClick={handleUnlink}
            disabled={isPending}
            className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
          >
            {isPending ? "Відв'язка..." : "Відв'язати в один клік"}
          </button>
        )}
      </div>

      {/* Попередження про згоду батьків для неповнолітніх (Вимога 5) */}
      {isMinorWithoutConsent && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs leading-relaxed space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-amber-300">
            <span>🛡️</span>
            <span>Потрібна згода батьків (гравцю менше 18 років)</span>
          </div>
          <p>
            Згідно з політикою конфіденційності та захисту даних неповнолітніх, прив&apos;язка до
            Telegram доступна лише після надання офіційної згоди батьків або законних представників.
          </p>
        </div>
      )}

      {/* Статус повідомлень */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
              : statusMessage.type === "error"
              ? "bg-rose-950/40 text-rose-300 border border-rose-500/30"
              : "bg-sky-950/40 text-sky-300 border border-sky-500/30"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Активна прив'язка */}
      {binding ? (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Telegram Chat ID:</span>
            <span className="font-mono text-white font-semibold">{binding.telegram_chat_id}</span>
          </div>
          {binding.telegram_username && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Юзернейм:</span>
              <span className="text-sky-400 font-medium">@{binding.telegram_username}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Дата підключення:</span>
            <span className="text-slate-300">
              {new Date(binding.created_at).toLocaleDateString("uk-UA")}
            </span>
          </div>
        </div>
      ) : (
        /* Немає прив'язки - пропозиція згенерувати QR або deep-link */
        <div className="space-y-4">
          {!deepLinkData ? (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-300">
                Згенеруйте одноразовий токен для прив&apos;язки гравця {playerName} до бота.
              </p>
              <button
                onClick={handleGenerateLink}
                disabled={isPending || isMinorWithoutConsent}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <span>{isPending ? "Генерація..." : "📱 Створити QR для прив'язки"}</span>
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
                  <Image
                    src={deepLinkData.qrDataUrl}
                    alt="Telegram QR code"
                    width={160}
                    height={160}
                    unoptimized
                    className="w-40 h-40"
                  />
                </div>
                <div className="space-y-3 text-xs w-full">
                  <div className="font-semibold text-white text-sm">
                    Як підключити Telegram:
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                    <li>Відскануйте QR-код камерою смартфона гравця.</li>
                    <li>
                      Або надішліть посилання в Telegram і натисніть <strong>Start</strong>.
                    </li>
                    <li>Токен є одноразовим та дійсний протягом 48 годин.</li>
                  </ol>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={deepLinkData.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <span>🚀 Відкрити в Telegram</span>
                    </a>
                    <button
                      onClick={copyToClipboard}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                    >
                      📋 Копіювати посилання
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
