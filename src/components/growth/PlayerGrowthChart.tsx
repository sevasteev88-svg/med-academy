"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from "recharts";

type Measurement = {
  date: string;
  age: number;
  height: number;
  weight: number;
  sittingHeight: number | null;
  consensusOffset: number | null;
  growthPhase: string | null;
  heightVelocity: number | null;
  weightVelocity: number | null;
  estimatedPhvAge: number | null;
};

type Props = {
  playerName: string;
  sex: string;
  measurements: Measurement[];
  estimatedPhvAge: number | null;
};

type ChartMode = "height" | "velocity" | "maturity";

export default function PlayerGrowthChart({
  playerName,
  sex,
  measurements,
  estimatedPhvAge,
}: Props) {
  const [mode, setMode] = useState<ChartMode>("height");

  if (measurements.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-slate-800 p-6 text-center">
        <p className="text-slate-500 text-sm">
          Немає антропометричних даних для побудови графіку.
          <br />
          Додайте вимір через «📏 Новий вимір».
        </p>
      </div>
    );
  }

  const sorted = [...measurements].sort((a, b) => a.age - b.age);

  const heightData = sorted.map((m) => ({
    age: m.age,
    date: m.date,
    height: m.height,
    weight: m.weight,
    phase: m.growthPhase,
  }));

  const velocityData = sorted
    .filter((m) => m.heightVelocity != null)
    .map((m) => ({
      age: m.age,
      date: m.date,
      heightVelocity: m.heightVelocity,
      weightVelocity: m.weightVelocity,
      phase: m.growthPhase,
    }));

  const maturityData = sorted
    .filter((m) => m.consensusOffset != null)
    .map((m) => ({
      age: m.age,
      date: m.date,
      offset: m.consensusOffset,
      phase: m.growthPhase,
    }));

  const modes: { key: ChartMode; label: string }[] = [
    { key: "height", label: "Зріст / Вага" },
    { key: "velocity", label: "Швидкість росту" },
    { key: "maturity", label: "Матурація" },
  ];

  return (
    <div className="bg-surface rounded-xl border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">{playerName}</h3>
          <p className="text-xs text-slate-500">
            {sex === "male" ? "Хлопець" : "Дівчина"}
            {estimatedPhvAge && (
              <> · Орієнт. вік PHV: {estimatedPhvAge.toFixed(1)} р.</>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === m.key
                  ? "bg-brand-blue text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        {mode === "height" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={heightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="age"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) => `${v}р.`}
              />
              <YAxis
                yAxisId="h"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) => `${v}`}
                label={{ value: "см", position: "insideTopLeft", fill: "#64748b", fontSize: 10 }}
              />
              <YAxis
                yAxisId="w"
                orientation="right"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) => `${v}`}
                label={{ value: "кг", position: "insideTopRight", fill: "#64748b", fontSize: 10 }}
              />
              {estimatedPhvAge && (
                <ReferenceArea
                  x1={estimatedPhvAge - 0.5}
                  x2={estimatedPhvAge + 0.5}
                  yAxisId="h"
                  fill="#eab308"
                  fillOpacity={0.08}
                  label={{ value: "PHV", position: "insideTop", fill: "#eab308", fontSize: 10 }}
                />
              )}
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                labelFormatter={(v) => `Вік: ${v} р.`}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Line yAxisId="h" type="monotone" dataKey="height" name="Зріст (см)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} activeDot={{ r: 6 }} />
              <Line yAxisId="w" type="monotone" dataKey="weight" name="Вага (кг)" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: "#22c55e" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {mode === "velocity" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="age" stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}р.`} />
              <YAxis stroke="#64748b" fontSize={11} label={{ value: "см/рік", position: "insideTopLeft", fill: "#64748b", fontSize: 10 }} />
              {estimatedPhvAge && (
                <ReferenceLine
                  x={estimatedPhvAge}
                  stroke="#eab308"
                  strokeDasharray="5 5"
                  label={{ value: "PHV", position: "top", fill: "#eab308", fontSize: 10 }}
                />
              )}
              <ReferenceLine
                y={8}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{ value: "Поріг ризику (8 см/р)", position: "right", fill: "#ef4444", fontSize: 9 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                labelFormatter={(v) => `Вік: ${v} р.`}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Line type="monotone" dataKey="heightVelocity" name="Δ Зріст (см/рік)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 5, fill: "#f59e0b" }} activeDot={{ r: 7 }} />
              <Line type="monotone" dataKey="weightVelocity" name="Δ Вага (кг/рік)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: "#8b5cf6" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {mode === "maturity" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={maturityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="age" stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}р.`} />
              <YAxis stroke="#64748b" fontSize={11} label={{ value: "Offset (р.)", position: "insideTopLeft", fill: "#64748b", fontSize: 10 }} />
              <ReferenceArea
                y1={-0.5}
                y2={0.5}
                fill="#eab308"
                fillOpacity={0.1}
                label={{ value: "PHV зона", position: "insideRight", fill: "#eab308", fontSize: 10 }}
              />
              <ReferenceLine y={0} stroke="#eab308" strokeDasharray="5 5" />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", fontSize: "12px" }}
                labelFormatter={(v) => `Вік: ${v} р.`}
                formatter={(value) => {
                  const num = typeof value === "number" ? value : Number(value);
                  return [`${num > 0 ? "+" : ""}${num.toFixed(2)} р.`, "Offset"];
                }}
              />
              <Line
                type="monotone"
                dataKey="offset"
                name="Maturity Offset"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  const color =
                    payload.phase === "phv" ? "#eab308"
                    : payload.phase === "post_phv" ? "#22c55e"
                    : "#64748b";
                  return (
                    <circle
                      key={`dot-${payload.age}`}
                      cx={cx} cy={cy} r={6}
                      fill={color} stroke="#0f172a" strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {mode === "maturity" && (
        <div className="flex gap-4 text-xs text-slate-500 justify-center">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Pre-PHV</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> PHV</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Post-PHV</span>
        </div>
      )}

      <details className="text-xs">
        <summary className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
          Всі виміри ({sorted.length})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 border-b border-slate-800">
                <th className="text-left py-1.5 px-2">Дата</th>
                <th className="text-center py-1.5 px-2">Вік</th>
                <th className="text-center py-1.5 px-2">Зріст</th>
                <th className="text-center py-1.5 px-2">Вага</th>
                <th className="text-center py-1.5 px-2">Зр. сид.</th>
                <th className="text-center py-1.5 px-2">Offset</th>
                <th className="text-center py-1.5 px-2">Δ зріст</th>
                <th className="text-center py-1.5 px-2">Фаза</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td className="py-1.5 px-2 text-slate-400">{new Date(m.date).toLocaleDateString("uk-UA")}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-300">{m.age.toFixed(1)}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-300">{m.height}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-300">{m.weight}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-400">{m.sittingHeight ?? "—"}</td>
                  <td className="py-1.5 px-2 text-center font-mono text-slate-300">
                    {m.consensusOffset != null ? `${m.consensusOffset > 0 ? "+" : ""}${m.consensusOffset.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-center font-mono">
                    <span className={m.heightVelocity != null && m.heightVelocity > 8 ? "text-yellow-500" : "text-slate-400"}>
                      {m.heightVelocity?.toFixed(1) ?? "—"}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      m.growthPhase === "phv" ? "bg-yellow-500/20 text-yellow-500"
                      : m.growthPhase === "post_phv" ? "bg-green-500/20 text-green-500"
                      : m.growthPhase === "pre_phv" ? "bg-slate-700 text-slate-400"
                      : "text-slate-600"
                    }`}>
                      {m.growthPhase ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
