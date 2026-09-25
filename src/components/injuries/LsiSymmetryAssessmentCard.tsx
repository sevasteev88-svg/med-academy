"use client";

import { useState, useTransition } from "react";
import type { LsiAssessmentRecord, LsiTestType, LsiTestItemResult } from "@/types/lsi";
import { LSI_TEST_DEFINITIONS, calculateLsiScore } from "@/types/lsi";
import { saveLsiAssessmentAction } from "@/actions/save-lsi-assessment-action";

type Props = {
  playerId: string;
  injuryId?: string | null;
  playerName: string;
  initialRecords: LsiAssessmentRecord[];
};

export default function LsiSymmetryAssessmentCard({
  playerId,
  injuryId,
  playerName,
  initialRecords,
}: Props) {
  const [records, setRecords] = useState<LsiAssessmentRecord[]>(initialRecords);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form Fields
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [testedLimb, setTestedLimb] = useState<"left" | "right">("right");
  const [evaluatorName, setEvaluatorName] = useState("Медичний штаб ФК Чорноморець");
  const [phaseClearance, setPhaseClearance] = useState("Фаза 4 -> Фаза 5 (Match Fitness Clearance)");
  const [doctorVerdict, setDoctorVerdict] = useState("");
  const [notes, setNotes] = useState("");

  // Test values: mapping test_type to { injured: number, uninjured: number }
  const [testValues, setTestValues] = useState<
    Record<LsiTestType, { injured: string; uninjured: string; enabled: boolean }>
  >({
    single_leg_hop: { injured: "165", uninjured: "172", enabled: true },
    triple_hop: { injured: "490", uninjured: "515", enabled: true },
    crossover_hop: { injured: "", uninjured: "", enabled: false },
    timed_hop_6m: { injured: "", uninjured: "", enabled: false },
    y_balance_composite: { injured: "96", uninjured: "98", enabled: true },
    quadriceps_dynamometry: { injured: "48", uninjured: "52", enabled: true },
    hamstring_dynamometry: { injured: "32", uninjured: "34", enabled: true },
    adductor_squeeze: { injured: "210", uninjured: "220", enabled: false },
  });

  const [isPending, startTransition] = useTransition();

  // Calculate live results for enabled tests
  const calculatedTestResults: LsiTestItemResult[] = Object.entries(testValues)
    .filter(([_, data]) => data.enabled && Number(data.uninjured) > 0 && Number(data.injured) > 0)
    .map(([testKey, data]) => {
      const type = testKey as LsiTestType;
      const def = LSI_TEST_DEFINITIONS[type];
      const inj = parseFloat(data.injured) || 0;
      const uninj = parseFloat(data.uninjured) || 0;
      const isTimed = type === "timed_hop_6m";
      const { lsi, deficit, passed } = calculateLsiScore(inj, uninj, isTimed);

      return {
        test_type: type,
        test_name: def.name,
        injured_limb_value: inj,
        uninjured_limb_value: uninj,
        unit: def.unit,
        lsi_percent: lsi,
        deficit_percent: deficit,
        passed,
      };
    });

  // Calculate overall composite LSI %
  const overallLsi =
    calculatedTestResults.length > 0
      ? Math.round(
          (calculatedTestResults.reduce((acc, t) => acc + t.lsi_percent, 0) /
            calculatedTestResults.length) *
            10
        ) / 10
      : 0;

  // Determine FIFA clearance status
  const overallStatus =
    overallLsi >= 90 && calculatedTestResults.every((t) => t.lsi_percent >= 85)
      ? "cleared"
      : overallLsi >= 80
      ? "conditional"
      : "high_risk";

  const handleToggleTest = (type: LsiTestType) => {
    setTestValues((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        enabled: !prev[type].enabled,
      },
    }));
  };

  const handleValueChange = (type: LsiTestType, field: "injured" | "uninjured", val: string) => {
    setTestValues((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: val,
      },
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (calculatedTestResults.length === 0) return;

    startTransition(async () => {
      const res = await saveLsiAssessmentAction({
        player_id: playerId,
        injury_id: injuryId || null,
        date,
        tested_limb: testedLimb,
        evaluator_name: evaluatorName,
        phase_clearance: phaseClearance,
        tests: calculatedTestResults,
        overall_lsi_percent: overallLsi,
        status: overallStatus,
        doctor_verdict:
          doctorVerdict ||
          (overallStatus === "cleared"
            ? "Допущено до повних тренувань у загальній групі (FIFA LSI ≥ 90%)"
            : overallStatus === "conditional"
            ? "Умовний допуск з обмеженням ударів та максимального спринту"
            : "Високий дефіцит симетрії (>20%). Ризик повторної травми! Продовжити ізольоване зміцнення."),
        notes,
      });

      if (res.success && res.record) {
        setRecords((prev) => [res.record!, ...prev]);
        setIsFormOpen(false);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-slate-900/60 backdrop-blur-xl p-5 md:p-6 shadow-xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚖️</span>
            <h3 className="text-lg md:text-xl font-black text-white tracking-wide">
              Тестування симетрії сили та стрибка (LSI & Динамометрія)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              FIFA PROTOCOL
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Limb Symmetry Index: порівняння травмованої/оперованої кінцівки зі здоровою. Критерій допуску до гри: LSI ≥ 90% (дефіцит &lt; 10%).
          </p>
        </div>

        <button
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
        >
          <span>{isFormOpen ? "✕ Закрити" : "➕ Провести LSI тест"}</span>
        </button>
      </div>

      {/* FORM: NEW ASSESSMENT */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="p-5 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📋</span> Протокол функціонального LSI тестування ({playerName})
            </h4>
            <span className="text-xs text-slate-400 font-mono">FIFA Medical Consensus</span>
          </div>

          {/* Test Meta Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Дата тестування:</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Травмована кінцівка:</label>
              <select
                value={testedLimb}
                onChange={(e) => setTestedLimb(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="right">Права нога (Травмована / Оперована)</option>
                <option value="left">Ліва нога (Травмована / Оперована)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Етап RTP тесту:</label>
              <input
                type="text"
                value={phaseClearance}
                onChange={(e) => setPhaseClearance(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Battery of Tests Selection & Inputs */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Батарея функціональних тестів та динамометрії:
            </div>

            <div className="space-y-2.5">
              {(Object.keys(LSI_TEST_DEFINITIONS) as LsiTestType[]).map((type) => {
                const def = LSI_TEST_DEFINITIONS[type];
                const item = testValues[type];
                const inj = parseFloat(item.injured) || 0;
                const uninj = parseFloat(item.uninjured) || 0;
                const isTimed = type === "timed_hop_6m";
                const { lsi, passed } = calculateLsiScore(inj, uninj, isTimed);

                return (
                  <div
                    key={type}
                    className={`p-3 rounded-xl border transition-all ${
                      item.enabled
                        ? "bg-slate-900/90 border-slate-700"
                        : "bg-slate-950/40 border-slate-800/40 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleTest(type)}
                          className="rounded border-slate-700 text-sky-500 focus:ring-0"
                        />
                        <div>
                          <span className="text-xs font-bold text-white">{def.name}</span>
                          <span className="text-[11px] text-slate-500 block">{def.benchmark}</span>
                        </div>
                      </label>

                      {item.enabled && (
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                          {/* Injured limb input */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-rose-400 font-semibold">
                              {testedLimb === "right" ? "Пр (Травм):" : "Лів (Травм):"}
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="0"
                              value={item.injured}
                              onChange={(e) => handleValueChange(type, "injured", e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-mono focus:border-sky-500"
                            />
                            <span className="text-[11px] text-slate-400">{def.unit}</span>
                          </div>

                          {/* Uninjured limb input */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-emerald-400 font-semibold">
                              {testedLimb === "right" ? "Лів (Здор):" : "Пр (Здор):"}
                            </span>
                            <input
                              type="number"
                              step="0.1"
                              placeholder="0"
                              value={item.uninjured}
                              onChange={(e) => handleValueChange(type, "uninjured", e.target.value)}
                              className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-mono focus:border-sky-500"
                            />
                            <span className="text-[11px] text-slate-400">{def.unit}</span>
                          </div>

                          {/* Live LSI Indicator */}
                          {uninj > 0 && inj > 0 && (
                            <div
                              className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold border ${
                                passed
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : lsi >= 80
                                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              }`}
                            >
                              LSI: {lsi}%
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Composite Summary Gauge & Verdict */}
          {calculatedTestResults.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Загальний композитний індекс симетрії:</div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span
                      className={`text-3xl font-black ${
                        overallStatus === "cleared"
                          ? "text-emerald-400"
                          : overallStatus === "conditional"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {overallLsi}%
                    </span>
                    <span className="text-xs text-slate-400">
                      (Дефіцит: {Math.round((100 - overallLsi) * 10) / 10}%)
                    </span>
                  </div>
                </div>

                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    overallStatus === "cleared"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : overallStatus === "conditional"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  }`}
                >
                  <span>{overallStatus === "cleared" ? "✓" : overallStatus === "conditional" ? "⚠️" : "🛑"}</span>
                  <span>
                    {overallStatus === "cleared"
                      ? "CLEARED: Допущено (LSI ≥ 90%)"
                      : overallStatus === "conditional"
                      ? "CONDITIONAL: Дефіцит 10-20%"
                      : "HIGH RISK: Заборонено (Дефіцит > 20%)"}
                  </span>
                </div>
              </div>

              {/* Progress bar visualizer */}
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden flex border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
                    overallStatus === "cleared"
                      ? "bg-emerald-500"
                      : overallStatus === "conditional"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.min(100, overallLsi)}%` }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Клінічний висновок та рекомендації лікаря:
                </label>
                <textarea
                  rows={2}
                  value={doctorVerdict}
                  onChange={(e) => setDoctorVerdict(e.target.value)}
                  placeholder="Вкажіть готовність до контактних єдиноборств, спринтів або додаткові обмеження..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending || calculatedTestResults.length === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-40"
            >
              {isPending ? "Збереження..." : "Зафіксувати протокол LSI"}
            </button>
          </div>
        </form>
      )}

      {/* HISTORICAL RECORDS LIST */}
      {records.length === 0 ? (
        <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          Функціональні LSI тести та динамометрія для цього гравця ще не проводились.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Історія LSI тестувань та динамометрії:
          </div>

          <div className="space-y-3">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-sky-500/30 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-mono text-xs">{rec.date}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-sky-400 font-semibold">
                      {rec.tested_limb === "right" ? "Права кінцівка (Травма)" : "Ліва кінцівка (Травма)"}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400">{rec.phase_clearance}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-300">
                      LSI: <span className="text-white text-sm">{rec.overall_lsi_percent}%</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        rec.status === "cleared"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : rec.status === "conditional"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      }`}
                    >
                      {rec.status === "cleared" ? "✓ Допущено (≥90%)" : rec.status === "conditional" ? "⚠️ Умовно" : "🛑 Дефіцит"}
                    </span>
                  </div>
                </div>

                {/* Subtests Pill Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rec.tests.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="truncate mr-2">
                        <div className="text-slate-300 font-medium truncate">{t.test_name.split("(")[0]}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {t.injured_limb_value} / {t.uninjured_limb_value} {t.unit}
                        </div>
                      </div>
                      <span
                        className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] shrink-0 ${
                          t.passed ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                        }`}
                      >
                        {t.lsi_percent}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Verdict */}
                {rec.doctor_verdict && (
                  <div className="text-xs text-slate-300 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex items-start gap-2">
                    <span className="text-sky-400 shrink-0">💬</span>
                    <span>{rec.doctor_verdict}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
