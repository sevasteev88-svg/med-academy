import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INJURY_ATTACHMENT_CONFIG,
  ATTACHMENT_TYPE_LABELS,
  type AttachmentType,
} from "../src/types/injury-attachment.ts";
import {
  validateAttachmentFile,
  sanitizeFileName,
  buildInjuryAttachmentStoragePath,
  parseInjuryAttachmentPath,
  canAccessInjuryAttachments,
  formatFileSize,
  buildAttachmentAuditMeta,
} from "../src/lib/injury-attachments.ts";

describe("Етап 5.1 — Вкладення до травми (Injury Attachments)", () => {
  describe("1. Конфігурація та обмеження за специфікацією", () => {
    it("максимальний розмір файлу становить рівно 20 МБ (20971520 байт)", () => {
      assert.equal(INJURY_ATTACHMENT_CONFIG.MAX_FILE_SIZE_BYTES, 20 * 1024 * 1024);
      assert.equal(INJURY_ATTACHMENT_CONFIG.MAX_FILE_SIZE_MB, 20);
    });

    it("термін дії підписаного посилання становить 5 хвилин (300 секунд)", () => {
      assert.equal(INJURY_ATTACHMENT_CONFIG.SIGNED_URL_TTL_SECONDS, 300);
    });

    it("дозволені MIME-типи включають лише PDF, JPG та PNG", () => {
      const allowed = INJURY_ATTACHMENT_CONFIG.ALLOWED_MIME_TYPES;
      assert.ok(allowed.includes("application/pdf"));
      assert.ok(allowed.includes("image/jpeg"));
      assert.ok(allowed.includes("image/png"));
      assert.equal(allowed.length, 3);
    });

    it("наявні українські мітки для всіх типів клінічних досліджень", () => {
      const types: AttachmentType[] = ["mri", "ultrasound", "xray", "conclusion", "other"];
      types.forEach((type) => {
        assert.ok(ATTACHMENT_TYPE_LABELS[type]);
        assert.ok(ATTACHMENT_TYPE_LABELS[type].label.length > 0);
        assert.ok(ATTACHMENT_TYPE_LABELS[type].shortLabel.length > 0);
        assert.ok(ATTACHMENT_TYPE_LABELS[type].icon.length > 0);
      });
    });
  });

  describe("2. Валідація завантажуваних файлів (validateAttachmentFile)", () => {
    it("успішно валідує валідний PDF файл розміром до 20 МБ", () => {
      const validPdf = {
        name: "mri_knee_protocol.pdf",
        size: 5 * 1024 * 1024, // 5 MB
        type: "application/pdf",
      };
      const res = validateAttachmentFile(validPdf);
      assert.equal(res.valid, true);
      assert.equal(res.error, undefined);
    });

    it("успішно валідує валідний JPG/PNG знімок", () => {
      const validJpg = {
        name: "ultrasound_hamstring.jpg",
        size: 2 * 1024 * 1024,
        type: "image/jpeg",
      };
      const validPng = {
        name: "xray_ankle.png",
        size: 18 * 1024 * 1024,
        type: "image/png",
      };
      assert.equal(validateAttachmentFile(validJpg).valid, true);
      assert.equal(validateAttachmentFile(validPng).valid, true);
    });

    it("відхиляє порожній файл (0 байт)", () => {
      const emptyFile = {
        name: "empty.pdf",
        size: 0,
        type: "application/pdf",
      };
      const res = validateAttachmentFile(emptyFile);
      assert.equal(res.valid, false);
      assert.match(res.error || "", /порожній/);
    });

    it("відхиляє файл, більший за ліміт 20 МБ", () => {
      const tooBigFile = {
        name: "huge_scan.pdf",
        size: 20 * 1024 * 1024 + 1, // 20 MB + 1 байт
        type: "application/pdf",
      };
      const res = validateAttachmentFile(tooBigFile);
      assert.equal(res.valid, false);
      assert.match(res.error || "", /перевищує ліміт 20 МБ/);
    });

    it("відхиляє заборонені формати (exe, zip, mp4, docx)", () => {
      const forbiddenFiles = [
        { name: "virus.exe", size: 1024, type: "application/x-msdownload" },
        { name: "archive.zip", size: 1024, type: "application/zip" },
        { name: "video.mp4", size: 1024, type: "video/mp4" },
        { name: "report.docx", size: 1024, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ];

      forbiddenFiles.forEach((file) => {
        const res = validateAttachmentFile(file);
        assert.equal(res.valid, false);
        assert.match(res.error || "", /Дозволені лише формати PDF, JPG та PNG/);
      });
    });

    it("відхиляє файл з невідповідністю MIME-типу та розширення (фальшивий pdf)", () => {
      const fakePdf = {
        name: "malicious.exe.pdf",
        size: 1024,
        type: "application/x-msdownload", // MIME не дозволений
      };
      const res = validateAttachmentFile(fakePdf);
      assert.equal(res.valid, false);
    });
  });

  describe("3. Формування шляхів та очищення назв (Security & Path Traversal)", () => {
    it("очищає назву файлу від шляхів path traversal (../ або ..\\)", () => {
      const dirty = "../../../etc/passwd.pdf";
      const clean = sanitizeFileName(dirty);
      assert.equal(clean.includes("/"), false);
      assert.equal(clean.includes("\\"), false);
      assert.equal(clean.includes(".."), false);
      assert.equal(clean, "passwd.pdf");
    });

    it("підтримує українські літери у назві файлу", () => {
      const uaName = "Висновок_МРТ_коліна_2026.pdf";
      const clean = sanitizeFileName(uaName);
      assert.equal(clean, "Висновок_МРТ_коліна_2026.pdf");
    });

    it("формує шлях у форматі club_id/player_id/injury_id/file_id_name", () => {
      const path = buildInjuryAttachmentStoragePath(
        "club-001",
        "player-042",
        "injury-777",
        "file-uuid-123",
        "mri_scan.pdf"
      );
      assert.equal(path, "club-001/player-042/injury-777/file-uuid-123_mri_scan.pdf");
    });

    it("викидає помилку, якщо пропущено обов'язковий ідентифікатор шляху", () => {
      assert.throws(
        () => buildInjuryAttachmentStoragePath("", "p1", "inj1", "f1", "test.pdf"),
        /обов'язковими/
      );
    });

    it("успішно парсить валідний шлях сховища", () => {
      const path = "c-123/p-456/inj-789/uuid-999_my_protocol.pdf";
      const parsed = parseInjuryAttachmentPath(path);
      assert.deepEqual(parsed, {
        clubId: "c-123",
        playerId: "p-456",
        injuryId: "inj-789",
        fileId: "uuid-999",
        fileName: "my_protocol.pdf",
      });
    });

    it("повертає null для невалідного або пошкодженого шляху", () => {
      assert.equal(parseInjuryAttachmentPath("invalid/path"), null);
      assert.equal(parseInjuryAttachmentPath(""), null);
    });
  });

  describe("4. Розмежування прав доступу (Doctor vs Coach vs Player)", () => {
    it("надає доступ лікарю (doctor) та адміністратору (admin)", () => {
      assert.equal(canAccessInjuryAttachments("doctor"), true);
      assert.equal(canAccessInjuryAttachments("admin"), true);
    });

    it("забороняє доступ тренеру (coach), гравцю (player) та гостю", () => {
      assert.equal(canAccessInjuryAttachments("coach"), false);
      assert.equal(canAccessInjuryAttachments("player"), false);
      assert.equal(canAccessInjuryAttachments("viewer"), false);
      assert.equal(canAccessInjuryAttachments(null), false);
      assert.equal(canAccessInjuryAttachments(undefined), false);
    });
  });

  describe("5. Форматування та аудит метаданих", () => {
    it("форматує розмір файлу у зрозумілі одиниці", () => {
      assert.equal(formatFileSize(500), "500 Б");
      assert.equal(formatFileSize(1500), "1.5 КБ");
      assert.equal(formatFileSize(4.5 * 1024 * 1024), "4.5 МБ");
    });

    it("формує метадані для audit_log без витоку конфіденційних діагнозів", () => {
      const meta = buildAttachmentAuditMeta({
        fileId: "att-1",
        fileName: "mri.pdf",
        fileType: "mri",
        fileSizeBytes: 2048,
        examinationDate: "2026-10-23",
        actionReason: "Плановий огляд",
      });

      assert.equal(meta.file_id, "att-1");
      assert.equal(meta.file_name, "mri.pdf");
      assert.equal(meta.file_type, "mri");
      assert.equal(meta.file_size_bytes, 2048);
      assert.equal(meta.examination_date, "2026-10-23");
      assert.equal(meta.reason, "Плановий огляд");

      // Переконуємось, що немає випадкових заборонених полів
      assert.equal("diagnosis" in meta, false);
      assert.equal("treatment" in meta, false);
    });
  });
});
