/**
 * injury-attachments.ts — Бізнес-логіка, валідація та безпека вкладень до травм (Етап 5.1)
 */

import {
  INJURY_ATTACHMENT_CONFIG,
  type AllowedMimeType,
  type AttachmentType,
} from "../types/injury-attachment.ts";

/**
 * Перевірка прав доступу до медичних вкладень.
 * Суворе медичне правило: лише лікар (doctor) та адміністратор клініки (admin).
 * Тренери, скаути, гравці не мають прямого доступу до сирих МРТ/КТ висновків через RLS.
 */
export function canAccessInjuryAttachments(role?: string | null): boolean {
  if (!role) return false;
  return role === "doctor" || role === "admin";
}

/**
 * Очищення назви файлу від небезпечних символів, спроб path-traversal та спеціальних символів.
 */
export function sanitizeFileName(originalName: string): string {
  if (!originalName || typeof originalName !== "string") {
    return "attachment";
  }

  // Видаляємо будь-які шляхи (/, \)
  const baseName = originalName.split(/[/\\]/).pop() || "attachment";

  // Відокремлюємо розширення
  const lastDot = baseName.lastIndexOf(".");
  let namePart = lastDot > 0 ? baseName.slice(0, lastDot) : baseName;
  const extPart = lastDot > 0 ? baseName.slice(lastDot).toLowerCase() : "";

  // Замінюємо пробіли та спецсимволи на підкреслення або дефіси
  namePart = namePart
    .normalize("NFKD")
    .replace(/[^\w\dА-Яа-яЄєІіЇїҐґ._-]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 80); // обмежуємо довжину назви

  const cleanName = `${namePart || "file"}${extPart}`;
  return cleanName;
}

/**
 * Побудова шляху в приватному бакеті Supabase Storage.
 * Формат за специфікацією: club_id/player_id/injury_id/{file_id}_{file_name}
 */
export function buildInjuryAttachmentStoragePath(
  clubId: string,
  playerId: string,
  injuryId: string,
  fileId: string,
  originalName: string
): string {
  if (!clubId || !playerId || !injuryId || !fileId) {
    throw new Error("Всі ідентифікатори (clubId, playerId, injuryId, fileId) є обов'язковими для формування шляху");
  }

  const cleanName = sanitizeFileName(originalName);
  return `${clubId}/${playerId}/${injuryId}/${fileId}_${cleanName}`;
}

/**
 * Парсинг шляху в бакеті для валідації безпеки та прив'язки
 */
export function parseInjuryAttachmentPath(path: string): {
  clubId: string;
  playerId: string;
  injuryId: string;
  fileId: string;
  fileName: string;
} | null {
  if (!path || typeof path !== "string") return null;

  const parts = path.split("/");
  if (parts.length !== 4) return null;

  const [clubId, playerId, injuryId, fileWithId] = parts;
  const underscoreIndex = fileWithId.indexOf("_");
  if (underscoreIndex <= 0) return null;

  const fileId = fileWithId.slice(0, underscoreIndex);
  const fileName = fileWithId.slice(underscoreIndex + 1);

  return {
    clubId,
    playerId,
    injuryId,
    fileId,
    fileName,
  };
}

/**
 * Валідація файлу перед завантаженням:
 * 1. Розмір не більше 20 МБ
 * 2. MIME-тип: application/pdf, image/jpeg, image/png
 * 3. Розширення файлу: .pdf, .jpg, .jpeg, .png
 */
export function validateAttachmentFile(file: {
  name: string;
  size: number;
  type: string;
}): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "Файл не надано" };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Файл порожній (0 байт)" };
  }

  if (file.size > INJURY_ATTACHMENT_CONFIG.MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Розмір файлу перевищує ліміт ${INJURY_ATTACHMENT_CONFIG.MAX_FILE_SIZE_MB} МБ (поточний: ${(file.size / (1024 * 1024)).toFixed(1)} МБ)`,
    };
  }

  // Перевірка MIME-типу
  const isMimeAllowed = (INJURY_ATTACHMENT_CONFIG.ALLOWED_MIME_TYPES as readonly string[]).includes(
    file.type.toLowerCase()
  );

  // Перевірка розширення
  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = (INJURY_ATTACHMENT_CONFIG.ALLOWED_EXTENSIONS as readonly string[]).some((ext) =>
    lowerName.endsWith(ext)
  );

  if (!isMimeAllowed || !hasAllowedExt) {
    return {
      valid: false,
      error: "Дозволені лише формати PDF, JPG та PNG (МРТ, УЗД, рентген, скани висновків)",
    };
  }

  return { valid: true };
}

/**
 * Безпечне людське форматування розміру файлу
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 Б";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Формування безпечних метаданих для Audit Log (без клінічних висновків/діагнозів)
 */
export function buildAttachmentAuditMeta(params: {
  fileId: string;
  fileName: string;
  fileType: AttachmentType;
  fileSizeBytes: number;
  examinationDate: string;
  actionReason?: string;
}): Record<string, unknown> {
  return {
    file_id: params.fileId,
    file_name: sanitizeFileName(params.fileName),
    file_type: params.fileType,
    file_size_bytes: params.fileSizeBytes,
    examination_date: params.examinationDate,
    ...(params.actionReason ? { reason: params.actionReason } : {}),
  };
}
