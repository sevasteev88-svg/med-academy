"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertAuth,
  assertDoctor,
  isDoctor,
  isCoach,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
import { getClubDate, getPlayerClubTimezone } from "@/lib/club-timezone";
import {
  calculateWearableBaseline,
} from "@/lib/wearables-baseline";
import {
  SUPPORTED_DEVICE_PROFILES,
  WEARABLES_DISCLAIMER_TEXT,
  validatePlausibleRange,
  RESTING_HR_PLAUSIBLE_RANGE,
  HRV_PLAUSIBLE_RANGE,
  SLEEP_DURATION_MIN_PLAUSIBLE_RANGE,
} from "@/lib/wearables-constants";
import { callAI } from "@/lib/ai";
import { logAudit } from "@/lib/audit";
import type {
  WearableEntry,
  WearableInputData,
  WearableDeviceType,
  HrvMetricType,
  WearableBaselineReport,
} from "@/types/wearables";

/**
 * 6 & 7. Перевірка доступу до блоку носимих пристроїв:
 * - Для гравців < 18 років обов'язкова згода батьків (consent scope 'wearables').
 * - Перевірка налаштування клубу для ШІ-скріншотів та згоди ai_processing.
 */
export async function checkPlayerWearablesAccessAction(playerId: string): Promise<{
  canUseWearables: boolean;
  isMinor: boolean;
  wearablesConsentGranted: boolean;
  aiScreenshotEnabled: boolean;
  aiProcessingConsentGranted: boolean;
  reason?: string;
}> {
  if (!playerId) {
    return {
      canUseWearables: false,
      isMinor: false,
      wearablesConsentGranted: false,
      aiScreenshotEnabled: false,
      aiProcessingConsentGranted: false,
      reason: "Не вказано гравця",
    };
  }

  const summary = await getPlayerConsentSummary(playerId);
  const supabase = createAdminClient();

  // Отримуємо налаштування клубу
  let aiScreenshotEnabled = false;
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    aiScreenshotEnabled = Boolean(
      (club as any)?.settings?.readiness_config?.wearablesAiScreenshotEnabled
    );
  } catch {}

  const isMinor = summary.isMinor;
  let wearablesConsentGranted = true;
  let aiProcessingConsentGranted = true;

  if (isMinor) {
    const wearConsent = summary.scopes["wearables"];
    wearablesConsentGranted = wearConsent?.status === "granted";

    const aiConsent = summary.scopes["ai_processing"];
    aiProcessingConsentGranted = aiConsent?.status === "granted";
  }

  if (isMinor && !wearablesConsentGranted) {
    return {
      canUseWearables: false,
      isMinor: true,
      wearablesConsentGranted: false,
      aiScreenshotEnabled,
      aiProcessingConsentGranted,
      reason: "Потрібна згода батьків на передачу даних з носимих пристроїв (Wearables)",
    };
  }

  return {
    canUseWearables: true,
    isMinor,
    wearablesConsentGranted,
    aiScreenshotEnabled,
    aiProcessingConsentGranted,
  };
}

/**
 * Отримує сьогоднішній запис з носимого пристрою для гравця (якщо вже заповнено).
 */
export async function getTodayWearableEntryAction(playerId: string): Promise<{
  entry: WearableEntry | null;
  today: string;
}> {
  if (!playerId) return { entry: null, today: "" };

  const { clubId, timezone } = await getPlayerClubTimezone(playerId);
  const today = getClubDate(timezone);
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("wearable_entries")
    .select("*")
    .eq("player_id", playerId)
    .eq("date", today)
    .maybeSingle();

  return {
    entry: data ? (data as WearableEntry) : null,
    today,
  };
}

/**
 * Збереження / оновлення запису з годинника (8.8).
 * Дозволено гравцю (власний запис) або лікарю / адміністратору.
 * Тренерам доступ заборонено!
 */
export async function submitWearableEntryAction(
  input: WearableInputData & { playerId: string; date?: string }
): Promise<{
  success: boolean;
  entry?: WearableEntry;
  warnings?: string[];
  error?: string;
}> {
  if (!input.playerId) {
    return { success: false, error: "Не вказано гравця" };
  }

  // 1. Перевірка авторизації
  const auth = await assertAuth();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }
  const { user } = auth;

  // ТРЕНЕРУ СУВОРО ЗАБОРОНЕНО ВНОСИТИ ЧИ РЕДАГУВАТИ ДАНІ ГОДИННИКА
  if (isCoach(user.role)) {
    return {
      success: false,
      error: "Недостатньо прав. Доступ лише для гравця або медичного штабу.",
    };
  }

  // 2. Перевірка згоди для неповнолітніх
  const access = await checkPlayerWearablesAccessAction(input.playerId);
  if (!access.canUseWearables) {
    return {
      success: false,
      error: access.reason || "Відсутня згода батьків на використання носимих пристроїв",
    };
  }

  const { clubId, timezone } = await getPlayerClubTimezone(input.playerId);
  const today = getClubDate(timezone);
  const entryDate = input.date || today;

  // Визначення дефолтної метрики HRV та назви індексу за типом пристрою
  const profile = SUPPORTED_DEVICE_PROFILES[input.device_type] || SUPPORTED_DEVICE_PROFILES.other;
  const hrvMetric: HrvMetricType = input.hrv_metric || profile.defaultHrvMetric;
  const scoreName = input.device_score_name || profile.defaultScoreName;

  // Валідація правдоподібних діапазонів (не блокує, збирає попередження)
  const warnings: string[] = [];
  const rhrCheck = validatePlausibleRange(input.resting_hr_bpm, RESTING_HR_PLAUSIBLE_RANGE);
  if (!rhrCheck.isPlausible && rhrCheck.warning) warnings.push(rhrCheck.warning);

  const hrvCheck = validatePlausibleRange(input.hrv_ms, HRV_PLAUSIBLE_RANGE);
  if (!hrvCheck.isPlausible && hrvCheck.warning) warnings.push(hrvCheck.warning);

  const sleepCheck = validatePlausibleRange(input.sleep_duration_min, SLEEP_DURATION_MIN_PLAUSIBLE_RANGE);
  if (!sleepCheck.isPlausible && sleepCheck.warning) warnings.push(sleepCheck.warning);

  const supabase = createAdminClient();

  // 3. Збереження в таблицю wearable_entries (ON CONFLICT player_id, date)
  const payload = {
    club_id: clubId,
    player_id: input.playerId,
    date: entryDate,
    device_type: input.device_type,
    resting_hr_bpm: input.resting_hr_bpm ?? null,
    hrv_ms: input.hrv_ms ?? null,
    hrv_metric: hrvMetric,
    sleep_duration_min: input.sleep_duration_min ?? null,
    device_score: input.device_score ?? null,
    device_score_name: scoreName,
    source: input.source || "manual",
  };

  const { data, error } = await supabase
    .from("wearable_entries")
    .upsert(payload, { onConflict: "player_id, date" })
    .select()
    .single();

  if (error) {
    console.error("[submitWearableEntryAction] error:", error);
    return { success: false, error: error.message };
  }

  // 4. Перевикористання sleep_hours: якщо заповнено сон і існує анкета wellness_entries
  // синхронізуємо sleep_hours без дублювання запитань
  if (input.sleep_duration_min && input.sleep_duration_min > 0) {
    try {
      const calculatedHours = Math.round((input.sleep_duration_min / 60) * 10) / 10;
      await supabase
        .from("wellness_entries")
        .update({ sleep_hours: calculatedHours })
        .eq("player_id", input.playerId)
        .eq("date", entryDate);
    } catch {}
  }

  await logAudit({
    action: "submit_wearable_entry",
    entity: "wearable_entries",
    entityId: data.id,
    clubId,
    meta: {
      playerId: input.playerId,
      deviceType: input.device_type,
      hrvMetric,
      source: input.source || "manual",
    },
  });

  revalidatePath("/wellness");
  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/team/readiness");

  return {
    success: true,
    entry: data as WearableEntry,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Отримує звіт особистої норми гравця за 28 днів (8.8).
 * ДОСТУП: Тільки лікар та admin! Для тренера повертає заборону помилкою 403.
 */
export async function getWearableBaselineReportAction(
  playerId: string,
  deviceType?: WearableDeviceType,
  hrvMetric?: HrvMetricType
): Promise<{
  report?: WearableBaselineReport;
  error?: string;
}> {
  if (!playerId) {
    return { error: "Не вказано гравця" };
  }

  // Перевірка ролі: ТІЛЬКИ лікар та адмін (або сам гравець для свого профілю)
  const auth = await assertAuth();
  if ("error" in auth) {
    return { error: auth.error };
  }
  const { user } = auth;

  if (isCoach(user.role)) {
    return {
      error: "Доступ заборонено. Біометричні дані з годинника доступні лише лікарю та адміністратору.",
    };
  }

  const { clubId, timezone } = await getPlayerClubTimezone(playerId);
  const todayDate = getClubDate(timezone);
  const supabase = createAdminClient();

  // Отримуємо записи гравця за останні 35 днів (щоб гарантовано покрити вікно 28 днів)
  const sinceDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: entriesData, error } = await supabase
    .from("wearable_entries")
    .select("*")
    .eq("player_id", playerId)
    .gte("date", sinceDate)
    .lte("date", todayDate)
    .order("date", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  const entries: WearableEntry[] = (entriesData || []) as WearableEntry[];

  // Якщо девайс не вказано явно, беремо останній використаний гравцем
  let targetDevice = deviceType;
  let targetMetric = hrvMetric;

  if (!targetDevice && entries.length > 0) {
    const lastEntry = entries[entries.length - 1];
    targetDevice = lastEntry.device_type;
    targetMetric = targetMetric || lastEntry.hrv_metric;
  }

  if (!targetDevice) {
    targetDevice = "whoop";
  }

  if (!targetMetric) {
    const prof = SUPPORTED_DEVICE_PROFILES[targetDevice] || SUPPORTED_DEVICE_PROFILES.other;
    targetMetric = prof.defaultHrvMetric;
  }

  const report = calculateWearableBaseline({
    entries,
    targetDeviceType: targetDevice,
    targetHrvMetric: targetMetric,
    todayDate,
    playerId,
  });

  return { report };
}

/**
 * 7. ШІ-розпізнавання скріншота екрану годинника (задача 1.5).
 * ВИМОГИ:
 * - Увімкнено налаштуванням клубу
 * - Згода ai_processing (для неповнолітніх)
 * - ЗОБРАЖЕННЯ НЕ ЗБЕРІГАЄТЬСЯ (обробка в пам'яті)
 * - Результат повертається гравцю для підтвердження
 * - Помилки розпізнавання НЕ записуються в базу
 */
export async function parseWearableScreenshotAction(input: {
  playerId: string;
  imageBase64: string;
  mediaType?: "image/jpeg" | "image/png" | "image/webp";
}): Promise<{
  success: boolean;
  data?: Partial<WearableInputData>;
  disclaimer: string;
  error?: string;
}> {
  if (!input.playerId || !input.imageBase64) {
    return {
      success: false,
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
      error: "Необхідно надати зображення для аналізу",
    };
  }

  // 1. Перевірка доступу та згоди
  const access = await checkPlayerWearablesAccessAction(input.playerId);
  if (!access.canUseWearables) {
    return {
      success: false,
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
      error: access.reason || "Немає доступу до блоку носимих пристроїв",
    };
  }

  if (!access.aiScreenshotEnabled) {
    return {
      success: false,
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
      error: "ШІ-розпізнавання скріншотів вимкнено в налаштуваннях клубу",
    };
  }

  if (access.isMinor && !access.aiProcessingConsentGranted) {
    return {
      success: false,
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
      error: "Потрібна згода батьків на використання ШІ-аналізу (ai_processing)",
    };
  }

  // 2. Виклик моделі ШІ через єдиний модуль (1.5)
  try {
    const prompt = `Ви аналізуєте скріншот програми носимого пристрою спортсмена (WHOOP, Apple Watch, Garmin, Oura тощо).
Витягніть із зображення виключно фізіологічні показники.

Поверніть ТІЛЬКИ валідний JSON у наступному форматі без жодного додаткового тексту чи markdown-форматування:
{
  "device_type": "whoop" | "apple_watch" | "garmin" | "oura" | "other",
  "resting_hr_bpm": number | null,
  "hrv_ms": number | null,
  "hrv_metric": "rmssd" | "sdnn" | "unknown",
  "sleep_duration_min": number | null,
  "device_score": number | null,
  "device_score_name": string | null
}

Правила:
- sleep_duration_min: переведіть тривалість сну в хвилини (наприклад, 7 годин 30 хвилин = 450).
- Якщо показник не видно на зображенні або ви не впевнені, вкажіть null.
- Якщо це WHOOP: hrv_metric = "rmssd", device_score_name = "Recovery".
- Якщо це Apple Watch: hrv_metric = "sdnn".
- Якщо це Garmin: hrv_metric = "rmssd", device_score_name = "Body Battery" або "Sleep Score".`;

    const aiRes = await callAI({
      prompt,
      system:
        "Ви медично-спортивний асистент парсингу біометричних скріншотів. Повертайте суворо чистий JSON.",
      temperature: 0.1,
      image: {
        base64: input.imageBase64,
        mediaType: input.mediaType || "image/jpeg",
      },
    });

    // Очищуємо відповідь від можливих markdown ```json
    const cleanedJson = aiRes.text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleanedJson);

    return {
      success: true,
      data: {
        device_type: parsed.device_type || "other",
        resting_hr_bpm: parsed.resting_hr_bpm ? Number(parsed.resting_hr_bpm) : null,
        hrv_ms: parsed.hrv_ms ? Number(parsed.hrv_ms) : null,
        hrv_metric: parsed.hrv_metric || "unknown",
        sleep_duration_min: parsed.sleep_duration_min
          ? Number(parsed.sleep_duration_min)
          : null,
        device_score: parsed.device_score ? Number(parsed.device_score) : null,
        device_score_name: parsed.device_score_name || null,
        source: "screenshot",
      },
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
    };
  } catch (err: any) {
    console.error("[parseWearableScreenshotAction] parsing error:", err);
    return {
      success: false,
      disclaimer: WEARABLES_DISCLAIMER_TEXT,
      error: "Не вдалося розпізнати дані зі скріншота. Будь ласка, введіть значення вручну.",
    };
  }
}
