"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { PharmacyItem, MedicalTreatmentEntry } from "@/types/pharmacy";
import { DEFAULT_PHARMACY_ITEMS } from "@/lib/default-pharmacy-stock";
import { findClinicalDrugPreset, lookupDrugWithAI, type ClinicalDrugInfo } from "@/lib/clinical-drug-directory";

/**
 * Знаходить або безпечно створює дійсний injury_id для прив'язки в injury_logs (в БД діє NOT NULL)
 */
async function getOrCreateSystemInjuryId(
  supabase: any,
  clubId: string,
  preferredPlayerId?: string
): Promise<string> {
  // 1. Якщо вказано гравця, шукаємо його травму
  if (preferredPlayerId) {
    const { data: playerInj } = await supabase
      .from("injuries")
      .select("id")
      .eq("player_id", preferredPlayerId)
      .limit(1)
      .maybeSingle();

    if (playerInj?.id) return playerInj.id;
  }

  // 2. Спробуємо знайти будь-яку травму цього клубу
  const { data: existingClubInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("club_id", clubId)
    .limit(1)
    .maybeSingle();

  if (existingClubInj?.id) return existingClubInj.id;

  // 3. Якщо у клубі взагалі ще немає травм, беремо будь-якого гравця клубу
  const { data: anyPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("club_id", clubId)
    .limit(1)
    .maybeSingle();

  const playerId = preferredPlayerId || anyPlayer?.id;
  if (playerId) {
    const { data: newInj } = await supabase
      .from("injuries")
      .insert({
        club_id: clubId,
        player_id: playerId,
        injury_type: "Планова фармакотерапія / Медсклад",
        body_part: "Загальний стан",
        status: "closed",
        date_of_injury: new Date().toISOString().split("T")[0],
        diagnosis: "Службовий запис аптечного обліку клубу",
      } as any)
      .select("id")
      .single();

    if (newInj?.id) return newInj.id;
  }

  // 4. Глобальний фолбек на будь-яку травму в БД
  const { data: anyInj } = await supabase.from("injuries").select("id").limit(1).maybeSingle();
  return anyInj?.id || "00000000-0000-0000-0000-000000000000";
}

/**
 * Отримує актуальний стан складу аптеки з Supabase injury_logs або повертає дефолтний склад
 */
export async function getPharmacyStockAction(): Promise<PharmacyItem[]> {
  const supabase = await createClient();

  const { data: logs, error } = await supabase
    .from("injury_logs")
    .select("note, created_at")
    .like("note", "[PHARMACY_STOCK_UPDATE]%")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !logs || logs.length === 0) {
    return DEFAULT_PHARMACY_ITEMS;
  }

  try {
    const raw = logs[0].note.replace("[PHARMACY_STOCK_UPDATE] ", "");
    const items = JSON.parse(raw) as PharmacyItem[];
    return items;
  } catch {
    return DEFAULT_PHARMACY_ITEMS;
  }
}

/**
 * Оновлює залишки/додає позицію на склад аптеки клубу
 */
export async function updatePharmacyItemAction(updatedItem: PharmacyItem) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const currentStock = await getPharmacyStockAction();

  const index = currentStock.findIndex((i) => i.id === updatedItem.id);
  let newStock: PharmacyItem[];

  if (index >= 0) {
    newStock = currentStock.map((i) => (i.id === updatedItem.id ? updatedItem : i));
  } else {
    newStock = [updatedItem, ...currentStock];
  }

  const payload = `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStock)}`;
  const sysInjuryId = await getOrCreateSystemInjuryId(supabase, auth.user.clubId);

  const { error } = await supabase.from("injury_logs").insert({
    club_id: auth.user.clubId,
    injury_id: sysInjuryId,
    date: new Date().toISOString().split("T")[0],
    category: "note",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath("/pharmacy");
  return { success: true, stock: newStock };
}

/**
 * Списати або скоригувати кількість препарату
 */
export async function adjustPharmacyStockCountAction(
  itemId: string,
  delta: number, // наприклад, -1 при списанні або +10 при приході
  reason?: string
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const currentStock = await getPharmacyStockAction();

  const item = currentStock.find((i) => i.id === itemId);
  if (!item) return { error: "Препарат не знайдено на складі" };

  const newCount = Math.max(0, item.stock_count + delta);
  const updatedItem: PharmacyItem = {
    ...item,
    stock_count: newCount,
  };

  const newStock = currentStock.map((i) => (i.id === itemId ? updatedItem : i));
  const payload = `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStock)}`;
  const sysInjuryId = await getOrCreateSystemInjuryId(supabase, auth.user.clubId);

  const { error } = await supabase.from("injury_logs").insert({
    club_id: auth.user.clubId,
    injury_id: sysInjuryId,
    date: new Date().toISOString().split("T")[0],
    category: "note",
    note: payload,
  } as any);

  if (error) return { error: error.message };

  revalidatePath("/pharmacy");
  return { success: true, item: updatedItem, newStock };
}

/**
 * Призначити препарат або процедуру гравцю зі списанням зі складу аптеки
 */
export async function prescribeTreatmentWithStockAction(
  treatmentData: Omit<MedicalTreatmentEntry, "id" | "created_at">,
  pharmacyItemId?: string | null,
  quantityToDeduct: number = 1
) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  // 1. Якщо обрано складський препарат, перевіряємо і списуємо залишки
  if (pharmacyItemId && quantityToDeduct > 0) {
    const currentStock = await getPharmacyStockAction();
    const item = currentStock.find((i) => i.id === pharmacyItemId);

    if (item) {
      const updatedCount = Math.max(0, item.stock_count - quantityToDeduct);
      const updatedItem = { ...item, stock_count: updatedCount };
      const newStock = currentStock.map((i) => (i.id === pharmacyItemId ? updatedItem : i));

      const sysInjuryId = await getOrCreateSystemInjuryId(supabase, auth.user.clubId);
      await supabase.from("injury_logs").insert({
        club_id: auth.user.clubId,
        injury_id: sysInjuryId,
        date: treatmentData.date,
        category: "note",
        note: `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStock)}`,
      } as any);
    }
  }

  // 2. Визначаємо валідний targetInjuryId для збереження в injury_logs
  let targetInjuryId = treatmentData.injury_id;
  if (!targetInjuryId) {
    targetInjuryId = await getOrCreateSystemInjuryId(supabase, auth.user.clubId, treatmentData.player_id);
  }

  // 3. Створюємо запис лікування гравця
  const generatedId = `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const entry: MedicalTreatmentEntry = {
    ...treatmentData,
    id: generatedId,
    created_at: new Date().toISOString(),
    pharmacy_item_id: pharmacyItemId || null,
    units_deducted: quantityToDeduct > 0 ? quantityToDeduct : null,
  };

  const payload = `[TREATMENT] ${JSON.stringify(entry)}`;

  // Визначаємо валідну категорію log_category (prescription, procedure)
  let dbCategory: "prescription" | "procedure" = "prescription";
  if (
    treatmentData.category === "injection" ||
    treatmentData.category === "taping" ||
    treatmentData.category === "physiotherapy"
  ) {
    dbCategory = "procedure";
  }

  const { data: insertedLog, error: treatmentError } = await supabase
    .from("injury_logs")
    .insert({
      club_id: auth.user.clubId,
      injury_id: targetInjuryId,
      date: treatmentData.date,
      category: dbCategory,
      note: payload,
    } as any)
    .select("id")
    .single();

  if (treatmentError) return { error: treatmentError.message };

  entry.log_id = insertedLog?.id;

  await logAudit({
    action: "prescribe_treatment",
    entity: "pharmacy",
    entityId: entry.id,
    playerId: treatmentData.player_id,
    meta: {
      date: treatmentData.date,
      category: treatmentData.category,
      has_stock_item: Boolean(pharmacyItemId),
      units: quantityToDeduct,
      duration_days: treatmentData.duration_days,
      reason: treatmentData.reason,
      doctor_wada_confirmed: treatmentData.doctor_wada_confirmed,
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  if (treatmentData.injury_id) {
    revalidatePath(`/injuries/${treatmentData.injury_id}`);
  }
  revalidatePath(`/players/${treatmentData.player_id}`);
  revalidatePath("/pharmacy");

  return { success: true, treatment: entry };
}

/**
 * Видалити медикаментозне призначення та автоматично повернути списані залишки на склад (Rollback)
 */
export async function deleteTreatmentAndRollbackStockAction(treatmentId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  // Знаходимо запис у injury_logs
  const { data: logs, error: findError } = await supabase
    .from("injury_logs")
    .select("id, note, injury_id")
    .like("note", `[TREATMENT] %"id":"${treatmentId}"%`)
    .limit(1);

  if (findError || !logs || logs.length === 0) {
    return { error: "Запис призначення не знайдено в базі даних" };
  }

  const targetLog = logs[0];
  let treatmentEntry: MedicalTreatmentEntry | null = null;
  try {
    const rawJson = targetLog.note.replace("[TREATMENT] ", "");
    treatmentEntry = JSON.parse(rawJson);
  } catch {
    return { error: "Помилка структури запису призначення" };
  }

  if (!treatmentEntry) {
    return { error: "Не вдалося розпарсити дані призначення" };
  }

  let rolledBackUnits = 0;
  let newStockList: PharmacyItem[] | undefined;

  // Якщо були списані одиниці зі складу — повертаємо їх
  if (treatmentEntry.pharmacy_item_id && (treatmentEntry.units_deducted ?? 0) > 0) {
    rolledBackUnits = treatmentEntry.units_deducted!;
    const currentStock = await getPharmacyStockAction();
    const item = currentStock.find((i) => i.id === treatmentEntry!.pharmacy_item_id);

    if (item) {
      const restoredCount = item.stock_count + rolledBackUnits;
      const updatedItem = { ...item, stock_count: restoredCount };
      newStockList = currentStock.map((i) => (i.id === item.id ? updatedItem : i));

      const sysInjuryId = await getOrCreateSystemInjuryId(supabase, auth.user.clubId);
      await supabase.from("injury_logs").insert({
        club_id: auth.user.clubId,
        injury_id: sysInjuryId,
        date: new Date().toISOString().split("T")[0],
        category: "note",
        note: `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStockList)}`,
      } as any);
    }
  }

  // Видаляємо запис призначення
  const { error: deleteError } = await supabase
    .from("injury_logs")
    .delete()
    .eq("id", targetLog.id);

  if (deleteError) return { error: deleteError.message };

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
    clubId: auth.user.clubId,
  });

  if (treatmentEntry.injury_id) {
    revalidatePath(`/injuries/${treatmentEntry.injury_id}`);
  }
  revalidatePath(`/players/${treatmentEntry.player_id}`);
  revalidatePath("/pharmacy");

  return { success: true, rolledBackUnits, newStock: newStockList };
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
