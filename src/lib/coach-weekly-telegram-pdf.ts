import { jsPDF } from "jspdf";
import type { CoachWeeklyTelegramSummary } from "../types/telegram.ts";

/**
 * Генерує офіційний PDF-звіт для тренерського штабу за тиждень (п. 8.7.3).
 *
 * Вимоги безпеки:
 * 1. Жодних персональних прізвищ у переліку ризиків.
 * 2. Тільки агреговані показники та лічильники прапорців.
 * 3. Посилання на захищений веб-кабінет для перегляду деталей.
 */
export function generateCoachWeeklyReportPdf(summary: CoachWeeklyTelegramSummary): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Темно-синій заголовок
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 32, "F");

  // Лого / Бренд
  doc.setTextColor(56, 189, 248); // sky-400
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("FC CHORNOMORETS · MEDICAL & FITNESS STAFF", 15, 12);

  // Назва звіту
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("WEEKLY SQUAD READINESS REPORT", 15, 22);

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Team: ${summary.teamName} | Period: ${summary.weekStart} - ${summary.weekEnd}`, 15, 28);

  let y = 42;

  // 1. Блок комплаєнсу (Дисципліна заповнення)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(15, y, pageWidth - 30, 28, 3, 3, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(15, y, pageWidth - 30, 28, 3, 3, "S");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. Team Survey Compliance (7 Days)", 20, y + 8);

  doc.setFontSize(18);
  doc.setTextColor(2, 132, 199); // sky-600
  doc.text(`${summary.compliancePct}%`, 20, y + 20);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Completed ${summary.completedSurveysCount} out of ${summary.totalSurveysExpected} expected surveys`, 55, y + 17);
  doc.text(
    summary.compliancePct >= 80 ? "Status: High discipline" : "Status: Low response rate - follow-up required",
    55,
    y + 22
  );

  y += 36;

  // 2. Блок світлофора прапорців (Тільки лічильники, без імен)
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, pageWidth - 30, 36, 3, 3, "F");
  doc.roundedRect(15, y, pageWidth - 30, 36, 3, 3, "S");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("2. Weekly Risk Flags (Counters Only)", 20, y + 8);

  // Жовтий бейдж
  doc.setFillColor(254, 240, 138); // yellow-200
  doc.roundedRect(20, y + 13, 75, 16, 2, 2, "F");
  doc.setTextColor(133, 77, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`YELLOW FLAGS: ${summary.yellowFlagsCount}`, 25, y + 23);

  // Червоний бейдж
  doc.setFillColor(254, 202, 202); // red-200
  doc.roundedRect(105, y + 13, 75, 16, 2, 2, "F");
  doc.setTextColor(153, 27, 27);
  doc.text(`RED FLAGS: ${summary.redFlagsCount}`, 110, y + 23);

  y += 44;

  // 3. Блок навантаження та втоми
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, pageWidth - 30, 32, 3, 3, "F");
  doc.roundedRect(15, y, pageWidth - 30, 32, 3, 3, "S");

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("3. Team Load & Fatigue Index", 20, y + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Load State: ${summary.overallWorkloadDescription}`, 20, y + 16);
  doc.text(`Average Fatigue / Freshness: ${summary.averageFatigueScore.toFixed(1)} / 5.0`, 20, y + 22);
  doc.text(`Average Muscle Soreness: ${summary.averageSorenessScore.toFixed(1)} / 5.0`, 20, y + 28);

  y += 40;

  // 4. Захищений блок «Потребують уваги»
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(15, y, pageWidth - 30, 36, 3, 3, "F");
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(15, y, pageWidth - 30, 36, 3, 3, "S");

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("4. Attention List & Player Privacy Notice", 20, y + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Active attention needed: ${summary.requiresAttentionCount} player(s).`, 20, y + 16);
  doc.text(
    "To comply with medical privacy (GDPR / Medical Confidentiality), names and symptoms",
    20,
    y + 22
  );
  doc.text(
    "are never transmitted via public messengers or exported PDFs. View real-time details in app:",
    20,
    y + 27
  );

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(2, 132, 199);
  doc.text(summary.appReadinessUrl, 20, y + 32);

  // Футер
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(
    `FC Chornomorets Medical & Performance · Generated at ${new Date().toISOString()}`,
    15,
    doc.internal.pageSize.getHeight() - 10
  );

  return doc;
}
