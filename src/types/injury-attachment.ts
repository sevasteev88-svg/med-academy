/**
 * injury-attachment.ts — Типи та константи вкладень до травми (Етап 5.1)
 *
 * Відповідає вимогам ScribePro / Kitman:
 * - Приватне сховище (Supabase Storage: bucket 'injury-documents')
 * - Шлях: club_id/player_id/injury_id/file_id_name
 * - Формати: PDF, JPG, PNG
 * - Ліміт розміру: 20 МБ (20 * 1024 * 1024 байт)
 * - Термін дії підписаного посилання: 300 секунд (5 хвилин)
 * - Метадані: тип дослідження, дата, автор
 * - Архівування (soft-delete) та аудит дій
 */

export type AttachmentType = "mri" | "ultrasound" | "xray" | "conclusion" | "other";

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, { label: string; shortLabel: string; icon: string }> = {
  mri: {
    label: "МРТ (магнітно-резонансна томографія)",
    shortLabel: "МРТ",
    icon: "🧲",
  },
  ultrasound: {
    label: "УЗД (ультразвукове дослідження)",
    shortLabel: "УЗД",
    icon: "📡",
  },
  xray: {
    label: "Рентген / Комп'ютерна томографія",
    shortLabel: "Рентген",
    icon: "🦴",
  },
  conclusion: {
    label: "Висновок спеціаліста / Консультативний огляд",
    shortLabel: "Висновок",
    icon: "📋",
  },
  other: {
    label: "Інше клінічне вкладення",
    shortLabel: "Інше",
    icon: "📎",
  },
};

export const INJURY_ATTACHMENT_CONFIG = {
  BUCKET_NAME: "injury-documents",
  MAX_FILE_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_FILE_SIZE_MB: 20,
  SIGNED_URL_TTL_SECONDS: 300, // 5 хвилин
  ALLOWED_MIME_TYPES: [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ] as const,
  ALLOWED_EXTENSIONS: [".pdf", ".jpg", ".jpeg", ".png"] as const,
} as const;

export type AllowedMimeType = (typeof INJURY_ATTACHMENT_CONFIG.ALLOWED_MIME_TYPES)[number];

export type InjuryAttachment = {
  id: string;
  club_id: string;
  player_id: string;
  injury_id: string;
  file_type: AttachmentType;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  storage_path: string;
  examination_date: string; // YYYY-MM-DD
  author_id: string;
  author_name: string;
  facility: string | null;
  notes: string | null;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
};

export type UploadAttachmentInput = {
  injury_id: string;
  player_id: string;
  file_type: AttachmentType;
  examination_date: string;
  facility?: string | null;
  notes?: string | null;
};
