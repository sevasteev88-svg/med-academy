/**
 * ehr-transfer.ts — Логіка валідації, генерації JSON/PDF та Dry-Run імпорту медичної карти
 */

import crypto from "node:crypto";
import { jsPDF } from "jspdf";
import {
  EHR_SECTIONS,
  EHR_SECTION_LABELS,
  TRANSFER_PURPOSE_LABELS,
  type EhrExportConsent,
  type EhrExportOptions,
  type EhrSection,
  type EhrTransferPayload,
  type EhrImportValidationReport,
} from "../types/ehr-transfer.ts";

/**
 * Валідація згоди гравця на експорт медичної картки (Consent Gate).
 * Без згоди або реквізитів приймаючого клубу експорт суворо заборонено.
 */
export function validateEhrExportConsent(consent?: EhrExportConsent | null): {
  valid: boolean;
  error?: string;
} {
  if (!consent) {
    return { valid: false, error: "Згода на передачу медичних даних не надана" };
  }

  if (!consent.consent_confirmed) {
    return {
      valid: false,
      error: "Обов'язкове підтвердження наявності згоди суб'єкта даних (гравця або законних представників)",
    };
  }

  if (!consent.recipient_club || consent.recipient_club.trim().length === 0) {
    return {
      valid: false,
      error: "Необхідно вказати назву приймаючого клубу, медичного центру або організації",
    };
  }

  if (!consent.doctor_confirmation_name || consent.doctor_confirmation_name.trim().length === 0) {
    return {
      valid: false,
      error: "Необхідно зазначити ПІБ лікаря, який засвідчує сформовану виписку",
    };
  }

  if (!consent.purpose) {
    return { valid: false, error: "Оберіть мету передачі медичної карти" };
  }

  return { valid: true };
}

/**
 * Обчислення контрольного хешу цілісності SHA-256 від даних медичної карти
 */
export function computeEhrPayloadHash(data: EhrTransferPayload["data"]): string {
  const serialized = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

/**
 * Побудова стандартизованого об'єкта перенесення картки (EHR Transfer Package)
 */
export function buildEhrExportPayload(params: {
  clubOrigin: { id: string; name: string };
  doctor: { id: string; name: string };
  player: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    position: string;
    dominant_side?: string;
  };
  consent: EhrExportConsent;
  sectionsIncluded: EhrSection[];
  data: EhrTransferPayload["data"];
}): EhrTransferPayload {
  const consentValidation = validateEhrExportConsent(params.consent);
  if (!consentValidation.valid) {
    throw new Error(consentValidation.error || "Невалідна згода на експорт");
  }

  const exportId = `ehr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const exportTimestamp = new Date().toISOString();

  const contentHash = computeEhrPayloadHash(params.data);

  return {
    schema_version: "1.0.0",
    export_id: exportId,
    export_timestamp: exportTimestamp,
    club_origin: params.clubOrigin,
    exporting_doctor: params.doctor,
    consent_record: params.consent,
    player: params.player,
    sections_included: params.sectionsIncluded,
    data: params.data,
    content_sha256: contentHash,
  };
}

/**
 * Безпечна Dry-Run валідація JSON-файлу перенесення медкарти перед імпортом
 */
export function validateEhrImportPayload(
  rawInput: unknown,
  existingPlayers: Array<{ id: string; first_name: string; last_name: string; date_of_birth: string }> = []
): EhrImportValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawInput || typeof rawInput !== "object") {
    return {
      valid: false,
      schema_version: "unknown",
      origin_club_name: "Невідомо",
      exported_at: "Невідомо",
      player_preview: { first_name: "", last_name: "", date_of_birth: "", position: "" },
      matching_player: { found: false },
      counts: { anthropometry: 0, injuries: 0, examinations: 0, screenings: 0, prescriptions: 0, lsi: 0, total_records: 0 },
      errors: ["Файл не містить валідного JSON-об'єкта медичної карти"],
      warnings: [],
    };
  }

  const payload = rawInput as Partial<EhrTransferPayload>;

  // 1. Перевірка версії схеми
  if (payload.schema_version !== "1.0.0") {
    errors.push(`Непідтримувана версія схеми: '${payload.schema_version || "відсутня"}'. Очікується '1.0.0'`);
  }

  // 2. Перевірка даних гравця
  if (!payload.player || typeof payload.player !== "object") {
    errors.push("У файлі відсутній розділ демографічних даних гравця (player)");
  }

  const p = payload.player || ({} as any);
  if (!p.first_name || !p.last_name) {
    errors.push("Прізвище та ім'я гравця у файлі не можуть бути порожніми");
  }

  if (!p.date_of_birth || !/^\d{4}-\d{2}-\d{2}$/.test(p.date_of_birth)) {
    errors.push(`Невалідний формат дати народження гравця: '${p.date_of_birth}'. Очікується РРРР-ММ-ДД`);
  }

  // 3. Перевірка клубу-відправника та дати
  const originClubName = payload.club_origin?.name || "Невідомий клуб";
  const exportedAt = payload.export_timestamp || "Невідома дата";

  // 4. Підрахунок записів та перевірка цілісності даних
  const data = payload.data || {};
  const anthroList = Array.isArray(data.anthropometry) ? data.anthropometry : [];
  const injuriesList = Array.isArray(data.injuries) ? data.injuries : [];
  const examsList = Array.isArray(data.examinations) ? data.examinations : [];
  const screeningsList = Array.isArray(data.screenings) ? data.screenings : [];
  const prescriptionsList = Array.isArray(data.prescriptions) ? data.prescriptions : [];
  const lsiList = Array.isArray(data.lsi) ? data.lsi : [];

  const counts = {
    anthropometry: anthroList.length,
    injuries: injuriesList.length,
    examinations: examsList.length,
    screenings: screeningsList.length,
    prescriptions: prescriptionsList.length,
    lsi: lsiList.length,
    total_records:
      anthroList.length +
      injuriesList.length +
      examsList.length +
      screeningsList.length +
      prescriptionsList.length +
      lsiList.length,
  };

  if (counts.total_records === 0) {
    warnings.push("Файл не містить жодного клінічного запису для імпорту");
  }

  // 5. Перевірка цілісності хешу
  if (payload.content_sha256) {
    const computedHash = computeEhrPayloadHash(data as any);
    if (computedHash !== payload.content_sha256) {
      warnings.push("Попередження: контрольний хеш цілісності файлу не збігається. Файл міг бути відредагований вручну");
    }
  } else {
    warnings.push("Контрольний хеш цілісності відсутній у пакеті");
  }

  // 6. Пошук збігу гравця в приймаючому клубі
  let matchingPlayer = { found: false, existing_player_id: undefined as string | undefined, existing_player_name: undefined as string | undefined };
  if (p.last_name && p.date_of_birth) {
    const match = existingPlayers.find(
      (ep) =>
        ep.last_name.toLowerCase().trim() === p.last_name.toLowerCase().trim() &&
        ep.date_of_birth === p.date_of_birth
    );
    if (match) {
      matchingPlayer = {
        found: true,
        existing_player_id: match.id,
        existing_player_name: `${match.last_name} ${match.first_name}`,
      };
      warnings.push(
        `Знайдено існуючого гравця в клубі: ${match.last_name} ${match.first_name} (${match.date_of_birth}). Дані буде об'єднано з його карткою`
      );
    }
  }

  return {
    valid: errors.length === 0,
    schema_version: payload.schema_version || "unknown",
    origin_club_name: originClubName,
    exported_at: exportedAt,
    player_preview: {
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      date_of_birth: p.date_of_birth || "",
      position: p.position || "НП",
    },
    matching_player: matchingPlayer,
    counts,
    errors,
    warnings,
  };
}

/**
 * Генерація офіційного витягу медичної картки у PDF з водяним знаком «Конфіденційно»
 */
export function generateEhrTransferPdfBase64(payload: EhrTransferPayload): string {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let currentY = 20;

  // Допоміжна функція малювання водяного знаку на сторінці
  const addWatermark = () => {
    doc.saveGraphicsState();
    doc.setTextColor(200, 200, 200);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    // Діагональний водяний знак
    doc.text("CONFIDENTIAL / MEDICAL", pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 45,
    });
    doc.restoreGraphicsState();
  };

  addWatermark();

  // 1. Шапка документа
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("OFFICIAL MEDICAL TRANSFER SUMMARY", margin, currentY);
  currentY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Origin Club: ${payload.club_origin.name}  |  Export ID: ${payload.export_id}`, margin, currentY);
  currentY += 4;
  doc.text(`Date of Export: ${payload.export_timestamp.split("T")[0]}  |  Doctor: ${payload.exporting_doctor.name}`, margin, currentY);
  currentY += 8;

  // Лінія розділювача
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 6;

  // 2. Демографічні дані гравця
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`PLAYER: ${payload.player.last_name.toUpperCase()} ${payload.player.first_name.toUpperCase()}`, margin, currentY);
  currentY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date of Birth: ${payload.player.date_of_birth}  |  Position: ${payload.player.position}  |  Side: ${payload.player.dominant_side || "Right"}`, margin, currentY);
  currentY += 4;
  doc.text(`Transfer Purpose: ${TRANSFER_PURPOSE_LABELS[payload.consent_record.purpose] || payload.consent_record.purpose}`, margin, currentY);
  currentY += 4;
  doc.text(`Recipient Organization: ${payload.consent_record.recipient_club}`, margin, currentY);
  currentY += 8;

  // 3. Розділи клінічних даних
  const checkPageBreak = (neededMm: number) => {
    if (currentY + neededMm > pageHeight - 20) {
      doc.addPage();
      addWatermark();
      currentY = 20;
    }
  };

  // РОЗДІЛ: Травми
  if (payload.data.injuries && payload.data.injuries.length > 0) {
    checkPageBreak(25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199); // sky-600
    doc.text(`1. INJURY & SURGERY HISTORY (${payload.data.injuries.length})`, margin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);

    payload.data.injuries.forEach((inj, idx) => {
      checkPageBreak(12);
      const days = inj.actual_return_date
        ? `${inj.date_of_injury} - ${inj.actual_return_date}`
        : `${inj.date_of_injury} (Ongoing)`;
      doc.text(
        `${idx + 1}. [${inj.severity.toUpperCase()}] ${inj.injury_type} (${inj.location}, ${inj.side}) — Dates: ${days} — Status: ${inj.status}`,
        margin + 2,
        currentY
      );
      currentY += 4;
      if (inj.description) {
        doc.setTextColor(100, 116, 139);
        doc.text(`   Notes: ${inj.description.slice(0, 90)}`, margin + 2, currentY);
        doc.setTextColor(15, 23, 42);
        currentY += 4;
      }
    });
    currentY += 4;
  }

  // РОЗДІЛ: Скринінги
  if (payload.data.screenings && payload.data.screenings.length > 0) {
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text(`2. PRE-SEASON MEDICAL SCREENINGS (${payload.data.screenings.length})`, margin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payload.data.screenings.forEach((sc, idx) => {
      checkPageBreak(10);
      doc.text(
        `${idx + 1}. Season: ${sc.season} | Date: ${sc.date} | Status: ${sc.overall_status.toUpperCase()} | Cardio Clearance: ${sc.cardio_clearance ? "YES" : "NO"} | Valid Until: ${sc.valid_until}`,
        margin + 2,
        currentY
      );
      currentY += 4;
    });
    currentY += 4;
  }

  // РОЗДІЛ: LSI тести
  if (payload.data.lsi && payload.data.lsi.length > 0) {
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text(`3. LIMB SYMMETRY INDEX (LSI) & DYNAMOMETRY (${payload.data.lsi.length})`, margin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payload.data.lsi.forEach((item, idx) => {
      checkPageBreak(10);
      doc.text(
        `${idx + 1}. Date: ${item.date} | Metric: ${item.metric_name} | Involved: ${item.involved_value} | Uninvolved: ${item.uninvolved_value} | LSI: ${item.lsi_percentage}% (${item.status})`,
        margin + 2,
        currentY
      );
      currentY += 4;
    });
    currentY += 4;
  }

  // РОЗДІЛ: Антропометрія
  if (payload.data.anthropometry && payload.data.anthropometry.length > 0) {
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text(`4. ANTHROPOMETRY DYNAMICS (${payload.data.anthropometry.length})`, margin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payload.data.anthropometry.slice(0, 10).forEach((a, idx) => {
      checkPageBreak(8);
      doc.text(
        `${idx + 1}. Date: ${a.date} | Height: ${a.height ? `${a.height} cm` : "—"} | Weight: ${a.weight ? `${a.weight} kg` : "—"} | Fat: ${a.fat_percentage ? `${a.fat_percentage}%` : "—"}`,
        margin + 2,
        currentY
      );
      currentY += 4;
    });
    currentY += 4;
  }

  // РОЗДІЛ: Призначення
  if (payload.data.prescriptions && payload.data.prescriptions.length > 0) {
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text(`5. MEDICATIONS & WADA COMPLIANCE (${payload.data.prescriptions.length})`, margin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    payload.data.prescriptions.forEach((pr, idx) => {
      checkPageBreak(10);
      doc.text(
        `${idx + 1}. Date: ${pr.date} | Medication: ${pr.medication_name} | Dosage: ${pr.dosage} | WADA Prohibited: ${pr.is_wada_prohibited ? "YES (Check TUE)" : "NO"} | Doctor: ${pr.prescribed_by}`,
        margin + 2,
        currentY
      );
      currentY += 4;
    });
    currentY += 4;
  }

  // 4. Підвал на всіх сторінках
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // slate-400

    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.text(
      `MedAcademy EHR Transfer v1.0.0  |  Integrity Hash: ${payload.content_sha256.slice(0, 24)}...  |  Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 8
    );
    doc.text(
      "CONFIDENTIAL MEDICAL DATA: Protected by GDPR Art. 9 & national medical secrecy acts.",
      pageWidth - margin,
      pageHeight - 8,
      { align: "right" }
    );
  }

  // Повертаємо Base64 рядок PDF документа
  return doc.output("datauristring").split(",")[1];
}
