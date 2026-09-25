export type UrineColorLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type HydrationSession = {
  id: string;
  player_id: string;
  date: string;
  session_name: string; // e.g., "Ранкове тренування (спека)", "Ігрове тренування"
  duration_minutes: number;
  temperature_celsius?: number | null; // e.g. 28°C

  weight_before_kg: number; // e.g. 74.5
  weight_after_kg: number; // e.g. 73.1
  fluid_consumed_liters: number; // e.g. 1.2

  urine_color_before?: UrineColorLevel | null; // Шкала Армстронга 1-8

  // Розраховані показники
  weight_loss_kg: number;
  weight_loss_pct: number; // % від початкової маси тіла
  sweat_rate_liters_per_hour: number; // (втрата ваги + випита рідина) / (тривалість/60)
  recommended_fluid_replacement_ml: number; // 150% від дефіциту ваги

  status: "optimal" | "mild_dehydration" | "severe_dehydration";
  notes?: string | null;
  created_at: string;
};

export const ARMSTRONG_URINE_SCALE: Record<
  UrineColorLevel,
  { label: string; color: string; status: "optimal" | "mild" | "severe" }
> = {
  1: { label: "1 - Прозорий (Гіпергідратація)", color: "#fef9c3", status: "optimal" },
  2: { label: "2 - Дуже світлий (Оптимум)", color: "#fef08a", status: "optimal" },
  3: { label: "3 - Світло-солом'яний (Норма)", color: "#fde047", status: "optimal" },
  4: { label: "4 - Жовтий (Початок зневоднення)", color: "#facc15", status: "mild" },
  5: { label: "5 - Темно-жовтий (Помірна дегідратація)", color: "#eab308", status: "mild" },
  6: { label: "6 - Бурштиновий (Виражене зневоднення)", color: "#ca8a04", status: "severe" },
  7: { label: "7 - Коричневий (Критична дегідратація)", color: "#a16207", status: "severe" },
  8: { label: "8 - Темно-коричневий (Небезпечний стан)", color: "#854d0e", status: "severe" },
};

export function calculateHydrationMetrics(input: {
  weightBefore: number;
  weightAfter: number;
  fluidConsumedLiters: number;
  durationMinutes: number;
}): {
  weightLossKg: number;
  weightLossPct: number;
  sweatRateLph: number;
  replacementMl: number;
  status: "optimal" | "mild_dehydration" | "severe_dehydration";
} {
  const weightLossKg = Math.max(0, Math.round((input.weightBefore - input.weightAfter) * 100) / 100);
  const weightLossPct =
    input.weightBefore > 0
      ? Math.round((weightLossKg / input.weightBefore) * 1000) / 10
      : 0;

  const hours = Math.max(0.25, input.durationMinutes / 60);
  const totalSweatLiters = weightLossKg + input.fluidConsumedLiters;
  const sweatRateLph = Math.round((totalSweatLiters / hours) * 100) / 100;

  // Рекомендоване відновлення: 150% від втраченої ваги (для компенсації діурезу)
  const replacementMl = Math.round(weightLossKg * 1500);

  let status: "optimal" | "mild_dehydration" | "severe_dehydration" = "optimal";
  if (weightLossPct >= 2.0) {
    status = "severe_dehydration";
  } else if (weightLossPct >= 1.0) {
    status = "mild_dehydration";
  }

  return {
    weightLossKg,
    weightLossPct,
    sweatRateLph,
    replacementMl,
    status,
  };
}
