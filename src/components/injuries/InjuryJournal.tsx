"use client";

import { useActionState, useState, useRef, useTransition, useEffect } from "react";
import { addInjuryLogAction, type AddLogState } from "@/actions/add-injury-log-action";
import { updateInjuryStatusAction } from "@/actions/update-injury-status-action";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { STATUS_UA, LOG_CATEGORY_UA, LOG_CATEGORY_ICONS } from "@/lib/constants";

type LogEntry = { id: string; date: string; note: string; category: string; created_at: string };

const inputClass = "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function InjuryJournal({
  injuryId, logs, currentStatus,
}: {
  injuryId: string; logs: LogEntry[]; currentStatus: string;
}) {
  const [logState, logAction, isAddingLog] = useActionState<AddLogState, FormData>(addInjuryLogAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [isPendingStatus, startTransition] = useTransition();
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    if (logState.success) {
      formRef.current?.reset();
    }
  }, [logState.success]);

  function handleStatusChange(newStatus: string) {
    setStatusError("");
    startTransition(async () => {
      const result = await updateInjuryStatusAction(injuryId, newStatus);
      if (result.error) setStatusError(result.error);
    });
  }

  const statusFlow: Record<string, { next: string; label: string; variant: "ok" | "warn" | "danger" }[]> = {
    active: [
      { next: "rehabilitation", label: "→ Реабілітація", variant: "warn" },
      { next: "closed", label: "→ Закрити", variant: "ok" },
    ],
    rehabilitation: [
      { next: "active", label: "← Гостра", variant: "danger" },
      { next: "closed", label: "→ Закрити", variant: "ok" },
    ],
    closed: [{ next: "active", label: "← Рецидив", variant: "danger" }],
  };
  const transitions = statusFlow[currentStatus] ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Статус травми</h3>
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={currentStatus === "active" ? "danger" : currentStatus === "rehabilitation" ? "warn" : "ok"}>
              {STATUS_UA[currentStatus] ?? currentStatus}
            </Badge>
            <div className="flex gap-2">
              {transitions.map((t) => (
                <button key={t.next} onClick={() => handleStatusChange(t.next)} disabled={isPendingStatus}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    t.variant === "ok" ? "border-status-ok/30 text-status-ok hover:bg-status-ok/10" :
                    t.variant === "warn" ? "border-status-warn/30 text-status-warn hover:bg-status-warn/10" :
                    "border-status-danger/30 text-status-danger hover:bg-status-danger/10"
                  }`}>{t.label}</button>
              ))}
            </div>
          </div>
          {statusError && <div className="mt-2 text-xs text-status-danger">{statusError}</div>}
        </Card>
      </section>

      {currentStatus !== "closed" && (
        <section>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Додати запис до журналу</h3>
          <Card>
            <form ref={formRef} action={logAction} className="space-y-3">
              <input type="hidden" name="injuryId" value={injuryId} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Категорія</label>
                  <select name="category" className={inputClass} defaultValue="note">
                    {Object.entries(LOG_CATEGORY_UA).map(([k, v]) => (
                      <option key={k} value={k}>{LOG_CATEGORY_ICONS[k]} {v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Дата</label>
                  <input name="date" type="date" defaultValue={new Date().toISOString().split("T")[0]} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Запис *</label>
                <textarea name="note" required rows={3} placeholder="Деталі огляду, призначення, результати обстеження..." className={inputClass + " resize-none"} />
              </div>
              {logState.error && <div className="text-xs text-status-danger">{logState.error}</div>}
              <button type="submit" disabled={isAddingLog}
                className="bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
                {isAddingLog ? "Зберігаємо..." : "Додати"}
              </button>
            </form>
          </Card>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Журнал ({logs.length})</h3>
        {logs.length === 0 ? (
          <Card><p className="text-slate-500 text-center py-4 text-sm">Записів ще немає</p></Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex gap-2 min-w-0">
                    <span className="text-base shrink-0">{LOG_CATEGORY_ICONS[log.category] ?? "📝"}</span>
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-600 mb-0.5">{LOG_CATEGORY_UA[log.category] ?? "Примітка"}</div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{log.note}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-600 font-mono shrink-0">
                    {new Date(log.date).toLocaleDateString("uk-UA")}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
