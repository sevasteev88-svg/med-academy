import type { PharmacyItem } from "@/types/pharmacy";

const clubLocks = new Map<string, Promise<unknown>>();

/**
 * Пер-клубний асинхронний м'ютекс для серіалізації операцій зі складом аптеки
 * в межах серверного процесу (захист від Lost Update при паралельних запитах).
 */
export async function withClubPharmacyLock<T>(
  clubId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = clubId || "default";
  const previous = clubLocks.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const chain = previous.then(() => current, () => current);
  clubLocks.set(key, chain);

  await previous.catch(() => undefined);

  try {
    return await fn();
  } finally {
    release();
    if (clubLocks.get(key) === chain) {
      clubLocks.delete(key);
    }
  }
}

export function mapDbRowToPharmacyItem(row: Record<string, any>): PharmacyItem {
  const extra = (row.data && typeof row.data === "object" ? row.data : {}) as Partial<PharmacyItem>;
  return {
    ...extra,
    id: String(row.item_key || extra.id || row.id),
    name: String(row.name || extra.name || "Препарат"),
    active_substance: row.active_substance ?? extra.active_substance ?? undefined,
    category: (row.category || extra.category || "nsaid_painkillers") as PharmacyItem["category"],
    stock_count: Math.max(0, Number(row.stock_count ?? extra.stock_count ?? 0)),
    unit: String(row.unit || extra.unit || "шт"),
    min_alert_threshold: Math.max(
      1,
      Number(row.min_alert_threshold ?? row.min_stock_alert ?? extra.min_alert_threshold ?? 5)
    ),
    expiry_date: row.expiry_date
      ? String(row.expiry_date).split("T")[0]
      : String(extra.expiry_date || ""),
    wada_status: (row.wada_status || extra.wada_status || "allowed") as PharmacyItem["wada_status"],
    storage_location:
      row.storage_location ?? row.storage_conditions ?? extra.storage_location ?? undefined,
    notes: row.notes ?? extra.notes ?? undefined,
    min_age: row.min_age !== undefined ? row.min_age : extra.min_age ?? null,
    age_note: row.age_note ?? extra.age_note ?? undefined,
    requires_review:
      row.requires_review !== undefined
        ? Boolean(row.requires_review)
        : Boolean(extra.requires_review),
    wada_source_note: row.wada_source_note ?? extra.wada_source_note ?? undefined,
    washout_note: row.washout_note ?? extra.washout_note ?? undefined,
    indications: row.indications ?? extra.indications ?? undefined,
  };
}

export function applyStockDeltaToList(
  stock: PharmacyItem[],
  itemId: string,
  delta: number
): { updatedItem: PharmacyItem; newStock: PharmacyItem[] } | { error: string } {
  if (!Number.isFinite(delta) || delta === 0) {
    return { error: "Некоректна кількість для зміни залишку" };
  }

  const item = stock.find((i) => i.id === itemId);
  if (!item) {
    return { error: "Препарат не знайдено на складі" };
  }

  const nextCount = item.stock_count + delta;
  if (nextCount < 0) {
    return {
      error: `Недостатньо препарату «${item.name}» на складі (доступно: ${item.stock_count} ${item.unit}, потрібно: ${Math.abs(delta)} ${item.unit})`,
    };
  }

  const updatedItem: PharmacyItem = {
    ...item,
    stock_count: nextCount,
  };

  const newStock = stock.map((i) => (i.id === itemId ? updatedItem : i));
  return { updatedItem, newStock };
}
