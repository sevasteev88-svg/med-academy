"use client";
import { useState, useTransition } from "react";
import { createRehabPhasesFromTemplate, addCustomRehabPhase, updateRehabPhaseStatus } from "@/actions/rehab-phase-actions";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { REHAB_STATUS_UA } from "@/lib/constants";

type Phase = { id: string; name: string; sort_order: number; status: string; started_at: string | null; completed_at: string | null; notes: string | null };
const inputClass = "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 transition-colors";

function statusBadgeVariant(s: string): "ok" | "warn" | "danger" | "neutral" {
  if (s === "completed") return "ok"; if (s === "in_progress") return "warn"; return "neutral";
}

export default function RehabTracker({ injuryId, phases, injuryStatus }: { injuryId: string; phases: Phase[]; injuryStatus: string }) {
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");

  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const completed = sorted.filter(p => p.status === "completed" || p.status === "skipped").length;
  const progress = sorted.length > 0 ? Math.round((completed / sorted.length) * 100) : 0;

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">План реабілітації</h3>
      {sorted.length === 0 ? (
        <Card>
          <p className="text-slate-500 text-sm mb-3">План реабілітації ще не створено.</p>
          <div className="flex gap-2">
            <button onClick={() => startTransition(async () => { await createRehabPhasesFromTemplate(injuryId); })} disabled={isPending} className="bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-xs transition-colors">Створити з шаблону</button>
            <button onClick={() => setShowAddForm(true)} disabled={isPending} className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2 px-4 rounded-lg text-xs transition-colors">Створити свій</button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mb-3">
            <div className="flex justify-between items-center mb-2"><span className="text-xs text-slate-500">Прогрес</span><span className="text-sm font-bold font-mono text-white">{progress}%</span></div>
            <div className="h-2 rounded-full bg-surface-raised overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand-blue to-status-ok transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          </Card>
          <div className="space-y-2">
            {sorted.map((phase, idx) => (
              <Card key={phase.id}>
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${phase.status === "completed" ? "bg-status-ok/20 text-status-ok" : phase.status === "in_progress" ? "bg-status-warn/20 text-status-warn" : "bg-slate-800 text-slate-500"}`}>
                      {phase.status === "completed" ? "✓" : idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold truncate ${phase.status === "completed" ? "text-slate-500 line-through" : "text-white"}`}>{phase.name}</div>
                      {(phase.started_at || phase.completed_at) && (
                        <div className="text-[10px] text-slate-600">
                          {phase.started_at && `Початок: ${new Date(phase.started_at).toLocaleDateString("uk-UA")}`}
                          {phase.completed_at && ` · Завершено: ${new Date(phase.completed_at).toLocaleDateString("uk-UA")}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusBadgeVariant(phase.status)}>{REHAB_STATUS_UA[phase.status]}</Badge>
                    {injuryStatus !== "closed" && (
                      <select value={phase.status} onChange={(e) => startTransition(async () => { await updateRehabPhaseStatus(phase.id, e.target.value, injuryId); })} disabled={isPending} className="bg-surface-raised border border-blue-900/20 rounded px-1 py-0.5 text-[10px] text-slate-400 focus:outline-none">
                        <option value="planned">Заплановано</option><option value="in_progress">В процесі</option><option value="completed">Завершено</option><option value="skipped">Пропущено</option>
                      </select>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {injuryStatus !== "closed" && (
            <div className="mt-2">
              {showAddForm ? (
                <Card><div className="flex gap-2">
                  <input value={newPhaseName} onChange={(e) => setNewPhaseName(e.target.value)} placeholder="Назва етапу..." className={inputClass} />
                  <button onClick={() => { if (!newPhaseName.trim()) return; const maxOrder = Math.max(0, ...sorted.map(p => p.sort_order)); startTransition(async () => { await addCustomRehabPhase(injuryId, newPhaseName, maxOrder); setNewPhaseName(""); setShowAddForm(false); }); }} disabled={isPending || !newPhaseName.trim()} className="bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors whitespace-nowrap">Додати</button>
                  <button onClick={() => setShowAddForm(false)} className="text-slate-500 hover:text-slate-300 text-xs px-2">✕</button>
                </div></Card>
              ) : (
                <button onClick={() => setShowAddForm(true)} className="text-xs font-semibold text-brand-blue hover:text-brand-blue-light transition-colors">+ Додати свій етап</button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
