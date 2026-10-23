import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EHR_SECTIONS,
  EHR_SECTION_LABELS,
  TRANSFER_PURPOSE_LABELS,
  type EhrExportConsent,
  type EhrTransferPayload,
} from "../src/types/ehr-transfer.ts";
import {
  validateEhrExportConsent,
  computeEhrPayloadHash,
  buildEhrExportPayload,
  validateEhrImportPayload,
  generateEhrTransferPdfBase64,
} from "../src/lib/ehr-transfer.ts";

describe("Етап 5.2 — Експорт медкарти та перенос гравця (EHR Transfer)", () => {
  const validConsent: EhrExportConsent = {
    consent_confirmed: true,
    purpose: "transfer",
    recipient_club: "ФК Шахтар Донецьк",
    doctor_confirmation_name: "Д-р Мельник О.В.",
    consent_date: "2026-10-23",
    notes: "Офіційний трансфер згідно з контрактом",
  };

  const sampleData: EhrTransferPayload["data"] = {
    anthropometry: [
      { date: "2026-09-01", height: 182, weight: 75.5, fat_percentage: 9.8, notes: "Початок сезону" },
    ],
    injuries: [
      {
        injury_type: "muscular",
        location: "thigh",
        side: "right",
        date_of_injury: "2026-08-10",
        actual_return_date: "2026-08-28",
        severity: "moderate",
        mechanism: "non_contact",
        status: "closed",
        description: "Надрив двоголового м'яза стегна 2A",
      },
    ],
    examinations: [
      {
        date: "2026-08-11",
        pain_vas: 6,
        swelling_grade: "mild",
        rom_grade: "slightly_limited",
        muscle_tone: "hypertonic",
        palpation_pain: true,
        notes: "Гострий період",
      },
    ],
    screenings: [
      {
        season: "2026/2027",
        date: "2026-07-15",
        examiner_doctor: "Д-р Мельник",
        overall_status: "cleared",
        valid_until: "2027-06-30",
        cardio_clearance: true,
      },
    ],
    prescriptions: [
      {
        date: "2026-08-12",
        medication_name: "Ібупрофен 400 мг",
        dosage: "1 таб х 2 рази на добу",
        route: "oral",
        is_wada_prohibited: false,
        prescribed_by: "Д-р Мельник",
      },
    ],
    lsi: [
      {
        date: "2026-08-25",
        metric_name: "Ізокінетична динамометрія (Hamstring 60°/s)",
        involved_value: 175,
        uninvolved_value: 188,
        lsi_percentage: 93.1,
        status: "optimal",
        notes: "Допущено до повноконтактних тренувань",
      },
    ],
  };

  describe("1. Юридичний контур згоди (validateEhrExportConsent)", () => {
    it("успішно валідує повну та підтверджену згоду", () => {
      const res = validateEhrExportConsent(validConsent);
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
    });

    it("відхиляє експорт, якщо чекбокс згоди не встановлено", () => {
      const invalid = { ...validConsent, consent_confirmed: false };
      const res = validateEhrExportConsent(invalid);
      assert.equal(res.valid, false);
      assert.match(res.error || "", /згоди суб'єкта даних/);
    });

    it("відхиляє експорт, якщо не вказано приймаючий клуб або організацію", () => {
      const invalid = { ...validConsent, recipient_club: "   " };
      const res = validateEhrExportConsent(invalid);
      assert.equal(res.valid, false);
      assert.match(res.error || "", /приймаючого клубу/);
    });

    it("відхиляє експорт, якщо відсутнє ПІБ відповідального лікаря", () => {
      const invalid = { ...validConsent, doctor_confirmation_name: "" };
      const res = validateEhrExportConsent(invalid);
      assert.equal(res.valid, false);
      assert.match(res.error || "", /ПІБ лікаря/);
    });

    it("відхиляє експорт, якщо об'єкт згоди null або undefined", () => {
      assert.equal(validateEhrExportConsent(null).valid, false);
      assert.equal(validateEhrExportConsent(undefined).valid, false);
    });
  });

  describe("2. Контрольний хеш цілісності (computeEhrPayloadHash)", () => {
    it("генерує 64-символьний SHA-256 хеш у шістнадцятковому форматі", () => {
      const hash = computeEhrPayloadHash(sampleData);
      assert.equal(typeof hash, "string");
      assert.equal(hash.length, 64);
      assert.match(hash, /^[0-9a-f]{64}$/);
    });

    it("детермінований: однакові дані завжди дають ідентичний хеш", () => {
      const hash1 = computeEhrPayloadHash(sampleData);
      const hash2 = computeEhrPayloadHash(sampleData);
      assert.equal(hash1, hash2);
    });

    it("чутливий: зміна будь-якого клінічного показника змінює хеш", () => {
      const hashOriginal = computeEhrPayloadHash(sampleData);
      const modifiedData = JSON.parse(JSON.stringify(sampleData));
      modifiedData.anthropometry[0].weight = 75.6; // зміна на 100 грамів
      const hashModified = computeEhrPayloadHash(modifiedData);
      assert.notEqual(hashOriginal, hashModified);
    });
  });

  describe("3. Побудова пакету передачі (buildEhrExportPayload)", () => {
    it("формує валідний EHR Transfer Package версії 1.0.0", () => {
      const payload = buildEhrExportPayload({
        clubOrigin: { id: "club-1", name: "ФК Динамо" },
        doctor: { id: "doc-1", name: "Д-р Мельник" },
        player: {
          first_name: "Олександр",
          last_name: "Шевченко",
          date_of_birth: "2008-05-14",
          position: "ЦЗ",
          dominant_side: "right",
        },
        consent: validConsent,
        sectionsIncluded: EHR_SECTIONS,
        data: sampleData,
      });

      assert.equal(payload.schema_version, "1.0.0");
      assert.ok(payload.export_id.startsWith("ehr_"));
      assert.equal(payload.club_origin.name, "ФК Динамо");
      assert.equal(payload.player.last_name, "Шевченко");
      assert.equal(payload.sections_included.length, 6);
      assert.equal(payload.content_sha256.length, 64);
      assert.deepEqual(payload.data, sampleData);
    });

    it("викидає помилку при спробі побудувати пакет з невалідною згодою", () => {
      assert.throws(
        () =>
          buildEhrExportPayload({
            clubOrigin: { id: "c1", name: "Клуб" },
            doctor: { id: "d1", name: "Лікар" },
            player: { first_name: "Іван", last_name: "Франко", date_of_birth: "2007-01-01", position: "ВР" },
            consent: { ...validConsent, consent_confirmed: false },
            sectionsIncluded: ["injuries"],
            data: {},
          }),
        /згоди/
      );
    });
  });

  describe("4. Валідація імпорту в приймаючому клубі (Dry-Run Engine)", () => {
    const existingPlayers = [
      { id: "p-exist-1", first_name: "Олександр", last_name: "Шевченко", date_of_birth: "2008-05-14" },
      { id: "p-exist-2", first_name: "Михайло", last_name: "Мудрик", date_of_birth: "2001-01-05" },
    ];

    it("успішно валідує коректний пакет перенесення та підраховує записи", () => {
      const payload = buildEhrExportPayload({
        clubOrigin: { id: "club-1", name: "ФК Динамо" },
        doctor: { id: "doc-1", name: "Д-р Мельник" },
        player: {
          first_name: "Віктор",
          last_name: "Циганков",
          date_of_birth: "1997-11-15",
          position: "ПВ",
        },
        consent: validConsent,
        sectionsIncluded: EHR_SECTIONS,
        data: sampleData,
      });

      const report = validateEhrImportPayload(payload, existingPlayers);

      assert.equal(report.valid, true);
      assert.equal(report.schema_version, "1.0.0");
      assert.equal(report.origin_club_name, "ФК Динамо");
      assert.equal(report.player_preview.last_name, "Циганков");
      assert.equal(report.matching_player.found, false);
      assert.equal(report.counts.injuries, 1);
      assert.equal(report.counts.examinations, 1);
      assert.equal(report.counts.screenings, 1);
      assert.equal(report.counts.prescriptions, 1);
      assert.equal(report.counts.lsi, 1);
      assert.equal(report.counts.anthropometry, 1);
      assert.equal(report.counts.total_records, 6);
      assert.equal(report.errors.length, 0);
    });

    it("виявляє наявного гравця в клубі за ПІБ та датою народження (Duplicate Match)", () => {
      const payload = buildEhrExportPayload({
        clubOrigin: { id: "c1", name: "Клуб А" },
        doctor: { id: "d1", name: "Лікар" },
        player: {
          first_name: "Олександр",
          last_name: "Шевченко",
          date_of_birth: "2008-05-14",
          position: "ЦЗ",
        },
        consent: validConsent,
        sectionsIncluded: ["injuries"],
        data: { injuries: sampleData.injuries },
      });

      const report = validateEhrImportPayload(payload, existingPlayers);

      assert.equal(report.valid, true);
      assert.equal(report.matching_player.found, true);
      assert.equal(report.matching_player.existing_player_id, "p-exist-1");
      assert.match(report.warnings[0], /Знайдено існуючого гравця/);
    });

    it("відхиляє файл з непідтримуваною версією схеми", () => {
      const corrupted = {
        schema_version: "2.5.0",
        player: { first_name: "А", last_name: "Б", date_of_birth: "2000-01-01" },
        data: {},
      };
      const report = validateEhrImportPayload(corrupted);
      assert.equal(report.valid, false);
      assert.match(report.errors[0], /Непідтримувана версія схеми/);
    });

    it("попереджає про розбіжність контрольного хешу при ручній зміні даних", () => {
      const payload = buildEhrExportPayload({
        clubOrigin: { id: "c1", name: "Клуб" },
        doctor: { id: "d1", name: "Лікар" },
        player: { first_name: "Тест", last_name: "Гравець", date_of_birth: "2005-01-01", position: "ВР" },
        consent: validConsent,
        sectionsIncluded: ["anthropometry"],
        data: sampleData,
      });

      // Змінюємо дані без перерахунку хешу
      payload.data.anthropometry![0].weight = 99.9;

      const report = validateEhrImportPayload(payload);
      assert.equal(report.valid, true);
      assert.ok(report.warnings.some((w) => w.includes("контрольний хеш цілісності")));
    });
  });

  describe("5. Генерація PDF з водяним знаком (generateEhrTransferPdfBase64)", () => {
    it("генерує валідний Base64 PDF документ", () => {
      const payload = buildEhrExportPayload({
        clubOrigin: { id: "club-1", name: "ФК Шахтар" },
        doctor: { id: "doc-1", name: "Д-р Мельник" },
        player: {
          first_name: "Тарас",
          last_name: "Степаненко",
          date_of_birth: "1989-08-08",
          position: "ОП",
        },
        consent: validConsent,
        sectionsIncluded: EHR_SECTIONS,
        data: sampleData,
      });

      const base64 = generateEhrTransferPdfBase64(payload);
      assert.equal(typeof base64, "string");
      assert.ok(base64.length > 500);

      // Перевіряємо заголовок PDF (%PDF-1.) у декодованих байтах
      const decoded = Buffer.from(base64, "base64").toString("latin1");
      assert.ok(decoded.startsWith("%PDF-1."));
      assert.ok(decoded.includes("CONFIDENTIAL"));
    });
  });
});
