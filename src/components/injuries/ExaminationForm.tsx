"use client";

import { useActionState, useState, useRef, useEffect } from "react";
import { addExaminationAction, type AddExamState } from "@/actions/add-examination-action";
import Card from "@/components/ui/Card";
import { EXAM_GRADE_UA, ROM_GRADE_UA, MUSCLE_TONE_UA } from "@/lib/constants";

const inputClass = "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

function vasColor(v: number): string {
  if (v >= 7) return "#ef4444"; if (v >= 4) return "#eab308"; return "#22c55e";
}

export default function ExaminationForm({
  injuryId, currentVas,
}: {
  injuryId: string; currentVas: number;
}) {
  const [state, formAction, isPending] = useActionState<AddExamState, FormData>(addExaminationAction, {});
  const [vas, setVas] = useState(currentVas);
  const [isOpen, setIsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setIsOpen(false);
    }
  }, [state.success]);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Щоденний огляд</h3>
        <button onClick={() => setIsOpen(!isOpen)} className="text-xs font-semibold text-brand-blue hover:text-brand-blue-light transition-colors">
          {isOpen ? "Сховати" : "+ Новий огляд"}
        </button>
      </div>

      {isOpen && (
        <Card>
          <form ref={formRef} action={formAction} className="space-y-4">
            <input type="hidden" name="injuryId" value={injuryId} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Дата огляду *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>ВАШ *</label>
                <div className="flex items-center gap-3">
                  <input type="range" name="vasScore" min={0} max={10} value={vas}
                    onChange={(e) => setVas(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, ${vasColor(vas)} 0%, ${vasColor(vas)} ${vas * 10}%, #1e293b ${vas * 10}%, #1e293b 100%)` }}
                  />
                  <span className="text-xl font-extrabold font-mono w-8 text-center" style={{ color: vasColor(vas) }}>{vas}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-blue-900/15 pt-4">
              <div className="text-xs font-semibold text-slate-400 mb-3">Об'єктивні дані</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Набряк</label>
                  <select name="edema" className={inputClass} defaultValue="none">
                    {Object.entries(EXAM_GRADE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Гематома</label>
                  <select name="hematoma" className={inputClass} defaultValue="none">
                    {Object.entries(EXAM_GRADE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Об'єм рухів</label>
                  <select name="rom" className={inputClass} defaultValue="full">
                    {Object.entries(ROM_GRADE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Біль при пальпації</label>
                  <select name="palpationPain" className={inputClass} defaultValue="none">
                    {Object.entries(EXAM_GRADE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>М'язовий тонус</label>
                  <select name="muscleTone" className={inputClass} defaultValue="normal">
                    {Object.entries(MUSCLE_TONE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>Додаткові об'єктивні дані</label>
                <textarea name="objectiveNote" rows={2} placeholder="Результати тестів, виміри, спостереження..." className={inputClass + " resize-none"} />
              </div>
            </div>

            <div className="border-t border-blue-900/15 pt-4">
              <div className="text-xs font-semibold text-slate-400 mb-3">Суб'єктивні дані</div>
              <textarea name="subjectiveNote" rows={2} placeholder="Скарги гравця, самопочуття, якість сну..." className={inputClass + " resize-none"} />
            </div>

            {state.error && <div className="text-xs text-status-danger">{state.error}</div>}

            <button type="submit" disabled={isPending} className="bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
              {isPending ? "Зберігаємо..." : "Зберегти огляд"}
            </button>
          </form>
        </Card>
      )}
    </section>
  );
}
