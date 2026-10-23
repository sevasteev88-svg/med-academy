/**
 * export-exposures-csv.ts
 *
 * Експорт таблиці експозицій у CSV з підтримкою UTF-8 BOM для Microsoft Excel.
 */

export interface ExposureExportRow {
  date: string;
  teamName: string;
  type: string;
  minutes: number;
  playersCount: number;
  exposureHours: number;
  notes?: string | null;
}

export function generateExposuresCsv(rows: ExposureExportRow[]): string {
  const headers = [
    "Дата",
    "Команда",
    "Тип сесії",
    "Тривалість (хв)",
    "Кількість гравців",
    "Людино-години",
    "Примітки",
  ];

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str == null) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const csvLines = [
    headers.map(escapeCsv).join(";"),
    ...rows.map((row) =>
      [
        escapeCsv(row.date),
        escapeCsv(row.teamName),
        escapeCsv(row.type === "match" ? "Матч" : "Тренування"),
        escapeCsv(row.minutes),
        escapeCsv(row.playersCount),
        escapeCsv(row.exposureHours.toFixed(2)),
        escapeCsv(row.notes ?? ""),
      ].join(";")
    ),
  ];

  // Додаємо UTF-8 BOM (\uFEFF)
  return "\uFEFF" + csvLines.join("\r\n");
}

export function downloadExposuresCsv(
  rows: ExposureExportRow[],
  filename: string = `exposures_${new Date().toISOString().split("T")[0]}.csv`
) {
  const csvContent = generateExposuresCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
