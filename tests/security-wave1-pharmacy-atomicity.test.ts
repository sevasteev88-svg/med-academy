import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  withClubPharmacyLock,
  applyStockDeltaToList,
  mapDbRowToPharmacyItem,
} from "../src/lib/pharmacy-stock-manager.ts";
import type { PharmacyItem } from "../src/types/pharmacy.ts";

const sampleItem: PharmacyItem = {
  id: "ph-1",
  name: "Німесулід 100 мг",
  active_substance: "Nimesulide",
  category: "nsaid_painkillers",
  stock_count: 10,
  unit: "пакетиків",
  min_alert_threshold: 3,
  expiry_date: "2027-08-30",
  wada_status: "allowed",
};

test("Волна 1 (1.5) — Атомарність аптечного складу та відсутність фіктивних травм", async (t) => {
  await t.test("withClubPharmacyLock серіалізує 10 паралельних списань без втрати оновлень (Lost Update)", async () => {
    let sharedStock: PharmacyItem[] = [{ ...sampleItem, stock_count: 10 }];

    const tasks = Array.from({ length: 10 }, () =>
      withClubPharmacyLock("club-alpha", async () => {
        // Симулюємо асинхронне читання та запис до БД із випадковою затримкою
        const current = sharedStock.map((i) => ({ ...i }));
        await new Promise((r) => setTimeout(r, 2));
        const res = applyStockDeltaToList(current, "ph-1", -1);
        assert.ok(!("error" in res));
        sharedStock = res.newStock;
      })
    );

    await Promise.all(tasks);
    assert.equal(sharedStock[0].stock_count, 0);
  });

  await t.test("applyStockDeltaToList блокує списання у від'ємний залишок та некоректні дельти", () => {
    const stock: PharmacyItem[] = [{ ...sampleItem, stock_count: 2 }];

    const insufficient = applyStockDeltaToList(stock, "ph-1", -3);
    assert.ok("error" in insufficient);
    assert.match(insufficient.error, /Недостатньо препарату/);

    const zeroDelta = applyStockDeltaToList(stock, "ph-1", 0);
    assert.ok("error" in zeroDelta);

    const missingItem = applyStockDeltaToList(stock, "ph-unknown", -1);
    assert.ok("error" in missingItem);

    const valid = applyStockDeltaToList(stock, "ph-1", -2);
    assert.ok(!("error" in valid));
    assert.equal(valid.updatedItem.stock_count, 0);
  });

  await t.test("mapDbRowToPharmacyItem коректно нормалізує рядки з pharmacy_items", () => {
    const mapped = mapDbRowToPharmacyItem({
      id: "uuid-123",
      item_key: "ph-4",
      name: "Дексаметазон",
      category: "injections",
      stock_count: 15,
      unit: "ампул",
      min_alert_threshold: 5,
      expiry_date: "2027-05-01",
      wada_status: "prohibited_in_competition",
      requires_review: true,
    });

    assert.equal(mapped.id, "ph-4");
    assert.equal(mapped.stock_count, 15);
    assert.equal(mapped.wada_status, "prohibited_in_competition");
    assert.equal(mapped.requires_review, true);
  });

  await t.test("pharmacy-actions.ts та міграція 1.5 не створюють фіктивних травм і забезпечують атомарність", () => {
    const actionsSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/actions/pharmacy-actions.ts"),
      "utf8"
    );
    assert.ok(!actionsSource.includes("getOrCreateSystemInjuryId"));
    assert.ok(!actionsSource.includes("Службовий запис аптечного обліку клубу"));
    assert.match(actionsSource, /withClubPharmacyLock/);
    assert.match(actionsSource, /assertPlayerAccess/);

    const migrationSql = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261119150000_wave1_pharmacy_atomicity_and_injury_logs.sql"
      ),
      "utf8"
    );
    assert.match(migrationSql, /ALTER TABLE public\.injury_logs ALTER COLUMN injury_id DROP NOT NULL/);
    assert.match(migrationSql, /chk_pharmacy_items_stock_non_negative/);
    assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.adjust_pharmacy_stock_atomic/);
  });
});
