"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";
import { TREATMENT_CATEGORY_META, WADA_META } from "@/types/pharmacy";
import { deleteTreatmentAndRollbackStockAction } from "@/actions/pharmacy-actions";

type Props = {
  playerId: string;
  playerName: string;
  initialTreatments: MedicalTreatmentEntry[];
};

export default function PlayerTreatmentsCard({ playerId: _playerId, playerName, initialTreatments }: Props) {
  const [treatments, setTreatments] = useState<MedicalTreatmentEntry[]>(initialTreatments);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRollback = (treatment: MedicalTreatmentEntry) => {
    if (
      !confirm(
        `Скасувати призначення "${treatment.title}"? ${
          treatment.units_deducted
            ? `Списані медикаменти (${treatment.units_deducted} од.) будуть автоматично повернуті на склад аптеки.`
            : ""
        }`
      )
    ) {
      return;
    }

    setDeletingId(treatment.id);
    startTransition(async () => {
      const res = await deleteTreatmentAndRollbackStockAction(treatment.id);
      setDeletingId(null);
      if (res.success) {
        setTreatments((prev) => prev.filter((t) => t.id !== treatment.id));
      } else {
        alert(res.error || "Помилка при скасуванні призначення");
      }
    });
  };

  return (
    <Card className="p-5 md:p-6 bg-slate-900/60 backdrop-blur-xl border border-sky-500/20 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-lg">
            💊
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-wide">
                Медикаментозні призначення та Процедури
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300">
                {treatments.length}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Індивідуальний облік ліків, ін&apos;єкцій та процедур {playerName} з аптечного складу клубу
            </p>
          </div>
        </div>

        <Link
          href="/pharmacy"
          className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>➕</span> Нове призначення в аптеці
        </Link>
      </div>

      {treatments.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          Призначень фармакотерапії та ін&apos;єкційних процедур для гравця не зафіксовано.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Дата</th>
                <th className="py-2.5 px-3">Препарат / Процедура</th>
                <th className="py-2.5 px-3">Дозування & Курс</th>
                <th className="py-2.5 px-3">Причина / Травма</th>
                <th className="py-2.5 px-3">WADA Статус</th>
                <th className="py-2.5 px-3">Списано</th>
                <th className="py-2.5 px-3">Лікар</th>
                <th className="py-2.5 px-3 text-right">Дія</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {treatments.map((tr) => {
                const catMeta = TREATMENT_CATEGORY_META[tr.category] || {
                  label: tr.category,
                  icon: "💊",
                  badgeClass: "",
                };
                const wada = tr.wada_status ? WADA_META[tr.wada_status] : WADA_META.allowed;

                return (
                  <tr key={tr.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-300 font-mono whitespace-nowrap">{tr.date}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span>{catMeta.icon}</span>
                        <span>{tr.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{catMeta.label}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <div className="font-semibold">{tr.dosage_or_params || "—"}</div>
                      {tr.duration_note && (
                        <div className="text-[10px] text-sky-400 font-mono">
                          Тривалість: {tr.duration_note}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <div className="max-w-xs truncate" title={tr.reason || ""}>
                        {tr.reason || "Планова терапія"}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold border inline-flex items-center gap-1 ${wada.badgeClass}`}
                        >
                          <span>{wada.icon}</span>
                          <span>{wada.label.split(":")[0]}</span>
                        </span>
                        {tr.doctor_wada_confirmed && (
                          <div className="text-[9px] text-emerald-400 font-medium">
                            ✓ Підтверджено лікарем
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      {tr.units_deducted ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-[10px]">
                          -{tr.units_deducted} од.
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{tr.doctor_name}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleRollback(tr)}
                        disabled={deletingId === tr.id || isPending}
                        title="Скасувати призначення та повернути списані медикаменти на склад"
                        className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] font-bold transition-all disabled:opacity-40"
                      >
                        {deletingId === tr.id ? "Відкат..." : "✕ Скасувати"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
