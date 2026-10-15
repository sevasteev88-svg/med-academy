"use client";

import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  playerName: string;
  subtitle?: string;
}

export default function PlayerPersonalQrModal({
  url,
  playerName,
  subtitle = "Персональний QR-код для входу в медичний кабінет",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && url) {
      QRCode.toDataURL(url, {
        width: 380,
        margin: 2,
        color: {
          dark: "#034984", // Клубний синій
          light: "#FFFFFF",
        },
      })
        .then((dataUri) => setQrDataUrl(dataUri))
        .catch((err) => console.error("QR Code generation error:", err));
    }
  }, [isOpen, url]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(url);
    alert("Персональне посилання скопійовано!");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500/20 to-blue-500/20 hover:from-sky-500/30 hover:to-blue-500/30 border border-sky-400/30 text-sky-200 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
        title="Показати або роздрукувати персональний QR-код гравця"
      >
        <span className="text-sm">📲</span>
        <span>QR-код гравця</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 print:p-0 print:bg-white animate-fadeIn">
          <div
            ref={printRef}
            className="bg-slate-900 border border-sky-500/30 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl relative print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:text-black"
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-base p-1 print:hidden"
            >
              ✕
            </button>

            <div className="flex items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-2 shadow-md print:bg-transparent print:border-slate-300">
                <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
              </div>
            </div>

            <div>
              <h3 className="text-base font-black text-white print:text-slate-900 tracking-tight">
                Медичний Кабінет Гравця
              </h3>
              <p className="text-xs text-sky-400 print:text-blue-700 font-bold mt-0.5">
                {playerName}
              </p>
              <p className="text-[11px] text-slate-400 print:text-slate-600 mt-1 leading-snug">
                {subtitle}
              </p>
            </div>

            <div className="p-3 bg-white rounded-2xl shadow-xl border border-sky-500/20 inline-block mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code для ${playerName}`}
                  className="w-52 h-52 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400 font-mono">
                  Генерація коду...
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 print:bg-slate-100 print:text-slate-800 print:border-slate-300 text-left space-y-1">
              <div className="font-bold text-sky-300 print:text-blue-700">📌 Як підключитися з телефону:</div>
              <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-slate-400 print:text-slate-700 leading-snug">
                <li>Наведіть камеру смартфона на цей персональний QR-код.</li>
                <li>Перейдіть за посиланням.</li>
                <li>Введіть 6-значний PIN-код, наданий лікарем.</li>
              </ol>
            </div>

            <div className="pt-2 flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition-all"
              >
                📋 Копіювати лінк
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition-all"
              >
                🖨️ Роздрукувати
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
