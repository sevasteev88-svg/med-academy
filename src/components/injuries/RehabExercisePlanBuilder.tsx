"use client";

import { useState, useTransition, useMemo } from "react";
import type {
  ExerciseLibraryItem,
  MuscleGroup,
  CustomRehabPlanItem,
  PlayerCustomRehabPlan,
  ExerciseLoadType,
  RehabPlanStatus,
} from "@/types/exercise-library";
import { MUSCLE_GROUP_LABELS } from "@/types/exercise-library";
import { EXERCISE_DATABASE, filterExerciseDatabase } from "@/lib/exercise-database";
import { savePlayerRehabPlanAction } from "@/actions/rehab-plan-actions";
import { RTP_PHASES, type RtpPhaseNumber } from "@/types/rtp";
import { LOCATION_UA, INJURY_TYPE_UA } from "@/lib/constants";

type Props = {
  playerId: string;
  playerName: string;
  initialPlan?: PlayerCustomRehabPlan | null;
  activeInjuries?: any[];
  currentRtpPhase?: number;
  defaultDoctorName?: string;
};

// Helper for phase warning: returns if exercise belongs to a later phase than targeted
function checkPhaseMismatch(exercisePhase: string, targetRtpPhase: number): { isLater: boolean; warning?: string } {
  if (exercisePhase === "all") return { isLater: false };

  if (targetRtpPhase === 1) {
    if (exercisePhase === "intermediate") {
      return {
        isLater: true,
        warning: "Вправа для Проміжної фази (RTP 2-3). У Фазі 1 (Зал/Клініка) уникайте надмірного динамічного навантаження!",
      };
    }
    if (exercisePhase === "late_dynamic") {
      return {
        isLater: true,
        warning: "Небезпечно: вправа для Пізньої динамічної фази (RTP 3-5). Не рекомендується у Фазі 1 через високий ризик рецидиву!",
      };
    }
  }

  if (targetRtpPhase === 2) {
    if (exercisePhase === "late_dynamic") {
      return {
        isLater: true,
        warning: "Вправа для Динамічної фази (RTP 3-5). У Фазі 2 уникайте різких стрибків та максимальних ексцентричних навантажень.",
      };
    }
  }

  return { isLater: false };
}

// Build human-friendly dosage string from structured inputs
function formatDosageString(sets: number | string, reps: string, loadType?: ExerciseLoadType, loadValue?: string): string {
  const s = sets || 3;
  const r = reps || "10-12 повторень";
  if (!loadType || loadType === "bodyweight") {
    return `${s} підходи × ${r} (Власна вага)`;
  }
  if (loadType === "rpe") {
    return `${s} підходи × ${r} @ ${loadValue || "RPE 6-7"}`;
  }
  if (loadType === "percent_bw") {
    return `${s} підходи × ${r} (${loadValue || "10-15%"} від маси тіла)`;
  }
  if (loadType === "percent_1rm") {
    return `${s} підходи × ${r} (${loadValue || "60%"} 1RM)`;
  }
  if (loadType === "custom_weight") {
    return `${s} підходи × ${r} (${loadValue || "вага лікаря"})`;
  }
  return `${s} підходи × ${r}`;
}

export default function RehabExercisePlanBuilder({
  playerId,
  playerName,
  initialPlan,
  activeInjuries = [],
  currentRtpPhase = 1,
  defaultDoctorName = "Головний лікар клубу",
}: Props) {
  const [activePlan, setActivePlan] = useState<PlayerCustomRehabPlan | null>(initialPlan || null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Mandatory Injury and RTP Phase linking
  const [selectedInjuryId, setSelectedInjuryId] = useState<string>(
    initialPlan?.target_injury_id || activeInjuries[0]?.id || ""
  );
  const [selectedRtpPhase, setSelectedRtpPhase] = useState<number>(
    initialPlan?.target_rtp_phase || currentRtpPhase || 1
  );

  // Doctor signature
  const [doctorName, setDoctorName] = useState<string>(
    initialPlan?.approved_by || initialPlan?.doctor_name || defaultDoctorName
  );

  // Filters for exercise library
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | "all">("all");
  const [selectedJoint, setSelectedJoint] = useState<string>("all");
  const [selectedInjuryTag, setSelectedInjuryTag] = useState<string>("all");
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Builder Plan State
  const [planTitle, setPlanTitle] = useState(
    initialPlan?.title || "Індивідуальний комплекс ЛФК (Мобільність та сила)"
  );
  const [stagedExercises, setStagedExercises] = useState<CustomRehabPlanItem[]>(
    initialPlan?.exercises || []
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Filtered exercises from library
  const availableExercises = useMemo(() => {
    return filterExerciseDatabase({
      muscleGroup: selectedMuscle !== "all" ? selectedMuscle : undefined,
      joint: selectedJoint !== "all" ? selectedJoint : undefined,
      injuryTag: selectedInjuryTag !== "all" ? selectedInjuryTag : undefined,
      phase: selectedPhase !== "all" ? selectedPhase : undefined,
      searchQuery: searchQuery.trim() || undefined,
    });
  }, [selectedMuscle, selectedJoint, selectedInjuryTag, selectedPhase, searchQuery]);

  // Selected injury title for metadata
  const selectedInjuryObj = useMemo(() => {
    return activeInjuries.find((i) => i.id === selectedInjuryId) || activeInjuries[0] || null;
  }, [activeInjuries, selectedInjuryId]);

  const injuryTitleDisplay = useMemo(() => {
    if (!selectedInjuryObj) return "Загальна реабілітація";
    const typeLabel = INJURY_TYPE_UA[selectedInjuryObj.injury_type] || selectedInjuryObj.injury_type || "";
    const locLabel = LOCATION_UA[selectedInjuryObj.location] || selectedInjuryObj.location || "";
    return selectedInjuryObj.description || `${typeLabel} (${locLabel})`;
  }, [selectedInjuryObj]);

  // Add exercise to staged plan
  const handleAddExerciseToPlan = (ex: ExerciseLibraryItem) => {
    if (stagedExercises.some((item) => item.exerciseId === ex.id)) return;

    const defaultSets = 3;
    const defaultReps = "10-12";
    const defaultLoadType: ExerciseLoadType = "rpe";
    const defaultLoadVal = "RPE 6";

    const newItem: CustomRehabPlanItem = {
      exerciseId: ex.id,
      name: ex.name,
      setsReps: formatDosageString(defaultSets, defaultReps, defaultLoadType, defaultLoadVal),
      targetArea: ex.targetArea,
      technique: ex.technique,
      notes: ex.precautions || "",
      source: ex.source || "",
      phase: ex.phase,
      sets: defaultSets,
      reps: defaultReps,
      loadType: defaultLoadType,
      loadValue: defaultLoadVal,
    };

    setStagedExercises((prev) => [...prev, newItem]);
  };

  // Remove exercise from staged plan
  const handleRemoveExercise = (exId: string) => {
    setStagedExercises((prev) => prev.filter((item) => item.exerciseId !== exId));
  };

  // Update structured dosage or parameters for an exercise
  const handleUpdateDosage = (
    exId: string,
    updates: Partial<CustomRehabPlanItem>
  ) => {
    setStagedExercises((prev) =>
      prev.map((item) => {
        if (item.exerciseId !== exId) return item;
        const updated = { ...item, ...updates };
        // Recalculate formatted setsReps if sets, reps, loadType, loadValue changed
        if (
          updates.sets !== undefined ||
          updates.reps !== undefined ||
          updates.loadType !== undefined ||
          updates.loadValue !== undefined
        ) {
          updated.setsReps = formatDosageString(
            updated.sets ?? 3,
            updated.reps ?? "10-12",
            updated.loadType,
            updated.loadValue
          );
        }
        return updated;
      })
    );
  };

  // Save plan to Supabase with draft or approved status
  const handleSavePlanWithStatus = (targetStatus: RehabPlanStatus) => {
    if (stagedExercises.length === 0) {
      setSaveErrorMsg("Додайте хоча б одну вправу до комплексу");
      return;
    }

    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    const nowIso = new Date().toISOString();
    const isApproved = targetStatus === "approved";

    startTransition(async () => {
      const res = await savePlayerRehabPlanAction({
        player_id: playerId,
        doctor_name: doctorName.trim() || "Медичний штаб",
        title: planTitle.trim() || "Індивідуальний комплекс ЛФК",
        muscle_or_injury_focus:
          selectedMuscle !== "all"
            ? MUSCLE_GROUP_LABELS[selectedMuscle]?.label || "Цільова група"
            : injuryTitleDisplay,
        exercises: stagedExercises,
        is_active: true,
        status: targetStatus,
        approved_by: isApproved ? (doctorName.trim() || "Клубний лікар") : undefined,
        approved_at: isApproved ? nowIso : undefined,
        target_injury_id: selectedInjuryId || undefined,
        injury_title: injuryTitleDisplay,
        target_rtp_phase: selectedRtpPhase,
      });

      if (res.error) {
        setSaveErrorMsg(res.error);
        return;
      }

      if (res.success && res.plan) {
        setActivePlan(res.plan);
        setStagedExercises(res.plan.exercises);
        setIsBuilderOpen(false);
        if (targetStatus === "approved") {
          setSaveSuccessMsg(
            `Комплекс із ${res.plan.exercises.length} вправ ЗАТВЕРДЖЕНО лікарем ${res.plan.approved_by} та опубліковано у кабінеті гравця! 📱`
          );
        } else {
          setSaveSuccessMsg(
            `Чернетку комплексу збережено 📝. Гравець не бачитиме вправ, доки план не буде затверджено.`
          );
        }
        setTimeout(() => setSaveSuccessMsg(null), 8000);
      }
    });
  };

  // Check if any staged exercise is for a later phase
  const stagedMismatches = useMemo(() => {
    return stagedExercises
      .map((item) => ({
        exercise: item,
        check: checkPhaseMismatch(item.phase || "early", selectedRtpPhase),
      }))
      .filter((m) => m.check.isLater);
  }, [stagedExercises, selectedRtpPhase]);

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-slate-900/60 backdrop-blur-xl p-5 md:p-6 shadow-xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏋️</span>
            <h3 className="text-lg md:text-xl font-black text-white tracking-wide">
              Конструктор ЛФК та Комплексів Реабілітації
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              BUILDER
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Безпечний конструктор програм ЛФК із клінічним дозуванням лікарем (RPE, % від ваги), прив&apos;язкою до фази RTP та багаторівневим захистом.
          </p>
        </div>

        <button
          onClick={() => setIsBuilderOpen(!isBuilderOpen)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <span>{isBuilderOpen ? "✕ Згорнути конструктор" : "🛠️ Відкрити конструктор плану"}</span>
        </button>
      </div>

      {saveSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <span>✓</span>
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {saveErrorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <span>⚠️</span>
          <span>{saveErrorMsg}</span>
        </div>
      )}

      {/* ACTIVE PLAN DISPLAY (IF NOT IN EDITING MODE) */}
      {!isBuilderOpen && activePlan && (
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sky-400 font-bold uppercase tracking-wider">
                  Призначений комплекс:
                </span>
                {activePlan.status === "draft" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    🟡 Чернетка (Не відображається у гравця)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    🟢 Затверджено лікарем · Опубліковано
                  </span>
                )}
              </div>
              <h4 className="text-sm sm:text-base font-bold text-white mt-1">{activePlan.title}</h4>
              <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {activePlan.injury_title && (
                  <span>🩹 Травма: <strong className="text-slate-200">{activePlan.injury_title}</strong></span>
                )}
                {activePlan.target_rtp_phase && (
                  <span>🎯 Фаза RTP: <strong className="text-sky-300">Фаза {activePlan.target_rtp_phase} ({RTP_PHASES[activePlan.target_rtp_phase as RtpPhaseNumber]?.shortTitle || ""})</strong></span>
                )}
                {activePlan.approved_by && (
                  <span>👨‍⚕️ Лікар: <strong className="text-emerald-300">{activePlan.approved_by}</strong> ({activePlan.approved_at ? new Date(activePlan.approved_at).toLocaleDateString("uk-UA") : ""})</span>
                )}
              </div>
            </div>

            {activePlan.status === "draft" && (
              <button
                type="button"
                onClick={() => {
                  setIsBuilderOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all self-start"
              >
                ✏️ Затвердити чернетку
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {activePlan.exercises.map((ex, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-white leading-tight">{ex.name}</span>
                  <span className="font-mono text-sky-400 font-semibold px-2 py-0.5 rounded bg-sky-500/10 shrink-0 text-[11px]">
                    {ex.setsReps}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{ex.technique}</div>
                {ex.source && (
                  <div className="text-[10px] text-slate-500 font-medium">
                    📖 Джерело: {ex.source}
                  </div>
                )}
                {ex.notes && (
                  <div className="text-[10px] text-amber-300/90 italic pt-1 border-t border-slate-800/50">
                    ⚠️ {ex.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INTERACTIVE CONSTRUCTOR / BUILDER */}
      {isBuilderOpen && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Stage Bar: Current Plan Under Construction */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-5">
            <div className="space-y-3 border-b border-slate-800 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Injury selection */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    🩹 Прив&apos;язка до травми (Обов&apos;язково):
                  </label>
                  <select
                    value={selectedInjuryId}
                    onChange={(e) => setSelectedInjuryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {activeInjuries.length === 0 ? (
                      <option value="">Немає активних травм (Загальна реабілітація)</option>
                    ) : (
                      activeInjuries.map((inj) => (
                        <option key={inj.id} value={inj.id}>
                          {inj.description || `${INJURY_TYPE_UA[inj.injury_type] || inj.injury_type} (${LOCATION_UA[inj.location] || inj.location})`} — {inj.date_of_injury}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* 2. Target RTP Phase */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    🎯 Цільова фаза RTP:
                  </label>
                  <select
                    value={selectedRtpPhase}
                    onChange={(e) => setSelectedRtpPhase(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {[1, 2, 3, 4, 5].map((phNum) => {
                      const cfg = RTP_PHASES[phNum as RtpPhaseNumber];
                      return (
                        <option key={phNum} value={phNum}>
                          {cfg ? `${cfg.shortTitle} — ${cfg.title}` : `Фаза ${phNum}`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. Doctor name signature */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    👨‍⚕️ Лікар (ПІБ для затвердження):
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Д-р Іванов І.І."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Plan Title */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Назва програми ЛФК:
                </label>
                <input
                  type="text"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Phase Mismatches Warning Banner */}
              {stagedMismatches.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs space-y-1.5 animate-fadeIn">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <span>⚠️</span>
                    <span>Клінічне застереження безпеки (Невідповідність фаз):</span>
                  </div>
                  <ul className="list-disc pl-5 text-[11px] space-y-1 text-amber-100/90">
                    {stagedMismatches.map((m, idx) => (
                      <li key={idx}>
                        <strong>{m.exercise.name}</strong>: {m.check.warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Staged Actions (Draft vs Approved) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-xs text-slate-400">
                  Вправ у плані: <strong className="text-white font-mono">{stagedExercises.length}</strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSavePlanWithStatus("draft")}
                    disabled={isPending || stagedExercises.length === 0}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <span>📝</span>
                    <span>Зберегти як чернетку</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSavePlanWithStatus("approved")}
                    disabled={isPending || stagedExercises.length === 0}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{isPending ? "Збереження..." : "Затвердити та призначити гравцю"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Staged Exercises Grid (Adjust dosage, RPE, % BW, notes) */}
            {stagedExercises.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                План порожній. Оберіть вправи з каталогу нижче та натисніть <strong>«+ Додати в план»</strong>.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Вправи у поточному плані:</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Дозування (підходи, повтори, навантаження) налаштовуються лікарем
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {stagedExercises.map((item) => {
                    const mismatch = checkPhaseMismatch(item.phase || "early", selectedRtpPhase);

                    return (
                      <div
                        key={item.exerciseId}
                        className={`p-3.5 rounded-xl bg-slate-900 border space-y-2.5 relative group ${
                          mismatch.isLater
                            ? "border-amber-500/50 bg-amber-950/10"
                            : "border-sky-500/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-white text-xs leading-tight pr-6">{item.name}</div>
                            {item.source && (
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                📖 {item.source}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(item.exerciseId)}
                            title="Видалити з плану"
                            className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs absolute top-3 right-3"
                          >
                            ✕
                          </button>
                        </div>

                        {mismatch.isLater && (
                          <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-medium leading-snug">
                            ⚠️ {mismatch.warning}
                          </div>
                        )}

                        {/* Structured Dosage Controls */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Підходи:</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={item.sets ?? 3}
                              onChange={(e) => handleUpdateDosage(item.exerciseId, { sets: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono focus:border-sky-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Повтори / Час:</label>
                            <input
                              type="text"
                              value={item.reps ?? "10-12"}
                              onChange={(e) => handleUpdateDosage(item.exerciseId, { reps: e.target.value })}
                              placeholder="10 або 30 сек"
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-mono focus:border-sky-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Тип навантаження:</label>
                            <select
                              value={item.loadType || "rpe"}
                              onChange={(e) => handleUpdateDosage(item.exerciseId, { loadType: e.target.value as any })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-xs text-sky-400 font-medium focus:border-sky-500"
                            >
                              <option value="rpe">Шкала RPE (1-10)</option>
                              <option value="percent_bw">% від ваги тіла</option>
                              <option value="bodyweight">Власна вага</option>
                              <option value="percent_1rm">% від 1RM</option>
                              <option value="custom_weight">Клінічна вага</option>
                            </select>
                          </div>
                        </div>

                        {/* Load Value & Notes */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">
                              {item.loadType === "rpe"
                                ? "Значення RPE (напр. RPE 6-7):"
                                : item.loadType === "percent_bw"
                                ? "% від ваги (напр. 15%):"
                                : item.loadType === "custom_weight"
                                ? "Вага лікаря (напр. 4 кг):"
                                : "Параметр інтенсивності:"}
                            </label>
                            <input
                              type="text"
                              value={item.loadValue || ""}
                              onChange={(e) => handleUpdateDosage(item.exerciseId, { loadValue: e.target.value })}
                              placeholder={item.loadType === "rpe" ? "RPE 6-7" : item.loadType === "percent_bw" ? "15%" : "Власна вага"}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-sky-400 font-mono focus:border-sky-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">Клінічна примітка:</label>
                            <input
                              type="text"
                              value={item.notes || ""}
                              onChange={(e) => handleUpdateDosage(item.exerciseId, { notes: e.target.value })}
                              placeholder="Темп 3-1-2 або кут 45°"
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 focus:border-sky-500"
                            />
                          </div>
                        </div>

                        {/* Resulting formatted dosage preview */}
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/50 flex items-center justify-between">
                          <span>Підсумкове формулювання:</span>
                          <span className="font-mono text-sky-300 font-semibold">{item.setsReps}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CATALOGUE FILTER & SELECTION BAR */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[220px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Пошук вправи за назвою, джерелом або технікою..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedMuscle}
                  onChange={(e) => setSelectedMuscle(e.target.value as any)}
                  aria-label="Група м'язів"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:border-sky-500"
                >
                  <option value="all">Усі групи м&apos;язів</option>
                  {Object.entries(MUSCLE_GROUP_LABELS).map(([mg, meta]) => (
                    <option key={mg} value={mg}>
                      {meta.icon} {meta.label}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedJoint}
                  onChange={(e) => setSelectedJoint(e.target.value)}
                  aria-label="Суглоб"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:border-sky-500"
                >
                  <option value="all">Усі суглоби</option>
                  <option value="knee">🦿 Коліно</option>
                  <option value="ankle">👟 Гомілкостоп</option>
                  <option value="hip">🍑 Кульшовий</option>
                  <option value="groin">🩲 Пах</option>
                  <option value="spine">🧱 Хребет / Кор</option>
                  <option value="shoulder">🦾 Плече</option>
                </select>

                <select
                  value={selectedInjuryTag}
                  onChange={(e) => setSelectedInjuryTag(e.target.value)}
                  aria-label="Специфічна травма"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:border-sky-500"
                >
                  <option value="all">Усі травми (Футбольний профіль)</option>
                  <option value="hamstring_strain">🦵 Надрив задньої поверхні (Хамстрінг)</option>
                  <option value="acl_tear">🦿 Пластика / Травма ПКС коліна</option>
                  <option value="patellar_tendon">⚡ Тендиніт зв&apos;язки надколінка (Jumper Knee)</option>
                  <option value="meniscus">🩹 Пошкодження меніска</option>
                  <option value="groin_pain">🩲 Пахова біль / Пубалгія / Аддуктор</option>
                  <option value="ankle_sprain">👟 Розтягнення зв&apos;язок гомілкостопа</option>
                  <option value="achilles_tendinopathy">🦶 Ахіллопатія / Литковий м&apos;яз</option>
                  <option value="fifa_rtp_clearance">🏆 FIFA RTP Тестовий допуск</option>
                  <option value="rotator_cuff">🦾 Травма плеча / Воротар</option>
                  <option value="lumbar_spine">🧱 Поперековий синдром / Грижа</option>
                </select>

                <select
                  value={selectedPhase}
                  onChange={(e) => setSelectedPhase(e.target.value)}
                  aria-label="Фаза реабілітації"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:border-sky-500"
                >
                  <option value="all">Усі фази каталогу</option>
                  <option value="early">Фаза 1-2: Рання мобілізація</option>
                  <option value="intermediate">Фаза 3: Сила та контроль</option>
                  <option value="late_dynamic">Фаза 4-5: Динаміка та стрибки</option>
                </select>
              </div>
            </div>

            {/* Exercise Database Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableExercises.map((ex) => {
                const isStaged = stagedExercises.some((item) => item.exerciseId === ex.id);
                const phaseWarning = checkPhaseMismatch(ex.phase, selectedRtpPhase);

                return (
                  <div
                    key={ex.id}
                    className={`rounded-2xl border bg-slate-900/60 backdrop-blur-md p-4 flex flex-col justify-between transition-all ${
                      isStaged
                        ? "border-sky-500/50 bg-sky-950/20"
                        : phaseWarning.isLater
                        ? "border-amber-500/30 hover:border-amber-500/60"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      {/* Tags Bar */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        {ex.muscleGroups.map((mg) => (
                          <span
                            key={mg}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-sky-300 border border-slate-700/60"
                          >
                            {MUSCLE_GROUP_LABELS[mg]?.label.split(" ")[0]}
                          </span>
                        ))}
                        {ex.equipment && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-950 text-slate-400 border border-slate-800">
                            ⚙️ {ex.equipment}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-950 text-slate-400 border border-slate-800">
                          {ex.phase === "early"
                            ? "Фаза 1-2"
                            : ex.phase === "intermediate"
                            ? "Фаза 2-3"
                            : "Фаза 3-5"}
                        </span>
                      </div>

                      {/* Phase Warning Flag if earlier phase selected */}
                      {phaseWarning.isLater && (
                        <div className="mb-2 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold flex items-center gap-1">
                          <span>⚠️</span>
                          <span>Для пізнішої фази RTP</span>
                        </div>
                      )}

                      {/* Title & Target */}
                      <h4 className="text-sm font-bold text-white leading-snug">{ex.name}</h4>
                      <p className="text-[11px] text-sky-400/90 font-medium mt-1">
                        🎯 {ex.targetArea}
                      </p>

                      {/* Technique & Guidance */}
                      <p className="text-xs text-slate-300 leading-relaxed mt-2 line-clamp-3">
                        {ex.technique}
                      </p>

                      {/* Evidence Source */}
                      {ex.source && (
                        <div className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                          <span>📖</span>
                          <span className="truncate">{ex.source}</span>
                        </div>
                      )}

                      {ex.precautions && (
                        <p className="text-[10px] text-amber-300/80 italic mt-1.5">
                          ⚠️ {ex.precautions}
                        </p>
                      )}
                    </div>

                    {/* Bottom Action Button */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-400 font-semibold">
                        {ex.defaultSetsReps}
                      </span>

                      {isStaged ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(ex.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition-all flex items-center gap-1"
                        >
                          ✕ Прибрати
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddExerciseToPlan(ex)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                            phaseWarning.isLater
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500 hover:text-black"
                              : "bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500 hover:text-white"
                          }`}
                        >
                          ➕ {phaseWarning.isLater ? "Додати (з ризиком)" : "Додати в план"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
