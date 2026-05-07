/**
 * rtp-calculator.ts
 *
 * Логіка прогнозу повернення в стрій (Return to Play).
 *
 * Джерела:
 *  - Munich Consensus (Müller-Wohlfahrt et al.)
 *  - BAMIC (British Athletics Muscle Injury Classification)
 *  - Hollabaugh et al., 2024 (систематичний огляд)
 *
 * Ключовий принцип:
 *  Прогноз без урахування локалізації (букв a/b/c) — некоректний.
 *  Саме зв'язка «Ступінь × Місце» дає статистично значуще
 *  передбачення дати виходу на поле.
 *
 * Архітектурне правило:
 *  Цей файл — чиста бізнес-логіка, без імпортів Next.js/Supabase.
 *  Можна тестувати ізольовано.
 */

import type {
  BamicGrade,
  BamicLocation,
  MunichGrade,
  RtpPrediction,
} from "@/types/database";

// ─── Таблиці RTP за Hollabaugh et al. ──────────────────────

/**
 * BAMIC RTP (дні): [ступінь][локалізація] → [min, max]
 *
 * Критична різниця T-junction (c):
 *   Grade 1–2 a/b : 16–25 днів  (м'язова тканина, добре кровопостачається)
 *   Grade 2c / 3c : 40–80 днів  (сухожилля заживає повільно)
 */
const BAMIC_RTP: Record<BamicGrade, Record<BamicLocation, [number, number]>> = {
  0: { a: [0, 7],   b: [0, 7],   c: [0, 7]   },
  1: { a: [7, 14],  b: [10, 18], c: [14, 28] },
  2: { a: [16, 25], b: [16, 25], c: [40, 60] }, // ← T-junction стрибок!
  3: { a: [21, 35], b: [28, 42], c: [50, 80] }, // ← T-junction стрибок!
  4: { a: [42, 90], b: [60, 120],c: [90, 180] },
};

/**
 * Munich Consensus RTP (дні): ступінь → [min, max]
 *
 * Типи 1/2 — функціональні, без розриву → короткий термін.
 * Типи 3/4 — структурні → тривала реабілітація.
 */
const MUNICH_RTP: Record<MunichGrade, [number, number]> = {
  "1A": [3, 7],    // Перевтома — відпочинок
  "1B": [7, 14],   // DOMS / мікроушкодження
  "2A": [7, 21],   // Спінальна нейром'язова
  "2B": [10, 21],  // Локальна нейром'язова
  "3A": [14, 28],  // Мікророзрив < 0.5 cm
  "3B": [21, 42],  // Частковий розрив ≥ 0.5 cm
  "4":  [60, 180], // Повний розрив / відрив
};

// ─── Перевірки T-junction ────────────────────────────────────

/** Чи є комбінація BAMIC небезпечною T-junction? */
export function isBamicTJunctionRisk(
  grade: BamicGrade,
  location: BamicLocation
): boolean {
  return location === "c" && grade >= 2;
}

/** Чи є Munich-ступінь структурною (є фізичний розрив)? */
export function isMunichStructural(grade: MunichGrade): boolean {
  return grade === "3A" || grade === "3B" || grade === "4";
}

// ─── Основні функції розрахунку ──────────────────────────────

/**
 * Розрахунок RTP за класифікацією BAMIC.
 *
 * @example
 * calculateBamicRtp(2, "c")
 * // → { min_days: 40, max_days: 60, is_t_junction_risk: true, ... }
 */
export function calculateBamicRtp(
  grade: BamicGrade,
  location: BamicLocation
): RtpPrediction {
  const [min, max] = BAMIC_RTP[grade][location];
  const tJunction = isBamicTJunctionRisk(grade, location);

  return {
    min_days: min,
    max_days: max,
    is_t_junction_risk: tJunction,
    confidence: grade <= 2 ? "high" : "medium",
    notes: tJunction
      ? `⚠️ T-junction (${grade}c): пошкодження інтрам'язового сухожилля. ` +
        `Термін реабілітації подвоєно порівняно з ${grade}b. ` +
        `Ризик рецидиву підвищений — обов'язковий МРТ-контроль.`
      : null,
  };
}

/**
 * Розрахунок RTP за класифікацією Munich Consensus.
 *
 * Примітка: Munich не враховує локалізацію → точність нижча.
 * Рекомендується комбінувати з BAMIC або УЗД-даними.
 */
export function calculateMunichRtp(grade: MunichGrade): RtpPrediction {
  const [min, max] = MUNICH_RTP[grade];
  const isStructural = isMunichStructural(grade);

  return {
    min_days: min,
    max_days: max,
    is_t_junction_risk: false, // Munich не розрізняє T-junction
    confidence: isStructural ? "medium" : "high",
    notes: isStructural
      ? `Структурне пошкодження (${grade}) — потрібен МРТ для уточнення локалізації. ` +
        `Розгляньте BAMIC-класифікацію для точнішого прогнозу RTP.`
      : null,
  };
}

/**
 * Комбінований розрахунок: якщо є обидві класифікації —
 * використовує BAMIC як основу (вища точність за Hollabaugh 2024),
 * Munich як контрольне підтвердження.
 */
export function calculateCombinedRtp(params: {
  munichGrade?: MunichGrade | null;
  bamicGrade?: BamicGrade | null;
  bamicLocation?: BamicLocation | null;
}): RtpPrediction | null {
  const { munichGrade, bamicGrade, bamicLocation } = params;

  // Якщо є повний BAMIC — пріоритет за ним
  if (bamicGrade !== null && bamicGrade !== undefined && bamicLocation) {
    return calculateBamicRtp(bamicGrade, bamicLocation);
  }

  // Якщо є Munich — використовуємо його
  if (munichGrade) {
    return calculateMunichRtp(munichGrade);
  }

  return null;
}

// ─── Допоміжні функції для UI ────────────────────────────────

/** Форматує діапазон RTP для відображення */
export function formatRtpRange(prediction: RtpPrediction): string {
  if (prediction.min_days === prediction.max_days) {
    return `${prediction.min_days} днів`;
  }
  return `${prediction.min_days}–${prediction.max_days} днів`;
}

/** Повертає колір-сигнал для UI на основі прогнозу */
export function getRtpSeverityVariant(
  prediction: RtpPrediction
): "ok" | "warn" | "danger" {
  if (prediction.is_t_junction_risk || prediction.max_days >= 60) {
    return "danger";
  }
  if (prediction.max_days >= 28) {
    return "warn";
  }
  return "ok";
}

/** Текстовий опис ступеня BAMIC для UI */
export const BAMIC_GRADE_LABELS: Record<BamicGrade, string> = {
  0: "0 — Без пошкодження",
  1: "1 — Міофасціальне",
  2: "2 — Внутрішньом'язове",
  3: "3 — Значний розрив",
  4: "4 — Повний розрив",
};

/** Текстовий опис локалізації BAMIC для UI */
export const BAMIC_LOCATION_LABELS: Record<BamicLocation, string> = {
  a: "a — Міофасціальне (краї м'яза)",
  b: "b — Внутрішньом'язове (брюшко)",
  c: "c — T-junction: інтрам'язове сухожилля ⚠️",
};

/** Текстовий опис ступеня Munich для UI */
export const MUNICH_GRADE_LABELS: Record<MunichGrade, string> = {
  "1A": "1A — Перевтома (functional)",
  "1B": "1B — Мікроушкодження DOMS (functional)",
  "2A": "2A — Спінальна нейром'язова (functional)",
  "2B": "2B — Локальна нейром'язова (functional)",
  "3A": "3A — Мікророзрив < 0.5 cm (structural)",
  "3B": "3B — Частковий розрив ≥ 0.5 cm (structural)",
  "4":  "4  — Повний розрив / відрив (structural)",
};
