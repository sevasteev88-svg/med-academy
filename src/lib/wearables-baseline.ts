/**
 * wearables-baseline.ts
 * Розрахунок особистої норми гравця з носимих пристроїв за 28 днів (8.8).
 *
 * ПРАВИЛО:
 * 1. Показники різних пристроїв і методик (WHOOP rMSSD, Apple Watch SDNN тощо)
 *    НЕ порівнюються між собою.
 * 2. Порівняння проводиться ТІЛЬКИ з особистою нормою гравця за 28 днів по тому самому
 *    пристрою та тій самій метриці HRV.
 * 3. Менше 14 записів за 28 днів = «Збір базових даних».
 */

import type {
  WearableEntry,
  WearableDeviceType,
  HrvMetricType,
  MetricBaseline,
  WearableBaselineReport,
} from "../types/wearables.ts";
import {
  WEARABLES_BASELINE_REQUIRED_DAYS,
  WEARABLES_BASELINE_WINDOW_DAYS,
  WEARABLES_DISCLAIMER_TEXT,
} from "./wearables-constants.ts";

export interface CalculateBaselineOptions {
  entries: WearableEntry[];
  targetDeviceType: WearableDeviceType;
  targetHrvMetric: HrvMetricType;
  todayDate: string; // YYYY-MM-DD
  windowDays?: number; // 28
  requiredEntries?: number; // 14
  playerId: string;
}

/**
 * Допоміжна функція розрахунку середнього та стандартного відхилення
 */
export function calculateStats(values: number[]): MetricBaseline | null {
  const valid = values.filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
  if (valid.length === 0) return null;

  const count = valid.length;
  const mean = valid.reduce((acc, curr) => acc + curr, 0) / count;

  let variance = 0;
  if (count > 1) {
    const sumSquares = valid.reduce((acc, curr) => acc + Math.pow(curr - mean, 2), 0);
    variance = sumSquares / (count - 1);
  }
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...valid);
  const max = Math.max(...valid);

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    count,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    normalBandLow: Math.round((mean - 1.0 * stdDev) * 10) / 10,
    normalBandHigh: Math.round((mean + 1.0 * stdDev) * 10) / 10,
  };
}

/**
 * Розраховує особисту норму за останні 28 днів
 */
export function calculateWearableBaseline(
  options: CalculateBaselineOptions
): WearableBaselineReport {
  const {
    entries,
    targetDeviceType,
    targetHrvMetric,
    todayDate,
    windowDays = WEARABLES_BASELINE_WINDOW_DAYS,
    requiredEntries = WEARABLES_BASELINE_REQUIRED_DAYS,
    playerId,
  } = options;

  // Визначаємо часове вікно (сьогодні - windowDays)
  const todayMs = new Date(todayDate).getTime();
  const windowStartMs = todayMs - windowDays * 24 * 60 * 60 * 1000;

  // 1. СУВОРИЙ ФІЛЬТР: тільки записи в межах вікна, ТОГО САМОГО ДЕВАЙСА та ТІЄЇ САМОЇ МЕТРИКИ
  const filtered = entries.filter((e) => {
    if (e.device_type !== targetDeviceType) return false;
    if (e.hrv_metric !== targetHrvMetric) return false;

    const entryMs = new Date(e.date).getTime();
    return entryMs >= windowStartMs && entryMs <= todayMs;
  });

  // Сортуємо хронологічно
  filtered.sort((a, b) => a.date.localeCompare(b.date));

  // Сьогоднішній запис
  const todayEntry = filtered.find((e) => e.date === todayDate) || null;

  const validDaysCount = filtered.length;
  const isBaselineReady = validDaysCount >= requiredEntries;

  let restingHrBaseline: MetricBaseline | null = null;
  let hrvBaseline: MetricBaseline | null = null;
  let sleepBaseline: MetricBaseline | null = null;

  let todayRestingHrZScore: number | null = null;
  let todayHrvZScore: number | null = null;

  if (isBaselineReady) {
    const restingHrs = filtered
      .map((e) => e.resting_hr_bpm)
      .filter((v): v is number => v !== null && v !== undefined);
    const hrvs = filtered
      .map((e) => e.hrv_ms)
      .filter((v): v is number => v !== null && v !== undefined);
    const sleeps = filtered
      .map((e) => e.sleep_duration_min)
      .filter((v): v is number => v !== null && v !== undefined);

    restingHrBaseline = calculateStats(restingHrs);
    hrvBaseline = calculateStats(hrvs);
    sleepBaseline = calculateStats(sleeps);

    if (todayEntry) {
      if (
        todayEntry.resting_hr_bpm !== null &&
        restingHrBaseline &&
        restingHrBaseline.stdDev > 0
      ) {
        todayRestingHrZScore =
          Math.round(
            ((todayEntry.resting_hr_bpm - restingHrBaseline.mean) /
              restingHrBaseline.stdDev) *
              100
          ) / 100;
      }

      if (
        todayEntry.hrv_ms !== null &&
        hrvBaseline &&
        hrvBaseline.stdDev > 0
      ) {
        todayHrvZScore =
          Math.round(
            ((todayEntry.hrv_ms - hrvBaseline.mean) / hrvBaseline.stdDev) * 100
          ) / 100;
      }
    }
  }

  const trendDays = filtered.map((e) => ({
    date: e.date,
    resting_hr_bpm: e.resting_hr_bpm,
    hrv_ms: e.hrv_ms,
    sleep_duration_min: e.sleep_duration_min,
    device_score: e.device_score,
  }));

  const status = !isBaselineReady
    ? "collecting_baseline"
    : "ready";

  const statusLabel = !isBaselineReady
    ? `Збір базових даних (${validDaysCount}/${requiredEntries} днів)`
    : "Особиста норма розрахована";

  return {
    playerId,
    deviceType: targetDeviceType,
    hrvMetric: targetHrvMetric,
    status,
    statusLabel,
    entriesCount: validDaysCount,
    requiredEntries,
    todayEntry,
    restingHrBaseline,
    hrvBaseline,
    sleepBaseline,
    todayRestingHrZScore,
    todayHrvZScore,
    trendDays,
    disclaimer: WEARABLES_DISCLAIMER_TEXT,
  };
}
