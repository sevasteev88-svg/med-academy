"use client";

import { useState, useTransition, useMemo } from "react";
import type {
  ExerciseLibraryItem,
  MuscleGroup,
  CustomRehabPlanItem,
  PlayerCustomRehabPlan,
} from "@/types/exercise-library";
import { MUSCLE_GROUP_LABELS } from "@/types/exercise-library";
import { EXERCISE_DATABASE, filterExerciseDatabase } from "@/lib/exercise-database";
import { savePlayerRehabPlanAction } from "@/actions/rehab-plan-actions";

type Props = {
  playerId: string;
  playerName: string;
  initialPlan?: PlayerCustomRehabPlan | null;
};

export default function RehabExercisePlanBuilder({
  playerId,
  playerName,
  initialPlan,
}: Props) {
  const [activePlan, setActivePlan] = useState<PlayerCustomRehabPlan | null>(initialPlan || null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Filters for exercise library
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | "all">("all");
  const [selectedJoint, setSelectedJoint] = useState<string>("all");
  const [selectedInjury, setSelectedInjury] = useState<string>("all");
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

  const [isPending, startTransition] = useTransition();

  // Filtered exercises from library
  const availableExercises = useMemo(() => {
    return filterExerciseDatabase({
      muscleGroup: selectedMuscle !== "all" ? selectedMuscle : undefined,
      joint: selectedJoint !== "all" ? selectedJoint : undefined,
      injuryTag: selectedInjury !== "all" ? selectedInjury : undefined,
      phase: selectedPhase !== "all" ? selectedPhase : undefined,
      searchQuery: searchQuery.trim() || undefined,
    });
  }, [selectedMuscle, selectedJoint, selectedInjury, selectedPhase, searchQuery]);

  // Add exercise to staged plan
  const handleAddExerciseToPlan = (ex: ExerciseLibraryItem) => {
    // Check if already in plan
    if (stagedExercises.some((item) => item.exerciseId === ex.id)) return;

    const newItem: CustomRehabPlanItem = {
      exerciseId: ex.id,
      name: ex.name,
      setsReps: ex.defaultSetsReps,
      targetArea: ex.targetArea,
      technique: ex.technique,
      notes: ex.precautions || "",
    };

    setStagedExercises((prev) => [...prev, newItem]);
  };

  // Remove exercise from staged plan
  const handleRemoveExercise = (exId: string) => {
    setStagedExercises((prev) => prev.filter((item) => item.exerciseId !== exId));
  };

  // Update sets/reps or notes for an exercise in plan
  const handleUpdateExerciseParam = (
    exId: string,
    field: "setsReps" | "notes" | "name",
    val: string
  ) => {
    setStagedExercises((prev) =>
      prev.map((item) => (item.exerciseId === exId ? { ...item, [field]: val } : item))
    );
  };

  // Save plan to Supabase
  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedExercises.length === 0) return;

    startTransition(async () => {
      const res = await savePlayerRehabPlanAction({
        player_id: playerId,
        doctor_name: "Медичний штаб клубу",
        title: planTitle,
        muscle_or_injury_focus:
          selectedMuscle !== "all"
            ? MUSCLE_GROUP_LABELS[selectedMuscle]?.label || "Цільова група"
            : "Комплексна реабілітація",
        exercises: stagedExercises,
        is_active: true,
      });

      if (res.success && res.plan) {
        setActivePlan(res.plan);
        setIsBuilderOpen(false);
        setSaveSuccessMsg("План ЛФК збережено та синхронізовано з телефоном гравця! 📱");
        setTimeout(() => setSaveSuccessMsg(null), 6000);
      }
    });
  };

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
            Створюйте індивідуальні програми вправ з фільтрацією за м&apos;язовими групами, суглобами та травмами для відображення в особистому кабінеті гравця.
          </p>
        </div>

        <button
          onClick={() => setIsBuilderOpen(!isBuilderOpen)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
        >
          <span>{isBuilderOpen ? "✕ Згорнути конструктор" : "🛠️ Відкрити конструктор плану"}</span>
        </button>
      </div>

      {saveSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <span>✓</span>
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* ACTIVE PLAN DISPLAY (IF NOT IN EDITING MODE) */}
      {!isBuilderOpen && activePlan && (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div>
              <div className="text-xs text-sky-400 font-bold uppercase tracking-wider">
                Поточний призначений комплекс ЛФК:
              </div>
              <h4 className="text-sm font-bold text-white mt-0.5">{activePlan.title}</h4>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              🟢 Активний у кабінеті гравця
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {activePlan.exercises.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-white">{ex.name}</span>
                  <span className="font-mono text-sky-400 font-semibold px-2 py-0.5 rounded bg-sky-500/10 shrink-0">
                    {ex.setsReps}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{ex.technique}</div>
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
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex-1 max-w-md">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Назва комплексу реабілітації:
                </label>
                <input
                  type="text"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  Обрано вправ: <strong className="text-white font-mono">{stagedExercises.length}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleSavePlan}
                  disabled={isPending || stagedExercises.length === 0}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                >
                  {isPending ? "Збереження..." : "💾 Призначити гравцю"}
                </button>
              </div>
            </div>

            {/* Staged Exercises Grid (Can adjust reps or remove) */}
            {stagedExercises.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                План порожній. Оберіть вправи з каталогу нижче та натисніть <strong>«+ Додати в план»</strong>.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Вправи у поточному плані:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stagedExercises.map((item) => (
                    <div
                      key={item.exerciseId}
                      className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/20 space-y-2 relative group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-white text-xs leading-tight pr-6">{item.name}</div>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(item.exerciseId)}
                          title="Видалити з плану"
                          className="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs absolute top-3 right-3"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Підходи та повторення:</label>
                          <input
                            type="text"
                            value={item.setsReps}
                            onChange={(e) =>
                              handleUpdateExerciseParam(item.exerciseId, "setsReps", e.target.value)
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-sky-400 font-mono focus:border-sky-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-0.5">Клінічна примітка / Застереження:</label>
                          <input
                            type="text"
                            value={item.notes || ""}
                            onChange={(e) =>
                              handleUpdateExerciseParam(item.exerciseId, "notes", e.target.value)
                            }
                            placeholder="Напр., без болю або контролювати кут 45°"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 focus:border-sky-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
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
                  placeholder="Пошук вправи за назвою або технікою..."
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
                  value={selectedInjury}
                  onChange={(e) => setSelectedInjury(e.target.value)}
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
                  <option value="all">Усі фази RTP</option>
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

                return (
                  <div
                    key={ex.id}
                    className={`rounded-2xl border bg-slate-900/60 backdrop-blur-md p-4 flex flex-col justify-between transition-all ${
                      isStaged
                        ? "border-sky-500/50 bg-sky-950/20"
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
                            ? "Етап 1-2"
                            : ex.phase === "intermediate"
                            ? "Етап 3"
                            : "Етап 4-5"}
                        </span>
                      </div>

                      {/* Title & Target */}
                      <h4 className="text-sm font-bold text-white leading-snug">{ex.name}</h4>
                      <p className="text-[11px] text-sky-400/90 font-medium mt-1">
                        🎯 {ex.targetArea}
                      </p>

                      {/* Technique & Guidance */}
                      <p className="text-xs text-slate-300 leading-relaxed mt-2 line-clamp-3">
                        {ex.technique}
                      </p>

                      {ex.precautions && (
                        <p className="text-[10px] text-amber-300/80 italic mt-2">
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
                          className="px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold hover:bg-sky-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          ➕ Додати в план
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
