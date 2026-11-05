import test from "node:test";
import assert from "node:assert/strict";
import { findClinicalDrugPreset, CLINICAL_DRUG_PRESETS } from "../src/lib/clinical-drug-directory.ts";

test("Pharmacy Clinical Autofill & WADA Directory", async (t) => {
  await t.test("знаходить відомий препарат за торговою назвою (Німесил)", () => {
    const res = findClinicalDrugPreset("Німесил");
    assert.ok(res, "Має знайти Німесил");
    assert.strictEqual(res.wada_status, "allowed");
    assert.strictEqual(res.min_age, 18);
    assert.ok(res.washout_note.length > 0);
    assert.ok(res.indications.length > 0);
    assert.strictEqual(res.storage_location, "Аптечка медкабінету");
  });

  await t.test("знаходить S9 кортикостероїд та підтягує статус заборони і TUE (Дексаметазон)", () => {
    const res = findClinicalDrugPreset("Дексаметазон");
    assert.ok(res, "Має знайти Дексаметазон");
    assert.strictEqual(res.wada_status, "prohibited_in_competition");
    assert.ok(res.wada_source_note.includes("S9"));
    assert.strictEqual(res.requires_review, true);
    assert.strictEqual(res.storage_location, "Сейф суворої звітності");
  });

  await t.test("знаходить депо-форму Дипроспан з тривалим періодом виведення (30-60 діб)", () => {
    const res = findClinicalDrugPreset("Дипроспан");
    assert.ok(res, "Має знайти Дипроспан");
    assert.strictEqual(res.wada_status, "prohibited_in_competition");
    assert.ok(res.washout_note.includes("30 до 60 ДНІВ"));
    assert.strictEqual(res.min_age, 18);
  });

  await t.test("знаходить вироби медичного призначення (Кінезіотейп K-Active)", () => {
    const res = findClinicalDrugPreset("тейп");
    assert.ok(res, "Має знайти тейпи");
    assert.strictEqual(res.category, "tapes_bandages");
    assert.strictEqual(res.wada_status, "allowed");
    assert.strictEqual(res.min_age, null);
  });

  await t.test("знаходить інгаляційний Сальбутамол (Вентолін) з лімітом WADA S3", () => {
    const res = findClinicalDrugPreset("Вентолін");
    assert.ok(res, "Має знайти Вентолін");
    assert.ok(res.wada_source_note.includes("S3"));
  });

  await t.test("знаходить суворо заборонений WADA засіб постійного бану (Мельдоній / Мілдронат)", () => {
    const res = findClinicalDrugPreset("Мілдронат");
    assert.ok(res, "Має знайти Мілдронат");
    assert.strictEqual(res.wada_status, "prohibited_always");
    assert.strictEqual(res.storage_location, "Сейф суворої звітності");
  });
});
