"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import QRCode from "qrcode";
import Card from "@/components/ui/Card";
import type { PlayerDevice } from "@/types/player-device";
import {
  generatePlayerActivationQrAction,
  revokePlayerDevicesAction,
  getPlayerActiveDevicesAction,
} from "@/actions/player-device-actions";

interface Props {
  playerId: string;
  playerName: string;
  initialDevices?: PlayerDevice[];
}

export default function PlayerDevicesCard({
  playerId,
  playerName,
  initialDevices = [],
}: Props) {
  const [devices, setDevices] = useState<PlayerDevice[]>(initialDevices);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrToken, setQrToken] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const [isGenerating, startGenerating] = useTransition();
  const [isRevoking, startRevoking] = useTransition();
  const printRef = useRef<HTMLDivElement>(null);

  // Оновлюємо QR при зміні токена
  useEffect(() => {
    if (qrToken && typeof window !== "undefined") {
      const activationUrl = `${window.location.origin}/a/${qrToken}`;
      QRCode.toDataURL(activationUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: "#034984",
          light: "#FFFFFF",
        },
      })
        .then((dataUri) => setQrDataUrl(dataUri))
        .catch((err) => console.error("QR Code generation error:", err));
    }
  }, [qrToken]);

  // Генерація нового одноразового QR-коду
  const handleGenerateQr = () => {
    setFeedback(null);
    startGenerating(async () => {
      const res = await generatePlayerActivationQrAction(playerId);
      if (res.success && res.token) {
        setQrToken(res.token);
        setQrExpiresAt(res.expiresAt || "");
        setIsQrModalOpen(true);
      } else {
        setFeedback(res.error || "Не вдалося згенерувати QR-код");
      }
    });
  };

  // Відкликання доступу для всіх пристроїв гравця
  const handleRevokeAccess = () => {
    if (!confirm(`Відкликати доступ для всіх пристроїв гравця ${playerName}? Сесії на телефонах будуть миттєво анульовані.`)) {
      return;
    }

    setFeedback(null);
    startRevoking(async () => {
      const res = await revokePlayerDevicesAction(playerId);
      if (res.success) {
        setDevices([]);
        setFeedback("Доступ успішно відкликано. Усі пристрої гравця втратили доступ.");
        // Оновлюємо список
        const refreshed = await getPlayerActiveDevicesAction(playerId);
        if (refreshed.success) {
          setDevices(refreshed.devices);
        }
      } else {
        setFeedback(res.error || "Помилка відкликання доступу");
      }
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined" && qrToken) {
      navigator.clipboard.writeText(`${window.location.origin}/a/${qrToken}`);
      alert("Посилання для активації скопійовано!");
    }
  };

  return (
    <>
      <Card className="p-4 sm:p-5 bg-slate-900/60 border border-sky-500/20 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📱</span> Авторизовані пристрої гравця
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 border border-slate-700">
                {devices.length} / 2 активно
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Вхід без пароля через одноразовий QR (сесія 90 днів, макс. 2 пристрої)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleGenerateQr}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <span>📲</span>
              <span>{isGenerating ? "Генерація..." : "Видати новий QR"}</span>
            </button>

            {devices.length > 0 && (
              <button
                type="button"
                onClick={handleRevokeAccess}
                disabled={isRevoking}
                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                title="Миттєво завершити всі сесії пристроїв гравця"
              >
                <span>🚫</span>
                <span>{isRevoking ? "Відкликання..." : "Відкликати доступ"}</span>
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="p-2.5 rounded-xl bg-slate-950 border border-sky-500/30 text-xs text-sky-200">
            {feedback}
          </div>
        )}

        {/* Devices list */}
        {devices.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center text-xs text-slate-500">
            Немає активних пристроїв. Натисніть «Видати новий QR», щоб гравець підключив телефон.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {devices.map((device, idx) => (
              <div
                key={device.id || idx}
                className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span>📱</span> {device.device_name}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Активна сесія" />
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>
                    Активовано: <strong className="text-slate-300">{new Date(device.created_at).toLocaleDateString("uk-UA")}</strong>
                  </div>
                  <div>
                    Остання активність: <strong className="text-slate-300">{new Date(device.last_seen_at).toLocaleDateString("uk-UA")} {new Date(device.last_seen_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</strong>
                  </div>
                  {device.ip_address && (
                    <div className="font-mono text-[10px] text-slate-500">
                      IP: {device.ip_address}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* QR Code Modal for Doctor */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn print:p-0 print:bg-white">
          <div
            ref={printRef}
            className="bg-slate-900 border border-sky-500/30 rounded-3xl max-w-sm w-full p-5 sm:p-6 text-center space-y-3.5 shadow-2xl relative max-h-[90vh] overflow-y-auto my-auto print:border-none print:shadow-none print:max-w-none print:w-full print:bg-white print:text-black"
          >
            <button
              onClick={() => setIsQrModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-base p-1 print:hidden"
            >
              ✕
            </button>

            <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-sky-500/30 flex items-center justify-center p-1.5 shadow-md mx-auto print:border-slate-300">
              <img src="/logo-chr.png" alt="Клуб" className="w-full h-full object-contain" />
            </div>

            <div>
              <h3 className="text-base font-black text-white print:text-slate-900 tracking-tight">
                Активація пристрою гравця
              </h3>
              <p className="text-xs text-sky-400 print:text-blue-700 font-bold mt-0.5">
                {playerName}
              </p>
              <p className="text-[11px] text-slate-400 print:text-slate-600 mt-1 leading-snug">
                Одноразовий QR-код для входу без пароля (дійсний 14 днів)
              </p>
            </div>

            <div className="p-2.5 bg-white rounded-2xl shadow-xl border border-sky-500/20 inline-block mx-auto">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Активаційний QR для ${playerName}`}
                  className="w-44 h-44 mx-auto rounded-lg"
                />
              ) : (
                <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400 font-mono">
                  Генерація QR-коду...
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 print:bg-slate-100 print:text-slate-800 print:border-slate-300 text-left space-y-1">
              <div className="font-bold text-sky-300 print:text-blue-700 text-[11px]">📌 Інструкція для гравця:</div>
              <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-slate-400 print:text-slate-700 leading-snug">
                <li>Відкрийте камеру смартфона та наведіть на QR-код.</li>
                <li>Перейдіть за посиланням — пристрій активується автоматично.</li>
                <li>Натисніть «Додати на головний екран» для щоденного входу в 1 клік.</li>
              </ol>
            </div>

            <div className="text-[10px] text-amber-400/90 font-mono">
              ⏳ Діє до: {qrExpiresAt ? new Date(qrExpiresAt).toLocaleDateString("uk-UA") : "14 днів"} · Одноразовий
            </div>

            <div className="pt-1 flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition-all active:scale-95"
              >
                📋 Копіювати лінк
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg transition-all active:scale-95"
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
