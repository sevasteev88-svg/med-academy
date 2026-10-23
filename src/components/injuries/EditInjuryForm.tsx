"use client";

import { useActionState, useState, useMemo } from "react";
import { updateInjuryAction, type UpdateInjuryState } from "@/actions/update-injury-action";
import Card from "@/components/ui/Card";
import {
  INJURY_TYPE_UA,
  LOCATION_UA,
  SIDE_UA,
  SEVERITY_UA,
  MECHANISM_UA,
  ONSET_UA,
  OCCURRENCE_UA,
} from "@/lib/constants";
import { getInjuryUefaSeverityInfo } from "@/lib/uefa-severity";

type Injury = {
  id: string;
  injury_type: string;
  location: string;
  side: string;
  severity: string;
  mechanism: string;
  date_of_injury: string;
  expected_return_date: string | null;
  actual_return_date?: string | null;
  description: string | null;
  osiics_code?: string | null;
  onset?: string | null;
  occurrence?: string | null;
  previous_injury_id?: string | null;
};

const inputClass =
  "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-400 mb-1.5";

export default function EditInjuryForm({ injury }: { injury: Injury }) {
  const [state, formAction, isPending] = useActionState<UpdateInjuryState, FormData>(
    updateInjuryAction,
    {}
  );

  const [dateOfInjury, setDateOfInjury] = useState(injury.date_of_injury);
  const [expectedReturnDate, setExpectedReturnDate] = useState(injury.expected_return_date ?? "");
  const [actualReturnDate, setActualReturnDate] = useState(injury.actual_return_date ?? "");

  const uefaInfo = useMemo(() => {
    return getInjuryUefaSeverityInfo({
      dateOfInjury,
      actualReturnDate: actualReturnDate || null,
      expectedReturnDate: expectedReturnDate || null,
      status: actualReturnDate ? "closed" : "active",
    });
  }, [dateOfInjury, actualReturnDate, expectedReturnDate]);

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="injuryId" value={injury.id} />

        {/* UEFA Тяжкість Live Preview */}
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${uefaInfo.colorClass}`}>
          <div>
            <div className="font-bold text-sm">{uefaInfo.badgeText}</div>
            <div className="text-[11px] opacity-80 mt-0.5">
              {actualReturnDate
                ? `Фактично втрачено: ${uefaInfo.timeLossDays} днів (травма закрита)`
                : expectedReturnDate
                ? `Очікувано за прогнозом: ${uefaInfo.expectedDays ?? 0} днів`
                : `Поточний термін: ${uefaInfo.timeLossDays} днів у лазареті`}
            </div>
          </div>
          <span className="text-xl">⏱️</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Тип травми *</label>
            <select name="injuryType" required className={inputClass} defaultValue={injury.injury_type}>
              {Object.entries(INJURY_TYPE_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Локалізація *</label>
            <select name="location" required className={inputClass} defaultValue={injury.location}>
              {Object.entries(LOCATION_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Сторона *</label>
            <select name="side" required className={inputClass} defaultValue={injury.side}>
              {Object.entries(SIDE_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Клінічна оцінка лікаря *</label>
            <select name="severity" required className={inputClass} defaultValue={injury.severity}>
              {Object.entries(SEVERITY_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Механізм</label>
            <select name="mechanism" className={inputClass} defaultValue={injury.mechanism}>
              {Object.entries(MECHANISM_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Дата травми *</label>
            <input
              name="dateOfInjury"
              type="date"
              required
              value={dateOfInjury}
              onChange={(e) => setDateOfInjury(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Стандарти UEFA: Onset та Occurrence */}
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-sky-500/10">
          <div>
            <label className={labelClass}>Характер виникнення (UEFA Onset)</label>
            <select name="onset" className={inputClass} defaultValue={injury.onset ?? "unknown"}>
              {Object.entries(ONSET_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Тип випадку (UEFA Occurrence)</label>
            <select name="occurrence" className={inputClass} defaultValue={injury.occurrence ?? "unknown"}>
              {Object.entries(OCCURRENCE_UA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Код OSIICS */}
        <div>
          <label className={labelClass}>Код OSIICS (наприклад TMHM, KJAA)</label>
          <input
            name="osiicsCode"
            type="text"
            placeholder="Введіть код класифікатора..."
            defaultValue={injury.osiics_code ?? ""}
            className={inputClass + " uppercase font-mono"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Очікувана дата повернення</label>
            <input
              name="expectedReturnDate"
              type="date"
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Фактична дата повернення (закриття)</label>
            <input
              name="actualReturnDate"
              type="date"
              value={actualReturnDate}
              onChange={(e) => setActualReturnDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Опис</label>
          <textarea
            name="description"
            rows={3}
            defaultValue={injury.description ?? ""}
            className={inputClass + " resize-none"}
          />
        </div>

        {state?.error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm"
        >
          {isPending ? "Зберігаємо..." : "Зберегти зміни"}
        </button>
      </form>
    </Card>
  );
}
