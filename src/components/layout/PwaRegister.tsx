"use client";

import { useEffect, useState } from "react";

export default function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    // Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("PWA Service Worker registered:", reg.scope))
        .catch((err) => console.log("PWA Service Worker error:", err));
    }

    // Android/Chrome install event
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if not dismissed recently
      const dismissed = localStorage.getItem("pwa_install_dismissed");
      if (!dismissed) {
        setShowInstallPrompt(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Detect iOS Safari standalone
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = (window.navigator as any).standalone === true;

    if (isAppleIos && !isStandalone) {
      setIsIos(true);
      const dismissedIos = localStorage.getItem("pwa_ios_tip_dismissed");
      if (!dismissedIos) {
        // Show after 3 seconds on iOS
        const timer = setTimeout(() => setShowIosTip(true), 3000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  const [showDesktopTip, setShowDesktopTip] = useState(false);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowDesktopTip(true);
    }
  };

  const dismissPrompt = () => {
    setShowInstallPrompt(false);
    setShowDesktopTip(false);
    localStorage.setItem("pwa_install_dismissed", "true");
  };

  const dismissIosTip = () => {
    setShowIosTip(false);
    localStorage.setItem("pwa_ios_tip_dismissed", "true");
  };

  if (!showInstallPrompt && !showIosTip) return null;

  return (
    <>
      {/* Android/Desktop Chrome Banner */}
      {showInstallPrompt && (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/40 backdrop-blur-xl shadow-2xl shadow-sky-950/60 flex flex-col gap-3 animate-slideUp">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-950 border border-sky-500/30 flex items-center justify-center text-xl overflow-hidden shrink-0">
                <img src="/logo-chr.png" alt="Чорноморець" className="w-8 h-8 object-contain" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate">Встановити додаток</h4>
                <p className="text-[10px] text-slate-400 truncate">Швидкий доступ з робочого столу</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md shadow-sky-500/30 transition-all active:scale-95"
              >
                Встановити
              </button>
              <button
                onClick={dismissPrompt}
                className="p-1.5 text-slate-400 hover:text-white text-xs transition-colors"
                title="Закрити"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Підказка для комп'ютера Chrome/Edge якщо нативний виклик блокується */}
          {showDesktopTip && (
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-sky-500/25 text-[11px] text-slate-300 space-y-1 animate-fadeIn">
              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                <span>🖥️</span> Як встановити у браузері на ПК:
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                1. У правому верхньому кутку Chrome натисніть <strong>три крапки ⋮</strong>
              </p>
              <p className="text-[10px] text-slate-400 leading-snug">
                2. Виберіть <strong>«Зберегти та поділитися»</strong> (або <i>«Трансляція, збереження...»</i>)
              </p>
              <p className="text-[10px] text-slate-400 leading-snug">
                3. Натисніть <strong>«Встановити сторінку як додаток»</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* iOS Safari Tip */}
      {showIosTip && (
        <div className="fixed bottom-20 left-4 right-4 z-50 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/40 backdrop-blur-xl shadow-2xl shadow-sky-950/60 flex items-start gap-3 animate-slideUp">
          <div className="w-9 h-9 rounded-xl bg-slate-950 border border-sky-500/30 flex items-center justify-center text-lg overflow-hidden shrink-0">
            <img src="/logo-chr.png" alt="Чорноморець" className="w-7 h-7 object-contain" />
          </div>
          <div className="flex-1 text-xs text-slate-300">
            <p className="font-bold text-white mb-0.5">Встановити на iPhone / iPad</p>
            <p className="text-[11px] text-slate-400 leading-snug">
              Натисніть <span className="text-sky-400 font-semibold">«Поділитися» ⎋</span> в Safari та оберіть <span className="text-sky-400 font-semibold">«На початковий екран» ➕</span>.
            </p>
          </div>
          <button
            onClick={dismissIosTip}
            className="p-1 text-slate-400 hover:text-white text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
