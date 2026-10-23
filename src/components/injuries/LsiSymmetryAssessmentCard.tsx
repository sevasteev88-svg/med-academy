"use client";

import { useState, useTransition } from "react";
import type { LsiAssessmentRecord, LsiTestType, LsiTestItemResult } from "@/types/lsi";
import {
  LSI_TEST_DEFINITIONS,
  LSI_THRESHOLDS,
  HQ_RATIO_THRESHOLD,
  DEFAULT_PROTOCOL_SOURCE,
  PROTOCOL_SOURCE_OPTIONS,
  calculateLsiScore,
  calculateHqRatio,
  calculateRelativeStrength,
} from "@/types/lsi";
import { saveLsiAssessmentAction } from "@/actions/save-lsi-assessment-action";
import { INJURY_TYPE_UA } from "@/lib/constants";

type Props = {
  playerId: string;
  injuryId?: string | null;
  playerName: string;
  initialRecords: LsiAssessmentRecord[];
  playerWeightKg?: number | null;
  defaultInjuryType?: string;
  defaultSide?: "left" | "right" | "bilateral";
};

export default function LsiSymmetryAssessmentCard({
  playerId,
  injuryId,
  playerName,
  initialRecords,
  playerWeightKg,
  defaultInjuryType,
  defaultSide,
}: Props) {
  const [records, setRecords] = useState<LsiAssessmentRecord[]>(initialRecords);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form Fields
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [testedLimb, setTestedLimb] = useState<"left" | "right" | "">(
    defaultSide === "left" || defaultSide === "right" ? defaultSide : ""
  );
  const [injuryType, setInjuryType] = useState<string>(defaultInjuryType || "");
  const [protocolSource, setProtocolSource] = useState<string>(DEFAULT_PROTOCOL_SOURCE);
  const [evaluatorName, setEvaluatorName] = useState("Медичний штаб ФК «Чорноморець»");
  const [doctorSignature, setDoctorSignature] = useState("Головний лікар Академії");
  const [phaseClearance, setPhaseClearance] = useState("Фаза 4 -> Фаза 5 (Match Fitness Clearance)");
  const [bodyWeightKgInput, setBodyWeightKgInput] = useState<string>(
    playerWeightKg ? String(playerWeightKg) : ""
  );
  const [doctorVerdict, setDoctorVerdict] = useState("");
  const [notes, setNotes] = useState("");

  // Test values: mapping test_type to { injured: number, uninjured: number, enabled: boolean }
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Parsed body weight
  const currentBodyWeight = parseFloat(bodyWeightKgInput) || (playerWeightKg ?? null);

  // Calculate live results for enabled tests
  const calculatedTestResults: LsiTestItemResult[] = Object.entries(testValues)
    .filter(([_, data]) => data.enabled && Number(data.uninjured) > 0 && Number(data.injured) > 0)
    .map(([testKey, data]) => {
      const type = testKey as LsiTestType;
      const def = LSI_TEST_DEFINITIONS[type];
      const inj = parseFloat(data.injured) || 0;
      const uninj = parseFloat(data.uninjured) || 0;
      const isTimed = type === "timed_hop_6m";
      const { lsi, deficit, threshold, passed } = calculateLsiScore(type, inj, uninj, isTimed);

      const isStrength = type === "quadriceps_dynamometry" || type === "hamstring_dynamometry";
      const injRel = isStrength ? calculateRelativeStrength(inj, currentBodyWeight) : null;
      const uninjRel = isStrength ? calculateRelativeStrength(uninj, currentBodyWeight) : null;

      return {
        test_type: type,
        test_name: def.name,
        injured_limb_value: inj,
        uninjured_limb_value: uninj,
        unit: def.unit,
        lsi_percent: lsi,
        deficit_percent: deficit,
        threshold_percent: threshold,
        passed,
        injured_relative_strength: injRel,
        uninjured_relative_strength: uninjRel,
      };
    });

  // Hamstring / Quad (H/Q) Ratio
  const hasQuadData =
    testValues.quadriceps_dynamometry.enabled &&
    parseFloat(testValues.quadriceps_dynamometry.injured) > 0 &&
    parseFloat(testValues.quadriceps_dynamometry.uninjured) > 0;
  const hasHamData =
    testValues.hamstring_dynamometry.enabled &&
    parseFloat(testValues.hamstring_dynamometry.injured) > 0 &&
    parseFloat(testValues.hamstring_dynamometry.uninjured) > 0;
  const hasHq = hasQuadData && hasHamData;

  const hqInj = hasHq
    ? calculateHqRatio(
        parseFloat(testValues.hamstring_dynamometry.injured),
        parseFloat(testValues.quadriceps_dynamometry.injured)
      )
    : null;
  const hqUninj = hasHq
    ? calculateHqRatio(
        parseFloat(testValues.hamstring_dynamometry.uninjured),
        parseFloat(testValues.quadriceps_dynamometry.uninjured)
      )
    : null;

  // Composite informational LSI %
  const overallLsi =
    calculatedTestResults.length > 0
      ? Math.round(
          (calculatedTestResults.reduce((acc, t) => acc + t.lsi_percent, 0) /
            calculatedTestResults.length) *
            10
        ) / 10
      : 0;

  // Discrete criteria verification
  const failedTests: string[] = [];
  calculatedTestResults.forEach((t) => {
    if (!t.passed) {
      failedTests.push(`${t.test_name}: LSI ${t.lsi_percent}% (поріг ≥ ${t.threshold_percent}%)`);
    }
  });

  if (hasHq && hqInj && !hqInj.passed) {
    failedTests.push(`Співвідношення H/Q (травмована кінцівка): ${hqInj.ratio} (поріг ≥ ${HQ_RATIO_THRESHOLD})`);
  }

  const criteriaMet =
    calculatedTestResults.length > 0 &&
    calculatedTestResults.every((t) => t.passed) &&
    (!hasHq || (hqInj ? hqInj.passed : true));

  const overallStatus = criteriaMet
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
    setErrorMsg(null);

    // Валідація обов'язкових полів: кінцівка та тип травми
    if (!testedLimb) {
      setErrorMsg("Обов'язково оберіть сторону травмованої кінцівки (ліва чи права).");
      return;
    }
    if (!injuryType) {
      setErrorMsg("Обов'язково оберіть тип травми.");
      return;
    }
    if (calculatedTestResults.length === 0) {
      setErrorMsg("Заповніть хоча б один функціональний тест (значення для обох кінцівок).");
      return;
    }

    startTransition(async () => {
      const defaultVerdictText = criteriaMet
        ? "Критерії LSI виконано. Рішення про допуск приймає лікар. Симетрія та показники сили/стрибків у межах цільового коридору."
        : `Критерії LSI не виконано. Рішення про допуск приймає лікар. Виявлено дефіцит у тестах: ${failedTests.join("; ")}.`;

      const res = await saveLsiAssessmentAction({
        player_id: playerId,
        injury_id: injuryId || null,
        injury_type: injuryType,
        date,
        tested_limb: testedLimb,
        evaluator_name: evaluatorName,
        doctor_signature: doctorSignature || "Головний лікар Академії",
        protocol_source: protocolSource,
        phase_clearance: phaseClearance,
        tests: calculatedTestResults,
        overall_lsi_percent: overallLsi,
        criteria_met: criteriaMet,
        failed_tests: failedTests,
        hq_ratio_injured: hqInj ? hqInj.ratio : null,
        hq_ratio_uninjured: hqUninj ? hqUninj.ratio : null,
        hq_ratio_passed: hqInj ? hqInj.passed : null,
        body_weight_kg: currentBodyWeight,
        status: overallStatus,
        doctor_verdict: doctorVerdict || defaultVerdictText,
        notes,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.success && res.record) {
        setRecords((prev) => [res.record!, ...prev]);
        setIsFormOpen(false);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-slate-900/60 backdrop-blur-xl p-5 md:p-6 shadow-xl space-y-6">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-400 hover:text-white px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl">⚖️</span>
            <h3 className="text-lg md:text-xl font-black text-white tracking-wide">
              Тестування симетрії сили та стрибка (LSI)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              Протокол функціонального тестування
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Limb Symmetry Index: порівняння травмованої кінцівки зі здоровою. Рішення про допуск приймає лікар на основі перевірки кожного індивідуального тесту.
          </p>
        </div>

        <button
          onClick={() => {
            setIsFormOpen(!isFormOpen);
            setErrorMsg(null);
          }}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span>{isFormOpen ? "✕ Закрити" : "➕ Провести LSI тест"}</span>
        </button>
      </div>

      {/* FORM: NEW ASSESSMENT */}
      {isFormOpen && (
        <form onSubmit={handleSave} className="p-5 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📋</span> Протокол функціонального тестування ({playerName})
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Джерело:</span>
              <select
                value={protocolSource}
                onChange={(e) => setProtocolSource(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-sky-300 focus:outline-none focus:border-sky-500"
              >
                {PROTOCOL_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Test Meta Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Дата тестування: <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Травмована кінцівка: <span className="text-rose-400 font-bold">*</span>
              </label>
              <select
                value={testedLimb}
                onChange={(e) => setTestedLimb(e.target.value as "left" | "right")}
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                  !testedLimb ? "border-rose-500 ring-1 ring-rose-500/40" : "border-slate-700 focus:border-sky-500"
                }`}
              >
                <option value="">-- Оберіть ногу (Обов'язково) --</option>
                <option value="right">Права нога (Травмована / Оперована)</option>
                <option value="left">Ліва нога (Травмована / Оперована)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Тип травми: <span className="text-rose-400 font-bold">*</span>
              </label>
              <select
                value={injuryType}
                onChange={(e) => setInjuryType(e.target.value)}
                className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                  !injuryType ? "border-rose-500 ring-1 ring-rose-500/40" : "border-slate-700 focus:border-sky-500"
                }`}
              >
                <option value="">-- Оберіть тип травми (Обов'язково) --</option>
                {Object.entries(INJURY_TYPE_UA).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label} ({key})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Маса тіла (кг) для нормування:
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Напр. 72"
                  value={bodyWeightKgInput}
                  onChange={(e) => setBodyWeightKgInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                {playerWeightKg && (
                  <span className="absolute right-2.5 top-2 text-[10px] text-emerald-400 font-mono">
                    Антропометрія: {playerWeightKg} кг
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Evaluator and Phase */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Етап RTP тесту:</label>
              <input
                type="text"
                value={phaseClearance}
                onChange={(e) => setPhaseClearance(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Хто проводить тест:</label>
              <input
                type="text"
                value={evaluatorName}
                onChange={(e) => setEvaluatorName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Підпис / ПІБ лікаря: <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={doctorSignature}
                onChange={(e) => setDoctorSignature(e.target.value)}
                placeholder="Лікар, що приймає рішення"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Battery of Tests Selection & Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Батарея функціональних тестів та динамометрії:
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Hop/Сила ≥90%, Y-Balance ≥95%
              </span>
            </div>

            <div className="space-y-2.5">
              {(Object.keys(LSI_TEST_DEFINITIONS) as LsiTestType[]).map((type) => {
                const def = LSI_TEST_DEFINITIONS[type];
                const item = testValues[type];
                const inj = parseFloat(item.injured) || 0;
                const uninj = parseFloat(item.uninjured) || 0;
                const isTimed = type === "timed_hop_6m";
                const { lsi, passed, threshold } = calculateLsiScore(type, inj, uninj, isTimed);
                const isStrength = type === "quadriceps_dynamometry" || type === "hamstring_dynamometry";
                const injRel = isStrength ? calculateRelativeStrength(inj, currentBodyWeight) : null;
                const uninjRel = isStrength ? calculateRelativeStrength(uninj, currentBodyWeight) : null;

                return (
                  <div
                    key={type}
                    className={`p-3 rounded-xl border transition-all ${
                      item.enabled
                        ? "bg-slate-900/90 border-slate-700"
                        : "bg-slate-950/40 border-slate-800/40 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleTest(type)}
                          className="mt-1 rounded border-slate-700 text-sky-500 focus:ring-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{def.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-sky-300 border border-slate-700">
                              Поріг: ≥{threshold}%
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 block mt-0.5">{def.description}</span>
                        </div>
                      </label>

                      {item.enabled && (
                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          {/* Injured limb input */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-rose-400 font-semibold whitespace-nowrap">
                              {testedLimb === "left" ? "Ліва (Травм):" : "Права (Травм):"}
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
                            {injRel !== null && (
                              <span className="text-[10px] text-sky-400 font-mono ml-0.5" title="Нормовано на масу тіла">
                                ({injRel} кг/кг)
                              </span>
                            )}
                          </div>

                          {/* Uninjured limb input */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-emerald-400 font-semibold whitespace-nowrap">
                              {testedLimb === "left" ? "Права (Здор):" : "Ліва (Здор):"}
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
                            {uninjRel !== null && (
                              <span className="text-[10px] text-emerald-400 font-mono ml-0.5" title="Нормовано на масу тіла">
                                ({uninjRel} кг/кг)
                              </span>
                            )}
                          </div>

                          {/* Live LSI Indicator */}
                          {uninj > 0 && inj > 0 && (
                            <div
                              className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border flex items-center gap-1 ${
                                passed
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              }`}
                            >
                              <span>{passed ? "✓" : "✗"}</span>
                              <span>LSI: {lsi}%</span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                (пор. ≥{threshold}%)
                              </span>
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

          {/* H/Q RATIO SECTION */}
          {hasHq && hqInj && hqUninj && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚖️</span>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Співвідношення H/Q (Hamstring / Quadriceps Ratio)
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">
                    Норма: ≥ {HQ_RATIO_THRESHOLD}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    hqInj.passed
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {hqInj.passed ? "✓ H/Q в нормі (≥0.60)" : "🛑 Дефіцит H/Q (<0.60)"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-rose-300 font-medium">
                    Травмована кінцівка ({testedLimb === "left" ? "Ліва" : "Права"}):
                  </span>
                  <span className={`font-mono text-sm font-bold ${hqInj.passed ? "text-emerald-400" : "text-rose-400"}`}>
                    {hqInj.ratio}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-emerald-300 font-medium">
                    Здорова кінцівка ({testedLimb === "left" ? "Права" : "Ліва"}):
                  </span>
                  <span className={`font-mono text-sm font-bold ${hqUninj.passed ? "text-emerald-400" : "text-amber-400"}`}>
                    {hqUninj.ratio}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Composite Summary Gauge & Verdict */}
          {calculatedTestResults.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              {/* Verdict Header Banner */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  criteriaMet
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{criteriaMet ? "✓" : "🛑"}</span>
                  <div>
                    <h5 className="text-sm font-bold leading-tight">
                      {criteriaMet
                        ? "Критерії LSI виконано. Рішення про допуск приймає лікар"
                        : "Критерії LSI не виконано. Рішення про допуск приймає лікар"}
                    </h5>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {criteriaMet
                        ? "Усі обрані функціональні тести та H/Q відповідають пороговим критеріям."
                        : `Не виконано ${failedTests.length} критеріїв тестування. Потрібна додаткова реабілітація.`}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-400">Середній LSI (довідково):</div>
                  <div className="text-2xl font-black font-mono text-white">{overallLsi}%</div>
                </div>
              </div>

              {/* List of failed tests if criteria are not met */}
              {!criteriaMet && failedTests.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 space-y-1.5">
                  <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️</span> Невиконані тести та порушення симетрії:
                  </div>
                  <ul className="text-xs text-rose-200/90 space-y-1 list-disc list-inside">
                    {failedTests.map((ft, idx) => (
                      <li key={idx} className="font-mono">{ft}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Doctor verdict note */}
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-40 transition-all flex items-center gap-2"
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
            Історія протоколів функціонального тестування (LSI):
          </div>

          <div className="space-y-3">
            {records.map((rec) => {
              const recCriteriaMet =
                rec.criteria_met !== undefined
                  ? rec.criteria_met
                  : rec.status === "cleared";

              return (
                <div
                  key={rec.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-sky-500/30 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-300 font-mono">{rec.date}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-sky-400 font-semibold">
                        {rec.tested_limb === "right" ? "Права нога (Травма)" : "Ліва нога (Травма)"}
                      </span>
                      {rec.injury_type && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-rose-300 font-medium">
                            {INJURY_TYPE_UA[rec.injury_type] || rec.injury_type}
                          </span>
                        </>
                      )}
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400">{rec.phase_clearance}</span>
                      {rec.protocol_source && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-500 text-[11px] italic">
                            {rec.protocol_source}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">
                        Середній LSI: <span className="text-white font-bold">{rec.overall_lsi_percent}%</span>
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          recCriteriaMet
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {recCriteriaMet
                          ? "✓ Критерії виконано"
                          : "🛑 Критерії не виконано"}
                      </span>
                    </div>
                  </div>

                  {/* Verbal verdict banner */}
                  <div
                    className={`text-xs p-2.5 rounded-lg border flex items-center justify-between ${
                      recCriteriaMet
                        ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/25"
                        : "bg-rose-950/30 text-rose-300 border-rose-500/25"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{recCriteriaMet ? "✓" : "⚠️"}</span>
                      <span className="font-semibold">
                        {recCriteriaMet
                          ? "Критерії LSI виконано. Рішення про допуск приймає лікар"
                          : "Критерії LSI не виконано. Рішення про допуск приймає лікар"}
                      </span>
                    </div>
                    {rec.doctor_signature && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        Підпис: {rec.doctor_signature}
                      </span>
                    )}
                  </div>

                  {/* If failed tests recorded */}
                  {rec.failed_tests && rec.failed_tests.length > 0 && (
                    <div className="text-[11px] text-rose-300 bg-rose-950/20 p-2 rounded border border-rose-500/20">
                      <span className="font-bold">Не виконані тести: </span>
                      {rec.failed_tests.join(", ")}
                    </div>
                  )}

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
                            {t.injured_relative_strength ? ` (${t.injured_relative_strength} кг/кг)` : ""}
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

                  {/* H/Q ratio summary if present */}
                  {rec.hq_ratio_injured != null && (
                    <div className="text-xs text-slate-300 bg-slate-900/40 px-3 py-1.5 rounded-lg border border-slate-800/50 flex items-center justify-between">
                      <span className="text-slate-400">Співвідношення H/Q (травмована):</span>
                      <span className={`font-mono font-bold ${rec.hq_ratio_passed !== false ? "text-emerald-400" : "text-rose-400"}`}>
                        {rec.hq_ratio_injured} {rec.hq_ratio_passed !== false ? "(≥0.60 ✓)" : "(<0.60 🛑)"}
                      </span>
                    </div>
                  )}

                  {/* Doctor's Verdict and Notes */}
                  {rec.doctor_verdict && (
                    <div className="text-xs text-slate-300 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 flex items-start gap-2">
                      <span className="text-sky-400 shrink-0">💬</span>
                      <span>{rec.doctor_verdict}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
