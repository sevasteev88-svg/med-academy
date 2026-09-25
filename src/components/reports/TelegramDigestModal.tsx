"use client";

import { useState, useTransition } from "react";
import { sendTelegramDigestAction } from "@/actions/send-telegram-digest-action";

type Props = {
  defaultMessage: string;
};

export default function TelegramDigestModal({ defaultMessage }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState(defaultMessage);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleSend = () => {
    startTransition(async () => {
      setStatus(null);
      const res = await sendTelegramDigestAction({
        botToken: botToken.trim() || undefined,
        chatId: chatId.trim() || undefined,
        text: message,
      });

      if (res.error) {
        setStatus({ type: "error", text: res.error });
      } else {
        setStatus({ type: "success", text: "✅ Рапорт успішно відправлено в Telegram-чат тренерського штабу!" });
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
        className="px-3.5 py-2 rounded-lg bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-semibold transition-all flex items-center gap-1.5"
      >
        <span>✈️</span>
        <span>Звіт в Telegram</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-blue-900/40 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✈️</span>
                <h3 className="text-base font-bold text-white">
                  Відправка медичного рапорту в Telegram штабу
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
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Текст повідомлення (Markdown підтримується)
                </label>
                <textarea
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-950 font-mono text-xs text-slate-200 border border-blue-900/30 rounded-xl p-3 focus:outline-none focus:border-brand-blue resize-none leading-relaxed"
                />
              </div>

              {/* Bot Config Toggle */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-blue-900/20">
                <button
                  type="button"
                  onClick={() => setShowConfig(!showConfig)}
                  className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1"
                >
                  ⚙️ {showConfig ? "Сховати налаштування бота" : "Налаштування бота / каналу"}
                </button>

                {showConfig && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <label className="block text-[10px] uppercase text-slate-400 mb-0.5">
                        Bot Token (якщо не прописано в env)
                      </label>
                      <input
                        type="password"
                        placeholder="123456789:ABCdefGhIJKlmNoPQRstuvw"
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-slate-400 mb-0.5">
                        Chat ID / ID каналу
                      </label>
                      <input
                        type="text"
                        placeholder="-100123456789 або @channel_username"
                        value={chatId}
                        onChange={(e) => setChatId(e.target.value)}
                        className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {status && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    status.type === "success"
                      ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-950/40 text-red-300 border border-red-500/30"
                  }`}
                >
                  {status.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-blue-900/20">
              <button
                type="button"
                onClick={copyText}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
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
