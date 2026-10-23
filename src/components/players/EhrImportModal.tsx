"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  Upload,
  FileCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Users,
  Building,
  Calendar,
  X,
  ArrowRight,
} from "lucide-react";
import {
  validateEhrImportAction,
  commitEhrImportAction,
} from "@/actions/ehr-transfer-actions";
import type {
  EhrImportValidationReport,
  EhrTransferPayload,
} from "@/types/ehr-transfer";

interface EhrImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (playerId: string) => void;
}

export function EhrImportModal({
  isOpen,
  onClose,
  onSuccess,
}: EhrImportModalProps) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawPayload, setRawPayload] = useState<EhrTransferPayload | null>(null);
  const [report, setReport] = useState<EhrImportValidationReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [importMode, setImportMode] = useState<"merge" | "new">("merge");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setReport(null);
    setRawPayload(null);

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      startTransition(async () => {
        try {
          const parsed = JSON.parse(content) as EhrTransferPayload;
          setRawPayload(parsed);

          const res = await validateEhrImportAction(content);
          if (!res.success) {
            setErrorMessage(res.error);
            return;
          }

          setReport(res.report);
          if (res.report.matching_player.found) {
            setImportMode("merge");
          } else {
            setImportMode("new");
          }
        } catch {
          setErrorMessage("Не вдалося розпарсити файл. Переконайтеся, що файл містить валідний JSON.");
        }
      });
    };
    reader.readAsText(file);
  };

  const handleCommitImport = () => {
    if (!rawPayload || !report || !report.valid) return;

    setErrorMessage(null);
    startTransition(async () => {
      const res = await commitEhrImportAction({
        payload: rawPayload,
        targetPlayerId:
          importMode === "merge" && report.matching_player.found
            ? report.matching_player.existing_player_id
            : undefined,
        createNewPlayer: importMode === "new" || !report.matching_player.found,
      });

      if (!res.success) {
        setErrorMessage(res.error);
        return;
      }

      setSuccessMessage(res.message);
      if (onSuccess) {
        setTimeout(() => onSuccess(res.playerId), 1200);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Імпорт медичної картки гравця (Трансфер)
              </h3>
              <p className="text-xs text-slate-400">
                Безпечний Dry-Run аналіз, перевірка схеми v1.0.0 та детекція дублікатів.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Алерти */}
        {errorMessage && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 border bg-rose-950/40 border-rose-500/40 text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 border bg-emerald-950/40 border-emerald-500/40 text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Завантаження файлу */}
        {!report && (
          <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-8 text-center bg-slate-950/40 transition">
            <FileCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-200">
              Оберіть транспортний JSON-файл медичної карти (EHR Transfer Package)
            </p>
            <p className="text-[11px] text-slate-500 mt-1 mb-4">
              Файл, експортований попереднім клубом за схемою MedAcademy v1.0.0
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
              id="ehr-json-input"
            />
            <label
              htmlFor="ehr-json-input"
              className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-sm transition"
            >
              <Upload className="w-4 h-4" />
              Обрати JSON-файл
            </label>
          </div>
        )}

        {/* Dry-Run Звіт валідації */}
        {report && (
          <div className="space-y-4">
            {/* Статус валідації */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                report.valid
                  ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/30 border-rose-500/40 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                {report.valid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                )}
                <span>
                  {report.valid
                    ? "Файл успішно пройшов схематичну валідацію v1.0.0"
                    : "Помилка валідації схеми файлу"}
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                {report.origin_club_name}
              </span>
            </div>

            {/* Демографічні дані з файлу */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Гравець</span>
                <p className="font-bold text-slate-100">
                  {report.player_preview.last_name} {report.player_preview.first_name}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Дата народження</span>
                <p className="font-bold text-slate-100">{report.player_preview.date_of_birth}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Позиція</span>
                <p className="font-bold text-slate-100">{report.player_preview.position}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Експортовано</span>
                <p className="font-bold text-slate-100">{report.exported_at.split("T")[0]}</p>
              </div>
            </div>

            {/* Підрахунок записів */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                ["Травми", report.counts.injuries, "🩹"],
                ["Огляди", report.counts.examinations, "🩺"],
                ["Скринінги", report.counts.screenings, "🫀"],
                ["LSI Тести", report.counts.lsi, "⚖️"],
                ["Антропометрія", report.counts.anthropometry, "📏"],
                ["Призначення", report.counts.prescriptions, "💊"],
              ].map(([name, count, icon]) => (
                <div
                  key={name as string}
                  className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-center"
                >
                  <span className="text-base">{icon}</span>
                  <div className="text-sm font-bold text-slate-100 mt-1">{count}</div>
                  <div className="text-[10px] text-slate-400">{name}</div>
                </div>
              ))}
            </div>

            {/* Попередження та дублікати */}
            {report.matching_player.found && (
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Виявлено існуючого гравця в клубі: {report.matching_player.existing_player_name}</span>
                </div>
                <div className="flex items-center gap-4 text-slate-300 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span>Об'єднати записи з існуючою карткою (Рекомендовано)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="new"
                      checked={importMode === "new"}
                      onChange={() => setImportMode("new")}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span>Створити окрему нову картку</span>
                  </label>
                </div>
              </div>
            )}

            {/* Список помилок (якщо є) */}
            {report.errors.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 space-y-1">
                <span className="font-bold">Помилки валідації:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {report.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Список попереджень */}
            {report.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs text-slate-300 space-y-1">
                <span className="font-bold text-amber-400">Примітки та зауваження:</span>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-400 text-[11px]">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Кнопки дій */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            Закрити
          </button>

          {report && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReport(null);
                  setRawPayload(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 transition"
              >
                Обрати інший файл
              </button>

              <button
                type="button"
                disabled={isPending || !report.valid}
                onClick={handleCommitImport}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 shadow-sm transition"
              >
                {isPending ? (
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                Затвердити імпорт у базу клубу
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
