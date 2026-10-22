"use client";

import { useState, useTransition } from "react";
import { generateCoachWeeklyTelegramReportAction } from "@/actions/telegram-actions";
import { generateCoachWeeklyReportPdf } from "@/lib/coach-weekly-telegram-pdf";
import type { CoachWeeklyTelegramSummary } from "@/types/telegram";

type Props = {
  teamId: string;
  teamName: string;
};

export default function CoachWeeklyTelegramModal({ teamId, teamName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<CoachWeeklyTelegramSummary | null>(null);
  const [messagePreview, setMessagePreview] = useState<string>("");
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setIsOpen(true);
    setStatus(null);
    startTransition(async () => {
      const res = await generateCoachWeeklyTelegramReportAction(teamId, { sendToTelegram: false });
      if (res.success && res.summary) {
        setSummary(res.summary);
        setMessagePreview(res.messageText || "");
      } else {
        setStatus({ type: "error", text: res.error || "Не вдалося сформувати звіт" });
      }
    });
  };

  const handleSendTelegram = () => {
    startTransition(async () => {
      setStatus(null);
      const res = await generateCoachWeeklyTelegramReportAction(teamId, { sendToTelegram: true });
      if (res.success) {
        setStatus({
          type: "success",
          text: "✅ Тижневий рапорт успішно відправлено в Telegram тренерського штабу!",
        });
      } else {
        setStatus({ type: "error", text: res.error || "Помилка відправки в Telegram" });
      }
    });
  };

  const handleDownloadPdf = () => {
    if (!summary) return;
    try {
      const doc = generateCoachWeeklyReportPdf(summary);
      doc.save(`Weekly-Readiness-${summary.teamName.replace(/\s+/g, "_")}.pdf`);
    } catch {
      setStatus({ type: "error", text: "Не вдалося згенерувати PDF" });
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
      >
        <span>📱</span>
        <span>Звіт тренеру (Telegram/PDF)</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-500/30 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-sky-500/15 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h3 className="text-base font-bold text-white">
                  Тижневий звіт тренеру: {teamName}
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/20 text-xs text-sky-200 leading-relaxed flex items-center gap-2">
              <span>🛡️</span>
              <span>
                <strong>Медична конфіденційність:</strong> у Telegram та експортований PDF
                передаються лише агреговані лічильники прапорців (без прізвищ та діагнозів). Деталі
                тренер дивиться в додатку.
              </span>
            </div>

            {summary ? (
              <div className="space-y-3">
                {/* Метрики */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      Дисципліна
                    </div>
                    <div className="text-xl font-black font-mono text-sky-400 mt-1">
                      {summary.compliancePct}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {summary.completedSurveysCount} / {summary.totalSurveysExpected}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-amber-500/80 uppercase tracking-wider font-semibold">
                      Жовті прапорці
                    </div>
                    <div className="text-xl font-black font-mono text-amber-400 mt-1">
                      {summary.yellowFlagsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">лічильник за 7 дн.</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-rose-500/80 uppercase tracking-wider font-semibold">
                      Червоні прапорці
                    </div>
                    <div className="text-xl font-black font-mono text-rose-400 mt-1">
                      {summary.redFlagsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">лічильник за 7 дн.</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                      Увага штабу
                    </div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      {summary.requiresAttentionCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">гравців на сьогодні</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Текст повідомлення для Telegram (Markdown)
                  </label>
                  <textarea
                    rows={7}
                    readOnly
                    value={messagePreview}
                    className="w-full bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 rounded-xl p-3 focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>
            ) : isPending ? (
              <div className="py-12 text-center text-xs text-slate-400">Формування звіту...</div>
            ) : null}

            {status && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  status.type === "success"
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-950/40 text-rose-300 border border-rose-500/30"
                }`}
              >
                {status.text}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800 gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={!summary}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5"
              >
                <span>📥 Завантажити PDF</span>
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
                  disabled={isPending || !summary}
                  onClick={handleSendTelegram}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-sky-900/30 flex items-center gap-1.5"
                >
                  {isPending ? "Відправка..." : "✈️ Надіслати тренеру в Telegram"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
