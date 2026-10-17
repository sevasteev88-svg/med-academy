"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import { resetPlayerPinByDoctorAction, saveDoctorInstructionAction } from "@/actions/rehab-portal-action";
import OneTimePinModal from "@/components/portal/OneTimePinModal";
import PlayerPersonalQrModal from "@/components/portal/PlayerPersonalQrModal";
import type { RehabCheckinData } from "@/types/rehab-portal";

export default function PlayerRehabCheckinHistory({
  playerId,
  playerName,
  portalToken,
  checkins,
}: {
  playerId: string;
  playerName: string;
  portalToken?: string;
  checkins: RehabCheckinData[];
}) {
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [currentToken, setCurrentToken] = useState<string | undefined>(portalToken);
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);

  // Doctor instruction state
  const [instructionText, setInstructionText] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [instructionFeedback, setInstructionFeedback] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleResetPin = () => {
    if (!confirm(`Згенерувати новий випадковий 6-значний PIN для гравця ${playerName}? Попередній доступ буде скасовано.`)) {
      return;
    }

    setPinFeedback(null);
    startTransition(async () => {
      const res = await resetPlayerPinByDoctorAction(playerId);
      if (res.success && res.generatedPin) {
        setGeneratedPin(res.generatedPin);
        if (res.portalToken) setCurrentToken(res.portalToken);
        setResetModalOpen(true);
        setPinFeedback("Новий PIN успішно згенеровано! Збережіть або передайте гравцю.");
        setTimeout(() => setPinFeedback(null), 5000);
      } else {
        setPinFeedback(res.error || "Помилка скидання PIN");
      }
    });
  };

  const handleSendInstruction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructionText.trim()) return;

    setInstructionFeedback(null);
    startTransition(async () => {
      const res = await saveDoctorInstructionAction({
        playerId,
        instruction: instructionText,
        appointmentTime: appointmentTime || undefined,
      });

      if (res.success) {
        setInstructionFeedback("✓ Вказівку надіслано в телефон футболіста!");
        setTimeout(() => setInstructionFeedback(null), 4000);
      } else {
        setInstructionFeedback(res.error || "Помилка відправки");
      }
    });
  };

  const portalLink = currentToken ? `/rehab-portal?token=${currentToken}` : "/rehab-portal";

  return (
    <>
      <Card className="border border-sky-500/20 bg-slate-900/60 backdrop-blur-md space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-sky-500/15 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-base">
              📱
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Кабінет Гравця та Звіти Відновлення
              </h3>
              <p className="text-[11px] text-slate-400">
                Безпечний вхід за персональним токеном та 6-значним PIN
              </p>
            </div>
          </div>

          {/* PIN Management: Hidden PIN + "Скинути PIN" button + Individual QR */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleResetPin}
              disabled={isPending}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/30 text-amber-200 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <span>🔑</span>
              <span>{isPending ? "Генерація..." : "Скинути PIN"}</span>
            </button>

            {currentToken && (
              <>
                <PlayerPersonalQrModal
                  url={typeof window !== "undefined" ? `${window.location.origin}/rehab-portal?token=${currentToken}` : `https://med-academy-alpha.vercel.app/rehab-portal?token=${currentToken}`}
                  playerName={playerName}
                />

                <Link
                  href={portalLink}
                  target="_blank"
                  className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <span>🔗</span>
                  <span>Відкрити</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {pinFeedback && (
          <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2.5 rounded-xl border border-amber-500/30">
            {pinFeedback}
          </div>
        )}

        {/* Doctor Daily Instruction Form */}
        <form onSubmit={handleSendInstruction} className="p-3.5 rounded-2xl bg-slate-950/70 border border-sky-500/20 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-bold text-sky-300 flex items-center gap-1.5">
              <span>👨‍⚕️</span> Надіслати персональну вказівку на телефон гравця:
            </label>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span>Час огляду:</span>
              <input
                type="time"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={instructionText}
              onChange={(e) => setInstructionText(e.target.value)}
              placeholder="Наприклад: 'Сьогодні біг без різких гальмувань. О 16:00 чекаю на лімфодренаж...'"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={isPending || !instructionText.trim()}
              className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              Надіслати ✉️
            </button>
          </div>

          {instructionFeedback && (
            <div className="text-[11px] text-emerald-400 font-medium">
              {instructionFeedback}
            </div>
          )}
        </form>

        {/* Checkins List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>📋</span> Історія самозвітів футболіста ({checkins.length}):
          </h4>

          {checkins.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-white/10 text-xs text-slate-500">
              Гравець ще не вносив щоденних звітів з телефону. Згенеруйте та надайте йому тимчасовий PIN через кнопку «Скинути PIN».
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {checkins.map((chk, idx) => (
                <div
                  key={chk.id || idx}
                  className="p-3 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-slate-400">{chk.date} · {chk.time || "Ранок"}</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded-lg border text-[10px] ${
                      chk.vas_score != null && chk.vas_score >= 7
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : chk.vas_score != null && chk.vas_score >= 4
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    }`}>
                      Біль ВАШ: {chk.vas_score != null ? `${chk.vas_score}/10` : "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-300 pt-1 border-t border-white/5">
                    <div>
                      <span className="text-slate-500 block">Набряк:</span>
                      <span className="font-medium">
                        {chk.swelling === "none" ? "Відсутній" : chk.swelling === "mild" ? "Незначний" : "Виражений"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Сон:</span>
                      <span className="font-medium">
                        {"⭐".repeat(chk.sleep_quality || 0)} ({chk.sleep_quality}/5)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ЛФК:</span>
                      <span className={`font-bold ${
                        chk.exercises_completed === "full"
                          ? "text-emerald-400"
                          : chk.exercises_completed === "partial"
                          ? "text-amber-400"
                          : "text-slate-500"
                      }`}>
                        {chk.exercises_completed === "full" ? "Виконано повністю" : chk.exercises_completed === "partial" ? "Частково" : "Не виконував"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Втома:</span>
                      <span className="font-medium">{chk.fatigue_level}/5</span>
                    </div>
                  </div>

                  {chk.player_comment && (
                    <div className="p-2 rounded-lg bg-white/5 text-[11px] text-slate-200 italic mt-1">
                      «{chk.player_comment}»
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Модальне вікно з 6-значним PIN для показу лікарю ОДИН раз */}
      {generatedPin && (
        <OneTimePinModal
          isOpen={resetModalOpen}
          onClose={() => setResetModalOpen(false)}
          playerName={playerName}
          pin={generatedPin}
          portalToken={currentToken}
          title="Новий PIN-код згенеровано!"
        />
      )}
    </>
  );
}
