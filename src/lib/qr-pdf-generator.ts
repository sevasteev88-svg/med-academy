import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import type { GeneratedQrCard } from "@/types/player-device";

export const INSTRUCTIONS_STEPS_UA = [
  "1. Відскануйте QR камерою смартфона",
  "2. Підтвердіть активацію пристрою",
  "3. Щоранку заповнюйте велнес за 1 хв",
] as const;

export const CARD_TERMS_UA = "Одноразовий доступ · Дійсний 14 днів";
export const CLUB_BRAND_UA = "ФК «ЧОРНОМОРЕЦЬ» · АКАДЕМІЯ";

/**
 * Перевірка відсутності медичних даних, дат народження та діагнозів
 * у структурі картки (вимога 2 & безпека).
 */
export function sanitizeCardData(card: Partial<GeneratedQrCard> & Record<string, any>): {
  valid: boolean;
  leakedFields: string[];
} {
  const forbiddenKeys = [
    "date_of_birth",
    "dob",
    "birth_date",
    "diagnosis",
    "injury",
    "injury_type",
    "treatment",
    "vas_score",
    "notes",
    "medical_history",
  ];

  const leakedFields: string[] = [];
  for (const key of forbiddenKeys) {
    if (card[key] !== undefined && card[key] !== null) {
      leakedFields.push(key);
    }
  }

  return {
    valid: leakedFields.length === 0,
    leakedFields,
  };
}

/**
 * Генерує base64 DataURL для QR-коду посилання активації
 */
export async function createQrDataUrl(url: string): Promise<string> {
  const fullUrl = url.startsWith("http") ? url : `${typeof window !== "undefined" ? window.location.origin : "https://med.fc-chornomorets.com"}${url}`;
  return QRCode.toDataURL(fullUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
    color: {
      dark: "#020617", // slate-950
      light: "#ffffff",
    },
  });
}

/**
 * Малює окрему візитку на HTMLCanvasElement для 100% підтримки
 * української кирилиці та чітких шрифтів у PDF без залежності від системних TTF файлів.
 */
export async function renderCardToCanvas(
  card: GeneratedQrCard,
  qrDataUrl: string
): Promise<HTMLCanvasElement> {
  const width = 800;
  const height = 560;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 1. Фон картки
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Зовнішня тонка рамка візитки
  ctx.strokeStyle = "#cbd5e1"; // slate-300
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // 2. Верхня смуга (Header)
  ctx.fillStyle = "#0f172a"; // slate-900
  ctx.fillRect(0, 0, width, 84);

  // Клубний акцент (лінія знизу смуги)
  ctx.fillStyle = "#0284c7"; // sky-600
  ctx.fillRect(0, 80, width, 4);

  // Текст у шапці: Клуб та Команда
  ctx.fillStyle = "#38bdf8"; // sky-400
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(CLUB_BRAND_UA, 24, 38);

  ctx.fillStyle = "#e2e8f0"; // slate-200
  ctx.font = "600 18px sans-serif";
  const teamText = card.teamName ? card.teamName.toUpperCase() : "КОМАНДА";
  ctx.fillText(teamText, 24, 66);

  // 3. Прізвище та Ім'я гравця (головний акцент)
  ctx.fillStyle = "#090d16";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(card.fullName, 24, 134);

  // Тонка розділова лінія під ім'ям
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(24, 150);
  ctx.lineTo(width - 24, 150);
  ctx.stroke();

  // 4. Отрисовка QR-коду (ліворуч)
  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = reject;
    qrImg.src = qrDataUrl;
  });

  const qrSize = 250;
  const qrX = 24;
  const qrY = 175;

  // Біла плашка з рамкою під QR
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);

  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // 5. Інструкція праворуч від QR-коду
  const textX = 305;
  let textY = 195;

  ctx.fillStyle = "#0369a1"; // sky-700
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("ШВИДКИЙ ВХІД ДО КАБІНЕТУ:", textX, textY);

  textY += 34;
  ctx.fillStyle = "#1e293b"; // slate-800
  ctx.font = "500 19px sans-serif";

  for (const step of INSTRUCTIONS_STEPS_UA) {
    ctx.fillText(step, textX, textY);
    textY += 32;
  }

  // 6. Блок безпеки та строк дії
  textY += 12;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(textX - 8, textY - 8, width - textX - 16, 68);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(textX - 8, textY - 8, width - textX - 16, 68);

  ctx.fillStyle = "#b45309"; // amber-700
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("🔒 " + CARD_TERMS_UA, textX + 6, textY + 20);

  ctx.fillStyle = "#64748b"; // slate-500
  ctx.font = "14px sans-serif";
  ctx.fillText("Персональна картка гравця · Не передавати третім особам", textX + 6, textY + 44);

  // 7. Нижній колонтитул
  ctx.fillStyle = "#94a3b8";
  ctx.font = "13px sans-serif";
  ctx.fillText("Медичний штаб та тренерський портал · Спортивна медицина", 24, height - 20);

  return canvas;
}

/**
 * Генерує A4 PDF на клієнті «на лету» (НЕ зберігається на сервері).
 * Формат листа: A4 portrait (210 x 297 мм).
 * 8 карток на лист: 2 колонки × 4 ряди.
 */
export async function generateTeamCardsPdfBlob(
  cards: GeneratedQrCard[],
  teamName: string
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 8;
  const marginY = 8;
  const colGap = 6;
  const rowGap = 5;

  const cardWidth = 94; // 2 * 94 + 6 + 16 = 210mm
  const cardHeight = 66; // 4 * 66 + 3*5 + 16 = 295mm

  let cardIndex = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    // Нова сторінка для кожних 8 карток (крім першої)
    if (i > 0 && i % 8 === 0) {
      doc.addPage();
    }

    const posOnPage = i % 8;
    const col = posOnPage % 2; // 0 або 1
    const row = Math.floor(posOnPage / 2); // 0, 1, 2, 3

    const x = marginX + col * (cardWidth + colGap);
    const y = marginY + row * (cardHeight + rowGap);

    // Генеруємо QR DataURL
    const qrDataUrl = card.qrDataUrl || (await createQrDataUrl(card.activationUrl));
    card.qrDataUrl = qrDataUrl;

    // Малюємо картку на canvas
    const canvas = await renderCardToCanvas(card, qrDataUrl);
    const cardDataUrl = canvas.toDataURL("image/png");

    // Додаємо картку у PDF
    doc.addImage(cardDataUrl, "PNG", x, y, cardWidth, cardHeight, undefined, "FAST");

    // Пунктирні лінії відрізу (Scissor cut lines)
    doc.setDrawColor(180, 190, 205);
    doc.setLineDashPattern([2, 2], 0);
    doc.setLineWidth(0.2);

    // Горизонтальна лінія між картками
    if (row < 3 && col === 0) {
      doc.line(marginX, y + cardHeight + rowGap / 2, pageWidth - marginX, y + cardHeight + rowGap / 2);
    }
    // Вертикальна лінія між колонками
    if (col === 0 && row === 0) {
      doc.line(marginX + cardWidth + colGap / 2, marginY, marginX + cardWidth + colGap / 2, pageHeight - marginY);
    }

    // Скидаємо пунктир
    doc.setLineDashPattern([], 0);
  }

  return doc.output("blob");
}

/**
 * Генерує PDF для одного гравця (заміна втраченої картки)
 */
export async function generateSingleCardPdfBlob(card: GeneratedQrCard): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const cardWidth = 110;
  const cardHeight = 77;
  const x = (210 - cardWidth) / 2;
  const y = 40;

  const qrDataUrl = card.qrDataUrl || (await createQrDataUrl(card.activationUrl));
  const canvas = await renderCardToCanvas(card, qrDataUrl);
  const cardDataUrl = canvas.toDataURL("image/png");

  // Заголовок сторінки
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text("ФК ЧОРНОМОРЕЦЬ · ПЕРСОНАЛЬНА QR-КАРТКА ГРАВЦЯ", 105, 25, { align: "center" });

  doc.addImage(cardDataUrl, "PNG", x, y, cardWidth, cardHeight);

  // Пунктирна рамка для вирізання
  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([3, 3], 0);
  doc.setLineWidth(0.3);
  doc.rect(x - 2, y - 2, cardWidth + 4, cardHeight + 4);
  doc.setLineDashPattern([], 0);

  // Підказка
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Роздрукуйте або надішліть гравцю для сканування з екрана", 105, y + cardHeight + 15, { align: "center" });

  return doc.output("blob");
}

/**
 * Завантажує створений Blob як файл у браузері користувача
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
