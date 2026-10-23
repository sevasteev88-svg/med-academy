"use client";

import React, { useState, useTransition } from "react";
import {
  FileText,
  AlertTriangle,
  Clock,
  CheckCircle,
  ExternalLink,
  Plus,
  Filter,
  Calendar,
} from "lucide-react";
import {
  TUE_STATUSES,
  TUE_STATUS_DETAILS,
  type TueStatus,
} from "@/types/tue";
import {
  updateTueCaseAction,
  type TueCaseWithPlayer,
} from "@/actions/tue-actions";
import { CreateTueCaseModal } from "./CreateTueCaseModal";

interface TueManagementSectionProps {
  initialCases: TueCaseWithPlayer[];
  playersList: Array<{ id: string; first_name: string; last_name: string; position: string }>;
}

export function TueManagementSection({
  initialCases,
  playersList,
}: TueManagementSectionProps) {
  const [cases, setCases] = useState<TueCaseWithPlayer[]>(initialCases);
  const [filterTab, setFilterTab] = useState<"all" | "active" | "pending" | "expired">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [prefilledSubstance, setPrefilledSubstance] = useState("");
  const [prefilledClass, setPrefilledClass] = useState("");
  const [isPending, startTransition] = useTransition();

  // Кейси, що закінчуються протягом 30 днів
  const expiringSoonCases = cases.filter(
    (c) => c.evaluation.isExpiringSoon && c.status === "схвалено"
  );

  const filteredCases = cases.filter((c) => {
    if (filterTab === "active") return c.status === "схвалено" && !c.evaluation.isExpired;
    if (filterTab === "pending") return c.status === "підготовка" || c.status === "подано";
    if (filterTab === "expired") return c.status === "закінчився" || c.evaluation.isExpired || c.status === "відхилено";
    return true;
  });

  const handleStatusChange = (id: string, newStatus: TueStatus) => {
    startTransition(async () => {
      const res = await updateTueCaseAction(id, { status: newStatus });
      if (res.success) {
        setCases((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
        );
      }
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
      {/* Шапка секції */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-rose-400" />
              Журнал терапевтичних виключень (TUE Cases)
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              {cases.length} кейсів
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Облік дозволів на S-препарати та нагадування за 30 днів до завершення
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPrefilledSubstance("");
            setPrefilledClass("S-препарат");
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Новий кейс TUE
        </button>
      </div>

      {/* Оповіщення за 30 днів до закінчення TUE */}
      {expiringSoonCases.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/50 space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>УВАГА: {expiringSoonCases.length} TUE-дозвіл(ів) потребують термінового продовження!</span>
          </div>
          <div className="divide-y divide-amber-900/40 text-xs">
            {expiringSoonCases.map((c) => (
              <div key={c.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-amber-200/90">
                <span>
                  Футболіст: <strong>{c.player.last_name} {c.player.first_name}</strong> · Препарат:{" "}
                  <strong>{c.substance}</strong> ({c.wada_class})
                </span>
                <span className="font-semibold text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-700">
                  Залишилося: {c.evaluation.daysRemaining} дн. (до {c.valid_until})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Фільтри */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {[
          ["all", `Усі (${cases.length})`],
          ["active", `Активні TUE (${cases.filter((c) => c.status === "схвалено" && !c.evaluation.isExpired).length})`],
          ["pending", `На розгляді (${cases.filter((c) => c.status === "підготовка" || c.status === "подано").length})`],
          ["expired", `Закінчився / Відхилено (${cases.filter((c) => c.status === "закінчився" || c.evaluation.isExpired || c.status === "відхилено").length})`],
        ].map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilterTab(val as any)}
            className={`px-3 py-1.5 rounded-lg border font-medium transition ${
              filterTab === val
                ? "bg-slate-800 border-rose-500 text-rose-300 shadow-sm"
                : "bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Список кейсів */}
      {filteredCases.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
          <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">Не знайдено жодного кейсу TUE у цій категорії.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          {filteredCases.map((item) => {
            const statusDetail = TUE_STATUS_DETAILS[item.status] || TUE_STATUS_DETAILS.підготовка;
            const evalRes = item.evaluation;

            return (
              <div
                key={item.id}
                className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-900/40 transition"
              >
                {/* Інформація про гравця та препарат */}
                <div className="space-y-1 min-w-[280px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-100">
                      {item.player.last_name} {item.player.first_name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({item.player.position} {item.player.team_name ? `· ${item.player.team_name}` : ""})
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {item.wada_class}
                    </span>
                  </div>

                  <div className="text-xs text-slate-200 font-semibold flex items-center gap-2">
                    <span>💊 {item.substance}</span>
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    Показання: "{item.reason}"
                  </p>
                </div>

                {/* Терміни та статус */}
                <div className="flex flex-col sm:items-end gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${evalRes.badgeClass}`}>
                      {statusDetail.label}
                    </span>

                    {/* Швидка зміна статусу */}
                    <select
                      value={item.status}
                      disabled={isPending}
                      onChange={(e) => handleStatusChange(item.id, e.target.value as TueStatus)}
                      className="text-[11px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300"
                    >
                      {TUE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                    {item.valid_until && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        Діє до: <strong className="text-slate-200">{item.valid_until}</strong>
                      </span>
                    )}

                    {evalRes.daysRemaining !== null && (
                      <span
                        className={`font-semibold ${
                          evalRes.daysRemaining <= 30 ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        ({evalRes.daysRemaining > 0 ? `${evalRes.daysRemaining} дн.` : "термін вичерпано"})
                      </span>
                    )}

                    {item.document_url && (
                      <a
                        href={item.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 flex items-center gap-0.5 ml-2"
                      >
                        <ExternalLink className="w-3 h-3" /> Скан TUE
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальне вікно створення TUE */}
      <CreateTueCaseModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        initialSubstance={prefilledSubstance}
        initialWadaClass={prefilledClass}
        playersList={playersList}
        onSuccess={() => {
          // Сторінка оновиться через revalidatePath
          window.location.reload();
        }}
      />
    </div>
  );
}
