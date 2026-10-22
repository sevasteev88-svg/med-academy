/**
 * Порогові значення та налаштування ранкового світлофора готовності гравців (8.4)
 */

export interface ReadinessThresholds {
  baselineRequiredDays: number; // Мінімум відповідей за 28 днів для розрахунку норми (за замовчуванням 14)
  baselineWindowDays: number; // Вікно збору базової норми в днях (за замовчуванням 28)
  painVasRedThreshold: number; // Поріг болю ВАШ для червоного прапорця (за замовчуванням >= 5)
  painVasYellowThreshold: number; // Поріг болю ВАШ для жовтого прапорця (за замовчуванням >= 3)
  zScoreRedThreshold: number; // Відхилення Z-score від особистої норми для червоного прапорця (за замовчуванням <= -1.5)
  zScoreYellowThreshold: number; // Відхилення Z-score для жовтого прапорця (за замовчуванням <= -1.0)
  singleScoreRedThreshold: number; // Одиночна оцінка сну/втоми/крепатури для червоного (за замовчуванням <= 1)
  singleScoreYellowThreshold: number; // Одиночна оцінка для жовтого (за замовчуванням <= 2)
  monotonyThresholdDays: number; // Поріг абсолютно однакових відповідей поспіль (за замовчуванням 7)
}

export interface CoachCategoryVisibility {
  showPainCategory: boolean; // Показувати категорію "біль"
  showFatigueCategory: boolean; // Показувати категорію "втома"
  showSleepCategory: boolean; // Показувати категорію "сон"
  showIllnessCategory: boolean; // Показувати категорію "нездужання"
}

export interface MorningReminderConfig {
  enabled: boolean;
  time: string; // "08:30"
  channel: "push" | "telegram" | "both";
  lastSentDate?: string | null;
}

export type ThresholdApprovalStatus = "draft" | "approved";

export interface ClubReadinessConfig {
  status: ThresholdApprovalStatus;
  statusLabel: string;
  approvedByDoctorName?: string | null;
  approvedByDoctorId?: string | null;
  approvedAt?: string | null;
  thresholds: ReadinessThresholds;
  visibility: CoachCategoryVisibility;
  morningReminder: MorningReminderConfig;
  wearablesAiScreenshotEnabled?: boolean; // 8.8 ШІ-розпізнавання скріншотів годинника (за замовчуванням вимкнено)
}

export const DRAFT_STATUS_LABEL = "ЧЕРНЕТКА, потребує затвердження лікарем";
export const APPROVED_STATUS_LABEL = "Затверджено лікарем";

export const DEFAULT_MORNING_REMINDER_CONFIG: MorningReminderConfig = {
  enabled: true,
  time: "08:30",
  channel: "push",
  lastSentDate: null,
};

export const DEFAULT_READINESS_THRESHOLDS: ReadinessThresholds = {
  baselineRequiredDays: 14,
  baselineWindowDays: 28,
  painVasRedThreshold: 5,
  painVasYellowThreshold: 3,
  zScoreRedThreshold: -1.5,
  zScoreYellowThreshold: -1.0,
  singleScoreRedThreshold: 1,
  singleScoreYellowThreshold: 2,
  monotonyThresholdDays: 7,
};

export const DEFAULT_COACH_CATEGORY_VISIBILITY: CoachCategoryVisibility = {
  showPainCategory: true,
  showFatigueCategory: true,
  showSleepCategory: true,
  showIllnessCategory: true,
};

export const DEFAULT_CLUB_READINESS_CONFIG: ClubReadinessConfig = {
  status: "draft",
  statusLabel: DRAFT_STATUS_LABEL,
  approvedByDoctorName: null,
  approvedByDoctorId: null,
  approvedAt: null,
  thresholds: { ...DEFAULT_READINESS_THRESHOLDS },
  visibility: { ...DEFAULT_COACH_CATEGORY_VISIBILITY },
  morningReminder: { ...DEFAULT_MORNING_REMINDER_CONFIG },
  wearablesAiScreenshotEnabled: false,
};

export const READINESS_DISCLAIMER_TEXT =
  "Підказка для рішення. Рішення про навантаження приймає тренер разом з лікарем";
