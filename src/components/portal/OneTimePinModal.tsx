"use client";

import React, { useState, useRef } from "react";
import QRCode from "qrcode";
import Link from "next/link";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  pin: string;
  portalToken?: string;
  title?: string;
  playerId?: string;
}

export default function OneTimePinModal({
  isOpen,
  onClose,
  playerName,
  pin,
  portalToken,
  title = "Тимчасовий PIN-код гравця",
  playerId,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  const portalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/rehab-portal${portalToken ? `?token=${portalToken}` : ""}`
    : `https://med-academy-alpha.vercel.app/rehab-portal${portalToken ? `?token=${portalToken}` : ""}`;

  React.useEffect(() => {
    if (isOpen && portalUrl) {
      QRCode.toDataURL(portalUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#034984",
          light: "#FFFFFF",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [isOpen, portalUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    const textToCopy = `Медичний кабінет гравця\nГравець: ${playerName}\nПерсональне посилання: ${portalUrl}\nОдноразовий 6-значний PIN: ${pin}\n(При першому вході обов'язково встановіть свій постійний PIN)`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:p-0 print:bg-white animate-fadeIn">
      <div
        ref={printRef}
        className="bg-slate-900 border border-sky-500/30 rounded-3xl max-w-md w-full p-5 sm:p-6 text-center space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:text-black print:max-h-none print:overflow-visible"
      >
        {/* Кнопка закриття */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-base p-1 print:hidden"
        >
          ✕
        </button>

        {/* Заголовок та попередження */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold">
            <span>⚠️</span> Повідомлення для лікаря
          </div>
          <h3 className="text-lg font-bold text-white print:text-black mt-2">
            {title}
          </h3>
          <p className="text-xs text-sky-400 font-semibold">{playerName}</p>
          <p className="text-[11px] text-slate-400 print:text-slate-600 mt-1">
            Цей PIN-код генерується <strong>ОДИН РАЗ</strong> для безпеки. Надалі його неможливо переглянути — лише скинути.
          </p>
        </div>

        {/* Великий блок PIN-коду */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-sky-500/30 text-center space-y-1 print:border-slate-300 print:bg-slate-50">
          <div className="text-[10px] text-slate-400 print:text-slate-600 uppercase tracking-wider font-semibold">
            Тимчасовий 6-значний PIN:
          </div>
          <div className="text-3xl font-mono font-black tracking-[0.3em] text-sky-300 print:text-blue-900">
            {pin}
          </div>
          <div className="text-[10px] text-rose-400 print:text-rose-700 font-medium">
            * При першому вході гравцю буде запропоновано встановити власний PIN
          </div>
        </div>

        {/* QR-код персонального посилання */}
        {qrDataUrl && (
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-2xl shadow-md border border-sky-500/20 inline-block mx-auto">
              <img
                src={qrDataUrl}
                alt="Персональний QR-код гравця"
                className="w-40 h-40 mx-auto rounded-lg"
              />
            </div>
            <p className="text-[10px] text-slate-400 print:text-slate-600 font-mono break-all px-2">
              {portalUrl}
            </p>
          </div>
        )}

        {/* Кнопки дій */}
        <div className="grid grid-cols-2 gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={handleCopy}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
          >
            <span>{copied ? "✓ Скопійовано!" : "📋 Скопіювати"}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-1.5"
          >
            <span>🖨️ Роздрукувати</span>
          </button>
        </div>

        {playerId && (
          <div className="pt-1 print:hidden">
            <Link
              href={`/players/${playerId}`}
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Перейти до картки гравця →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
