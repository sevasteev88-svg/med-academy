/**
 * exposure-calculator.ts
 *
 * Модуль розрахунку експозиції та захворюваності (травматизму) на 1000 годин
 * згідно зі стандартами спортивної медицини та епідеміології (UEFA / IOC).
 *
 * Формула:
 *   Людино-години = (хвилини * кількість гравців) / 60
 *   Інцидентність (на 1000 год) = (травми / Людино-години) * 1000
 *
 * Окремо рахується для тренувань ('training') та матчів ('match').
 * Якщо експозиція = 0 або дані відсутні -> «Недостатньо даних про експозицію».
 */

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
  activity_type?: "training" | "match" | "other" | string | null;
  mechanism?: string | null;
}

export interface ExposurePeriodFilter {
  teamId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ExposureMetricsResult {
  totalExposureHours: number;
  trainingExposureHours: number;
  matchExposureHours: number;
  totalInjuries: number;
  trainingInjuries: number;
  matchInjuries: number;
  overallIncidence: number | null;
  trainingIncidence: number | null;
  matchIncidence: number | null;
  hasSufficientData: boolean;
  displayLabel: string;
  trainingDisplayLabel: string;
  matchDisplayLabel: string;
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

  // 4. Підсумок травм за категоріями
  let trainingInjuries = 0;
  let matchInjuries = 0;

  for (const inj of filteredInjuries) {
    const act = inj.activity_type;
    if (act === "match") {
      matchInjuries++;
    } else {
      // За замовчуванням або якщо явно training/інше
      trainingInjuries++;
    }
  }

  const totalInjuries = filteredInjuries.length;

  // 5. Розрахунок інцидентності
  const overallIncidence = calculateIncidenceRate(totalInjuries, totalExposureHours);
  const trainingIncidence = calculateIncidenceRate(trainingInjuries, trainingExposureHours);
  const matchIncidence = calculateIncidenceRate(matchInjuries, matchExposureHours);

  const hasSufficientData = totalExposureHours > 0;

  return {
    totalExposureHours,
    trainingExposureHours,
    matchExposureHours,
    totalInjuries,
    trainingInjuries,
    matchInjuries,
    overallIncidence,
    trainingIncidence,
    matchIncidence,
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
