/**
 * wearables-constants.ts
 * Константи валідації діапазонів, дефолтних налаштувань та розрахунку норми для носимих пристроїв (8.8)
 */

import type {
  WearableDeviceType,
  HrvMetricType,
} from "../types/wearables.ts";

export interface ValueRange {
  min: number;
  max: number;
  unit: string;
  label: string;
}

/**
 * Фізіологічно правдоподібні діапазони значень для професійних спортсменів.
 * Значення поза цими межами НЕ блокують введення, але показують м'яке попередження «Перевірте значення».
 */
export const RESTING_HR_PLAUSIBLE_RANGE: ValueRange = {
  min: 35,
  max: 105,
  unit: "уд/хв",
  label: "Пульс спокою",
};

export const HRV_PLAUSIBLE_RANGE: ValueRange = {
  min: 15,
  max: 220,
  unit: "мс",
  label: "HRV (варіабельність)",
};

export const SLEEP_DURATION_MIN_PLAUSIBLE_RANGE: ValueRange = {
  min: 240, // 4 години
  max: 720, // 12 годин
  unit: "хв",
  label: "Тривалість сну",
};

export const DEVICE_SCORE_PLAUSIBLE_RANGE: ValueRange = {
  min: 0,
  max: 100,
  unit: "%",
  label: "Показник відновлення пристрою",
};

export const WEARABLES_BASELINE_REQUIRED_DAYS = 14;
export const WEARABLES_BASELINE_WINDOW_DAYS = 28;

export const WEARABLES_DISCLAIMER_TEXT =
  "Дані внесені гравцем, не перевірені";

export const WEARABLES_WARNING_OUT_OF_RANGE = "Перевірте значення";

/**
 * Метадані підтримуваних пристроїв з дефолтною метрикою HRV та назвою фірмового індексу
 */
export interface DeviceProfile {
  id: WearableDeviceType;
  name: string;
  icon: string;
  defaultHrvMetric: HrvMetricType;
  defaultScoreName: string | null;
  scorePlaceholder: string | null;
  scoreUnit: string | null;
}

export const SUPPORTED_DEVICE_PROFILES: Record<WearableDeviceType, DeviceProfile> = {
  whoop: {
    id: "whoop",
    name: "WHOOP 4.0 / 5.0",
    icon: "⭕",
    defaultHrvMetric: "rmssd",
    defaultScoreName: "Recovery",
    scorePlaceholder: "Recovery % (напр. 85)",
    scoreUnit: "%",
  },
  apple_watch: {
    id: "apple_watch",
    name: "Apple Watch",
    icon: "🍎",
    defaultHrvMetric: "sdnn",
    defaultScoreName: null,
    scorePlaceholder: null,
    scoreUnit: null,
  },
  garmin: {
    id: "garmin",
    name: "Garmin",
    icon: "⌚",
    defaultHrvMetric: "rmssd",
    defaultScoreName: "Body Battery",
    scorePlaceholder: "Body Battery % (напр. 78)",
    scoreUnit: "%",
  },
  other: {
    id: "other",
    name: "Інший пристрій",
    icon: "📱",
    defaultHrvMetric: "unknown",
    defaultScoreName: "Score",
    scorePlaceholder: "Оцінка (0-100)",
    scoreUnit: "",
  },
  oura: {
    id: "oura",
    name: "Oura Ring",
    icon: "💍",
    defaultHrvMetric: "rmssd",
    defaultScoreName: "Readiness",
    scorePlaceholder: "Readiness Score (0-100)",
    scoreUnit: "%",
  },
};

/**
 * Перевірка, чи значення знаходиться у правдоподібному діапазоні.
 * Повертає { isPlausible: boolean, warning?: string }
 */
export function validatePlausibleRange(
  value: number | null | undefined,
  range: ValueRange
): { isPlausible: boolean; warning?: string } {
  if (value === null || value === undefined || isNaN(value)) {
    return { isPlausible: true };
  }
  if (value < range.min || value > range.max) {
    return {
      isPlausible: false,
      warning: `${WEARABLES_WARNING_OUT_OF_RANGE} (${range.label}: ${range.min}–${range.max} ${range.unit})`,
    };
  }
  return { isPlausible: true };
}
