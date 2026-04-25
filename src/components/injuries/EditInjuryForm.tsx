"use client";
import { useActionState } from "react";
import { updateInjuryAction, type UpdateInjuryState } from "@/actions/update-injury-action";
import Card from "@/components/ui/Card";
import { INJURY_TYPE_UA, LOCATION_UA, SIDE_UA, SEVERITY_UA, MECHANISM_UA } from "@/lib/constants";

type Injury = { id: string; injury_type: string; location: string; side: string; severity: string; mechanism: string; date_of_injury: string; expected_return_date: string | null; description: string | null };
const inputClass = "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function EditInjuryForm({ injury }: { injury: Injury }) {
  const [state, formAction, isPending] = useActionState<UpdateInjuryState, FormData>(updateInjuryAction, {});
  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="injuryId" value={injury.id} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Тип травми *</label><select name="injuryType" required className={inputClass} defaultValue={injury.injury_type}>{Object.entries(INJURY_TYPE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={labelClass}>Локалізація *</label><select name="location" required className={inputClass} defaultValue={injury.location}>{Object.entries(LOCATION_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Сторона *</label><select name="side" required className={inputClass} defaultValue={injury.side}>{Object.entries(SIDE_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={labelClass}>Тяжкість *</label><select name="severity" required className={inputClass} defaultValue={injury.severity}>{Object.entries(SEVERITY_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Механізм</label><select name="mechanism" className={inputClass} defaultValue={injury.mechanism}>{Object.entries(MECHANISM_UA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={labelClass}>Дата травми *</label><input name="dateOfInjury" type="date" required defaultValue={injury.date_of_injury} className={inputClass} /></div>
        </div>
        <div><label className={labelClass}>Очікувана дата повернення</label><input name="expectedReturnDate" type="date" defaultValue={injury.expected_return_date ?? ""} className={inputClass} /></div>
        <div><label className={labelClass}>Опис</label><textarea name="description" rows={3} defaultValue={injury.description ?? ""} className={inputClass + " resize-none"} /></div>
        {state.error && <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">{state.error}</div>}
        <button type="submit" disabled={isPending} className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm">{isPending ? "Зберігаємо..." : "Зберегти зміни"}</button>
      </form>
    </Card>
  );
}
