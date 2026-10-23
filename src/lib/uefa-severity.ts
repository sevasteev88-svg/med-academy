/**
 * uefa-severity.ts
 *
 * Розрахунок тяжкості травм за стандартами та пороговими значеннями UEFA
 * (Fuller et al., 2006; Ekstrand et al., UEFA Elite Club Injury Study).
 *
 * Пороги time-loss (дні відсутності):
 * - 1–3 дні: мінімальна (minimal)
 * - 4–7 днів: легка (mild)
 * - 8–28 днів: середня (moderate)
 * - >28 днів (29+): тяжка (severe)
 */

export type UefaSeverity = "minimal" | "mild" | "moderate" | "severe";
export type InjuryOnset = "acute" | "gradual" | "unknown";
export type InjuryOccurrence = "new" | "recurrence" | "exacerbation" | "unknown";

export const UEFA_SEVERITY_THRESHOLDS = {
  minimal: { min: 1, max: 3, label: "Мінімальна (1–3 дні)" },
  mild: { min: 4, max: 7, label: "Легка (4–7 днів)" },
  moderate: { min: 8, max: 28, label: "Середня (8–28 днів)" },
  severe: { min: 29, max: Infinity, label: "Тяжка (>28 днів)" },
} as const;

export const UEFA_SEVERITY_UA: Record<UefaSeverity, string> = {
  minimal: "Мінімальна (1–3 дні)",
  mild: "Легка (4–7 днів)",
  moderate: "Середня (8–28 днів)",
  severe: "Тяжка (>28 днів)",
};

export const UEFA_SEVERITY_SHORT_UA: Record<UefaSeverity, string> = {
  minimal: "Мінімальна",
  mild: "Легка",
  moderate: "Середня",
  severe: "Тяжка",
};

export const ONSET_UA: Record<InjuryOnset, string> = {
  acute: "Гострий початок (Acute)",
  gradual: "Поступовий розвиток (Overuse/Gradual)",
  unknown: "Невідомо",
};

export const OCCURRENCE_UA: Record<InjuryOccurrence, string> = {
  new: "Нова травма (New injury)",
  recurrence: "Рецидив (Recurrence)",
  exacerbation: "Загострення (Exacerbation)",
  unknown: "Невідомо",
};

/**
 * Розрахунок днів від дати травми до фактичного повернення або до цільової дати (сьогодні для відкритих).
 */
export function calculateTimeLossDays(
  dateOfInjury: string | Date,
  actualReturnDate?: string | Date | null,
  referenceDate: Date = new Date()
): number {
  if (!dateOfInjury) return 0;
  const start = new Date(dateOfInjury);
  start.setHours(0, 0, 0, 0);

  const end = actualReturnDate ? new Date(actualReturnDate) : new Date(referenceDate);
  end.setHours(0, 0, 0, 0);

  const diffMs = end.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/**
 * Класифікація тяжкості за днями втрати тренувального/ігрового процесу.
 */
export function calculateUefaSeverity(days: number): UefaSeverity {
  if (days <= 3) return "minimal";
  if (days <= 7) return "mild";
  if (days <= 28) return "moderate";
  return "severe";
}

export interface InjuryUefaSeverityInfo {
  timeLossDays: number;
  actualSeverity: UefaSeverity;
  isProvisional: boolean;
  expectedDays: number | null;
  expectedSeverity: UefaSeverity | null;
  displaySeverity: UefaSeverity;
  label: string;
  badgeText: string;
  colorClass: string;
}

/**
 * Отримує повну інформацію про тяжкість травми:
 * Якщо відкрита — показує «попередня» за очікуваним строком або днями в лазареті.
 * Якщо закрита — точна фінальна тяжкість.
 */
export function getInjuryUefaSeverityInfo(params: {
  dateOfInjury: string;
  actualReturnDate?: string | null;
  expectedReturnDate?: string | null;
  status?: string;
  referenceDate?: Date;
}): InjuryUefaSeverityInfo {
  const { dateOfInjury, actualReturnDate, expectedReturnDate, status, referenceDate = new Date() } = params;

  const isClosed = status === "closed" || Boolean(actualReturnDate);
  const timeLossDays = calculateTimeLossDays(dateOfInjury, actualReturnDate, referenceDate);

  let expectedDays: number | null = null;
  let expectedSeverity: UefaSeverity | null = null;

  if (expectedReturnDate) {
    expectedDays = calculateTimeLossDays(dateOfInjury, expectedReturnDate, referenceDate);
    expectedSeverity = calculateUefaSeverity(expectedDays);
  }

  const isProvisional = !isClosed;
  let displaySeverity: UefaSeverity;

  if (!isClosed) {
    if (expectedDays !== null) {
      // Якщо дні у лазареті вже перевищили очікувані, беремо максимум
      const effectiveDays = Math.max(expectedDays, timeLossDays);
      displaySeverity = calculateUefaSeverity(effectiveDays);
    } else {
      displaySeverity = calculateUefaSeverity(timeLossDays);
    }
  } else {
    displaySeverity = calculateUefaSeverity(timeLossDays);
  }

  const colorMap: Record<UefaSeverity, string> = {
    minimal: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    mild: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    moderate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    severe: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  };

  const badgeText = isProvisional
    ? `Попередня (UEFA): ${UEFA_SEVERITY_SHORT_UA[displaySeverity]}`
    : `Тяжкість (UEFA): ${UEFA_SEVERITY_SHORT_UA[displaySeverity]}`;

  const label = isProvisional
    ? `Попередня (${UEFA_SEVERITY_SHORT_UA[displaySeverity]}, ${expectedDays ?? timeLossDays} дн.)`
    : `${UEFA_SEVERITY_SHORT_UA[displaySeverity]} (${timeLossDays} дн.)`;

  return {
    timeLossDays,
    actualSeverity: calculateUefaSeverity(timeLossDays),
    isProvisional,
    expectedDays,
    expectedSeverity,
    displaySeverity,
    label,
    badgeText,
    colorClass: colorMap[displaySeverity],
  };
}
