import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { AuditAction, AuditEntity } from "@/types/database";

export type LogAuditParams = {
  action: AuditAction | string;
  entity: AuditEntity | string;
  entityId?: string | null;
  playerId?: string | null;
  /**
   * Метадані події.
   * ВАЖЛИВО: Категорично заборонено передавати сюди медичні діагнози,
   * клінічні коментарі, ВАШ, текст оглядів чи промпти до ШІ.
   * Дозволені лише технічні та контекстні поля: teamId, format, model, success, count тощо.
   */
  meta?: Record<string, unknown>;
  /**
   * Опційне перевизначення контексту користувача, якщо він уже отриманий
   */
  userId?: string;
  clubId?: string;
};

/**
 * Єдина точка запису аудиту дій користувача (Audit Log).
 * Безпечна: не викидає помилок і не ламає основну операцію користувача,
 * якщо аудит з якоїсь причини не вдалося записати.
 */
export async function logAudit(params: LogAuditParams): Promise<{ success: boolean; error?: string }> {
  try {
    let userId = params.userId;
    let clubId = params.clubId;

    if (!userId || !clubId) {
      const user = await getCurrentUser();
      if (!user) {
        // Якщо користувач не авторизований (наприклад, анонімний виклик), аудит не записується
        return { success: false, error: "Unauthenticated" };
      }
      userId = userId || user.id;
      clubId = clubId || user.clubId;
    }

    const supabase = await createClient();

    // Очищаємо можливі небезпечні медичні ключі в meta перед збереженням
    const sanitizedMeta = { ...(params.meta || {}) };
    const forbiddenKeys = [
      "diagnosis",
      "treatment",
      "prescription",
      "note",
      "objective_note",
      "subjective_note",
      "medical_history",
      "prompt",
      "response",
      "vas_score",
      "injury_type",
      "pin",
      "pin_hash",
      "password",
    ];

    for (const key of forbiddenKeys) {
      if (key in sanitizedMeta) {
        delete sanitizedMeta[key];
      }
    }

    const { error } = await supabase.from("audit_log").insert({
      club_id: clubId,
      user_id: userId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ? String(params.entityId) : null,
      player_id: params.playerId ? String(params.playerId) : null,
      meta: sanitizedMeta,
    });

    if (error) {
      console.error("[AuditLog] Failed to insert audit log entry:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[AuditLog] Unexpected error while logging audit:", err?.message || err);
    return { success: false, error: err?.message };
  }
}
