"use client";

import { useState, useTransition } from "react";
import {
  type ConcussionAssessment,
  type ConcussionMechanism,
  type RedFlagItem,
  type ConcussionStageNumber,
  CONCUSSION_GRTP_STAGES,
  CONCUSSION_MECHANISM_LABELS,
  RED_FLAG_LABELS,
  validateStageTransition,
} from "@/types/concussion";
import { saveConcussionAction } from "@/actions/save-concussion-action";

type Props = {
  injuryId: string;
  playerName: string;
  initialAssessments: ConcussionAssessment[];
};

export default function Scat6ConcussionAssessment({
  injuryId,
  playerName,
  initialAssessments,
}: Props) {
  const [assessments, setAssessments] = useState<ConcussionAssessment[]>(initialAssessments);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"protocol" | "stages">("stages");

  // Acute form states
  const [mechanism, setMechanism] = useState<ConcussionMechanism>("head_to_head");
  const [selectedRedFlags, setSelectedRedFlags] = useState<RedFlagItem[]>([]);
  const [maddocksScore, setMaddocksScore] = useState(5);
  const [symptomCount, setSymptomCount] = useState(2);
  const [symptomSeverity, setSymptomSeverity] = useState(4);
  const [bessErrors, setBessErrors] = useState(1);
  const [doctor, setDoctor] = useState("Лікар спортивної медицини");
  const [notes, setNotes] = useState("");

  // GRTP Stage management states
  const latest = assessments[0] || null;
  const currentStageNum = (latest?.current_rtp_stage ?? 1) as ConcussionStageNumber;
  const [selectedStage, setSelectedStage] = useState<ConcussionStageNumber>(currentStageNum);
  const [isSymptomFree24h, setIsSymptomFree24h] = useState(true);
  const [symptomsTriggered, setSymptomsTriggered] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [medicalClearance, setMedicalClearance] = useState(false);
  const [stageDoctorSignature, setStageDoctorSignature] = useState("Лікар команди");
  const [stageNotes, setStageNotes] = useState("");
  const [stageFeedback, setStageFeedback] = useState<{ allowed: boolean; message: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  const toggleRedFlag = (flag: RedFlagItem) => {
    setSelectedRedFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const toggleSymptomTrigger = (sym: string) => {
    setSymptomsTriggered((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  // Збереження первинної оцінки SCAT6
  const handleAcuteSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const hasFlags = selectedRedFlags.length > 0;
      const res = await saveConcussionAction({
        injury_id: injuryId,
        date: new Date().toISOString().split("T")[0],
        examiner: doctor,
        has_red_flags: hasFlags,
        red_flags_selected: selectedRedFlags,
        maddocks_score: Number(maddocksScore),
        total_symptoms_count: Number(symptomCount),
        total_symptom_severity_score: Number(symptomSeverity),
        bess_double_leg_errors: 0,
        bess_single_leg_errors: Number(bessErrors),
        bess_tandem_errors: 0,
        bess_total_errors: Number(bessErrors),
        current_rtp_stage: 1,
        clinical_verdict: hasFlags || symptomCount > 0 ? "suspected_concussion" : "cleared_no_concussion",
        recommendations: notes.trim() || `Механізм: ${CONCUSSION_MECHANISM_LABELS[mechanism]}. Режим відносного спокою 24-48 год.`,
      });

      if (res.assessment) {
        setAssessments([res.assessment, ...assessments]);
        setSelectedStage(1);
        setIsOpen(false);
      }
    });
  };

  // Перехід між ступенями GRTP
  const handleStageTransition = (target: ConcussionStageNumber) => {
    const allSymptoms = [...symptomsTriggered];
    if (customSymptom.trim()) allSymptoms.push(customSymptom.trim());

    const result = validateStageTransition({
      currentStage: currentStageNum,
      targetStage: target,
      isSymptomFree24h,
      symptomsNoted: allSymptoms,
      doctorSignatureName: stageDoctorSignature,
      medicalClearanceGranted: medicalClearance,
    });

    if (!result.allowed) {
      setStageFeedback({
        allowed: false,
        message: result.error || result.actionReason,
      });
      return;
    }

    startTransition(async () => {
      const res = await saveConcussionAction({
        injury_id: injuryId,
        date: new Date().toISOString().split("T")[0],
        examiner: stageDoctorSignature,
        has_red_flags: false,
        red_flags_selected: [],
        maddocks_score: 5,
        total_symptoms_count: allSymptoms.length,
        total_symptom_severity_score: allSymptoms.length * 2,
        bess_double_leg_errors: 0,
        bess_single_leg_errors: 0,
        bess_tandem_errors: 0,
        bess_total_errors: 0,
        current_rtp_stage: result.nextStage,
        clinical_verdict: result.nextStage === 6 ? "cleared_no_concussion" : "recovering",
        recommendations: `Перехід на Ступінь ${result.nextStage}: ${CONCUSSION_GRTP_STAGES[result.nextStage].title}. ${stageNotes}`.trim(),
      });

      if (res.assessment) {
        setAssessments([res.assessment, ...assessments]);
        setSelectedStage(result.nextStage);
        setStageFeedback({
          allowed: true,
          message: result.actionReason,
        });
        setSymptomsTriggered([]);
        setCustomSymptom("");
        setStageNotes("");
      }
    });
  };

  const activeStageInfo = CONCUSSION_GRTP_STAGES[selectedStage];

  return (
    <div className="bg-slate-900/90 border border-blue-900/40 rounded-2xl p-5 space-y-5 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-900/30 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-2xl shadow-inner">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Протокол струсу мозку (SCAT6 / FIFA Concussion)
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                CISG Amsterdam
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Стандартизована оцінка, захищений протокол та 6-ступеневе поступове повернення (GRTP)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === "stages" ? "protocol" : "stages")}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
          >
            {activeTab === "stages" ? "📋 Форма SCAT6" : "🏃‍♂️ Протокол повернення"}
          </button>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-xs font-bold transition shadow-sm"
          >
            {isOpen ? "✕ Закрити" : "+ Новий запис"}
          </button>
        </div>
      </div>

      {/* Поточний клінічний статус */}
      {latest && (
        <div className="p-4 rounded-xl bg-slate-950/70 border border-blue-900/30 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Клінічний статус:</span>
              <span
                className={`font-bold px-2.5 py-1 rounded-md text-xs border ${
                  latest.clinical_verdict === "suspected_concussion"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                    : latest.clinical_verdict === "recovering"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                }`}
              >
                {latest.clinical_verdict === "suspected_concussion"
                  ? "🛑 Гострий струс мозку (Недопущений до гри)"
                  : latest.clinical_verdict === "recovering"
                  ? `🟡 Ступінь ${latest.current_rtp_stage}/6 повернення до гри`
                  : "🟢 Допущений до змагань (Return to Play)"}
              </span>
            </div>
            <div className="text-slate-400 font-mono text-[11px]">
              Останній запис: {latest.date} · Лікар: {latest.examiner}
            </div>
          </div>

          {/* Індикатор доступності */}
          {latest.current_rtp_stage < 6 && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-300">
              <span>⚠️</span>
              <span>
                <strong>Правило безпеки:</strong> Гравець з відкритим струсом мозку автоматично позначений як{" "}
                <span className="underline decoration-rose-500 font-bold text-rose-300">недоступний</span> у
                звітах готовності до матчу до завершення 6-го ступеня.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Вкладка 1: 6 Ступенів поступового повернення (GRTP) */}
      {activeTab === "stages" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              6-ступеневий протокол повернення (Graduated Return to Play)
            </h4>
            <span className="text-[11px] text-slate-400">
              Мінімум 24 години без симптомів між кожним ступенем
            </span>
          </div>

          {/* Stepper Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {([1, 2, 3, 4, 5, 6] as ConcussionStageNumber[]).map((num) => {
              const stageData = CONCUSSION_GRTP_STAGES[num];
              const isCurrent = currentStageNum === num;
              const isCompleted = currentStageNum > num;
              const isSelected = selectedStage === num;

              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setSelectedStage(num);
                    setStageFeedback(null);
                  }}
                  className={`p-3 rounded-xl border text-left transition relative flex flex-col justify-between min-h-[90px] ${
                    isSelected
                      ? "ring-2 ring-blue-500 border-blue-400 bg-blue-950/40"
                      : isCompleted
                      ? "bg-slate-900/60 border-emerald-500/30 text-emerald-300 hover:bg-slate-800"
                      : isCurrent
                      ? "bg-amber-950/30 border-amber-500/40 text-amber-300"
                      : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                      Ступінь {num}
                    </span>
                    {isCompleted && <span className="text-emerald-400 text-xs">✓</span>}
                    {isCurrent && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                  </div>
                  <div className="text-xs font-semibold text-white mt-1 line-clamp-2">
                    {stageData.title}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {num === 6 ? "Матчі" : `мін. ${stageData.minDurationHours} год`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Детальна панель обраного ступеня з симптомами-підказками */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-blue-900/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    Ступінь {selectedStage}: {activeStageInfo.title}
                  </span>
                  {activeStageInfo.requiresDoctorClearance && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      Потрібен допуск лікаря
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ціль: <span className="text-slate-200">{activeStageInfo.goal}</span>
                </p>
              </div>

              <div className="text-xs font-mono text-slate-400">
                Дозволена активність: <span className="text-blue-300 font-sans">{activeStageInfo.activities}</span>
              </div>
            </div>

            {/* Блок симптомів-підказок для даного ступеня (Запит користувача) */}
            <div className="p-3.5 rounded-lg bg-blue-950/30 border border-blue-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                <span className="flex items-center gap-1.5">
                  <span>💡</span>
                  <span>Характерні симптоми-тригери для Ступеня {selectedStage}:</span>
                </span>
                <span className="text-[10px] font-normal text-slate-400">
                  (Клікніть, якщо симптом проявився)
                </span>
              </div>

              <p className="text-[11px] text-slate-400">
                Під час виконання навантажень цього ступеня звертайте особливу увагу на наступні симптоми:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {activeStageInfo.typicalSymptoms.map((sym, idx) => {
                  const isMarked = symptomsTriggered.includes(sym);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleSymptomTrigger(sym)}
                      className={`p-2.5 rounded-lg text-left text-xs transition border flex items-center justify-between gap-2 ${
                        isMarked
                          ? "bg-rose-950/60 border-rose-500 text-rose-200 font-bold shadow-sm"
                          : "bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                      }`}
                    >
                      <span>{sym}</span>
                      <span className="text-xs">{isMarked ? "🛑 Проявився" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Форма переходу та підпису лікаря */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={isSymptomFree24h}
                    onChange={(e) => setIsSymptomFree24h(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600"
                  />
                  <span>Симптоми відсутні щонайменше останні 24 години</span>
                </label>

                {selectedStage >= 5 && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-300 bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/30">
                    <input
                      type="checkbox"
                      checked={medicalClearance}
                      onChange={(e) => setMedicalClearance(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 accent-emerald-600"
                    />
                    <span>Медичний допуск лікаря до контактного тренування/гри (Medical Clearance)</span>
                  </label>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Електронний підпис лікаря (ПІБ):
                  </label>
                  <input
                    type="text"
                    value={stageDoctorSignature}
                    onChange={(e) => setStageDoctorSignature(e.target.value)}
                    placeholder="Д-р Шевченко О.В."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    Клінічні нотатки та зауваження:
                  </label>
                  <textarea
                    rows={3}
                    value={stageNotes}
                    onChange={(e) => setStageNotes(e.target.value)}
                    placeholder="Реакція на навантаження, показники ЧСС, самопочуття гравця..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Сповіщення зворотного зв'язку */}
            {stageFeedback && (
              <div
                className={`p-3 rounded-lg text-xs border ${
                  stageFeedback.allowed
                    ? "bg-emerald-950/40 text-emerald-200 border-emerald-500/40"
                    : "bg-rose-950/40 text-rose-200 border-rose-500/40"
                }`}
              >
                {stageFeedback.message}
              </div>
            )}

            {/* Кнопка переходу */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              {symptomsTriggered.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleStageTransition(Math.max(1, selectedStage - 1) as ConcussionStageNumber)}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-bold transition"
                >
                  🛑 Зафіксувати симптоми і відкотити на Ступінь {Math.max(1, selectedStage - 1)}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleStageTransition(selectedStage)}
                disabled={isPending}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md disabled:opacity-50"
              >
                {isPending ? "Збереження..." : `Затвердити прогрес Ступеня ${selectedStage}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Вкладка 2 або Модальне вікно: Форма оцінки SCAT6 */}
      {(activeTab === "protocol" || isOpen) && (
        <form
          onSubmit={handleAcuteSubmit}
          className="bg-slate-950/90 p-5 rounded-xl border border-blue-900/40 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="font-bold text-white text-sm">
              Первинна оцінка струсу мозку (SCAT6) · {playerName}
            </div>
            <a
              href="https://bjsm.bmj.com/content/57/11/622"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Офіційний консенсус SCAT6 (BJSM)</span>
              <span>↗</span>
            </a>
          </div>

          {/* Механізм травми */}
          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Механізм травми голови:
            </label>
            <select
              value={mechanism}
              onChange={(e) => setMechanism(e.target.value as ConcussionMechanism)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-semibold"
            >
              {(Object.entries(CONCUSSION_MECHANISM_LABELS) as [ConcussionMechanism, string][]).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Red Flags чеклист */}
          <div className="p-3.5 rounded-lg bg-red-950/20 border border-red-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-red-300">
                🚨 Червоні прапорці (Red Flags — екстрена госпіталізація):
              </span>
              <span className="text-[10px] text-red-400 font-mono">
                {selectedRedFlags.length} виявлено
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {(Object.entries(RED_FLAG_LABELS) as [RedFlagItem, string][]).map(([key, label]) => {
                const isSelected = selectedRedFlags.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer border text-[11px] transition ${
                      isSelected
                        ? "bg-red-900/40 border-red-500 text-red-200 font-bold"
                        : "bg-slate-900/40 border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRedFlag(key)}
                      className="w-3.5 h-3.5 rounded text-red-600 accent-red-600"
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Бали числових тестів (без копіювання авторського тексту запитань) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Орієнтація Maddocks (0–5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={maddocksScore}
                onChange={(e) => setMaddocksScore(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">5 = норма відповідей на полі</span>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Кількість симптомів (з 22)
              </label>
              <input
                type="number"
                min={0}
                max={22}
                value={symptomCount}
                onChange={(e) => setSymptomCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">За шкалою симптомів SCAT6</span>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Тест балансу mBESS (помилки)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={bessErrors}
                onChange={(e) => setBessErrors(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">Норма: ≤ 3 помилок</span>
            </div>
          </div>

          {/* Лікар та примітки */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Лікар, що проводив оцінку:
              </label>
              <input
                type="text"
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Клінічні рекомендації:
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Обмеження екранів, динамічний огляд через 24 год..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
            >
              {isPending ? "Збереження..." : "Затвердити протокол SCAT6"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
