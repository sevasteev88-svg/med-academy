"use client";

import React, { useState, useEffect } from "react";

interface Props {
  forceOpen?: boolean;
}

export default function PwaInstallPromptModal({ forceOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Перевірка чи застосунок вже запущено як PWA (standalone)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(isStandaloneMode);

    // Детекція iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(ua);
    setIsIos(isApple);

    // Перехоплення Android beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (forceOpen) {
        setIsOpen(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Якщо це тільки-но після активації і не standalone — показуємо автоматично
    if (forceOpen && !isStandaloneMode) {
      setIsOpen(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, [forceOpen]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsOpen(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!isOpen || isStandalone) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-sky-500/40 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative">
        <button
          onClick={() => setIsOpen(false)}
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
          <p className="text-xs text-sky-300 font-medium mt-1">
            Для швидкого входу без повторного сканування
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-left space-y-2.5">
          {isIos ? (
            <div className="space-y-2 text-slate-300">
              <div className="font-bold text-sky-400 flex items-center gap-1.5 text-[11px]">
                <span>🍏</span> Інструкція для iPhone (Safari):
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 leading-snug">
                <li>
                  Натисніть кнопку <span className="font-bold text-white">«Поділитися»</span> (іконка квадрата зі стрілкою вгору внизу екрана Safari).
                </li>
                <li>
                  Прокрутіть меню та оберіть <span className="font-bold text-white">«На початковий екран»</span>.
                </li>
                <li>
                  У правому верхньому кутку натисніть <span className="font-bold text-sky-400">«Додати»</span>.
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-2 text-slate-300">
              <div className="font-bold text-sky-400 flex items-center gap-1.5 text-[11px]">
                <span>🤖</span> Інструкція для Android (Chrome):
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Додайте застосунок на головний екран смартфона, щоб відкривати ранкову анкету в один дотик.
              </p>
              {deferredPrompt && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
                >
                  ➕ Встановити на телефон
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition-all active:scale-95"
          >
            Зрозуміло, перейти до анкети →
          </button>
        </div>
      </div>
    </div>
  );
}
