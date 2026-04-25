"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import {
  addAnthropometryAction,
  type AddAnthroState,
} from "@/actions/add-anthropometry-action";
import Card from "@/components/ui/Card";

type Measurement = { id: string; date: string; height: number; weight: number };

const inputClass = "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function AnthropometrySection({
  playerId, measurements,
}: {
  playerId: string; measurements: Measurement[];
}) {
  const [state, formAction, isPending] = useActionState<AddAnthroState, FormData>(addAnthropometryAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  const sorted = [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const heightDelta = last && prev ? +(last.height - prev.height).toFixed(1) : null;
  const weightDelta = last && prev ? +(last.weight - prev.weight).toFixed(1) : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Антропометрія</h2>
        <button onClick={() => setShowForm(!showForm)} className="text-xs font-semibold text-brand-blue hover:text-brand-blue-light transition-colors">
          {showForm ? "Сховати" : "+ Додати замір"}
        </button>
      </div>

      {last && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Зріст</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold font-mono text-white">{last.height}</span>
              <span className="text-xs text-slate-500">см</span>
              {heightDelta !== null && (
                <span className={`text-xs font-semibold ${heightDelta > 0 ? "text-status-ok" : heightDelta < 0 ? "text-status-danger" : "text-slate-500"}`}>
                  {heightDelta > 0 ? "+" : ""}{heightDelta}
                </span>
              )}
            </div>
          </Card>
          <Card>
            <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-1">Вага</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold font-mono text-white">{last.weight}</span>
              <span className="text-xs text-slate-500">кг</span>
              {weightDelta !== null && (
                <span className={`text-xs font-semibold ${weightDelta > 0 ? "text-status-warn" : weightDelta < 0 ? "text-status-ok" : "text-slate-500"}`}>
                  {weightDelta > 0 ? "+" : ""}{weightDelta}
                </span>
              )}
            </div>
          </Card>
        </div>
      )}

      {showForm && (
        <Card>
          <form ref={formRef} action={formAction} className="space-y-3">
            <input type="hidden" name="playerId" value={playerId} />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Дата *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Зріст (см) *</label>
                <input name="height" type="number" step="0.1" min="100" max="220" required placeholder="175.0" defaultValue={last?.height} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Вага (кг) *</label>
                <input name="weight" type="number" step="0.1" min="30" max="150" required placeholder="70.0" defaultValue={last?.weight} className={inputClass} />
              </div>
            </div>
            {state.error && <div className="text-xs text-status-danger">{state.error}</div>}
            {state.success && <div className="text-xs text-status-ok">Замір збережено</div>}
            <button type="submit" disabled={isPending} className="bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              {isPending ? "Зберігаємо..." : "Зберегти"}
            </button>
          </form>
        </Card>
      )}

      {sorted.length >= 2 && (
        <Card>
          <div className="text-xs text-slate-500 mb-3 font-semibold">Динаміка за {sorted.length} замірів</div>
          <MiniChart data={sorted} />
        </Card>
      )}

      {sorted.length > 0 && (
        <Card>
          <div className="text-xs text-slate-500 mb-3 font-semibold">Історія замірів</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-600 border-b border-blue-900/15">
                  <th className="text-left py-2 pr-4">Дата</th>
                  <th className="text-right py-2 px-4">Зріст (см)</th>
                  <th className="text-right py-2 px-4">Вага (кг)</th>
                  <th className="text-right py-2 pl-4">ІМТ</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((m) => {
                  const bmi = (m.weight / (m.height / 100) ** 2).toFixed(1);
                  return (
                    <tr key={m.id} className="border-b border-blue-900/10 last:border-0">
                      <td className="py-2 pr-4 text-slate-300">{new Date(m.date).toLocaleDateString("uk-UA")}</td>
                      <td className="py-2 px-4 text-right text-white font-mono">{m.height}</td>
                      <td className="py-2 px-4 text-right text-white font-mono">{m.weight}</td>
                      <td className="py-2 pl-4 text-right text-slate-400 font-mono">{bmi}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {sorted.length === 0 && (
        <Card><p className="text-slate-500 text-center py-4 text-sm">Замірів ще немає. Натисніть «+ Додати замір».</p></Card>
      )}
    </section>
  );
}

function MiniChart({ data }: { data: Measurement[] }) {
  const W = 600, H = 180;
  const PAD = { top: 10, right: 50, bottom: 30, left: 10 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  if (data.length < 2) return null;
  const heights = data.map(d => d.height), weights = data.map(d => d.weight);
  const hMin = Math.min(...heights) - 1, hMax = Math.max(...heights) + 1;
  const wMin = Math.min(...weights) - 1, wMax = Math.max(...weights) + 1;
  function xPos(i: number) { return PAD.left + (i / (data.length - 1)) * plotW; }
  function yH(v: number) { return PAD.top + plotH - ((v - hMin) / (hMax - hMin)) * plotH; }
  function yW(v: number) { return PAD.top + plotH - ((v - wMin) / (wMax - wMin)) * plotH; }
  const heightPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yH(d.height)}`).join(" ");
  const weightPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yW(d.weight)}`).join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 400 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PAD.left} y1={PAD.top + plotH * (1 - t)} x2={PAD.left + plotW} y2={PAD.top + plotH * (1 - t)} stroke="#1e293b" strokeWidth="0.5" />
        ))}
        <path d={heightPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => <circle key={`h-${i}`} cx={xPos(i)} cy={yH(d.height)} r="3" fill="#3b82f6" />)}
        <path d={weightPath} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
        {data.map((d, i) => <circle key={`w-${i}`} cx={xPos(i)} cy={yW(d.weight)} r="3" fill="#a855f7" />)}
        {data.map((d, i) => (
          <text key={`d-${i}`} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#64748b">
            {new Date(d.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })}
          </text>
        ))}
        <line x1={W - 44} y1={12} x2={W - 28} y2={12} stroke="#3b82f6" strokeWidth="2" />
        <text x={W - 24} y={15} fontSize="10" fill="#3b82f6">см</text>
        <line x1={W - 44} y1={26} x2={W - 28} y2={26} stroke="#a855f7" strokeWidth="2" strokeDasharray="4 2" />
        <text x={W - 24} y={29} fontSize="10" fill="#a855f7">кг</text>
      </svg>
    </div>
  );
}
