"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor, assertAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

function revalidateAllPlayerPaths(playerId?: string) {
  revalidatePath("/players");
  if (playerId) {
    revalidatePath(`/players/${playerId}`);
    revalidatePath(`/players/${playerId}/edit`);
  }
  revalidatePath("/availability");
  revalidatePath("/coach-briefing");
  revalidatePath("/reports/matchday");
  revalidatePath("/workload");
  revalidatePath("/hydration");
  revalidatePath("/wellness");
  revalidatePath("/");
}

/**
 * 1.6 Перенесення гравця в архів замість видалення
 * Доступно: лікар (doctor) та адміністратор (admin).
 */
export async function archivePlayerAction(playerId: string, reason: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { error: "Будь ласка, вкажіть обов'язкову причину перенесення в архів." };
  }

  const supabase = await createClient();

  // Отримуємо поточного гравця для аудиту
  const { data: player, error: fetchError } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id")
    .eq("id", playerId)
    .maybeSingle();

  if (fetchError || !player) {
    return { error: "Гравця не знайдено." };
  }

  const archivedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("players")
    .update({
      archived_at: archivedAt,
      archive_reason: trimmedReason,
    })
    .eq("id", playerId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Запис у незмінний журнал audit_log
  await logAudit({
    action: "archive_player",
    entity: "player",
    entityId: playerId,
    playerId: playerId,
    clubId: player.club_id || auth.user.clubId,
    meta: {
      reason: trimmedReason,
      player_name: `${player.last_name} ${player.first_name}`,
      archived_at: archivedAt,
    },
  });

  revalidateAllPlayerPaths(playerId);
  return { success: true };
}

/**
 * 1.6 Відновлення гравця з архіву
 * Доступно: лікар (doctor) та адміністратор (admin).
 */
export async function restorePlayerAction(playerId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const { data: player, error: fetchError } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id")
    .eq("id", playerId)
    .maybeSingle();

  if (fetchError || !player) {
    return { error: "Гравця не знайдено." };
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({
      archived_at: null,
      archive_reason: null,
    })
    .eq("id", playerId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Запис у незмінний журнал audit_log
  await logAudit({
    action: "restore_player",
    entity: "player",
    entityId: playerId,
    playerId: playerId,
    clubId: player.club_id || auth.user.clubId,
    meta: {
      player_name: `${player.last_name} ${player.first_name}`,
      restored_at: new Date().toISOString(),
    },
  });

  revalidateAllPlayerPaths(playerId);
  return { success: true };
}

/**
 * 1.6 Повне (hard) видалення гравця
 * ТІЛЬКИ ДЛЯ РОЛІ ADMIN.
 * Вимагає обов'язкового підтвердження введенням прізвища гравця.
 * Заборонено, якщо у гравця є відкриті/реабілітаційні травми.
 */
export async function hardDeletePlayerAction(
  playerId: string,
  confirmationLastName: string
) {
  const auth = await assertAdmin();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const supabase = await createClient();

  // 1. Отримуємо дані гравця
  const { data: player, error: fetchError } = await supabase
    .from("players")
    .select("id, first_name, last_name, club_id")
    .eq("id", playerId)
    .maybeSingle();

  if (fetchError || !player) {
    return { error: "Гравця не знайдено." };
  }

  // 2. Перевірка підтвердження введенням прізвища (case-insensitive)
  const inputLastName = (confirmationLastName || "").trim().toLowerCase();
  const actualLastName = (player.last_name || "").trim().toLowerCase();

  if (!inputLastName || inputLastName !== actualLastName) {
    return {
      error: `Прізвище підтвердження не збігається. Очікувалося «${player.last_name}», а введено «${confirmationLastName}».`,
    };
  }

  // 3. Заборона видалення, якщо є відкриті травми (active / rehabilitation)
  const { data: openInjuries, error: injError } = await supabase
    .from("injuries")
    .select("id, injury_type, status")
    .eq("player_id", playerId)
    .in("status", ["active", "rehabilitation"]);

  if (injError) {
    return { error: `Помилка перевірки травм: ${injError.message}` };
  }

  if (openInjuries && openInjuries.length > 0) {
    return {
      error: `Неможливо видалити гравця: виявлено ${openInjuries.length} відкриту(их) травму(р). Спочатку завершіть або закрийте лікування травми перед повним видаленням.`,
    };
  }

  // 4. Фіксація в audit_log ДО фактичного видалення гравця
  await logAudit({
    action: "delete_player",
    entity: "player",
    entityId: playerId,
    playerId: playerId,
    clubId: player.club_id || auth.user.clubId,
    meta: {
      hard_delete: true,
      player_name: `${player.last_name} ${player.first_name}`,
      confirmed_by_last_name: confirmationLastName,
      deleted_by_admin: auth.user.fullName || auth.user.email,
    },
  });

  // 5. Видалення запису гравця
  const { error: deleteError } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidateAllPlayerPaths(playerId);
  return { success: true };
}

/**
 * Застарілий метод для зворотної сумісності (якщо викликається безпосередньо)
 */
export async function deletePlayerAction(playerId: string) {
  // Для зворотної сумісності перенаправляємо на архів
  const res = await archivePlayerAction(playerId, "Архівовано користувачем");
  if (res.error) return { error: res.error };
  redirect("/players");
}
