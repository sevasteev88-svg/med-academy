/**
 * types/wearables.ts
 * Типи для біометричних даних носимих пристроїв (WHOOP, Apple Watch, Garmin, Oura)
 */

export type WearableDeviceType = "whoop" | "apple_watch" | "garmin" | "other" | "oura";

export type HrvMetricType = "rmssd" | "sdnn" | "unknown";

export type WearableSource = "manual" | "screenshot" | "api_sync" | "apple_health";

/**
 * Запис таблиці wearable_entries (Задача 8.8)
 */
export interface WearableEntry {
  id: string;
  club_id: string;
  player_id: string;
  date: string; // YYYY-MM-DD
  device_type: WearableDeviceType;
  resting_hr_bpm: number | null;
  hrv_ms: number | null;
  hrv_metric: HrvMetricType;
  sleep_duration_min: number | null; // У хвилинах
  device_score: number | null;
  device_score_name: string | null;
  source: WearableSource;
  created_at: string;
}

export interface WearableInputData {
  device_type: WearableDeviceType;
  resting_hr_bpm?: number | null;
  hrv_ms?: number | null;
  hrv_metric?: HrvMetricType;
  sleep_duration_min?: number | null;
  device_score?: number | null;
  device_score_name?: string | null;
  source?: WearableSource;
}

export type BaselineStatus = "collecting_baseline" | "ready" | "no_data";

export interface MetricBaseline {
  mean: number;
  stdDev: number;
  count: number;
  min: number;
  max: number;
  normalBandLow: number; // mean - 1.0 * stdDev
  normalBandHigh: number; // mean + 1.0 * stdDev
}

export interface WearableBaselineReport {
  playerId: string;
  deviceType: WearableDeviceType;
  hrvMetric: HrvMetricType;
  status: BaselineStatus;
  statusLabel: string; // "Збір базових даних" або "Норма розрахована"
  entriesCount: number; // Кількість валідних записів за 28 днів по цьому девайсу і метриці
  requiredEntries: number; // 14

  todayEntry: WearableEntry | null;

  restingHrBaseline: MetricBaseline | null;
  hrvBaseline: MetricBaseline | null;
  sleepBaseline: MetricBaseline | null;

  todayRestingHrZScore: number | null;
  todayHrvZScore: number | null;

  trendDays: {
    date: string;
    resting_hr_bpm: number | null;
    hrv_ms: number | null;
    sleep_duration_min: number | null;
    device_score: number | null;
  }[];

  disclaimer: string; // "Дані внесені гравцем, не перевірені"
}

export type WearableBiometricsEntry = {
  id: string;
  player_id: string;
  device_type: WearableDeviceType;
  date: string; // YYYY-MM-DD
  
  // 1. Відновлення та вегетативна система
  recovery_score: number; // 0-100% (WHOOP recovery або зведений індекс)
  hrv_rmssd: number; // мс (варіабельність пульсу, норма зазвичай 40-120 мс)
  resting_hr: number; // уд/хв (пульс спокою)
  skin_temp_celsius?: number | null; // відхилення темп. тіла (°C)
  spo2_pct?: number | null; // кисень у крові %

  // 2. Моніторинг сну
  sleep_duration_hours: number; // напр. 7.8 год
  sleep_efficiency_pct: number; // 0-100%
  deep_sleep_hours?: number | null; // глибокий сон
  rem_sleep_hours?: number | null; // швидкий сон
  sleep_needed_hours?: number | null; // рекомендований сон
  
  // 3. Денне навантаження / стрес
  day_strain?: number | null; // 0-21 (WHOOP Day Strain)
  calories_burned?: number | null; // активні ккал

  source: "api_sync" | "apple_health" | "manual";
  created_at: string;
};

export const DEVICE_META: Record<
  WearableDeviceType,
  { label: string; icon: string; brandColor: string }
> = {
  whoop: {
    label: "WHOOP 4.0",
    icon: "⭕",
    brandColor: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  },
  apple_watch: {
    label: "Apple Watch (HealthKit)",
    icon: "🍎",
    brandColor: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  },
  garmin: {
    label: "Garmin Sports",
    icon: "⌚",
    brandColor: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  },
  oura: {
    label: "Oura Ring Gen 3",
    icon: "💍",
    brandColor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  other: {
    label: "Інший трекер",
    icon: "📱",
    brandColor: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  },
};
