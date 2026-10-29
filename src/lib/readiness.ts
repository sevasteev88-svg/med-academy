/**
 * Модуль розрахунку ранкового світлофора готовності гравця (8.4)
 */

import type { WellnessEntry, CoachWellnessEntry } from "../types/wellness.ts";
import type { WearableBaselineReport } from "../types/wearables.ts";
import {
  DEFAULT_READINESS_THRESHOLDS,
  DEFAULT_COACH_CATEGORY_VISIBILITY,
  READINESS_DISCLAIMER_TEXT,
  type ReadinessThresholds,
  type CoachCategoryVisibility,
  type ClubReadinessConfig,
} from "./readiness-constants.ts";

export type ReadinessColor = "green" | "yellow" | "red" | "gray";

export type ReadinessGrayReason =
  | "no_consent" // Неповнолітній без згоди на обробку даних
  | "no_device" // Пристрій не активовано
  | "no_entry_today" // Сьогодні не заповнив анкету
  | "collecting_baseline"; // Менше 14 відповідей за 28 днів

export type PhysicalFlagCategory = "біль" | "втома" | "сон" | "нездужання";

export interface ReadinessTrendPoint {
  date: string;
  compositeScore: number | null; // 3-15 (сон + втома + крепатура)
  status: ReadinessColor;
  label: string;
  isAcknowledged?: boolean;
  reviewedByRole?: "coach" | "doctor" | "admin" | null;
  reviewedAt?: string | null;
  details?: {
    pain: boolean;
    painVas: number | null;
    painLocations: string[] | null;
    illness: boolean;
    stress: number | null;
    comment: string | null;
    sleepHours: number | null;
    sleepQuality: number;
    fatigue: number;
    soreness: number;
  } | null;
}

export interface PlayerReadinessResult {
  playerId: string;
  playerName?: string;
  teamId?: string;
  teamName?: string;
  position?: string;
  date: string; // Сьогоднішня дата
  status: ReadinessColor;
  statusLabel: string; // "Оптимально", "Потребує уваги", "Поговорити з гравцем / повідомити лікаря", "Збір даних" тощо
  actionPrompt: string; // Коротка підказка до дії
  disclaimer: string; // Фіксований текст для тренера
  grayReason?: ReadinessGrayReason | null;
  
  // Базові метрики норми (особиста норма гравця за 28 днів)
  baselineDaysCount: number; // Кількість днів із заповненими анкетами за останні 28 днів
  isBaselineReady: boolean; // >= 14 днів
  personalMean: number | null; // Середнє значення фізичного композиту
  personalStdDev: number | null; // Стандартне відхилення
  todayComposite: number | null; // Сьогоднішній фізичний композит
  zScore: number | null; // Z-score відхилення від особистої норми

  // Фізичні прапорці
  flagCategories: PhysicalFlagCategory[]; // Дозволені до показу категорії прапорців
  
  // 7-денний тренд для міні-графіка
  trendLast7Days: ReadinessTrendPoint[];

  // 8.5 Статистика заповнення та дисципліна (Compliance)
  compliance7Days: number; // 0 - 100% за останні 7 днів
  compliance28Days: number; // 0 - 100% за останні 28 днів
  currentStreakDays: number; // Серия заповнення поспіль

  // 8.5 Зворотний зв'язок (Відмітка перегляду штабом)
  isAcknowledged: boolean;
  reviewedByRole: "coach" | "doctor" | "admin" | null;
  reviewedAt: string | null;

  // 8.5 Детекція монотонних однакових відповідей (ВИДНО ТІЛЬКИ ЛІКАРЮ ТА АДМІНУ!)
  hasMonotony: boolean;
  monotonyDays: number;
  monotonyPrompt?: string | null;

  // ДЕТАЛІ ДЛЯ ЛІКАРЯ (Суворо null або undefined для тренера!)
  doctorDetails?: {
    pain: boolean;
    painVas: number | null;
    painLocations: string[] | null;
    illness: boolean;
    stress: number | null;
    comment: string | null;
    sleepHours: number | null;
    sleepQuality: number;
    fatigue: number;
    soreness: number;
    wearables?: {
      deviceType: string;
      hrvMetric: string;
      restingHrBpm: number | null;
      hrvMs: number | null;
      sleepDurationMin: number | null;
      deviceScore: number | null;
      deviceScoreName: string | null;
      restingHrZScore: number | null;
      hrvZScore: number | null;
      baselineStatus: string;
      disclaimer: string;
    } | null;
  } | null;
}

export interface CalculateReadinessOptions {
  todayDate: string; // YYYY-MM-DD
  hasConsent: boolean; // Наявність згоди
  hasActiveDevice: boolean; // Наявність активованого пристрою
  entriesLast28Days: WellnessEntry[]; // Анкети за останні 28 днів включно із сьогоднішньою
  thresholds?: ReadinessThresholds;
  visibility?: CoachCategoryVisibility;
  forRole?: "coach" | "doctor" | "admin";
  playerInfo?: {
    id: string;
    name?: string;
    teamId?: string;
    teamName?: string;
    position?: string;
  };
  wearablesReport?: WearableBaselineReport | null;
}

/**
 * Розраховує фізичний композит: Сон + Втома + Крепатура (без стресу).
 * Діапазон: 3-15 (де 15 - ідеальний стан, 3 - сильне виснаження / біль / поганий сон).
 */
export function calculatePhysicalComposite(entry: {
  sleep_quality: number;
  fatigue: number;
  soreness: number;
}): number {
  return entry.sleep_quality + entry.fatigue + entry.soreness;
}

/**
 * Розраховує середнє арифметичне.
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

/**
 * Розраховує вибіркове стандартне відхилення (Sample Standard Deviation).
 */
export function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
    (values.length - 1);
  return Number(Math.sqrt(variance).toFixed(2));
}

/**
 * Розраховує Z-score (на скільки стандартних відхилень сьогоднішнє значення відрізняється від норми).
 */
export function calculateZScore(
  value: number,
  mean: number,
  stdDev: number
): number {
  if (stdDev <= 0.0001) {
    if (value < mean) return -2.0; // Значне погіршення при нульовій варіації
    if (value > mean) return 1.0;
    return 0;
  }
  return Number(((value - mean) / stdDev).toFixed(2));
}

/**
 * Головна серверна функція розрахунку готовності гравця за алгоритмом 8.4
 */
export function evaluatePlayerReadiness(
  options: CalculateReadinessOptions
): PlayerReadinessResult {
  const {
    todayDate,
    hasConsent,
    hasActiveDevice,
    entriesLast28Days,
    thresholds = DEFAULT_READINESS_THRESHOLDS,
    visibility = DEFAULT_COACH_CATEGORY_VISIBILITY,
    forRole = "coach",
    playerInfo,
  } = options;

  const isDoctorRole = forRole === "doctor" || forRole === "admin";

  // Базовий каркас відповіді
  const baseResult: PlayerReadinessResult = {
    playerId: playerInfo?.id || "",
    playerName: playerInfo?.name,
    teamId: playerInfo?.teamId,
    teamName: playerInfo?.teamName,
    position: playerInfo?.position,
    date: todayDate,
    status: "gray",
    statusLabel: "Немає даних",
    actionPrompt: "Очікується інформація",
    disclaimer: READINESS_DISCLAIMER_TEXT,
    grayReason: null,
    baselineDaysCount: 0,
    isBaselineReady: false,
    personalMean: null,
    personalStdDev: null,
    todayComposite: null,
    zScore: null,
    flagCategories: [],
    trendLast7Days: [],
    compliance7Days: 0,
    compliance28Days: 0,
    currentStreakDays: 0,
    isAcknowledged: false,
    reviewedByRole: null,
    reviewedAt: null,
    hasMonotony: false,
    monotonyDays: 0,
    monotonyPrompt: null,
    doctorDetails: null,
  };

  // 1. ПЕРЕВІРКА ЗГОДИ ТА ПРИСТРОЮ
  if (!hasConsent) {
    return {
      ...baseResult,
      status: "gray",
      grayReason: "no_consent",
      statusLabel: "Немає згоди",
      actionPrompt: "Потрібна згода батьків на обробку даних",
    };
  }

  if (!hasActiveDevice) {
    return {
      ...baseResult,
      status: "gray",
      grayReason: "no_device",
      statusLabel: "Не активовано",
      actionPrompt: "Гравець ще не активував пристрій по QR-коду",
    };
  }

  // 2. СОРТУВАННЯ ТА ПОШУК СЬОГОДНІШНЬОЇ АНКЕТИ
  const dateMap = new Map<string, WellnessEntry>();
  for (const entry of entriesLast28Days) {
    dateMap.set(entry.date, entry);
  }

  const todayEntry = dateMap.get(todayDate) || null;

  // Рахуємо кількість заповнених днів за останні 28 днів
  const totalDaysFilled = dateMap.size;
  baseResult.baselineDaysCount = totalDaysFilled;
  baseResult.isBaselineReady = totalDaysFilled >= thresholds.baselineRequiredDays;

  // Формуємо 7-денний тренд
  baseResult.trendLast7Days = generate7DayTrend(todayDate, dateMap);

  // 8.5 Розрахунок дисципліни заповнення (Compliance) та серій заповнення (Streaks)
  const { compliance7, compliance28 } = calculateComplianceRates(todayDate, dateMap);
  const streak = calculateStreakDays(todayDate, dateMap);
  baseResult.compliance7Days = compliance7;
  baseResult.compliance28Days = compliance28;
  baseResult.currentStreakDays = streak;

  // 8.5 Детекція монотонних однакових відповідей N днів поспіль
  const monotonyThreshold = thresholds.monotonyThresholdDays || 7;
  const monotony = detectMonotonousAnswers(entriesLast28Days, monotonyThreshold);
  baseResult.hasMonotony = monotony.isMonotonous;
  baseResult.monotonyDays = monotony.consecutiveDays;
  baseResult.monotonyPrompt = monotony.messageForPlayer;

  // 8.5 Перевірка статусу перегляду (acknowledgement)
  if (todayEntry) {
    baseResult.isAcknowledged = Boolean(todayEntry.acknowledged || todayEntry.reviewed_at);
    baseResult.reviewedByRole = todayEntry.reviewed_by_role || null;
    baseResult.reviewedAt = todayEntry.reviewed_at || null;
  }

  // Якщо сьогодні анкету ще не заповнено
  if (!todayEntry) {
    return {
      ...baseResult,
      status: "gray",
      grayReason: "no_entry_today",
      statusLabel: "Не заповнив",
      actionPrompt: "Очікується ранкове заповнення анкети",
    };
  }

  // Сьогоднішній композит
  const todayComposite = calculatePhysicalComposite(todayEntry);
  baseResult.todayComposite = todayComposite;

  // Заповнюємо деталі лікаря (якщо запитує лікар/адмін)
  if (isDoctorRole) {
    baseResult.doctorDetails = {
      pain: todayEntry.pain,
      painVas: todayEntry.pain_vas,
      painLocations: todayEntry.pain_locations,
      illness: todayEntry.illness,
      stress: todayEntry.stress,
      comment: todayEntry.comment,
      sleepHours: todayEntry.sleep_hours,
      sleepQuality: todayEntry.sleep_quality,
      fatigue: todayEntry.fatigue,
      soreness: todayEntry.soreness,
      wearables: options.wearablesReport?.todayEntry
        ? {
            deviceType: options.wearablesReport.deviceType,
            hrvMetric: options.wearablesReport.hrvMetric,
            restingHrBpm: options.wearablesReport.todayEntry.resting_hr_bpm,
            hrvMs: options.wearablesReport.todayEntry.hrv_ms,
            sleepDurationMin: options.wearablesReport.todayEntry.sleep_duration_min,
            deviceScore: options.wearablesReport.todayEntry.device_score,
            deviceScoreName: options.wearablesReport.todayEntry.device_score_name,
            restingHrZScore: options.wearablesReport.todayRestingHrZScore,
            hrvZScore: options.wearablesReport.todayHrvZScore,
            baselineStatus: options.wearablesReport.status,
            disclaimer: options.wearablesReport.disclaimer,
          }
        : null,
    };
  }

  // 3. РЕЖИМ 1: «ЗБІР БАЗОВИХ ДАНИХ» (< 14 відповідей за останні 28 днів)
  if (totalDaysFilled < thresholds.baselineRequiredDays) {
    // Статус сірий, порівняння з нормою НЕ рахується
    return {
      ...baseResult,
      status: "gray",
      grayReason: "collecting_baseline",
      statusLabel: `Збір даних (${totalDaysFilled}/${thresholds.baselineRequiredDays})`,
      actionPrompt: `Триває збір базової норми (заповнено ${totalDaysFilled} з ${thresholds.baselineRequiredDays} днів)`,
    };
  }

  // 4. РЕЖИМ 2: ДОСТАТНЬО ДАНИХ (>= 14 відповідей)
  // Розрахунок особистої норми гравця за всіма записами за останні 28 днів (виключаючи сьогоднішній для чистоти або включно)
  const historicalComposites: number[] = [];
  dateMap.forEach((entry, date) => {
    // Для базової норми беремо всі наявні дні періоду
    historicalComposites.push(calculatePhysicalComposite(entry));
  });

  const mean = calculateMean(historicalComposites);
  const stdDev = calculateStdDev(historicalComposites, mean);
  const zScore = calculateZScore(todayComposite, mean, stdDev);

  baseResult.personalMean = mean;
  baseResult.personalStdDev = stdDev;
  baseResult.zScore = zScore;

  // 5. ПРАВИЛА ЧЕРВОНИХ ТА ЖОВТИХ ПРАПОРЦІВ
  const redReasons: string[] = [];
  const yellowReasons: string[] = [];
  const categories: Set<PhysicalFlagCategory> = new Set();

  // Правило 1: "Хворію" (illness === true) -> ЗАВЖДИ ЧЕРВОНИЙ
  if (todayEntry.illness) {
    redReasons.push("Гравець повідомив про хворобу / нездужання");
    if (visibility.showIllnessCategory) categories.add("нездужання");
  }

  // Правило 2: Біль із ВАШ
  if (todayEntry.pain) {
    const vas = todayEntry.pain_vas ?? 0;
    if (vas >= thresholds.painVasRedThreshold) {
      redReasons.push(`Високий рівень болю`);
      if (visibility.showPainCategory) categories.add("біль");
    } else if (vas >= thresholds.painVasYellowThreshold) {
      yellowReasons.push(`Помірний біль`);
      if (visibility.showPainCategory) categories.add("біль");
    }
  }

  // Правило 3: Різке погіршення відносно особистої норми (Z-score)
  if (zScore <= thresholds.zScoreRedThreshold) {
    redReasons.push("Різке падіння фізичного стану відносно особистої норми");
  } else if (zScore <= thresholds.zScoreYellowThreshold) {
    yellowReasons.push("Зниження фізичного стану нижче особистої норми");
  }

  // Правило 4: Окремі компоненти (сон, втома, крепатура)
  if (todayEntry.sleep_quality <= thresholds.singleScoreRedThreshold) {
    redReasons.push("Критично низька якість сну");
    if (visibility.showSleepCategory) categories.add("сон");
  } else if (todayEntry.sleep_quality <= thresholds.singleScoreYellowThreshold) {
    yellowReasons.push("Низька якість сну");
    if (visibility.showSleepCategory) categories.add("сон");
  }

  if (todayEntry.fatigue <= thresholds.singleScoreRedThreshold) {
    redReasons.push("Сильне виснаження");
    if (visibility.showFatigueCategory) categories.add("втома");
  } else if (todayEntry.fatigue <= thresholds.singleScoreYellowThreshold) {
    yellowReasons.push("Підвищена втома");
    if (visibility.showFatigueCategory) categories.add("втома");
  }

  if (todayEntry.soreness <= thresholds.singleScoreRedThreshold) {
    redReasons.push("Сильна крепатура або м'язовий біль");
    if (visibility.showPainCategory) categories.add("біль");
  } else if (todayEntry.soreness <= thresholds.singleScoreYellowThreshold) {
    yellowReasons.push("Відчутна крепатура");
    if (visibility.showPainCategory) categories.add("біль");
  }

  // Правило 5 (8.8): Wearable-дані як додатковий фізіологічний сигнал
  // Можуть вплинути на світлофор тільки як додатковий сигнал і ніколи не замінюють анкету
  if (options.wearablesReport && options.wearablesReport.status === "ready") {
    const hrvZ = options.wearablesReport.todayHrvZScore;
    const rhrZ = options.wearablesReport.todayRestingHrZScore;

    // Сильне падіння HRV (Z <= -2.0) або суттєвий стрибок пульсу спокою (Z >= 2.0)
    if (hrvZ !== null && hrvZ <= -2.0) {
      yellowReasons.push("Фізіологічний сигнал: значне падіння HRV нижче індивідуальної норми");
      if (visibility.showFatigueCategory) categories.add("втома");
    } else if (rhrZ !== null && rhrZ >= 2.0) {
      yellowReasons.push("Фізіологічний сигнал: підвищений пульс спокою вище індивідуальної норми");
      if (visibility.showFatigueCategory) categories.add("втома");
    }
  }

  baseResult.flagCategories = Array.from(categories);

  // 6. ВИЗНАЧЕННЯ ФІНАЛЬНОГО СТАТУСУ
  if (redReasons.length > 0) {
    baseResult.status = "red";
    baseResult.statusLabel = "Поговорити з гравцем / повідомити лікаря";
    baseResult.actionPrompt =
      "Рекомендується бесіда перед тренуванням та консультація лікаря";
    return baseResult;
  }

  if (yellowReasons.length > 0) {
    baseResult.status = "yellow";
    baseResult.statusLabel = "Потребує уваги";
    baseResult.actionPrompt =
      "Зверніть увагу під час розминки / можливе коригування навантаження";
    return baseResult;
  }

  // Якщо немає прапорців і показники стабільні
  baseResult.status = "green";
  baseResult.statusLabel = "Оптимально";
  baseResult.actionPrompt = "Готовий до планового навантаження";

  return baseResult;
}

/**
 * Допоміжна функція генерації 7-денного тренду для міні-графіка
 */
function generate7DayTrend(
  todayDate: string,
  dateMap: Map<string, WellnessEntry>
): ReadinessTrendPoint[] {
  const points: ReadinessTrendPoint[] = [];
  const baseDate = new Date(todayDate);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    const entry = dateMap.get(dateStr);
    if (!entry) {
      points.push({
        date: dateStr,
        compositeScore: null,
        status: "gray",
        label: "Пропуск",
        isAcknowledged: false,
        details: null,
      });
      continue;
    }

    const comp = calculatePhysicalComposite(entry);
    let st: ReadinessColor = "green";
    if (entry.illness || (entry.pain && (entry.pain_vas ?? 0) >= 5) || comp <= 6) {
      st = "red";
    } else if ((entry.pain && (entry.pain_vas ?? 0) >= 3) || comp <= 9) {
      st = "yellow";
    }

    points.push({
      date: dateStr,
      compositeScore: comp,
      status: st,
      label: `${comp}/15`,
      isAcknowledged: Boolean(entry.acknowledged || entry.reviewed_at),
      reviewedByRole: entry.reviewed_by_role || null,
      reviewedAt: entry.reviewed_at || null,
      details: {
        pain: entry.pain,
        painVas: entry.pain_vas,
        painLocations: entry.pain_locations,
        illness: entry.illness,
        stress: entry.stress,
        comment: entry.comment,
        sleepHours: entry.sleep_hours,
        sleepQuality: entry.sleep_quality,
        fatigue: entry.fatigue,
        soreness: entry.soreness,
      },
    });
  }

  return points;
}

/**
 * Розраховує відсоток заповнення за 7 та 28 днів
 */
export function calculateComplianceRates(
  todayDate: string,
  dateMap: Map<string, WellnessEntry>
): { compliance7: number; compliance28: number } {
  const baseDate = new Date(todayDate);

  let count7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (dateMap.has(dateStr)) {
      count7++;
    }
  }

  let count28 = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (dateMap.has(dateStr)) {
      count28++;
    }
  }

  return {
    compliance7: Math.round((count7 / 7) * 100),
    compliance28: Math.round((count28 / 28) * 100),
  };
}

/**
 * Розраховує серію заповнених днів поспіль (Streaks).
 * Нагороджує виключно за факт заповнення, не за бали!
 */
export function calculateStreakDays(
  todayDate: string,
  dateMap: Map<string, WellnessEntry>
): number {
  const baseDate = new Date(todayDate);
  let streak = 0;

  // Якщо сьогодні вже заповнено, починаємо відсьогодні
  // Якщо сьогодні ще ні, перевіряємо від учора, щоб серія не обривалася завчасно
  const hasToday = dateMap.has(todayDate);
  const startOffset = hasToday ? 0 : 1;

  for (let i = startOffset; i < 120; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (dateMap.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Детекція однакових відповідей N днів поспіль (за замовчуванням 7).
 * При збігу повертає прапорець для лікаря та м'яку підказку для гравця.
 * Не карає та не блокує.
 */
export function detectMonotonousAnswers(
  entries: WellnessEntry[],
  thresholdDays: number = 7
): {
  isMonotonous: boolean;
  consecutiveDays: number;
  messageForPlayer?: string | null;
} {
  if (entries.length < thresholdDays) {
    return { isMonotonous: false, consecutiveDays: 0, messageForPlayer: null };
  }

  // Сортуємо хронологічно від найстаріших до найновіших
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Беремо останній запис як еталон
  const latest = sorted[sorted.length - 1];
  let consecutiveSame = 0;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const cur = sorted[i];
    const isSame =
      cur.sleep_quality === latest.sleep_quality &&
      cur.fatigue === latest.fatigue &&
      cur.soreness === latest.soreness &&
      cur.stress === latest.stress &&
      cur.pain === latest.pain &&
      cur.illness === latest.illness;

    if (isSame) {
      consecutiveSame++;
    } else {
      break;
    }
  }

  if (consecutiveSame >= thresholdDays) {
    return {
      isMonotonous: true,
      consecutiveDays: consecutiveSame,
      messageForPlayer: "Все гаразд? Можна додати нотатку або обговорити з лікарем",
    };
  }

  return {
    isMonotonous: false,
    consecutiveDays: consecutiveSame,
    messageForPlayer: null,
  };
}

/**
 * Фільтрація для тренера: видаляє будь-які приватні та клінічні дані, якщо випадково передані.
 * ВИМОГА 8.5: Тренер бачить відсоток заповнення, але НЕ бачить метку монотонності (видно тільки doctor/admin)!
 */
export function sanitizeReadinessForCoach(
  result: PlayerReadinessResult
): PlayerReadinessResult {
  return {
    ...result,
    hasMonotony: false,
    monotonyDays: 0,
    monotonyPrompt: null,
    doctorDetails: null, // Тренер ніколи не бачить doctorDetails
    trendLast7Days: result.trendLast7Days.map((pt) => ({
      date: pt.date,
      compositeScore: pt.compositeScore,
      status: pt.status,
      label: pt.label,
    })),
  };
}
