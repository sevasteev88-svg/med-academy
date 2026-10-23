"use client";

import React, { useState, useTransition } from "react";
import { X, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { TUE_STATUSES, TUE_STATUS_DETAILS, type TueStatus } from "@/types/tue";
import { createTueCaseAction } from "@/actions/tue-actions";

interface CreateTueCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialSubstance?: string;
  initialWadaClass?: string;
  initialPlayerId?: string;
  playersList: Array<{ id: string; first_name: string; last_name: string; position: string }>;
}

export function CreateTueCaseModal({
  isOpen,
  onClose,
  onSuccess,
  initialSubstance = "",
  initialWadaClass = "S-препарат",
  initialPlayerId = "",
  playersList,
}: CreateTueCaseModalProps) {
  const [isPending, startTransition] = useTransition();

  const [playerId, setPlayerId] = useState(initialPlayerId || playersList[0]?.id || "");
  const [substance, setSubstance] = useState(initialSubstance);
  const [wadaClass, setWadaClass] = useState(initialWadaClass);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<TueStatus>("підготовка");
  const [submittedAt, setSubmittedAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [notes, setNotes] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!playerId) {
      setErrorMessage("Оберіть футболіста");
      return;
    }

    if (!substance.trim()) {
      setErrorMessage("Вкажіть назву діючої речовини / препарату");
      return;
    }

    if (!reason.trim()) {
      setErrorMessage("Вкажіть діагноз або клінічне показання для TUE");
      return;
    }

    startTransition(async () => {
      const res = await createTueCaseAction({
        player_id: playerId,
        substance: substance.trim(),
        wada_class: wadaClass.trim() || undefined,
        reason: reason.trim(),
        status,
        submitted_at: submittedAt || null,
        valid_until: validUntil || null,
        document_url: documentUrl.trim() || null,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setErrorMessage(res.error);
        return;
      }

      if (onSuccess) onSuccess();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Реєстрація кейсу TUE (Терапевтичне виключення)
              </h3>
              <p className="text-xs text-slate-400">
                Офіційний облік дозволів НАДЦ / WADA для гравців клубу
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Алерт помилки */}
        {errorMessage && (
          <div className="p-3 rounded-lg text-xs flex items-center gap-2 border bg-rose-950/40 border-rose-500/40 text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Вибір гравця */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Футболіст *</label>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
            >
              {playersList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.last_name} {p.first_name} ({p.position})
                </option>
              ))}
            </select>
          </div>

          {/* Субстанція та Клас WADA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Заборонена субстанція / Препарат *
              </label>
              <input
                type="text"
                value={substance}
                onChange={(e) => setSubstance(e.target.value)}
                placeholder="напр., Сальбутамол, Дексаметазон"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Клас WADA</label>
              <input
                type="text"
                value={wadaClass}
                onChange={(e) => setWadaClass(e.target.value)}
                placeholder="напр., S3, S9, S6"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              />
            </div>
          </div>

          {/* Клінічне показання */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Діагноз / Медичне показання для TUE *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="напр., Бронхіальна астма з бронхоспазмом фізичного навантаження"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
          </div>

          {/* Статус кейсу */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Статус кейсу *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TueStatus)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              >
                {TUE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {TUE_STATUS_DETAILS[st].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Дата подачі</label>
              <input
                type="date"
                value={submittedAt}
                onChange={(e) => setSubmittedAt(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Діє до (Valid until)
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
              />
            </div>
          </div>

          {/* Посилання на скан сертифіката TUE */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Посилання на документ / Скан рішення НАДЦ
            </label>
            <input
              type="text"
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="https://... або назва файлу в сховищі"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
          </div>

          {/* Нотатки */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Внутрішні нотатки</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Дозування за сертифікатом, контакт особистого лікаря..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 resize-none"
            />
          </div>

          {/* Кнопки */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {isPending ? "Збереження..." : "Зареєструвати TUE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
