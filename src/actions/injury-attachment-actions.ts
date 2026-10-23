"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  validateAttachmentFile,
  buildInjuryAttachmentStoragePath,
  buildAttachmentAuditMeta,
  formatFileSize,
} from "@/lib/injury-attachments";
import {
  INJURY_ATTACHMENT_CONFIG,
  type AttachmentType,
  type InjuryAttachment,
} from "@/types/injury-attachment";

export type UploadAttachmentResult =
  | { success: true; attachment: InjuryAttachment }
  | { success: false; error: string };

export type SignedUrlResult =
  | { success: true; signedUrl: string; expiresAt: string; fileName: string }
  | { success: false; error: string };

export type GenericActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Завантаження клінічного вкладення (МРТ, УЗД, рентген, висновок) до травми.
 * Файл зберігається у приватному бакеті 'injury-documents' із суворим доступом doctor/admin.
 */
export async function uploadInjuryAttachmentAction(
  formData: FormData
): Promise<UploadAttachmentResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const file = formData.get("file") as File | null;
  const injuryId = formData.get("injury_id") as string | null;
  const playerId = formData.get("player_id") as string | null;
  const fileType = (formData.get("file_type") as AttachmentType) || "mri";
  const examinationDate = (formData.get("examination_date") as string) || new Date().toISOString().split("T")[0];
  const facility = (formData.get("facility") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!file) {
    return { success: false, error: "Будь ласка, оберіть файл для завантаження" };
  }

  if (!injuryId || !playerId) {
    return { success: false, error: "Відсутні обов'язкові параметри травми або гравця" };
  }

  // 1. Валідація файлу (формат, розмір <= 20 МБ)
  const validation = validateAttachmentFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });

  if (!validation.valid) {
    return { success: false, error: validation.error || "Невалідний файл" };
  }

  const supabase = await createClient();

  // 2. Перевірка належності травми до клубу
  const { data: injury, error: injuryError } = await supabase
    .from("injuries")
    .select("id, club_id, player_id")
    .eq("id", injuryId)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (injuryError || !injury) {
    return { success: false, error: "Травму не знайдено або відсутній доступ" };
  }

  // 3. Формування безпечного шляху у сховищі
  const fileId = crypto.randomUUID();
  const storagePath = buildInjuryAttachmentStoragePath(
    user.clubId,
    playerId,
    injuryId,
    fileId,
    file.name
  );

  // 4. Завантаження у приватний бакет Supabase Storage
  const fileBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(INJURY_ATTACHMENT_CONFIG.BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[Storage] Upload error:", uploadError.message);
    return { success: false, error: `Помилка завантаження у сховище: ${uploadError.message}` };
  }

  // 5. Запис метаданих у базу даних
  const newRecord: Omit<InjuryAttachment, "id" | "created_at"> = {
    club_id: user.clubId,
    player_id: playerId,
    injury_id: injuryId,
    file_type: fileType,
    file_name: file.name,
    file_size_bytes: file.size,
    mime_type: file.type,
    storage_path: storagePath,
    examination_date: examinationDate,
    author_id: user.id,
    author_name: user.fullName || "Медичний персонал клубу",
    facility,
    notes,
    is_archived: false,
    archived_at: null,
    archived_by: null,
  };

  const { data: savedAttachment, error: insertError } = await supabase
    .from("injury_attachments")
    .insert(newRecord as any)
    .select()
    .single();

  if (insertError || !savedAttachment) {
    console.error("[DB] Insert attachment error:", insertError?.message);
    // Якщо запис в БД не вдався, видаляємо завантажений файл зі сховища
    await supabase.storage.from(INJURY_ATTACHMENT_CONFIG.BUCKET_NAME).remove([storagePath]);
    return { success: false, error: "Помилка збереження запису вкладення в базі даних" };
  }

  // 6. Фіксація в Audit Log (без медичних діагнозів у meta)
  await logAudit({
    action: "upload_injury_attachment",
    entity: "injury_attachment",
    entityId: savedAttachment.id,
    playerId,
    clubId: user.clubId,
    userId: user.id,
    meta: buildAttachmentAuditMeta({
      fileId: savedAttachment.id,
      fileName: file.name,
      fileType,
      fileSizeBytes: file.size,
      examinationDate,
    }),
  });

  revalidatePath(`/injuries/${injuryId}`);
  return { success: true, attachment: savedAttachment as unknown as InjuryAttachment };
}

/**
 * Отримання тимчасового підписаного посилання (Signed URL) на 5 хвилин (300 секунд).
 * Кожен факт перегляду фіксується в Audit Log.
 */
export async function getInjuryAttachmentSignedUrlAction(
  attachmentId: string
): Promise<SignedUrlResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  // 1. Отримуємо запис вкладення
  const { data: attachment, error: fetchError } = await supabase
    .from("injury_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (fetchError || !attachment) {
    return { success: false, error: "Вкладення не знайдено або відсутній доступ" };
  }

  // 2. Генерація підписаного посилання на 300 секунд (5 хвилин)
  const ttlSeconds = INJURY_ATTACHMENT_CONFIG.SIGNED_URL_TTL_SECONDS;
  const { data: signedData, error: signError } = await supabase.storage
    .from(INJURY_ATTACHMENT_CONFIG.BUCKET_NAME)
    .createSignedUrl(attachment.storage_path, ttlSeconds);

  if (signError || !signedData?.signedUrl) {
    console.error("[Storage] CreateSignedUrl error:", signError?.message);
    return { success: false, error: "Не вдалося згенерувати захищене посилання для перегляду" };
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  // 3. Запис у Audit Log факту перегляду медичного файлу
  await logAudit({
    action: "view_injury_attachment",
    entity: "injury_attachment",
    entityId: attachment.id,
    playerId: attachment.player_id,
    clubId: user.clubId,
    userId: user.id,
    meta: buildAttachmentAuditMeta({
      fileId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type as AttachmentType,
      fileSizeBytes: attachment.file_size_bytes,
      examinationDate: attachment.examination_date,
      actionReason: `Генерація підписаного посилання на ${ttlSeconds} сек`,
    }),
  });

  return {
    success: true,
    signedUrl: signedData.signedUrl,
    expiresAt,
    fileName: attachment.file_name,
  };
}

/**
 * Переміщення вкладення в архів (Soft-delete).
 * Фізично файл не видаляється, але приховується з основного перегляду та фіксується в аудит-лозі.
 */
export async function archiveInjuryAttachmentAction(
  attachmentId: string,
  reason?: string
): Promise<GenericActionResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  const { data: attachment, error: fetchError } = await supabase
    .from("injury_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (fetchError || !attachment) {
    return { success: false, error: "Вкладення не знайдено або відсутній доступ" };
  }

  const { error: updateError } = await supabase
    .from("injury_attachments")
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: user.id,
    } as any)
    .eq("id", attachmentId);

  if (updateError) {
    return { success: false, error: `Помилка архівації: ${updateError.message}` };
  }

  // Запис в Audit Log
  await logAudit({
    action: "archive_injury_attachment",
    entity: "injury_attachment",
    entityId: attachment.id,
    playerId: attachment.player_id,
    clubId: user.clubId,
    userId: user.id,
    meta: buildAttachmentAuditMeta({
      fileId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type as AttachmentType,
      fileSizeBytes: attachment.file_size_bytes,
      examinationDate: attachment.examination_date,
      actionReason: reason || "Переміщено в архів лікарем",
    }),
  });

  revalidatePath(`/injuries/${attachment.injury_id}`);
  return { success: true };
}

/**
 * Відновлення вкладення з архіву
 */
export async function restoreInjuryAttachmentAction(
  attachmentId: string
): Promise<GenericActionResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  const { data: attachment, error: fetchError } = await supabase
    .from("injury_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (fetchError || !attachment) {
    return { success: false, error: "Вкладення не знайдено або відсутній доступ" };
  }

  const { error: updateError } = await supabase
    .from("injury_attachments")
    .update({
      is_archived: false,
      archived_at: null,
      archived_by: null,
    } as any)
    .eq("id", attachmentId);

  if (updateError) {
    return { success: false, error: `Помилка відновлення: ${updateError.message}` };
  }

  await logAudit({
    action: "restore_injury_attachment",
    entity: "injury_attachment",
    entityId: attachment.id,
    playerId: attachment.player_id,
    clubId: user.clubId,
    userId: user.id,
    meta: buildAttachmentAuditMeta({
      fileId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type as AttachmentType,
      fileSizeBytes: attachment.file_size_bytes,
      examinationDate: attachment.examination_date,
      actionReason: "Відновлено з архіву лікарем",
    }),
  });

  revalidatePath(`/injuries/${attachment.injury_id}`);
  return { success: true };
}

/**
 * Отримання списку вкладень до травми
 */
export async function listInjuryAttachmentsAction(
  injuryId: string,
  includeArchived = false
): Promise<{ success: boolean; attachments: InjuryAttachment[]; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, attachments: [], error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  let query = supabase
    .from("injury_attachments")
    .select("*")
    .eq("injury_id", injuryId)
    .eq("club_id", user.clubId);

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query
    .order("examination_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, attachments: [], error: error.message };
  }

  return { success: true, attachments: (data || []) as unknown as InjuryAttachment[] };
}
