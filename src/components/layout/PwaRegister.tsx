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

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const dismissPrompt = () => {
    setShowInstallPrompt(false);
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
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 p-4 rounded-2xl bg-slate-900/95 border border-sky-500/40 backdrop-blur-xl shadow-2xl shadow-sky-950/60 flex items-center justify-between gap-3 animate-slideUp">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-sky-500/30 flex items-center justify-center text-xl overflow-hidden shrink-0">
              <img src="/logo-chr.png" alt="Чорноморець" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Встановити додаток</h4>
              <p className="text-[10px] text-slate-400">Швидкий доступ з головного екрану</p>
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
            >
              ✕
            </button>
          </div>
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
