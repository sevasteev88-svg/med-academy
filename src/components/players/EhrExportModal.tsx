"use client";

import React, { useState, useTransition } from "react";
import {
  FileDown,
  FileText,
  FileCode,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  Building2,
  Calendar,
  X,
} from "lucide-react";
import {
  EHR_SECTIONS,
  EHR_SECTION_LABELS,
  TRANSFER_PURPOSE_LABELS,
  type EhrExportConsent,
  type EhrExportPeriod,
  type EhrSection,
  type TransferPurpose,
} from "@/types/ehr-transfer";
import { exportPlayerEhrAction } from "@/actions/ehr-transfer-actions";

interface EhrExportModalProps {
  playerId: string;
  playerName: string;
  doctorName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EhrExportModal({
  playerId,
  playerName,
  doctorName = "Лікар клубу",
  isOpen,
  onClose,
}: EhrExportModalProps) {
  const [isPending, startTransition] = useTransition();

  // Вибір розділів
  const [selectedSections, setSelectedSections] = useState<EhrSection[]>([...EHR_SECTIONS]);

  // Період
  const [period, setPeriod] = useState<EhrExportPeriod>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Згода на передачу даних (Consent Gate)
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [purpose, setPurpose] = useState<TransferPurpose>("transfer");
  const [recipientClub, setRecipientClub] = useState("");
  const [docConfirmName, setDocConfirmName] = useState(doctorName);
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSection = (section: EhrSection) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const handleExport = (format: "pdf" | "json") => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!consentConfirmed) {
      setErrorMessage("Обов'язково підтвердіть отримання згоди гравця на передачу медичних даних!");
      return;
    }

    if (!recipientClub.trim()) {
      setErrorMessage("Вкажіть назву приймаючого клубу або організації");
      return;
    }

    if (selectedSections.length === 0) {
      setErrorMessage("Оберіть хоча б один розділ медичної карти для експорту");
      return;
    }

    const consent: EhrExportConsent = {
      consent_confirmed: true,
      purpose,
      recipient_club: recipientClub.trim(),
      doctor_confirmation_name: docConfirmName.trim() || doctorName,
      consent_date: new Date().toISOString().split("T")[0],
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const res = await exportPlayerEhrAction({
        player_id: playerId,
        sections: selectedSections,
        period,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        consent,
      });

      if (!res.success) {
        setErrorMessage(res.error);
        return;
      }

      if (format === "json") {
        // Завантаження файлу JSON
        const blob = new Blob([JSON.stringify(res.payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${res.filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setSuccessMessage("JSON-пакет медичної карти успішно сформовано та завантажено");
      } else {
        // Завантаження файлу PDF
        const byteCharacters = atob(res.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${res.filename}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setSuccessMessage("Офіційний клінічний витяг PDF з водяним знаком сформовано");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
        {/* Шапка модального вікна */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <FileDown className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Експорт та трансфер медкарти: {playerName}
              </h3>
              <p className="text-xs text-slate-400">
                Стандарт FIFA / UEFA Medical Transfer Summary. Захищений експорт з аудитом.
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

        {/* Алерти помилок/успіху */}
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

        {/* 1. Вибір розділів */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            1. Оберіть розділи для включення до витягу
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EHR_SECTIONS.map((secKey) => {
              const meta = EHR_SECTION_LABELS[secKey];
              const isChecked = selectedSections.includes(secKey);
              return (
                <button
                  key={secKey}
                  type="button"
                  onClick={() => toggleSection(secKey)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition ${
                    isChecked
                      ? "bg-sky-950/30 border-sky-500/50 text-slate-100"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{meta.shortLabel}</span>
                      <span
                        className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${
                          isChecked
                            ? "bg-sky-500 border-sky-400 text-white font-bold"
                            : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        {isChecked && "✓"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">{meta.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Вибір періоду */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            2. Період вибірки
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ["all", "Вся історія"],
                ["current_season", "Поточний сезон"],
                ["last_12_months", "Останні 12 міс."],
                ["custom", "Власний діапазон"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPeriod(val)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition ${
                  period === val
                    ? "bg-slate-800 border-sky-500 text-sky-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">З дати</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">По дату</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. Юридичний контур (Consent Gate) */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-4 h-4" /> 3. Юридичне підтвердження згоди на передачу (GDPR Art. 9)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-300 mb-1">
                Мета передачі даних *
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as TransferPurpose)}
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              >
                {(Object.keys(TRANSFER_PURPOSE_LABELS) as TransferPurpose[]).map((pKey) => (
                  <option key={pKey} value={pKey}>
                    {TRANSFER_PURPOSE_LABELS[pKey]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-300 mb-1">
                Приймаючий клуб / Клініка *
              </label>
              <input
                type="text"
                value={recipientClub}
                onChange={(e) => setRecipientClub(e.target.value)}
                placeholder="напр., ФК Шахтар / Клініка Isokinetic"
                required
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              ПІБ лікаря, що засвідчує експорт *
            </label>
            <input
              type="text"
              value={docConfirmName}
              onChange={(e) => setDocConfirmName(e.target.value)}
              className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
          </div>

          <label className="flex items-start gap-2.5 pt-2 border-t border-slate-800/80 cursor-pointer">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-xs text-slate-300 leading-snug">
              Підтверджую отримання офіційної письмової згоди гравця (або законного представника для
              неповнолітнього) на обробку та транскордонну/міжклубну передачу персональних медичних
              даних.
            </span>
          </label>
        </div>

        {/* Дії експорту */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            Закрити
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending || !consentConfirmed || !recipientClub.trim()}
              onClick={() => handleExport("json")}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 disabled:opacity-40 transition"
              title="Експорт транспортного пакету версії 1.0.0"
            >
              <FileCode className="w-4 h-4" />
              Експорт JSON (v1.0.0)
            </button>

            <button
              type="button"
              disabled={isPending || !consentConfirmed || !recipientClub.trim()}
              onClick={() => handleExport("pdf")}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 shadow-sm transition"
              title="Експорт офіційного витягу з водяним знаком"
            >
              {isPending ? (
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Експорт PDF (Водяний знак)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
