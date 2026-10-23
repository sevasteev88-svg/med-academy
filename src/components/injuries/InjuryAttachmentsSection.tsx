"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  FileText,
  UploadCloud,
  Eye,
  Archive,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Clock,
  Sparkles,
  FileCheck,
} from "lucide-react";
import {
  ATTACHMENT_TYPE_LABELS,
  INJURY_ATTACHMENT_CONFIG,
  type AttachmentType,
  type InjuryAttachment,
} from "@/types/injury-attachment";
import {
  uploadInjuryAttachmentAction,
  getInjuryAttachmentSignedUrlAction,
  archiveInjuryAttachmentAction,
  restoreInjuryAttachmentAction,
} from "@/actions/injury-attachment-actions";
import { formatFileSize, validateAttachmentFile } from "@/lib/injury-attachments";

interface InjuryAttachmentsSectionProps {
  injuryId: string;
  playerId: string;
  initialAttachments: InjuryAttachment[];
  userRole?: string;
}

export function InjuryAttachmentsSection({
  injuryId,
  playerId,
  initialAttachments,
  userRole = "doctor",
}: InjuryAttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<InjuryAttachment[]>(initialAttachments);
  const [showArchived, setShowArchived] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Стан форми завантаження
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<AttachmentType>("mri");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [facility, setFacility] = useState("");
  const [notes, setNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAttachments = attachments.filter((a) => !a.is_archived);
  const archivedAttachments = attachments.filter((a) => a.is_archived);

  // Обробник вибору файлу з валідацією
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateAttachmentFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!validation.valid) {
      setStatusMessage({ type: "error", text: validation.error || "Недопустимий файл" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  };

  // Відправка форми
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setStatusMessage({ type: "error", text: "Оберіть файл для завантаження" });
      return;
    }

    startTransition(async () => {
      setStatusMessage(null);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("injury_id", injuryId);
      formData.append("player_id", playerId);
      formData.append("file_type", fileType);
      formData.append("examination_date", examDate);
      if (facility.trim()) formData.append("facility", facility.trim());
      if (notes.trim()) formData.append("notes", notes.trim());

      const res = await uploadInjuryAttachmentAction(formData);

      if (!res.success) {
        setStatusMessage({ type: "error", text: res.error });
        return;
      }

      setAttachments((prev) => [res.attachment, ...prev]);
      setSelectedFile(null);
      setFacility("");
      setNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsUploadOpen(false);
      setStatusMessage({ type: "success", text: "Клінічне вкладення успішно додано та зашифровано" });
    });
  };

  // Перегляд через підписане посилання на 5 хвилин
  const handleView = (attachmentId: string) => {
    setViewingId(attachmentId);
    setStatusMessage(null);

    startTransition(async () => {
      try {
        const res = await getInjuryAttachmentSignedUrlAction(attachmentId);
        if (!res.success) {
          setStatusMessage({ type: "error", text: res.error });
          return;
        }

        // Відкриваємо захищене посилання в новій вкладці
        window.open(res.signedUrl, "_blank", "noopener,noreferrer");
      } finally {
        setViewingId(null);
      }
    });
  };

  // Архівування (Soft-delete)
  const handleArchive = (attachmentId: string) => {
    if (!window.confirm("Перемістити це вкладення в архів? Його можна буде відновити за потреби.")) {
      return;
    }

    startTransition(async () => {
      const res = await archiveInjuryAttachmentAction(attachmentId);
      if (!res.success) {
        setStatusMessage({ type: "error", text: res.error });
        return;
      }

      setAttachments((prev) =>
        prev.map((item) => (item.id === attachmentId ? { ...item, is_archived: true } : item))
      );
      setStatusMessage({ type: "success", text: "Вкладення переміщено в архів" });
    });
  };

  // Відновлення з архіву
  const handleRestore = (attachmentId: string) => {
    startTransition(async () => {
      const res = await restoreInjuryAttachmentAction(attachmentId);
      if (!res.success) {
        setStatusMessage({ type: "error", text: res.error });
        return;
      }

      setAttachments((prev) =>
        prev.map((item) => (item.id === attachmentId ? { ...item, is_archived: false } : item))
      );
      setStatusMessage({ type: "success", text: "Вкладення успішно відновлено з архіву" });
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 my-6 space-y-4 shadow-sm">
      {/* Заголовок секції */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-emerald-400" />
              Клінічні вкладення (МРТ, УЗД, Рентген, Висновки)
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Приватний Storage
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Захищені медичні файли з тимчасовим доступом 5 хвилин. Доступно лише лікарю клубу.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {archivedAttachments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition"
            >
              {showArchived ? "Приховати архівні" : `Архів (${archivedAttachments.length})`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIsUploadOpen(!isUploadOpen);
              setStatusMessage(null);
            }}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
          >
            <UploadCloud className="w-4 h-4" />
            {isUploadOpen ? "Скасувати" : "Додати файл (до 20 МБ)"}
          </button>
        </div>
      </div>

      {/* Повідомлення про статус */}
      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
            statusMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Форма завантаження нового вкладення */}
      {isUploadOpen && (
        <form
          onSubmit={handleUploadSubmit}
          className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Тип дослідження *
              </label>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value as AttachmentType)}
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {(Object.keys(ATTACHMENT_TYPE_LABELS) as AttachmentType[]).map((key) => (
                  <option key={key} value={key}>
                    {ATTACHMENT_TYPE_LABELS[key].icon} {ATTACHMENT_TYPE_LABELS[key].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Дата обстеження *
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Медичний заклад / Клініка
              </label>
              <input
                type="text"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                placeholder="напр., Клініка 'Св. Катерини'"
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Файл обстеження (PDF, JPG, PNG, макс. 20 МБ) *
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={handleFileChange}
                required
                className="text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700 cursor-pointer"
              />
              {selectedFile && (
                <span className="text-xs text-slate-400">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Короткий коментар до файлу
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="напр., Контрольне УЗД через 14 днів після надриву двоголового м'яза"
              className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsUploadOpen(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedFile}
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
            >
              {isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Завантаження...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Завантажити та зафіксувати в картці
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Список активних вкладень */}
      {activeAttachments.length === 0 && !isUploadOpen ? (
        <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
          <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">До цієї травми ще не прикріплено жодного медичного файлу.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Натисніть «Додати файл», щоб завантажити протокол МРТ, знімок УЗД або рентген.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
          {activeAttachments.map((attachment) => {
            const meta = ATTACHMENT_TYPE_LABELS[attachment.file_type] || ATTACHMENT_TYPE_LABELS.other;
            const isViewing = viewingId === attachment.id;

            return (
              <div
                key={attachment.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-900/50 transition"
              >
                <div className="flex items-start gap-3 min-w-[260px]">
                  <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700/80 text-xl">
                    {meta.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-200">{attachment.file_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-400 font-medium">
                        {meta.shortLabel}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatFileSize(attachment.file_size_bytes)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                      <span>📅 Обстеження: {attachment.examination_date}</span>
                      {attachment.facility && <span>🏥 {attachment.facility}</span>}
                      <span>👨‍⚕️ {attachment.author_name}</span>
                    </div>

                    {attachment.notes && (
                      <p className="text-[11px] text-slate-400 mt-1 italic">
                        "{attachment.notes}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={isViewing || isPending}
                    onClick={() => handleView(attachment.id)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
                    title="Згенерувати підписане посилання на 5 хвилин та відкрити"
                  >
                    {isViewing ? (
                      <span className="w-3.5 h-3.5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Переглянути (5 хв)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleArchive(attachment.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Перемістити в архів"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Розділ архівних вкладень */}
      {showArchived && archivedAttachments.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> Архівні вкладення ({archivedAttachments.length})
          </h4>
          <div className="divide-y divide-slate-800/60 border border-slate-800/60 rounded-xl overflow-hidden bg-slate-950/20 opacity-80">
            {archivedAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="p-3 flex items-center justify-between gap-3 text-xs text-slate-400"
              >
                <div>
                  <span className="line-through">{attachment.file_name}</span>{" "}
                  <span className="text-[10px] text-slate-500">
                    ({formatFileSize(attachment.file_size_bytes)} · архів від{" "}
                    {attachment.archived_at?.split("T")[0] || "раніше"})
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRestore(attachment.id)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <RotateCcw className="w-3 h-3 text-emerald-400" />
                  Відновити
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
