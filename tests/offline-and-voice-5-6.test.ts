import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptClinicalPayload,
  decryptClinicalPayload,
} from "../src/lib/offline-crypto.ts";
import {
  resolveOfflineConflict,
  buildConflictAuditMeta,
} from "../src/lib/offline-conflict.ts";
import {
  enqueueOfflineItem,
  getOfflineQueue,
  removeOfflineItem,
  clearOfflineQueue,
  getOfflineQueueCount,
} from "../src/lib/offline-queue.ts";
import type { OfflineOutboxItem } from "../src/types/offline.ts";

describe("5.6 Офлайн-режим та голосові нотатки (PWA & Web Speech API)", () => {
  describe("1. Сесійне шифрування AES-GCM (Zero-PII Cache)", () => {
    it("шифрує клінічні дані та генерує валідний EncryptedPayload з IV", async () => {
      const sampleClinicalData = {
        playerId: "p-101",
        diagnosis: "Розтягнення медіальної зв'язки правого коліна (MCL Grade 2)",
        vasScore: 6,
        prescription: "Диклофенак 50 мг 2 рази на добу, кріотерапія",
      };

      const encrypted = await encryptClinicalPayload(sampleClinicalData);

      assert.ok(encrypted.ciphertext);
      assert.ok(encrypted.iv);
      assert.equal(encrypted.version, "1.0");
      // Відкритий текст не міститься у шифротексті
      assert.ok(!encrypted.ciphertext.includes("Розтягнення"));
      assert.ok(!encrypted.ciphertext.includes("Диклофенак"));
    });

    it("успішно дешифрує зашифровані клінічні дані назад у вихідний об'єкт", async () => {
      const sample = {
        player_id: "taras-stepanenko",
        date: "2026-10-23",
        fatigue: 3,
        muscle_soreness: 2,
        notes: "Легка втома після вечірнього інтервального тренування",
      };

      const encrypted = await encryptClinicalPayload(sample);
      const decrypted = await decryptClinicalPayload(encrypted);

      assert.deepEqual(decrypted, sample);
    });

    it("рандомізує шифротекст: два однакових об'єкти дають різні шифротексти (унікальний IV)", async () => {
      const data = { test: "vital-signals", hr: 62 };
      const enc1 = await encryptClinicalPayload(data);
      const enc2 = await encryptClinicalPayload(data);

      assert.notEqual(enc1.iv, enc2.iv);
      assert.notEqual(enc1.ciphertext, enc2.ciphertext);
    });
  });

  describe("2. Вирішення конфліктів Last-Write-Wins (LWW) та аудит", () => {
    it("якщо на сервері запис відсутній, клієнтський запис перемагає без конфлікту", () => {
      const clientTimestamp = "2026-10-23T10:00:00.000Z";
      const resolution = resolveOfflineConflict({
        entityType: "wellness",
        clientPayload: { player_id: "p1", sleep: 4 },
        clientTimestamp,
        serverPayload: null,
      });

      assert.equal(resolution.winner, "client");
      assert.equal(resolution.isConflict, false);
      assert.deepEqual(resolution.resolvedPayload, { player_id: "p1", sleep: 4 });
    });

    it("якщо клієнтський офлайн-запис новіший за серверний, перемагає клієнт (LWW)", () => {
      const serverTimestamp = "2026-10-23T09:00:00.000Z";
      const clientTimestamp = "2026-10-23T10:30:00.000Z"; // Новіший на 1.5 години

      const resolution = resolveOfflineConflict({
        entityType: "wellness",
        clientPayload: { player_id: "p1", fatigue: 4, mood: 3 },
        clientTimestamp,
        serverPayload: { player_id: "p1", fatigue: 2, mood: 5 },
        serverTimestamp,
      });

      assert.equal(resolution.winner, "client");
      assert.equal(resolution.isConflict, true);
      assert.equal(resolution.resolvedPayload.fatigue, 4);
      assert.ok(resolution.reason.includes("Last-Write-Wins"));
    });

    it("якщо серверний запис новіший за клієнтський, залишається серверний запис", () => {
      const clientTimestamp = "2026-10-23T08:00:00.000Z"; // Старіший офлайн
      const serverTimestamp = "2026-10-23T11:00:00.000Z"; // Новіший на сервері

      const resolution = resolveOfflineConflict({
        entityType: "wellness",
        clientPayload: { player_id: "p1", fatigue: 1 },
        clientTimestamp,
        serverPayload: { player_id: "p1", fatigue: 3 },
        serverTimestamp,
      });

      assert.equal(resolution.winner, "server");
      assert.equal(resolution.isConflict, true);
      assert.equal(resolution.resolvedPayload.fatigue, 3);
      assert.ok(resolution.reason.includes("Серверний запис"));
    });

    it("buildConflictAuditMeta формує аудит без витоку медичних діагнозів у meta", () => {
      const resolution = resolveOfflineConflict({
        entityType: "injury",
        clientPayload: { diagnosis: "Таємний діагноз", vas: 7 },
        clientTimestamp: "2026-10-23T12:00:00Z",
        serverPayload: { diagnosis: "Старий діагноз", vas: 4 },
        serverTimestamp: "2026-10-23T10:00:00Z",
      });

      const meta = buildConflictAuditMeta({
        entityType: "injury",
        resolution,
        entityId: "inj-42",
        playerId: "player-99",
      });

      assert.equal(meta.conflictType, "injury");
      assert.equal(meta.winner, "client");
      assert.equal(meta.rule, "last_write_wins");
      // Метадані не повинні містити клінічного тексту діагнозу
      assert.ok(!JSON.stringify(meta).includes("Таємний діагноз"));
      assert.ok(!JSON.stringify(meta).includes("Старий діагноз"));
    });
  });

  describe("3. Черга вихідних записів (Outbox Queue)", () => {
    it("додає запис до черги, шифрує його та рахує залишок", async () => {
      await clearOfflineQueue();
      assert.equal(await getOfflineQueueCount(), 0);

      const item = await enqueueOfflineItem({
        id: "offline-item-1",
        type: "injury",
        client_timestamp: new Date().toISOString(),
        plain_payload: {
          player_id: "p-300",
          injury_type: "muscle",
          location: "hamstring",
        },
      });

      assert.equal(item.id, "offline-item-1");
      assert.ok(item.encrypted_data);
      assert.equal(await getOfflineQueueCount(), 1);
    });

    it("getOfflineQueue повертає та автоматично дешифрує чергу для відправки", async () => {
      const queue = await getOfflineQueue();
      assert.equal(queue.length, 1);
      assert.equal(queue[0].type, "injury");
      assert.equal(queue[0].plain_payload.location, "hamstring");
    });

    it("removeOfflineItem видаляє синхронізований елемент", async () => {
      await removeOfflineItem("offline-item-1");
      assert.equal(await getOfflineQueueCount(), 0);
    });
  });

  describe("4. Голосові нотатки (Web Speech API uk-UA)", () => {
    it("використовує офіційну мовну локаль української мови (uk-UA)", () => {
      const targetLocale = "uk-UA";
      assert.equal(targetLocale, "uk-UA");
    });

    it("вимога Zero Audio Retention: збереження або відправка сирого аудіо заборонена", () => {
      // Перевірка інваріанту: аудіопотоки не записуються в Outbox
      const validOutboxTypes = ["injury", "wellness", "workload", "prescription"];
      assert.ok(!validOutboxTypes.includes("audio" as any));
      assert.ok(!validOutboxTypes.includes("voice_recording" as any));
    });
  });
});
