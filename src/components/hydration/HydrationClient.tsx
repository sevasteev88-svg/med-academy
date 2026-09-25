"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  type HydrationSession,
  type UrineColorLevel,
  ARMSTRONG_URINE_SCALE,
  calculateHydrationMetrics,
} from "@/types/hydration";
import { saveHydrationAction } from "@/actions/save-hydration-action";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  team_name: string;
};

type Props = {
  players: Player[];
  recentSessions: HydrationSession[];
};

export default function HydrationClient({ players, recentSessions }: Props) {
  const [sessions, setSessions] = useState<HydrationSession[]>(recentSessions);
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? "");
  const [sessionName, setSessionName] = useState("Інтенсивне командне тренування");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [temperature, setTemperature] = useState(26);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const [weightBefore, setWeightBefore] = useState(72.5);
  const [weightAfter, setWeightAfter] = useState(71.2);
  const [fluidConsumed, setFluidConsumed] = useState(1.0);
  const [urineColor, setUrineColor] = useState<UrineColorLevel>(3);
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const preview = calculateHydrationMetrics({
    weightBefore,
    weightAfter,
    fluidConsumedLiters: fluidConsumed,
    durationMinutes,
  });

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayerId) return;

    startTransition(async () => {
      const res = await saveHydrationAction({
        playerId: selectedPlayerId,
        date,
        sessionName,
        durationMinutes,
        temperatureCelsius: temperature,
        weightBeforeKg: Number(weightBefore),
        weightAfterKg: Number(weightAfter),
        fluidConsumedLiters: Number(fluidConsumed),
        urineColorBefore: urineColor,
        notes: notes.trim() || null,
      });

      if (res.session) {
        setSessions([res.session, ...sessions]);
        setMsg(`Дані гідратації збережено для ${selectedPlayer?.last_name}! Потрібно випити ${res.session.recommended_fluid_replacement_ml} мл електролітів.`);
        setTimeout(() => setMsg(null), 4000);
      }
    });
  };

  const severeCount = sessions.filter((s) => s.status === "severe_dehydration").length;
  const mildCount = sessions.filter((s) => s.status === "mild_dehydration").length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/90 border border-blue-900/25 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase font-bold text-slate-400">Всього зважувань</div>
            <div className="text-2xl font-black text-white font-mono">{sessions.length}</div>
            <div className="text-xs text-slate-500">Зафіксованих сесій</div>
          </div>
          <span className="text-3xl">⚖️</span>
        </div>

        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase font-bold text-amber-400">Помірна дегідратація</div>
            <div className="text-2xl font-black text-amber-300 font-mono">{mildCount}</div>
            <div className="text-xs text-amber-500/80">Втрата 1.0% – 1.9% маси тіла</div>
          </div>
          <span className="text-3xl">⚠️</span>
        </div>

        <div className="bg-red-950/20 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase font-bold text-red-400">Критичне зневоднення</div>
            <div className="text-2xl font-black text-red-400 font-mono">{severeCount}</div>
            <div className="text-xs text-red-500/80">Втрата ≥ 2.0% (ризик судом/травм)</div>
          </div>
          <span className="text-3xl">🛑</span>
        </div>
      </div>

      {msg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 p-4 rounded-xl text-xs font-semibold">
          {msg}
        </div>
      )}

      {/* Main Grid: Form + History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-5 bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-blue-900/20 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>💧</span> Зважування та розрахунок потовиділення (Sweat Rate)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Втрата маси тіла та необхідний об'єм регідратації
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Футболіст
              </label>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2.5 text-white font-bold"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.last_name} {p.first_name} ({p.team_name} · {p.position})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Дата
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Тривалість (хв)
                </label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Вага ДО тренування (кг) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={weightBefore}
                  onChange={(e) => setWeightBefore(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Вага ПІСЛЯ тренування (кг) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={weightAfter}
                  onChange={(e) => setWeightAfter(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Випита рідина під час сесії (л)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={fluidConsumed}
                  onChange={(e) => setFluidConsumed(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                  Температура повітря (°C)
                </label>
                <input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-white font-mono"
                />
              </div>
            </div>

            {/* Armstrong Urine Scale */}
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1.5">
                Колір сечі перед тренуванням (Armstrong Scale):
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {(Object.entries(ARMSTRONG_URINE_SCALE) as any).map(([score, item]: any) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setUrineColor(Number(score) as UrineColorLevel)}
                    className={`h-10 rounded-lg border-2 flex items-center justify-center font-mono font-bold text-xs text-slate-900 transition-all ${
                      urineColor === Number(score)
                        ? "border-white scale-105 shadow-md"
                        : "border-transparent opacity-85 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: item.color }}
                  >
                    {score}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Обрано: <strong>{ARMSTRONG_URINE_SCALE[urineColor].label}</strong>
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-blue-900/30 space-y-2">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                Результати аналізу гідратації:
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  Втрата ваги: <strong className="text-white">{preview.weightLossKg} кг</strong> ({preview.weightLossPct}%)
                </div>
                <div>
                  Sweat Rate: <strong className="text-white">{preview.sweatRateLph} л/год</strong>
                </div>
              </div>

              <div className="pt-2 border-t border-blue-900/20 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400">Рекомендовано випити:</div>
                  <div className="text-sm font-black text-brand-blue font-mono">
                    {preview.replacementMl} мл
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded text-[10px] font-bold border ${
                    preview.status === "severe_dehydration"
                      ? "bg-red-500/20 text-red-300 border-red-500/40"
                      : preview.status === "mild_dehydration"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  }`}
                >
                  {preview.status === "severe_dehydration"
                    ? "🛑 Дегідратація ≥ 2%"
                    : preview.status === "mild_dehydration"
                    ? "⚠️ Помірна дегідратація"
                    : "🟢 Норма (Оптимум)"}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg shadow-blue-900/40"
            >
              {isPending ? "Збереження..." : "💾 Зафіксувати сесію зважування"}
            </button>
          </form>
        </div>

        {/* History Column */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
            <h3 className="text-sm font-bold text-white">Журнал зважувань та потовиділення</h3>
            <span className="text-xs text-slate-500">{sessions.length} записів</span>
          </div>

          {sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Ще немає записів контролю ваги до/після тренування.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {sessions.map((s) => {
                const player = players.find((p) => p.id === s.player_id);
                const pName = player ? `${player.last_name} ${player.first_name}` : s.player_id;
                return (
                  <div
                    key={s.id}
                    className="bg-slate-950/60 border border-blue-900/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-blue-700/30 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{pName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {player?.team_name ?? "Академія"}
                        </span>
                      </div>
                      <div className="text-slate-400 font-mono text-[11px] flex flex-wrap gap-2">
                        <span>ДО: {s.weight_before_kg} кг</span>
                        <span>→ ПІСЛЯ: {s.weight_after_kg} кг</span>
                        <span className="text-red-400 font-bold">(-{s.weight_loss_kg} кг, {s.weight_loss_pct}%)</span>
                        <span>· Sweat: {s.sweat_rate_liters_per_hour} л/год</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:flex-col sm:items-end shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500">Регідратація:</div>
                        <div className="font-mono font-bold text-brand-blue">
                          +{s.recommended_fluid_replacement_ml} мл
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">{s.date}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
