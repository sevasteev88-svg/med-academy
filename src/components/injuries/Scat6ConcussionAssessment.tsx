"use client";

import { useState, useTransition } from "react";
import {
  type ConcussionAssessment,
  RTP_CONCUSSION_STAGES,
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
  const [assessments, setAssessments] = useState(initialAssessments);
  const [isOpen, setIsOpen] = useState(false);

  // Form states
  const [maddocksScore, setMaddocksScore] = useState(5);
  const [hasRedFlags, setHasRedFlags] = useState(false);
  const [symptomCount, setSymptomCount] = useState(2);
  const [symptomSeverity, setSymptomSeverity] = useState(4);
  const [bessErrors, setBessErrors] = useState(1);
  const [stage, setStage] = useState<1 | 2 | 3 | 4 | 5 | 6>(2);
  const [verdict, setVerdict] = useState<ConcussionAssessment["clinical_verdict"]>("recovering");
  const [doctor, setDoctor] = useState("Лікар-травматолог штабу");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();

  const latest = assessments[0] || null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const res = await saveConcussionAction({
        injury_id: injuryId,
        date: new Date().toISOString().split("T")[0],
        examiner: doctor,
        has_red_flags: hasRedFlags,
        red_flags_selected: hasRedFlags ? ["loss_of_consciousness"] : [],
        maddocks_score: Number(maddocksScore),
        total_symptoms_count: Number(symptomCount),
        total_symptom_severity_score: Number(symptomSeverity),
        bess_double_leg_errors: 0,
        bess_single_leg_errors: Number(bessErrors),
        bess_tandem_errors: 0,
        bess_total_errors: Number(bessErrors),
        current_rtp_stage: stage,
        clinical_verdict: verdict,
        recommendations: notes.trim() || RTP_CONCUSSION_STAGES[stage].activities,
      });

      if (res.assessment) {
        setAssessments([res.assessment, ...assessments]);
        setIsOpen(false);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Протокол струсу мозку (FIFA / SCAT6 Concussion Protocol)
            </h3>
            <p className="text-[11px] text-slate-400">
              Стандартизована оцінка на полі та 6-етапний протокол повернення
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition-all"
        >
          {isOpen ? "✕ Закрити" : "+ Оцінка SCAT6"}
        </button>
      </div>

      {latest && !isOpen && (
        <div className="bg-slate-950/60 p-4 rounded-xl border border-blue-900/20 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">
              Поточний статус:{" "}
              <strong className="text-amber-400">
                {latest.clinical_verdict === "suspected_concussion"
                  ? "🛑 Підозра на струс мозку"
                  : latest.clinical_verdict === "recovering"
                  ? "🟡 Період відновлення"
                  : "🟢 Допущений без струсу"}
              </strong>
            </span>
            <span className="font-mono text-slate-400 text-[11px]">{latest.date}</span>
          </div>

          <div className="bg-blue-950/20 p-3 rounded-lg border border-blue-900/30">
            <div className="font-bold text-brand-blue flex items-center justify-between">
              <span>{RTP_CONCUSSION_STAGES[latest.current_rtp_stage].stage}: {RTP_CONCUSSION_STAGES[latest.current_rtp_stage].title}</span>
              <span className="font-mono text-[10px] text-slate-400">Етап {latest.current_rtp_stage}/6</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              {RTP_CONCUSSION_STAGES[latest.current_rtp_stage].activities}
            </div>
          </div>
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 p-4 rounded-xl border border-blue-900/30 space-y-4 text-xs">
          <div className="font-bold text-blue-300">
            Оцінка за протоколом SCAT6 · {playerName}
          </div>

          {/* Red flags */}
          <div className="p-3 rounded-lg bg-red-950/20 border border-red-500/30 flex items-center justify-between">
            <div>
              <div className="font-bold text-red-300">Червоні прапорці (Red Flags):</div>
              <div className="text-[11px] text-slate-400">
                Втрата свідомості, біль у шиї, двоїння в очах, блювота, судоми
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-white">
              <input
                type="checkbox"
                checked={hasRedFlags}
                onChange={(e) => setHasRedFlags(e.target.checked)}
                className="w-4 h-4 rounded text-red-600 accent-red-600"
              />
              Виявлено
            </label>
          </div>

          {/* Maddocks score */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Орієнтація на полі (Maddocks Score 0-5)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={maddocksScore}
                onChange={(e) => setMaddocksScore(Number(e.target.value))}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">5 = відповів на всі питання</span>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">
                К-сть симптомів (з 22)
              </label>
              <input
                type="number"
                min={0}
                max={22}
                value={symptomCount}
                onChange={(e) => setSymptomCount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">
                Тест балансу mBESS (к-сть помилок)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={bessErrors}
                onChange={(e) => setBessErrors(Number(e.target.value))}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500">Норма: до 3 помилок</span>
            </div>
          </div>

          {/* RTP Stage */}
          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Етап протоколу повернення (Graduated Return to Play)
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(Number(e.target.value) as any)}
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
            >
              {(Object.entries(RTP_CONCUSSION_STAGES) as any).map(([num, item]: any) => (
                <option key={num} value={num}>
                  {item.stage}: {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-blue-900/20">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              {isPending ? "Збереження..." : "Затвердити оцінку SCAT6"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
