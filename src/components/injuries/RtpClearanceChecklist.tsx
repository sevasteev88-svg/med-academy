"use client";

import { useState, useTransition } from "react";
import {
  submitRtpClearanceAction,
  type RtpCriteriaState,
} from "@/actions/submit-rtp-clearance-action";

type Props = {
  injuryId: string;
  injuryStatus: string;
  playerName: string;
};

export default function RtpClearanceChecklist({
  injuryId,
  injuryStatus,
  playerName,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    success?: boolean;
    error?: string;
    msg?: string;
  } | null>(null);

  const [criteria, setCriteria] = useState<RtpCriteriaState>({
    noPalpationPain: false,
    fullPainfreeRom: false,
    noEffusionOrSwelling: false,
    strengthDeficitLessThan10Pct: false,
    eccentricControlPassed: false,
    maximalSprint30mPassed: false,
    changeOfDirectionPassed: false,
    fullTrainingSessionCompleted: false,
    psychologicalReadinessPassed: false,
    doctorNote: "",
  });

  const [closeInjury, setCloseInjury] = useState(false);

  const passedCount = [
    criteria.noPalpationPain,
    criteria.fullPainfreeRom,
    criteria.noEffusionOrSwelling,
    criteria.strengthDeficitLessThan10Pct,
    criteria.eccentricControlPassed,
    criteria.maximalSprint30mPassed,
    criteria.changeOfDirectionPassed,
    criteria.fullTrainingSessionCompleted,
    criteria.psychologicalReadinessPassed,
  ].filter(Boolean).length;

  const totalCount = 9;
  const percentage = Math.round((passedCount / totalCount) * 100);

  function toggle(key: keyof Omit<RtpCriteriaState, "doctorNote">) {
    setCriteria((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const res = await submitRtpClearanceAction(injuryId, criteria, closeInjury);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({
          success: true,
          msg: closeInjury
            ? `✓ Гравець ${playerName} успішно пройшов RTP-допуск! Травму закрито, гравець готовий до гри.`
            : `✓ Результати тестування збережено (${res.passedCriteria}/${res.totalCriteria} критеріїв виконано).`,
        });
      }
    });
  }

  const isClosed = injuryStatus === "closed";

  return (
    <div className="bg-slate-900/80 border border-blue-900/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <h3 className="text-sm font-bold text-white">
              Чек-лист повернення в гру (RTP Clearance)
            </h3>
            <p className="text-[11px] text-slate-400">
              Стандарти Aspetar & FC Barcelona для безпечного допуску до матчів
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                percentage === 100
                  ? "bg-status-ok/15 text-status-ok"
                  : percentage >= 60
                  ? "bg-status-warn/15 text-status-warn"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {passedCount}/{totalCount} ({percentage}%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs px-3 py-1 rounded-lg bg-surface border border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {isOpen ? "Згорнути" : "Розгорнути"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="pt-3 border-t border-slate-800/80 space-y-4">
          {/* Блок 1: Клінічні критерії */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🩺</span>
              <span>1. Клінічні критерії (кабінет лікаря)</span>
            </div>
            <div className="space-y-1.5 pl-6">
              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.noPalpationPain}
                  onChange={() => toggle("noPalpationPain")}
                  className="rounded border-slate-700"
                />
                <span>Повна відсутність локальної болісності при глибокій пальпації</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.fullPainfreeRom}
                  onChange={() => toggle("fullPainfreeRom")}
                  className="rounded border-slate-700"
                />
                <span>100% безболісна амплітуда рухів (ROM) порівняно зі здоровою кінцівкою</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.noEffusionOrSwelling}
                  onChange={() => toggle("noEffusionOrSwelling")}
                  className="rounded border-slate-700"
                />
                <span>Повна відсутність набряку, випоту або постізометричної реакції</span>
              </label>
            </div>
          </div>

          {/* Блок 2: Симетричність сили */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>💪</span>
              <span>2. Функціонально-симетричні тести</span>
            </div>
            <div className="space-y-1.5 pl-6">
              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.strengthDeficitLessThan10Pct}
                  onChange={() => toggle("strengthDeficitLessThan10Pct")}
                  className="rounded border-slate-700"
                />
                <span>Дефіцит пікової сили м'яза &lt; 10% (за даними ручного динамометра)</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.eccentricControlPassed}
                  onChange={() => toggle("eccentricControlPassed")}
                  className="rounded border-slate-700"
                />
                <span>Безболісний ексцентричний контроль на довгих важелях</span>
              </label>
            </div>
          </div>

          {/* Блок 3: Польові футбольні тести */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>⚽</span>
              <span>3. Польові функціональні тести (на газоні)</span>
            </div>
            <div className="space-y-1.5 pl-6">
              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.maximalSprint30mPassed}
                  onChange={() => toggle("maximalSprint30mPassed")}
                  className="rounded border-slate-700"
                />
                <span>Спринт на 30м з максимальною інтенсивністю (≥ 95% від дотравматичної швидкості)</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.changeOfDirectionPassed}
                  onChange={() => toggle("changeOfDirectionPassed")}
                  className="rounded border-slate-700"
                />
                <span>Тест на зміну напрямку руху (5-0-5 або T-Test) на 100% зусилля без дискомфорту</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.fullTrainingSessionCompleted}
                  onChange={() => toggle("fullTrainingSessionCompleted")}
                  className="rounded border-slate-700"
                />
                <span>Успішне завершення мінімум 1 повного командного тренування з контактною боротьбою</span>
              </label>
            </div>
          </div>

          {/* Блок 4: Психологічна готовність */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🧠</span>
              <span>4. Психологічна готовність</span>
            </div>
            <div className="space-y-1.5 pl-6">
              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={criteria.psychologicalReadinessPassed}
                  onChange={() => toggle("psychologicalReadinessPassed")}
                  className="rounded border-slate-700"
                />
                <span>Відсутність кинезіофобії (страху рецидиву при стиках, підкатах та ударах)</span>
              </label>
            </div>
          </div>

          {/* Примітка лікаря */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Медичний коментар лікаря (Clearance Notes):
            </label>
            <input
              type="text"
              value={criteria.doctorNote}
              onChange={(e) =>
                setCriteria((prev) => ({ ...prev, doctorNote: e.target.value }))
              }
              placeholder="Наприклад: допущено до матчу на 45-60 хвилин за погодженням з фітнес-тренером..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Опція закриття травми */}
          {!isClosed && (
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="closeInjuryCheck"
                checked={closeInjury}
                onChange={(e) => setCloseInjury(e.target.checked)}
                className="rounded border-slate-700"
              />
              <label
                htmlFor="closeInjuryCheck"
                className="text-xs text-slate-300 cursor-pointer font-medium"
              >
                Оформити повний допуск до гри та <strong>закрити травму</strong> (змінити статус на «Закрита» та обнулити біль ВАШ = 0)
              </label>
            </div>
          )}

          {feedback?.error && (
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {feedback.error}
            </div>
          )}

          {feedback?.msg && (
            <div className="p-2.5 rounded-lg bg-green-500/15 border border-green-500/30 text-xs text-green-300">
              {feedback.msg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                closeInjury
                  ? "bg-status-ok hover:bg-green-600 text-slate-950 shadow-md shadow-status-ok/30"
                  : "bg-brand-blue hover:bg-blue-600 text-white"
              } disabled:opacity-50`}
            >
              {isPending
                ? "Збереження…"
                : closeInjury
                ? "✅ Підтвердити допуск і закрити травму"
                : "💾 Зберегти результати чек-листа"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
