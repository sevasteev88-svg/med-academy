"use client";
// src/app/injuries/[id]/ClassificationSection.tsx
// Клієнтська секція класифікації: показ + модалка з класифікатором.

import { useState } from "react";
import { useRouter } from "next/navigation";
import MlgrClassifier, { type ClassificationResult } from "@/components/injuries/MlgrClassifier";
import { classifyInjury } from "@/actions/classify-injury-action";
import type { ClassificationInput } from "@/lib/mlgr-classifier";
import { RTP_RISK_LABELS } from "@/lib/mlgr-classifier";
import type { RtpRisk, MlgrMuscle, MlgrMechanism, MlgrLocation, MlgrGrade, BamicLocation, MunichType } from "@/types/database";

type InjuryClassData = {
  id: string;
  dateOfInjury: string;
  injuryType: string;
  isClassified: boolean;
  // поточні значення (для предзаповнення + показу)
  mlgrMuscle: MlgrMuscle | null;
  mlgrMechanism: MlgrMechanism | null;
  mlgrLocation: MlgrLocation | null;
  mlgrGrade: MlgrGrade | null;
  mlgrHasR: boolean;
  mlgrCsaPct: number | null;
  mlgrReinjury: number;
  mlgrCode: string | null;
  bamicGrade: number | null;
  bamicLocation: BamicLocation | null;
  bamicCode: string | null;
  munichType: MunichType | null;
  rtpMinDays: number | null;
  rtpMaxDays: number | null;
  rtpRisk: RtpRisk | null;
};

export default function ClassificationSection({ injury }: { injury: InjuryClassData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMuscular = injury.injuryType === "muscular";

  // Якщо не м'язова — класифікатор не показуємо взагалі
  if (!isMuscular) return null;

  // Предзаповнення для докласифікації
  const initial: Partial<ClassificationInput> = {
    muscle: injury.mlgrMuscle ?? "",
    mechanism: injury.mlgrMechanism ?? "",
    location: injury.mlgrLocation ?? "",
    grade: injury.mlgrGrade,
    hasR: injury.mlgrHasR,
    csaPct: injury.mlgrCsaPct,
    reinjury: injury.mlgrReinjury,
    bamicGrade: injury.bamicGrade != null ? String(injury.bamicGrade) : "",
    bamicLocation: injury.bamicLocation ?? "",
    munichType: injury.munichType ?? "",
  };

  async function handleSave(result: ClassificationResult) {
    setSaving(true);
    setError(null);
    const res = await classifyInjury({
      injuryId: injury.id,
      dateOfInjury: injury.dateOfInjury,
      mlgrMuscle: result.input.muscle,
      mlgrMechanism: result.input.mechanism,
      mlgrLocation: result.input.location,
      mlgrGrade: result.input.grade,
      mlgrHasR: result.input.hasR,
      mlgrCsaPct: result.input.csaPct,
      mlgrReinjury: result.input.reinjury,
      mlgrCode: result.mlgrCode,
      bamicGrade: result.input.bamicGrade,
      bamicLocation: result.input.bamicLocation,
      bamicCode: result.bamicCode,
      munichType: result.input.munichType,
      rtpMinDays: result.rtp?.minDays ?? null,
      rtpMaxDays: result.rtp?.maxDays ?? null,
      rtpRisk: result.rtp?.risk ?? null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div>
      {/* Якщо вже класифіковано — показуємо результат */}
      {injury.isClassified ? (
        <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] uppercase tracking-widest text-slate-600">
              Класифікація пошкодження
            </span>
            <button
              onClick={() => setOpen(true)}
              className="text-[10px] text-blue-400 border border-blue-500/25 bg-blue-500/8 px-2.5 py-1 rounded-lg hover:bg-blue-500/15 transition-colors"
            >
              ✏️ Уточнити
            </button>
          </div>

          {/* Коди */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {injury.mlgrCode && (
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/25 font-medium">
                MLG-R: {injury.mlgrCode}
              </span>
            )}
            {injury.bamicCode && (
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25 font-medium">
                BAMIC: {injury.bamicCode}
                {injury.bamicLocation === "c" && <span className="ml-1 text-[9px]">⚠️ T-junction</span>}
              </span>
            )}
            {injury.munichType && (
              <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/25 font-medium">
                Munich: {injury.munichType}
              </span>
            )}
          </div>

          {/* RTP */}
          {injury.rtpMinDays != null && (
            <div className="bg-slate-950/50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-600">Прогноз RTP</div>
                <div className="text-[18px] font-medium text-slate-200">
                  {injury.rtpMinDays}–{injury.rtpMaxDays}{" "}
                  <span className="text-[12px] text-slate-500">днів</span>
                </div>
              </div>
              {injury.rtpRisk && (
                <span
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{
                    background: `${injury.rtpRisk === "high" ? "#EF4444" : injury.rtpRisk === "moderate" ? "#F59E0B" : "#22C55E"}18`,
                    color: injury.rtpRisk === "high" ? "#EF4444" : injury.rtpRisk === "moderate" ? "#F59E0B" : "#22C55E",
                  }}
                >
                  {RTP_RISK_LABELS[injury.rtpRisk]}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Ще не класифіковано — кнопка */
        <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-slate-400">Класифікація не вказана</p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              MLG-R + BAMIC + Munich для точного прогнозу RTP
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-[11px] text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors font-medium"
          >
            🔬 Класифікувати
          </button>
        </div>
      )}

      {/* Модалка з класифікатором */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8 px-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {error && (
              <div className="mb-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[11px] text-red-400">
                {error}
              </div>
            )}
            <MlgrClassifier
              initial={initial}
              onSave={handleSave}
              onCancel={() => !saving && setOpen(false)}
              saving={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}
