"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import type { PharmacyItem, MedicalTreatmentEntry } from "@/types/pharmacy";
import { DEFAULT_PHARMACY_ITEMS } from "@/lib/default-pharmacy-stock";

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

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: new Date().toISOString().split("T")[0],
    category: "treatment",
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

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: null as any,
    date: new Date().toISOString().split("T")[0],
    category: "treatment",
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

      await supabase.from("injury_logs").insert({
        injury_id: null as any,
        date: treatmentData.date,
        category: "treatment",
        note: `[PHARMACY_STOCK_UPDATE] ${JSON.stringify(newStock)}`,
      } as any);
    }
  }

  // 2. Створюємо запис лікування гравця
  const entry: MedicalTreatmentEntry = {
    ...treatmentData,
    id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
    pharmacy_item_id: pharmacyItemId || null,
    units_deducted: quantityToDeduct > 0 ? quantityToDeduct : null,
  };

  const payload = `[TREATMENT] ${JSON.stringify(entry)}`;

  const { error: treatmentError } = await supabase.from("injury_logs").insert({
    injury_id: treatmentData.injury_id || (null as any),
    date: treatmentData.date,
    category: "treatment",
    note: payload,
  } as any);

  if (treatmentError) return { error: treatmentError.message };

  if (treatmentData.injury_id) {
    revalidatePath(`/injuries/${treatmentData.injury_id}`);
  }
  revalidatePath(`/players/${treatmentData.player_id}`);
  revalidatePath("/pharmacy");

  return { success: true, treatment: entry };
}
