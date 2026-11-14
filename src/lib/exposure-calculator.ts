/**
 * exposure-calculator.ts
 *
 * Модуль розрахунку експозиції та захворюваності (травматизму) на 1000 годин
 * згідно зі стандартами спортивної медицини та епідеміології (UEFA / IOC).
 *
 * Формула:
 *   Людино-години = (хвилини * кількість гравців) / 60
 *   Інцидентність (на 1000 год) = (травми / Людино-години) * 1000
 *   Тягар травм (Injury Burden) = (дні простою / Людино-години) * 1000
 *
 * Окремо рахується для тренувань ('training') та матчів ('match').
 * Якщо експозиція = 0 або дані відсутні -> «Недостатньо даних про експозицію».
 */

import { calculateTimeLossDays } from "./uefa-severity.ts";

export const INSUFFICIENT_EXPOSURE_DATA_MSG = "Недостатньо даних про експозицію";

export interface RawExposureItem {
  id?: string;
  team_id?: string | null;
  date: string;
  type?: "training" | "match" | string;
  exposure_type?: string;
  minutes: number;
  players_count?: number;
}

export interface RawInjuryItem {
  id?: string;
  team_id?: string | null;
  teamId?: string | null;
  date_of_injury?: string;
  dateOfInjury?: string;
  actual_return_date?: string | null;
  actualReturnDate?: string | null;
  expected_return_date?: string | null;
  expectedReturnDate?: string | null;
  status?: string | null;
  time_loss_days?: number | null;
  timeLossDays?: number | null;
  activity_type?: "training" | "match" | "other" | string | null;
  mechanism?: string | null;
}

export interface ExposurePeriodFilter {
  teamId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  referenceDate?: Date;
}

export interface ExposureMetricsResult {
  totalExposureHours: number;
  trainingExposureHours: number;
  matchExposureHours: number;
  totalInjuries: number;
  trainingInjuries: number;
  matchInjuries: number;
  totalTimeLossDays: number;
  trainingTimeLossDays: number;
  matchTimeLossDays: number;
  overallIncidence: number | null;
  trainingIncidence: number | null;
  matchIncidence: number | null;
  overallBurden: number | null;
  trainingBurden: number | null;
  matchBurden: number | null;
  hasSufficientData: boolean;
  displayLabel: string;
  trainingDisplayLabel: string;
  matchDisplayLabel: string;
  burdenDisplayLabel: string;
  trainingBurdenDisplayLabel: string;
  matchBurdenDisplayLabel: string;
}

/**
 * Розрахунок людино-годин однієї сесії: (хвилини * гравці) / 60
 */
export function calculateExposureHours(minutes: number, playersCount: number = 1): number {
  if (!minutes || minutes <= 0 || !playersCount || playersCount <= 0) {
    return 0;
  }
  return (minutes * playersCount) / 60;
}

/**
 * Розрахунок захворюваності / частоти травм на 1000 годин
 * (травми / години) * 1000
 */
export function calculateIncidenceRate(injuriesCount: number, exposureHours: number): number | null {
  if (!exposureHours || exposureHours <= 0) {
    return null;
  }
  const rate = (injuriesCount / exposureHours) * 1000;
  return Math.round(rate * 10) / 10;
}

/**
 * Форматування значення інцидентності для UI
 */
export function formatIncidenceRate(
  rate: number | null,
  fallback: string = INSUFFICIENT_EXPOSURE_DATA_MSG
): string {
  if (rate == null) return fallback;
  return `${rate.toFixed(1)}`;
}

/**
 * Розрахунок тягаря травм (Injury Burden) на 1000 годин
 * (дні простою / години) * 1000
 */
export function calculateInjuryBurden(timeLossDays: number, exposureHours: number): number | null {
  if (!exposureHours || exposureHours <= 0) {
    return null;
  }
  const safeDays = Math.max(0, timeLossDays || 0);
  const burden = (safeDays / exposureHours) * 1000;
  return Math.round(burden * 10) / 10;
}

/**
 * Форматування значення Injury Burden для UI
 */
export function formatInjuryBurden(
  burden: number | null,
  fallback: string = INSUFFICIENT_EXPOSURE_DATA_MSG
): string {
  if (burden == null) return fallback;
  return `${burden.toFixed(1)}`;
}

function resolveInjuryTimeLossDays(inj: RawInjuryItem, referenceDate: Date): number {
  const explicitDays = inj.time_loss_days ?? inj.timeLossDays;
  if (typeof explicitDays === "number" && Number.isFinite(explicitDays)) {
    return Math.max(0, Math.round(explicitDays));
  }

  const dateOfInjury = inj.date_of_injury ?? inj.dateOfInjury;
  if (!dateOfInjury) return 0;

  const actualReturn = inj.actual_return_date ?? inj.actualReturnDate;
  const expectedReturn = inj.expected_return_date ?? inj.expectedReturnDate;
  const effectiveReturn =
    actualReturn ?? (inj.status === "closed" && expectedReturn ? expectedReturn : null);

  return calculateTimeLossDays(dateOfInjury, effectiveReturn, referenceDate);
}

/**
 * Повний зведений розрахунок метрик експозиції та інцидентності
 * по команді та періоду для тренувань і матчів
 */
export function calculateExposureMetrics(
  exposures: RawExposureItem[] = [],
  injuries: RawInjuryItem[] = [],
  filter?: ExposurePeriodFilter
): ExposureMetricsResult {
  const teamId = filter?.teamId;
  const startDate = filter?.startDate;
  const endDate = filter?.endDate;

  // 1. Фільтрація експозицій
  const filteredExposures = exposures.filter((exp) => {
    if (teamId && exp.team_id && exp.team_id !== teamId) return false;
    if (startDate && exp.date < startDate) return false;
    if (endDate && exp.date > endDate) return false;
    return true;
  });

  // 2. Фільтрація травм
  const filteredInjuries = injuries.filter((inj) => {
    const injTeamId = inj.team_id ?? inj.teamId;
    if (teamId && injTeamId && injTeamId !== teamId) return false;
    const injDate = inj.date_of_injury ?? inj.dateOfInjury;
    if (startDate && injDate && injDate < startDate) return false;
    if (endDate && injDate && injDate > endDate) return false;
    return true;
  });

  // 3. Підсумок експозиції за категоріями
  let trainingExposureHours = 0;
  let matchExposureHours = 0;

  for (const exp of filteredExposures) {
    const pCount = exp.players_count ?? 1;
    const hrs = calculateExposureHours(exp.minutes, pCount);
    const sessionType = exp.type === "match" || exp.exposure_type === "match" ? "match" : "training";

    if (sessionType === "match") {
      matchExposureHours += hrs;
    } else {
      trainingExposureHours += hrs;
    }
  }

  const totalExposureHours = Math.round((trainingExposureHours + matchExposureHours) * 100) / 100;
  trainingExposureHours = Math.round(trainingExposureHours * 100) / 100;
  matchExposureHours = Math.round(matchExposureHours * 100) / 100;

  // 4. Підсумок травм та днів простою за категоріями
  const referenceDate = filter?.referenceDate ?? new Date();
  let trainingInjuries = 0;
  let matchInjuries = 0;
  let trainingTimeLossDays = 0;
  let matchTimeLossDays = 0;

  for (const inj of filteredInjuries) {
    const act = inj.activity_type;
    const lossDays = resolveInjuryTimeLossDays(inj, referenceDate);
    if (act === "match") {
      matchInjuries++;
      matchTimeLossDays += lossDays;
    } else {
      // За замовчуванням або якщо явно training/інше
      trainingInjuries++;
      trainingTimeLossDays += lossDays;
    }
  }

  const totalInjuries = filteredInjuries.length;
  const totalTimeLossDays = trainingTimeLossDays + matchTimeLossDays;

  // 5. Розрахунок інцидентності та Injury Burden
  const overallIncidence = calculateIncidenceRate(totalInjuries, totalExposureHours);
  const trainingIncidence = calculateIncidenceRate(trainingInjuries, trainingExposureHours);
  const matchIncidence = calculateIncidenceRate(matchInjuries, matchExposureHours);

  const overallBurden = calculateInjuryBurden(totalTimeLossDays, totalExposureHours);
  const trainingBurden = calculateInjuryBurden(trainingTimeLossDays, trainingExposureHours);
  const matchBurden = calculateInjuryBurden(matchTimeLossDays, matchExposureHours);

  const hasSufficientData = totalExposureHours > 0;

  return {
    totalExposureHours,
    trainingExposureHours,
    matchExposureHours,
    totalInjuries,
    trainingInjuries,
    matchInjuries,
    totalTimeLossDays,
    trainingTimeLossDays,
    matchTimeLossDays,
    overallIncidence,
    trainingIncidence,
    matchIncidence,
    overallBurden,
    trainingBurden,
    matchBurden,
    hasSufficientData,
    displayLabel: hasSufficientData && overallIncidence != null
      ? `${overallIncidence.toFixed(1)} / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
    trainingDisplayLabel: trainingExposureHours > 0 && trainingIncidence != null
      ? `${trainingIncidence.toFixed(1)} / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
    matchDisplayLabel: matchExposureHours > 0 && matchIncidence != null
      ? `${matchIncidence.toFixed(1)} / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
    burdenDisplayLabel: hasSufficientData && overallBurden != null
      ? `${overallBurden.toFixed(1)} дн. / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
    trainingBurdenDisplayLabel: trainingExposureHours > 0 && trainingBurden != null
      ? `${trainingBurden.toFixed(1)} дн. / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
    matchBurdenDisplayLabel: matchExposureHours > 0 && matchBurden != null
      ? `${matchBurden.toFixed(1)} дн. / 1000 год`
      : INSUFFICIENT_EXPOSURE_DATA_MSG,
  };
}

/**
 * Розрахунок статистики експозиції для кожної команди окремо
 */
export function calculateTeamExposureBreakdown(
  teams: { id: string; name: string }[],
  exposures: RawExposureItem[] = [],
  injuries: RawInjuryItem[] = [],
  periodFilter?: { startDate?: string | null; endDate?: string | null }
) {
  return teams.map((team) => {
    const metrics = calculateExposureMetrics(exposures, injuries, {
      teamId: team.id,
      startDate: periodFilter?.startDate,
      endDate: periodFilter?.endDate,
    });

    return {
      teamId: team.id,
      teamName: team.name,
      ...metrics,
    };
  });
}
