"use client";

import { useState, useTransition } from "react";
import { saveAnthropometryWithPhv } from "@/actions/save-anthropometry-action";
import {
  GROWTH_PHASE_LABELS,
  RISK_ZONE_LABELS,
  METHOD_LABELS,
  PHASE_TYPICAL_INJURIES,
  RECOMMENDED_AGE_RANGE,
  type RiskZone,
  type MethodName,
  type PhvResult,
} from "@/lib/phv-calculator";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  sex: string;
  date_of_birth: string;
};

// Вік на дату виміру (десятковий)
function ageAt(dob: string, date: string): number {
  return (new Date(date).getTime() - new Date(dob).getTime()) / (365.25 * 86400000);
}

export default function AnthropometryForm({ players }: { players: Player[] }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PhvResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSittingHeight, setHasSittingHeight] = useState(true);
  const [computePhv, setComputePhv] = useState(true);

  const [form, setForm] = useState({
    playerId: "",
    date: new Date().toISOString().slice(0, 10),
    height: "",
    weight: "",
    sittingHeight: "",
    bodyFat: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const selectedPlayer = players.find((p) => p.id === form.playerId);

  // Предзаповнення галочки PHV: вкл якщо вік на дату виміру ≤ 16
  function syncPhvByAge(playerId: string, date: string) {
    const pl = players.find((p) => p.id === playerId);
    if (!pl) return;
    setComputePhv(ageAt(pl.date_of_birth, date) <= 16);
  }

  function handlePlayerOrDate(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    handleChange(e);
    const next = { ...form, [e.target.name]: e.target.value };
    syncPhvByAge(next.playerId, next.date);
  }

  function handleSubmit() {
    setError(null);
    setResult(null);

    if (!form.playerId || !form.height) {
      setError("Мінімум: оберіть гравця та введіть зріст");
      return;
    }

    const height = parseFloat(form.height);
    const weight = form.weight ? parseFloat(form.weight) : 0;
    const sittingHeight =
      computePhv && hasSittingHeight && form.sittingHeight
        ? parseFloat(form.sittingHeight)
        : null;
    const bodyFatPct = form.bodyFat ? parseFloat(form.bodyFat) : null;

    if (sittingHeight != null && sittingHeight >= height) {
      setError("Зріст сидячи має бути менший за загальний зріст");
      return;
    }

    startTransition(async () => {
      const res = await saveAnthropometryWithPhv({
        playerId: form.playerId,
        date: form.date,
        height,
        weight,
        bodyFatPct,
        sittingHeight,
        computePhv,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.data?.phvResult) {
        setResult(res.data.phvResult);
      } else {
        setError(null);
        setResult(null);
      }
    });
  }

  const riskBorder: Record<RiskZone, string> = {
    green: "border-status-ok bg-status-ok/5",
    yellow: "border-status-warn bg-status-warn/5",
    red: "border-status-danger bg-status-danger/5",
  };

  return (
    <div className="space-y-6">
      {/* Форма */}
      <div className="bg-surface rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-bold text-white mb-4">
          Антропометричний вимір
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Гравець */}
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Гравець</label>
            <select
              name="playerId"
              value={form.playerId}
              onChange={handlePlayerOrDate}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
            >
              <option value="">Оберіть гравця…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.last_name} {p.first_name} ({p.sex === "male" ? "хл." : "дів."})
                </option>
              ))}
            </select>
          </div>

          {/* Рекомендований діапазон */}
          {selectedPlayer && (
            <div className="md:col-span-2 text-xs text-gray-500">
              Рекомендований вік для{" "}
              {selectedPlayer.sex === "male" ? "хлопців" : "дівчат"}:{" "}
              {RECOMMENDED_AGE_RANGE[selectedPlayer.sex as "male" | "female"].min}–
              {RECOMMENDED_AGE_RANGE[selectedPlayer.sex as "male" | "female"].max} років
            </div>
          )}

          {/* Дата */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Дата</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handlePlayerOrDate}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>

          {/* Зріст */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Зріст (см) <span className="text-status-danger">*</span>
            </label>
            <input
              type="number"
              name="height"
              value={form.height}
              onChange={handleChange}
              placeholder="168.5"
              step="0.1"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>

          {/* Вага */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Вага (кг)</label>
            <input
              type="number"
              name="weight"
              value={form.weight}
              onChange={handleChange}
              placeholder="58.0"
              step="0.1"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>

          {/* % жиру (Tanita) */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">% жиру (Tanita)</label>
            <input
              type="number"
              name="bodyFat"
              value={form.bodyFat}
              onChange={handleChange}
              placeholder="12.5"
              step="0.1"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
            />
          </div>

          {/* Галочка PHV */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={computePhv}
                onChange={(e) => setComputePhv(e.target.checked)}
                className="rounded"
              />
              Розрахувати PHV
              {selectedPlayer && (
                <span className="text-xs text-gray-600">
                  (вік на дату виміру: {ageAt(selectedPlayer.date_of_birth, form.date).toFixed(1)} р.)
                </span>
              )}
            </label>
            {!computePhv && (
              <p className="text-[10px] text-gray-600 mt-1">
                PHV найточніший для віку ≤16 р. Для старших вимикається — зберігається лише вимір.
              </p>
            )}
          </div>

          {/* Зріст сидячи — лише коли рахуємо PHV */}
          {computePhv && (
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400">Зріст сидячи (см)</label>
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasSittingHeight}
                    onChange={(e) => setHasSittingHeight(e.target.checked)}
                    className="rounded"
                  />
                  Виміряно
                </label>
              </div>
              {hasSittingHeight ? (
                <input
                  type="number"
                  name="sittingHeight"
                  value={form.sittingHeight}
                  onChange={handleChange}
                  placeholder="86.0"
                  step="0.1"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-brand-blue focus:outline-none"
                />
              ) : (
                <div className="text-xs text-gray-600 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                  Без зросту сидячи працює тільки Moore-2 (хлопці) та Moore-1 (дівчата).
                  Для повної оцінки рекомендуємо вимірювати.
                </div>
              )}
              {hasSittingHeight && (
                <p className="text-[10px] text-gray-600 mt-1">
                  Вимірюється сидячи на антропометрі, спина пряма, стегна горизонтально
                </p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="mt-6 bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg shadow-brand-blue/20"
        >
          {isPending ? "Збереження…" : computePhv ? "Зберегти та розрахувати PHV" : "Зберегти вимір"}
        </button>

        {error && <p className="mt-3 text-sm text-status-danger">{error}</p>}
      </div>

      {/* Результат */}
      {result && (
        <div className={`rounded-xl border-2 p-6 ${riskBorder[result.riskZone]}`}>
          <h3 className="text-lg font-bold text-white mb-4">
            Результат мультиметодної оцінки
          </h3>

          {/* Консенсус */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-xs text-gray-400">Вік</div>
              <div className="text-xl font-mono text-white">
                {result.ageAtMeasurement.toFixed(1)} р.
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Consensus Offset</div>
              <div className="text-xl font-mono text-white">
                {result.consensusOffset > 0 ? "+" : ""}
                {result.consensusOffset.toFixed(2)} р.
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">PHV вік (орієнт.)</div>
              <div className="text-xl font-mono text-white">
                {result.consensusPhvAge.toFixed(1)} р.
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Фаза</div>
              <div className="text-xl text-white">
                {GROWTH_PHASE_LABELS[result.growthPhase]}
              </div>
            </div>
          </div>

          {/* Порівняння методів */}
          <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
            <div className="text-xs text-gray-500 mb-2 font-medium">
              Порівняння методів:
            </div>
            {result.methods.map((m) => (
              <div
                key={m.method}
                className="flex justify-between items-center text-sm py-1"
              >
                <div>
                  <span className="text-gray-300">
                    {METHOD_LABELS[m.method as MethodName]}
                  </span>
                  <span className="text-gray-600 ml-2 text-xs">
                    SEE ±{m.see}р.
                  </span>
                </div>
                <div className="font-mono text-gray-200">
                  offset {m.offset > 0 ? "+" : ""}
                  {m.offset.toFixed(2)} · PHV {m.estimatedPhvAge.toFixed(1)}р.
                </div>
              </div>
            ))}
            {result.methods.length > 1 && (
              <div className="flex justify-between items-center text-sm py-1 border-t border-gray-700 mt-1 pt-2 font-medium">
                <span className="text-white">Зважений консенсус</span>
                <span className="font-mono text-white">
                  offset {result.consensusOffset > 0 ? "+" : ""}
                  {result.consensusOffset.toFixed(2)} · PHV{" "}
                  {result.consensusPhvAge.toFixed(1)}р.
                </span>
              </div>
            )}
          </div>

          {/* Ризик */}
          <div className="mb-4">
            <span className="text-sm text-gray-400">Зона ризику: </span>
            <span className="font-bold text-white">
              {RISK_ZONE_LABELS[result.riskZone]}
            </span>
          </div>

          {result.riskFactors.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-gray-400 mb-1">Фактори:</div>
              {result.riskFactors.map((f, i) => (
                <div key={i} className="text-sm text-gray-300">• {f}</div>
              ))}
            </div>
          )}

          {/* Типові патології */}
          <div className="border-t border-gray-700/50 pt-3 mt-3">
            <div className="text-sm text-gray-400 mb-1">
              Типові патології ({GROWTH_PHASE_LABELS[result.growthPhase]}):
            </div>
            {PHASE_TYPICAL_INJURIES[result.growthPhase].map((inj, i) => (
              <div key={i} className="text-xs text-gray-500">• {inj}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}