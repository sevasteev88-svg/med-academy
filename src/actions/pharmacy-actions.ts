"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertDoctor,
  assertPlayerAccess,
  getCurrentUser,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { PharmacyItem, MedicalTreatmentEntry } from "@/types/pharmacy";
import { DEFAULT_PHARMACY_ITEMS } from "@/lib/default-pharmacy-stock";
import {
  findClinicalDrugPreset,
  lookupDrugWithAI,
  type ClinicalDrugInfo,
} from "@/lib/clinical-drug-directory";
import {
  withClubPharmacyLock,
  mapDbRowToPharmacyItem,
  applyStockDeltaToList,
} from "@/lib/pharmacy-stock-manager";

/**
 * Читає актуальний склад аптеки клубу (без створення фіктивних травм).
 * Пріоритет:
 * 1) таблиця public.pharmacy_items
 * 2) резервний знімок у clubs.settings.pharmacy_stock або останній [PHARMACY_STOCK_UPDATE] в injury_logs
 * 3) для дефолтного клубу — DEFAULT_PHARMACY_ITEMS
 */
async function readClubPharmacyStockInternal(clubId: string): Promise<PharmacyItem[]> {
  const admin = createAdminClient();

  // 1. Спроба читання з таблиці pharmacy_items
  try {
    const { data: rows, error } = await admin
      .from("pharmacy_items")
      .select("*")
      .eq("club_id", clubId)
      .order("created_at", { ascending: true });

    if (!error && rows && rows.length > 0) {
      return rows.map((r: any) => mapDbRowToPharmacyItem(r));
    }
  } catch {}

  // 2. Спроба читання з clubs.settings.pharmacy_stock
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const settingsStock = (club as any)?.settings?.pharmacy_stock;
    if (Array.isArray(settingsStock) && settingsStock.length > 0) {
      return settingsStock as PharmacyItem[];
    }
  } catch {}

  // 3. Зворотна сумісність зі старим записом [PHARMACY_STOCK_UPDATE] в injury_logs
  try {
    const { data: logs, error } = await admin
      .from("injury_logs")
      .select("note, created_at")
      .eq("club_id", clubId)
      .like("note", "[PHARMACY_STOCK_UPDATE]%")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && logs && logs.length > 0) {
      const raw = logs[0].note.replace("[PHARMACY_STOCK_UPDATE] ", "");
      const parsed = JSON.parse(raw) as PharmacyItem[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}

  return clubId === DEFAULT_CLUB_ID
    ? DEFAULT_PHARMACY_ITEMS.map((item) => ({ ...item }))
    : [];
}

/**
 * Персистентно зберігає оновлений список складу аптеки клубу в pharmacy_items та clubs.settings.pharmacy_stock
 * БЕЗ створення фіктивних травм у public.injuries.
 */
async function persistClubPharmacyStockInternal(
  clubId: string,
  newStock: PharmacyItem[],
  changedItem?: PharmacyItem
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  let persisted = false;

  // 1. Якщо змінився конкретний елемент або ініціалізуємо таблицю pharmacy_items
  try {
    const itemsToSync = changedItem ? [changedItem] : newStock;
    const isUuid = (val: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    for (const item of itemsToSync) {
      const fullRow: Record<string, any> = {
        club_id: clubId,
        item_key: item.id,
        name: item.name,
        active_substance: item.active_substance || null,
        category: item.category,
        stock_count: Math.max(0, Number(item.stock_count) || 0),
        unit: item.unit || "шт",
        min_alert_threshold: Math.max(1, Number(item.min_alert_threshold) || 1),
        expiry_date: item.expiry_date || null,
        wada_status: item.wada_status || "allowed",
        storage_location: item.storage_location || null,
        notes: item.notes || null,
        min_age: item.min_age ?? null,
        age_note: item.age_note || null,
        requires_review: Boolean(item.requires_review),
        wada_source_note: item.wada_source_note || null,
        washout_note: item.washout_note || null,
        indications: item.indications || null,
        data: item,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await admin
        .from("pharmacy_items")
        .upsert(fullRow, { onConflict: "club_id,item_key" });

      if (!upsertErr) {
        persisted = true;
      } else if (isUuid(item.id)) {
        // Якщо нова міграція з item_key ще не застосована, оновлюємо за базовими колонками таблиці pharmacy_items
        const legacyRow: Record<string, any> = {
          id: item.id,
          club_id: clubId,
          name: item.name,
          active_substance: item.active_substance || null,
          category: item.category,
          stock_count: Math.max(0, Number(item.stock_count) || 0),
          unit: item.unit || "шт",
          min_alert_threshold: Math.max(1, Number(item.min_alert_threshold) || 1),
          expiry_date: item.expiry_date || null,
          wada_status: item.wada_status || "allowed",
          storage_location: item.storage_location || null,
          notes: item.notes || null,
          updated_at: new Date().toISOString(),
        };
        const { error: legacyErr } = await admin
          .from("pharmacy_items")
          .upsert(legacyRow, { onConflict: "id" });
        if (!legacyErr) persisted = true;
      }
    }
  } catch {}

  // 2. Синхронізуємо повний знімок у clubs.settings.pharmacy_stock (атомарний JSON-знімок на рівні клубу без injury_logs)
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const currSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const { error: clubUpdateErr } = await admin
      .from("clubs")
      .update({
        settings: {
          ...currSettings,
          pharmacy_stock: newStock,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", clubId);

    if (!clubUpdateErr) {
      persisted = true;
    }
  } catch {}

  // 3. Якщо injury_logs підтримує injury_id = NULL, записуємо журнал змін складу без створення фіктивної травми
  try {
    const { error: logErr } = await admin.from("injury_logs").insert({
      club_id: clubId,
      injury_id: null,
      date: new Date().toISOString().split("T")[0],
      category: "note",
      note: `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStock)}`,
    } as any);
    if (!logErr) {
      persisted = true;
    }
  } catch {}

  if (!persisted) {
    return { error: "Не вдалося зберегти оновлений стан аптечного складу" };
  }

  return {};
}

/**
 * Отримує актуальний стан складу аптеки поточного клубу
 */
export async function getPharmacyStockAction(): Promise<PharmacyItem[]> {
  const user = await getCurrentUser();
  if (!user || !user.clubId) {
    return [];
  }

  return readClubPharmacyStockInternal(user.clubId);
}

/**
 * Оновлює залишки/додає позицію на склад аптеки клубу (серіалізовано через пер-клубний м'ютекс)
 */
export async function updatePharmacyItemAction(updatedItem: PharmacyItem): Promise<{
  success?: boolean;
  stock?: PharmacyItem[];
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (!updatedItem || !updatedItem.name?.trim()) {
    return { error: "Вкажіть назву препарату" };
  }

  const normalizedItem: PharmacyItem = {
    ...updatedItem,
    id: (updatedItem.id || `ph-${Date.now()}`).trim(),
    name: updatedItem.name.trim(),
    stock_count: Math.max(0, Number(updatedItem.stock_count) || 0),
    min_alert_threshold: Math.max(1, Number(updatedItem.min_alert_threshold) || 1),
  };

  return withClubPharmacyLock(auth.user.clubId, async () => {
    const currentStock = await readClubPharmacyStockInternal(auth.user.clubId);
    const index = currentStock.findIndex((i) => i.id === normalizedItem.id);
    const newStock =
      index >= 0
        ? currentStock.map((i) => (i.id === normalizedItem.id ? normalizedItem : i))
        : [normalizedItem, ...currentStock];

    const persistRes = await persistClubPharmacyStockInternal(
      auth.user.clubId,
      newStock,
      normalizedItem
    );
    if (persistRes.error) {
      return { error: persistRes.error };
    }

    revalidatePath("/pharmacy");
    return { success: true, stock: newStock };
  });
}

/**
 * Списати або скоригувати кількість препарату (атомарно, з перевіркою достатності залишку)
 */
export async function adjustPharmacyStockCountAction(
  itemId: string,
  delta: number,
  _reason?: string
): Promise<{
  success?: boolean;
  item?: PharmacyItem;
  newStock?: PharmacyItem[];
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (!Number.isFinite(delta) || delta === 0) {
    return { error: "Некоректна зміна кількості препарату" };
  }

  return withClubPharmacyLock(auth.user.clubId, async () => {
    const currentStock = await readClubPharmacyStockInternal(auth.user.clubId);
    const applied = applyStockDeltaToList(currentStock, itemId, delta);
    if ("error" in applied) {
      return { error: applied.error };
    }

    const persistRes = await persistClubPharmacyStockInternal(
      auth.user.clubId,
      applied.newStock,
      applied.updatedItem
    );
    if (persistRes.error) {
      return { error: persistRes.error };
    }

    revalidatePath("/pharmacy");
    return {
      success: true,
      item: applied.updatedItem,
      newStock: applied.newStock,
    };
  });
}

/**
 * Призначити препарат або процедуру гравцю зі списанням зі складу аптеки
 * Гарантує:
 * - перевірку належності гравця і травми клубу лікаря
 * - перевірку достатності залишку на складі ДО створення призначення
 * - автоматичний компенсаційний відкат (rollback) складу, якщо вставка в medical_treatments завершилась помилкою
 */
export async function prescribeTreatmentWithStockAction(
  treatmentData: Omit<MedicalTreatmentEntry, "id" | "created_at">,
  pharmacyItemId?: string | null,
  quantityToDeduct: number = 1
): Promise<{
  success?: boolean;
  treatment?: MedicalTreatmentEntry;
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const access = await assertPlayerAccess(auth.user, treatmentData.player_id, {
    allowCoach: false,
  });
  if ("error" in access) return { error: access.error };

  const clubId = access.player.club_id || auth.user.clubId;
  const supabase = await createClient();
  const admin = createAdminClient();

  if (treatmentData.injury_id) {
    const { data: ownedInjury } = await admin
      .from("injuries")
      .select("id")
      .eq("id", treatmentData.injury_id)
      .eq("player_id", treatmentData.player_id)
      .eq("club_id", clubId)
      .maybeSingle();

    if (!ownedInjury) {
      return { error: "Обрана травма не належить цьому гравцю або клубу" };
    }
  }

  if (pharmacyItemId && (!Number.isFinite(quantityToDeduct) || quantityToDeduct <= 0)) {
    return { error: "Кількість для списання має бути додатним числом" };
  }

  return withClubPharmacyLock(clubId, async () => {
    let previousStock: PharmacyItem[] | null = null;
    let previousItem: PharmacyItem | null = null;
    let deductedUnits: number | null = null;

    if (pharmacyItemId && quantityToDeduct > 0) {
      const currentStock = await readClubPharmacyStockInternal(clubId);
      const existingItem = currentStock.find((i) => i.id === pharmacyItemId);
      if (!existingItem) {
        return { error: "Обраний препарат не знайдено на складі клубу" };
      }

      const applied = applyStockDeltaToList(currentStock, pharmacyItemId, -quantityToDeduct);
      if ("error" in applied) {
        return { error: applied.error };
      }

      previousStock = currentStock;
      previousItem = existingItem;

      const persistRes = await persistClubPharmacyStockInternal(
        clubId,
        applied.newStock,
        applied.updatedItem
      );
      if (persistRes.error) {
        return { error: persistRes.error };
      }
      deductedUnits = quantityToDeduct;
    }

    const generatedId = `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const entry: MedicalTreatmentEntry = {
      ...treatmentData,
      id: generatedId,
      created_at: new Date().toISOString(),
      pharmacy_item_id: pharmacyItemId || null,
      units_deducted: deductedUnits,
    };

    const { data: insertedTreatment, error: treatmentError } = await supabase
      .from("medical_treatments")
      .insert({
        club_id: clubId,
        player_id: treatmentData.player_id,
        injury_id: treatmentData.injury_id || null,
        date: treatmentData.date,
        category: treatmentData.category,
        title: treatmentData.title,
        dosage_or_params: treatmentData.dosage_or_params || null,
        duration_days: treatmentData.duration_days ?? null,
        duration_note: treatmentData.duration_note || null,
        reason: treatmentData.reason || null,
        doctor_name: treatmentData.doctor_name,
        wada_status: treatmentData.wada_status,
        doctor_wada_confirmed: Boolean(treatmentData.doctor_wada_confirmed),
        doctor_confirmation_note: treatmentData.doctor_confirmation_note || null,
        notes: treatmentData.notes || null,
        pharmacy_item_id: pharmacyItemId || null,
        units_deducted: deductedUnits,
        legacy_entry_id: generatedId,
        data: entry,
      } as any)
      .select("id")
      .single();

    if (treatmentError) {
      // Компенсаційний відкат складу при помилці збереження призначення
      if (previousStock && previousItem) {
        await persistClubPharmacyStockInternal(clubId, previousStock, previousItem);
      }
      return { error: treatmentError.message };
    }

    entry.log_id = insertedTreatment?.id;

    await logAudit({
      action: "prescribe_treatment",
      entity: "pharmacy",
      entityId: entry.id,
      playerId: treatmentData.player_id,
      meta: {
        date: treatmentData.date,
        category: treatmentData.category,
        has_stock_item: Boolean(pharmacyItemId),
        units: deductedUnits,
        duration_days: treatmentData.duration_days,
        reason: treatmentData.reason,
        doctor_wada_confirmed: treatmentData.doctor_wada_confirmed,
      },
      userId: auth.user.id,
      clubId,
    });

    if (treatmentData.injury_id) {
      revalidatePath(`/injuries/${treatmentData.injury_id}`);
    }
    revalidatePath(`/players/${treatmentData.player_id}`);
    revalidatePath("/pharmacy");

    return { success: true, treatment: entry };
  });
}

/**
 * Видалити медикаментозне призначення та атомарно повернути списані залишки на склад (Rollback).
 * Спочатку видаляє запис у medical_treatments (із перевіркою фактичного видалення),
 * щоб подвійний клік не міг двічі повернути препарат на склад.
 */
export async function deleteTreatmentAndRollbackStockAction(treatmentId: string): Promise<{
  success?: boolean;
  rolledBackUnits?: number;
  newStock?: PharmacyItem[];
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const clubId = auth.user.clubId;
  const supabase = await createClient();

  return withClubPharmacyLock(clubId, async () => {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        treatmentId
      );
    let findQuery = supabase
      .from("medical_treatments")
      .select("*")
      .eq("club_id", clubId);

    findQuery = isUuid
      ? findQuery.or(`id.eq.${treatmentId},legacy_entry_id.eq.${treatmentId}`)
      : findQuery.eq("legacy_entry_id", treatmentId);

    const { data: targetRow, error: findError } = await findQuery
      .limit(1)
      .maybeSingle();

    if (findError || !targetRow) {
      return { error: "Запис призначення не знайдено в базі даних" };
    }

    // 1. Атомарно видаляємо запис призначення і перевіряємо, що він дійсно був видалений цим запитом
    const { data: deletedRows, error: deleteError } = await supabase
      .from("medical_treatments")
      .delete()
      .eq("id", targetRow.id)
      .eq("club_id", clubId)
      .select("id");

    if (deleteError) return { error: deleteError.message };
    if (!deletedRows || deletedRows.length === 0) {
      return { error: "Запис призначення вже було скасовано" };
    }

    const treatmentEntry: MedicalTreatmentEntry = {
      ...((targetRow.data as MedicalTreatmentEntry) || {}),
      id: targetRow.legacy_entry_id || targetRow.id,
      log_id: targetRow.id,
      injury_id: targetRow.injury_id,
      player_id: targetRow.player_id,
      date: targetRow.date,
      category: targetRow.category,
      title: targetRow.title,
      dosage_or_params: targetRow.dosage_or_params,
      duration_days: targetRow.duration_days,
      duration_note: targetRow.duration_note,
      reason: targetRow.reason,
      doctor_name: targetRow.doctor_name,
      wada_status: targetRow.wada_status,
      doctor_wada_confirmed: targetRow.doctor_wada_confirmed,
      doctor_confirmation_note: targetRow.doctor_confirmation_note,
      notes: targetRow.notes,
      pharmacy_item_id: targetRow.pharmacy_item_id,
      units_deducted:
        targetRow.units_deducted != null ? Number(targetRow.units_deducted) : null,
      created_at: targetRow.created_at,
    };

    let rolledBackUnits = 0;
    let newStockList: PharmacyItem[] | undefined;

    // 2. Повертаємо списані одиниці на склад
    if (
      treatmentEntry.pharmacy_item_id &&
      (treatmentEntry.units_deducted ?? 0) > 0
    ) {
      const unitsToRestore = Number(treatmentEntry.units_deducted);
      const currentStock = await readClubPharmacyStockInternal(clubId);
      const applied = applyStockDeltaToList(
        currentStock,
        treatmentEntry.pharmacy_item_id,
        unitsToRestore
      );

      if (!("error" in applied)) {
        const persistRes = await persistClubPharmacyStockInternal(
          clubId,
          applied.newStock,
          applied.updatedItem
        );
        if (!persistRes.error) {
          rolledBackUnits = unitsToRestore;
          newStockList = applied.newStock;
        }
      }
    }

    await logAudit({
      action: "delete_treatment_and_rollback_stock",
      entity: "pharmacy",
      entityId: treatmentId,
      playerId: treatmentEntry.player_id,
      meta: {
        treatment_title: treatmentEntry.title,
        units_restored: rolledBackUnits,
        pharmacy_item_id: treatmentEntry.pharmacy_item_id,
      },
      userId: auth.user.id,
      clubId,
    });

    if (treatmentEntry.injury_id) {
      revalidatePath(`/injuries/${treatmentEntry.injury_id}`);
    }
    revalidatePath(`/players/${treatmentEntry.player_id}`);
    revalidatePath("/pharmacy");

    return { success: true, rolledBackUnits, newStock: newStockList };
  });
}

/**
 * Автозаповнення клінічних та WADA даних препарату за назвою чи діючою речовиною
 */
export async function lookupDrugAutofillAction(query: string): Promise<{
  success: boolean;
  drug?: ClinicalDrugInfo;
  source?: "preset" | "ai";
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  if (!query || query.trim().length < 2) {
    return { success: false, error: "Введіть хоча б 2 символи назви для пошуку" };
  }

  try {
    // 1. Пошук у локальній еталонній базі спортивної фармакології (0 мс)
    const preset = findClinicalDrugPreset(query);
    if (preset) {
      return { success: true, drug: preset, source: "preset" };
    }

    // 2. Якщо не знайдено — інтелектуальний пошук через ШІ (Gemini / WADA)
    const aiResult = await lookupDrugWithAI(query);
    if (aiResult) {
      return { success: true, drug: aiResult, source: "ai" };
    }

    return {
      success: false,
      error: "Препарат не знайдено в автоматичному каталозі. Будь ласка, заповніть поля вручну.",
    };
  } catch (err: any) {
    console.error("lookupDrugAutofillAction error:", err);
    return { success: false, error: err?.message || "Помилка при пошуку даних препарату" };
  }
}
