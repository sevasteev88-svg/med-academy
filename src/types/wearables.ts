/**
 * types/wearables.ts
 * Типи для біометричних даних носимих пристроїв (WHOOP, Apple Watch, Garmin, Oura)
 */

export type WearableDeviceType = "whoop" | "apple_watch" | "garmin" | "oura" | "other";

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
