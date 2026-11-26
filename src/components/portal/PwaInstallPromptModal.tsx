"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Props {
  forceOpen?: boolean;
  externalOpen?: boolean;
  onClose?: () => void;
  variant?: "player" | "parent";
  /** Шлях для збереження в закладку на iOS ("На початковий екран") */
  pwaInstallPath?: string;
  /** Чистий шлях, який повертається після закриття модалки на iOS */
  cleanPath?: string;
  /** Посилання для копіювання, якщо відкрито у вбудованому браузері Telegram/Viber */
  copyEntryUrl?: string;
}

export default function PwaInstallPromptModal({
  forceOpen = false,
  externalOpen = false,
  onClose,
  variant = "player",
  pwaInstallPath,
  cleanPath,
  copyEntryUrl,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOpen = Boolean(externalOpen) || internalOpen;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsStandalone(isStandaloneMode);

    const ua = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(ua);
    setIsIos(isApple);

    const inApp = /telegram|viber|whatsapp|fban|fbav|instagram|line\//.test(ua);
    setIsInAppBrowser(inApp);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (forceOpen && !isStandaloneMode) {
        setInternalOpen(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if (forceOpen && !isStandaloneMode) {
      setInternalOpen(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, [forceOpen]);

  // На iOS при відкритті інструкції тимчасово підставляємо у рядок адреси
  // токенізований URL, щоб «На початковий екран» зберіг персональний старт
  useEffect(() => {
    if (typeof window === "undefined" || isStandalone) return;
    if (isOpen && isIos && pwaInstallPath) {
      try {
        window.history.replaceState({}, "", pwaInstallPath);
      } catch {}
    }
  }, [isOpen, isIos, isStandalone, pwaInstallPath]);

  const handleClose = useCallback(() => {
    setInternalOpen(false);
    if (
      typeof window !== "undefined" &&
      isIos &&
      cleanPath &&
      pwaInstallPath &&
      cleanPath !== pwaInstallPath
    ) {
      try {
        window.history.replaceState({}, "", cleanPath);
      } catch {}
    }
    onClose?.();
  }, [isIos, cleanPath, pwaInstallPath, onClose]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        handleClose();
      }
      setDeferredPrompt(null);
    }
  };

  const handleCopyLink = async () => {
    const targetUrl =
      copyEntryUrl ||
      (typeof window !== "undefined"
        ? pwaInstallPath
          ? `${window.location.origin}${pwaInstallPath}`
          : window.location.href
        : "");
    if (!targetUrl) return;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  if (!isOpen || isStandalone) {
    return null;
  }

  const subtitle =
    variant === "parent"
      ? "Щоб сімейний кабінет завжди відкривався в один дотик"
      : "Для швидкого входу без повторного сканування";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-sky-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-base p-1"
          aria-label="Закрити"
        >
          ✕
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-600 text-white flex items-center justify-center text-3xl mx-auto shadow-xl shadow-sky-600/30">
          📲
        </div>

        <div>
          <h3 className="text-lg font-black text-white tracking-tight">
            Додати на головний екран
          </h3>
          <p className="text-xs text-sky-300 font-medium mt-1">{subtitle}</p>
        </div>

        {isInAppBrowser && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/35 text-xs text-left space-y-2">
            <div className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px]">
              <span>⚠️</span> Відкрито у вбудованому браузері
            </div>
            <p className="text-[11px] text-amber-100/90 leading-snug">
              У Telegram / Viber не можна встановити іконку на екран. Натисніть меню{" "}
              <strong className="text-white">⋮</strong> або іконку браузера та оберіть{" "}
              <strong className="text-white">
                {isIos ? "«Відкрити в Safari»" : "«Відкрити в Chrome»"}
              </strong>
              .
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold text-[11px] transition-colors"
            >
              {copied ? "✅ Посилання скопійовано" : "📋 Скопіювати посилання для входу"}
            </button>
          </div>
        )}

        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-left space-y-2.5">
          {isIos ? (
            <div className="space-y-2 text-slate-300">
              <div className="font-bold text-sky-400 flex items-center gap-1.5 text-[11px]">
                <span>🍏</span> Інструкція для iPhone (Safari):
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-snug">
                <li>
                  Натисніть кнопку <span className="font-bold text-white">«Поділитися»</span> (квадрат зі стрілкою вгору внизу Safari).
                </li>
                <li>
                  Прокрутіть меню та оберіть <span className="font-bold text-white">«На початковий екран»</span>.
                </li>
                <li>
                  У правому верхньому кутку натисніть <span className="font-bold text-sky-400">«Додати»</span>.
                </li>
              </ol>
              <p className="text-[10px] text-emerald-300/90 pt-0.5 leading-snug">
                ✓ Ваша сесія автоматично перенесеться в іконку — повторно сканувати QR не доведеться.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 text-slate-300">
              <div className="font-bold text-sky-400 flex items-center gap-1.5 text-[11px]">
                <span>🤖</span> Інструкція для Android (Chrome / інший браузер):
              </div>
              {deferredPrompt ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
                >
                  ➕ Встановити на телефон
                </button>
              ) : (
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Додайте кабінет на головний екран смартфона, щоб відкривати його в один дотик:
                </p>
              )}
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400 leading-snug">
                <li>
                  Натисніть меню <span className="font-bold text-white">⋮</span> (або <span className="font-bold text-white">≡</span>) у кутку браузера.
                </li>
                <li>
                  Оберіть <span className="font-bold text-white">«Додати на головний екран»</span> або <span className="font-bold text-white">«Встановити додаток»</span>.
                </li>
                <li>
                  Підтвердіть <span className="font-bold text-sky-400">«Встановити»</span>.
                </li>
              </ol>
            </div>
          )}
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-all active:scale-95"
          >
            Зрозуміло, перейти до кабінету →
          </button>
        </div>
      </div>
    </div>
  );
}
