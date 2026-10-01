"use client";

import React, { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";

interface Props {
  url?: string;
  title?: string;
  subtitle?: string;
}

export default function PortalQrCodeModal({
  url = "https://med-academy-alpha.vercel.app/rehab-portal",
  title = "Медичний Портал Футболіста",
  subtitle = "Скануйте камерою телефону для щоденного звіту (Велнес, Сон, Відновлення)",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: "#034984", // Глибокий клубний синій «Чорноморець»
        light: "#FFFFFF",
      },
    })
      .then((dataUri) => setQrDataUrl(dataUri))
      .catch((err) => console.error("QR Code generation error:", err));
  }, [url]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Кнопка виклику QR-коду */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500/20 to-blue-500/20 hover:from-sky-500/30 hover:to-blue-500/30 border border-sky-400/30 text-sky-200 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
        title="Загальний QR-код для роздягальні"
      >
        <span className="text-sm">📲</span>
        <span>QR-код для гравців</span>
      </button>

      {/* Модальне вікно */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 print:p-0 print:bg-white animate-fadeIn">
          <div
            ref={printRef}
            className="bg-slate-900 border border-sky-500/30 rounded-3xl max-w-sm w-full p-6 text-center space-y-5 shadow-2xl relative print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:text-black"
          >
            {/* Кнопка закриття */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-base p-1 print:hidden"
            >
              ✕
            </button>

            {/* Логотип клубу */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-2 shadow-md print:bg-transparent print:border-slate-300">
                <img src="/logo-chr.png" alt="Чорноморець" className="w-full h-full object-contain" />
              </div>
            </div>

            <div>
              <h3 className="text-base font-black text-white print:text-slate-900 tracking-tight">
                {title}
              </h3>
              <p className="text-xs text-sky-400 print:text-blue-700 font-semibold mt-0.5">
                ФК «Чорноморець» Одеса
              </p>
              <p className="text-[11px] text-slate-400 print:text-slate-600 mt-2 leading-snug">
                {subtitle}
              </p>
            </div>

            {/* Зображення QR-коду */}
            <div className="p-3 bg-white rounded-2xl shadow-xl border border-sky-500/20 inline-block mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code для входу в портал"
                  className="w-56 h-56 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400 font-mono">
                  Генерація коду...
                </div>
              )}
            </div>

            {/* Інструкція для футболістів */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 print:bg-slate-100 print:text-slate-800 print:border-slate-300 text-left space-y-1">
              <div className="font-bold text-sky-300 print:text-blue-700">📌 Як підключитися з телефону:</div>
              <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-slate-400 print:text-slate-700 leading-snug">
                <li>Наведіть камеру смартфона на цей QR-код.</li>
                <li>Перейдіть за посиланням у браузері.</li>
                <li>Оберіть своє прізвище та введіть 4-значний PIN.</li>
              </ol>
            </div>

            {/* Кнопки дій */}
            <div className="pt-2 flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🖨️</span>
                <span>Роздрукувати для роздягальні (А4)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
