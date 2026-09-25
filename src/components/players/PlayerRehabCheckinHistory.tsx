"use client";

import React, { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import { setPlayerPinAction } from "@/actions/rehab-portal-action";
import type { RehabCheckinData } from "@/types/rehab-portal";

export default function PlayerRehabCheckinHistory({
  playerId,
  playerName,
  dateOfBirth,
  currentPin,
  checkins,
}: {
  playerId: string;
  playerName: string;
  dateOfBirth?: string;
  currentPin?: string;
  checkins: RehabCheckinData[];
}) {
  const [pin, setPin] = useState(currentPin || (dateOfBirth ? dateOfBirth.split("-").slice(1).reverse().join("") : "0000"));
  const [newPin, setNewPin] = useState("");
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setPinFeedback("PIN має містити рівно 4 цифри");
      return;
    }

    setPinFeedback(null);
    startTransition(async () => {
      const res = await setPlayerPinAction(playerId, newPin);
      if (res.success) {
        setPin(newPin);
        setIsEditingPin(false);
        setPinFeedback("PIN успішно збережено!");
        setTimeout(() => setPinFeedback(null), 3000);
      } else {
        setPinFeedback(res.error || "Помилка збереження");
      }
    });
  };

  return (
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
              Самозвіти футболіста з телефону (біль ВАШ, набряк, ЛФК)
            </p>
          </div>
        </div>

        {/* PIN management */}
        <div className="flex items-center gap-2">
          {!isEditingPin ? (
            <div className="flex items-center gap-2 bg-slate-950/70 px-3 py-1.5 rounded-xl border border-sky-500/20">
              <span className="text-[10px] text-slate-400">Особистий PIN:</span>
              <span className="font-mono font-bold text-sky-400 text-xs tracking-wider">
                {pin}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewPin(pin);
                  setIsEditingPin(true);
                }}
                className="text-[10px] text-slate-400 hover:text-white ml-1 underline"
              >
                Змінити
              </button>
            </div>
          ) : (
            <form onSubmit={handleSavePin} className="flex items-center gap-1.5">
              <input
                type="text"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="4 цифри"
                className="w-20 bg-slate-950 border border-sky-500/40 rounded-lg px-2 py-1 text-center font-mono text-xs text-white"
              />
              <button
                type="submit"
                disabled={isPending}
                className="px-2.5 py-1 bg-sky-500 text-white rounded-lg text-[10px] font-bold"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setIsEditingPin(false)}
                className="px-2 py-1 text-slate-400 hover:text-white text-[10px]"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </div>

      {pinFeedback && (
        <div className="text-[11px] text-sky-300 bg-sky-950/40 p-2 rounded-lg border border-sky-500/20">
          {pinFeedback}
        </div>
      )}

      {/* Checkins List */}
      <div className="space-y-2">
        {checkins.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-white/10 text-xs text-slate-500">
            Гравець ще не вносив щоденних звітів з телефону. Надайте йому PIN-код (<strong>{pin}</strong>) для входу на сторінці <Link href="/rehab-portal" className="text-sky-400 hover:underline">/rehab-portal</Link>.
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
                    chk.vas_score >= 7
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                      : chk.vas_score >= 4
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  }`}>
                    Біль ВАШ: {chk.vas_score}/10
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-300 pt-1">
                  <div>
                    <span className="text-slate-500">Набряк: </span>
                    <span className="font-semibold">{chk.swelling === "none" ? "Немає" : chk.swelling === "mild" ? "Легкий" : "Помірний/Сильний"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Скутість: </span>
                    <span className="font-semibold">{chk.stiffness_minutes ? `${chk.stiffness_minutes} хв` : "Немає"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">ЛФК вправи: </span>
                    <span className="font-semibold text-emerald-400">
                      {chk.exercises_completed === "full" ? "✅ Повністю" : chk.exercises_completed === "partial" ? "🟡 Частково" : "❌ Не виконав"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Сон / Втома: </span>
                    <span className="font-semibold">{chk.sleep_quality}/5 · {chk.fatigue_level}/5</span>
                  </div>
                </div>

                {chk.player_comment && (
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-sky-500/20 text-[11px] text-slate-200 mt-1">
                    <strong className="text-sky-300">Коментар гравця: </strong>
                    «{chk.player_comment}»
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
