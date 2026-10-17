"use client";

import { useState, useTransition } from "react";
import { sendTelegramDigestAction } from "@/actions/send-telegram-digest-action";

type Props = {
  defaultMessage: string;
};

export default function TelegramDigestModal({ defaultMessage }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState(defaultMessage);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    startTransition(async () => {
      setStatus(null);
      const res = await sendTelegramDigestAction({
        text: message,
      });

      if (res.error) {
        setStatus({ type: "error", text: res.error });
      } else {
        setStatus({ type: "success", text: "✅ Агрегований рапорт успішно відправлено в Telegram-чат тренерського штабу!" });
        setTimeout(() => setIsOpen(false), 2200);
      }
    });
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(message);
    setStatus({ type: "success", text: "📋 Текст рапорту скопійовано для вставки в Telegram!" });
  };

  return (
    <>
      <button
        onClick={() => {
          setMessage(defaultMessage);
          setStatus(null);
          setIsOpen(true);
        }}
        className="px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
      >
        <span>✈️</span>
        <span>Звіт в Telegram</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/30 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sky-500/15 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✈️</span>
                <h3 className="text-base font-bold text-white">
                  Агрегований медичний рапорт для тренерського штабу
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/20 text-[11px] text-sky-200 leading-relaxed flex items-center gap-2">
                <span>🛡️</span>
                <span>
                  <strong>Безпека персональних даних:</strong> звіт для Telegram містить виключно узагальнені цифри доступності (без прізвищ, діагнозів та персональних оцінок болю).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Текст повідомлення для Telegram (Markdown)
                </label>
                <textarea
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-950 font-mono text-xs text-slate-200 border border-sky-500/30 rounded-xl p-3 focus:outline-none focus:border-sky-400 resize-none leading-relaxed"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>⚙️ Ключі та Chat ID бота налаштовані на сервері (env)</span>
                <span className="text-emerald-400 font-mono font-semibold">● Захищено</span>
              </div>

              {status && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    status.type === "success"
                      ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-950/40 text-red-300 border border-red-500/30"
                  }`}
                >
                  {status.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-sky-500/15">
              <button
                type="button"
                onClick={copyText}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                📋 Копіювати текст
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Закрити
                </button>
                <button
                  type="button"
                  disabled={isPending || !message.trim()}
                  onClick={handleSend}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-sky-900/30 flex items-center gap-1.5"
                >
                  {isPending ? "Відправка..." : "✈️ Надіслати ботом"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
