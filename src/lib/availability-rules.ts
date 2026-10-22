import {
  type PreSeasonScreening,
  type ClearanceStatus,
  isScreeningValid,
} from "../types/screening.ts";
import type { RtpPhaseLog, RtpPhaseNumber } from "../types/rtp.ts";

// ─── 1. Константи та типи статусу доступності ─────────────────────────────────

export type AvailabilityStatus = "available" | "restricted" | "unavailable";
export type LegacyPlayerStatus = "ok" | "warn" | "danger";

export const AVAILABILITY_STATUS = {
  AVAILABLE: "available",
  RESTRICTED: "restricted",
  UNAVAILABLE: "unavailable",
} as const;

export const AVAILABILITY_RULES = {
  ACUTE_INJURY_STATUS: "unavailable" as AvailabilityStatus,
  RTP_PHASES_INDIVIDUAL: [1, 2, 3] as const, // Недоступний до групи / індивідуально
  RTP_PHASE_RESTRICTED: 4 as const,           // Обмежений з лімітом хвилин
  RTP_PHASE_FULL: 5 as const,                 // Повний допуск (за наявності скринінгу)
  DEFAULT_RESTRICTED_MAX_MINUTES: 45,
  DEFAULT_AVAILABLE_MAX_MINUTES: 90,
  DEFAULT_UNAVAILABLE_MAX_MINUTES: 0,
} as const;

export const STATUS_TO_LEGACY: Record<AvailabilityStatus, LegacyPlayerStatus> = {
  available: "ok",
  restricted: "warn",
  unavailable: "danger",
};

export const LEGACY_TO_STATUS: Record<LegacyPlayerStatus, AvailabilityStatus> = {
  ok: "available",
  warn: "restricted",
  danger: "unavailable",
};

export const AVAILABILITY_STATUS_LABELS: Record<
  AvailabilityStatus,
  {
    label: string;
    pluralLabel: string;
    badgeClass: string;
    accent: "green" | "amber" | "red";
  }
> = {
  available: {
    label: "Готовий",
    pluralLabel: "Готові",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    accent: "green",
  },
  restricted: {
    label: "Обмежений",
    pluralLabel: "Обмежені",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    accent: "amber",
  },
  unavailable: {
    label: "Недоступний (Лазарет)",
    pluralLabel: "Недоступні (Лазарет)",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    accent: "red",
  },
};

// ─── 2. Структура даних гравця та звіту ───────────────────────────────────────

export interface PlayerAvailabilityItem {
  id: string;
  first_name: string;
  last_name: string;
  fullName: string;
  position: string;
  team_id?: string;
  team_name?: string;
  team_category?: "youth" | "academy";
  date_of_birth?: string | null;
  status: AvailabilityStatus;
  legacyStatus: LegacyPlayerStatus;
  max_minutes: number;
  restriction_notes: string;
  injury_summary: string;
  openInjuriesCount: number;
  worstRtpPhase: number | null;
  hasValidScreening: boolean;
  screeningStatus: ClearanceStatus | "missing";
  screeningDate: string | null;
  screeningValidUntil: string | null;
  injuries: Array<{
    id: string;
    status: string;
    injury_type?: string;
    location?: string;
    vas_score?: number | null;
    date_of_injury?: string;
    expected_return_date?: string | null;
    rtp_phase?: number | null;
  }>;
}

export interface AvailabilitySummary {
  total: number;
  available: number;
  restricted: number;
  unavailable: number;
}

export interface TeamAvailabilitySummary extends AvailabilitySummary {
  teamId: string;
  teamName: string;
  category?: "youth" | "academy";
  players: PlayerAvailabilityItem[];
}

export interface ClubAvailabilityReport {
  date: string;
  summary: AvailabilitySummary;
  byTeam: Record<string, TeamAvailabilitySummary>;
  players: PlayerAvailabilityItem[];
}

// ─── 3. Чиста функція розрахунку доступності одного гравця ─────────────────────

export interface RawPlayerInput {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  team_id?: string;
  date_of_birth?: string | null;
  archived_at?: string | null;
  teams?: {
    id?: string;
    name?: string;
    category?: "youth" | "academy";
    sort_order?: number;
  } | null;
  team_name?: string;
  team_category?: "youth" | "academy";
  injuries?: Array<{
    id: string;
    status: string;
    injury_type?: string;
    location?: string;
    vas_score?: number | null;
    date_of_injury?: string;
    expected_return_date?: string | null;
    description?: string | null;
  }>;
  screening?: PreSeasonScreening | null;
}

export interface CalculationOptions {
  date?: string | Date;
  rtpLogsByInjury?: Record<string, Partial<RtpPhaseLog> | { phase: number; max_minutes?: number }>;
}

export function calculatePlayerAvailability(
  player: RawPlayerInput,
  options: CalculationOptions = {}
): PlayerAvailabilityItem {
  const targetDate = options.date ? new Date(options.date) : new Date();
  const rtpLogs = options.rtpLogsByInjury || {};

  // Фільтруємо лише відкриті травми (active або rehabilitation)
  const openInjuries = (player.injuries || []).filter(
    (inj) => inj.status === "active" || inj.status === "rehabilitation"
  );

  // Оцінюємо скринінг
  const screening = player.screening || null;
  const validScreening = isScreeningValid(screening, targetDate);
  const screeningStatus: ClearanceStatus | "missing" = screening?.overall_status || "missing";

  const enrichedInjuries = openInjuries.map((inj) => {
    const rtp = rtpLogs[inj.id];
    let phase: number | null = null;
    if (inj.status === "rehabilitation") {
      phase = rtp?.phase ?? 1; // За замовчуванням при реабілітації стартова фаза 1
    }
    return {
      ...inj,
      rtp_phase: phase,
    };
  });

  // Правила (в константах):
  // 1. Острая фаза травмы -> «недоступний» (0 хв)
  // 2. RTP фазы 1-3 -> «недоступний / індивідуально» (0 хв)
  // 3. Фаза 4 -> «обмежений» с лимитом минут (за замовчуванням 45 хв або з RTP)
  // 4. Фаза 5 и нет открытых травм -> «готовий», при действующем скрининге
  // 5. Несколько травм у игрока -> по худшему статусу (unavailable > restricted > available)

  let worstStatus: AvailabilityStatus = "available";
  let maxMinutes = AVAILABILITY_RULES.DEFAULT_AVAILABLE_MAX_MINUTES;
  const restrictionNotesList: string[] = [];
  const injurySummariesList: string[] = [];
  let worstRtpPhase: number | null = null;

  // Оцінюємо травми
  for (const inj of enrichedInjuries) {
    if (inj.status === "active") {
      // Правило 1: Гостра фаза
      worstStatus = "unavailable";
      maxMinutes = AVAILABILITY_RULES.DEFAULT_UNAVAILABLE_MAX_MINUTES;
      restrictionNotesList.push("Гостра фаза травми: повний спокій / лазарет. Не допущений до тренувань.");
      injurySummariesList.push("Лазарет / гостра травма");
    } else if (inj.status === "rehabilitation") {
      const phase = (inj.rtp_phase ?? 1) as RtpPhaseNumber;
      if (worstRtpPhase === null || phase < worstRtpPhase) {
        worstRtpPhase = phase;
      }

      if (phase >= 1 && phase <= 3) {
        // Правило 2: RTP фази 1-3
        worstStatus = "unavailable";
        maxMinutes = AVAILABILITY_RULES.DEFAULT_UNAVAILABLE_MAX_MINUTES;
        const phaseTitle = phase === 1 ? "Зал / Клініка" : phase === 2 ? "Лінійний біг" : "Індивідуальна робота з м'ячем";
        restrictionNotesList.push(`RTP Фаза ${phase} (${phaseTitle}): індивідуальна реабілітація. Не допущений до загальної групи.`);
        injurySummariesList.push(`RTP Фаза ${phase} (індивідуально)`);
      } else if (phase === 4) {
        // Правило 3: Фаза 4
        if (worstStatus !== "unavailable") {
          worstStatus = "restricted";
          const rtpLog = rtpLogs[inj.id];
          const phaseMinutes = (rtpLog as any)?.max_minutes || AVAILABILITY_RULES.DEFAULT_RESTRICTED_MAX_MINUTES;
          maxMinutes = Math.min(maxMinutes, phaseMinutes);
        }
        restrictionNotesList.push(`RTP Фаза 4 (Група з обмеженнями): жовтий жилет, ліміт до ${maxMinutes} хв.`);
        injurySummariesList.push(`RTP Фаза 4 (до ${maxMinutes} хв)`);
      } else if (phase === 5) {
        // Фаза 5: завершення RTP
        injurySummariesList.push("RTP Фаза 5 (допущений за протоколом)");
      }
    }
  }

  // Правило 4: Перевірка діючого скринінгу для фінального «готовий»
  if (worstStatus === "available") {
    if (!validScreening) {
      if (screeningStatus === "disqualified") {
        worstStatus = "unavailable";
        maxMinutes = AVAILABILITY_RULES.DEFAULT_UNAVAILABLE_MAX_MINUTES;
        restrictionNotesList.push("Медичне відсторонення за результатами передсезонного скринінгу.");
        injurySummariesList.push("Відсторонений (скринінг)");
      } else if (screeningStatus === "provisional") {
        worstStatus = "restricted";
        maxMinutes = AVAILABILITY_RULES.DEFAULT_RESTRICTED_MAX_MINUTES;
        restrictionNotesList.push("Умовний допуск за скринінгом: потребує додаткового медичного контролю.");
        injurySummariesList.push("Умовний допуск (скринінг)");
      } else {
        worstStatus = "unavailable";
        maxMinutes = AVAILABILITY_RULES.DEFAULT_UNAVAILABLE_MAX_MINUTES;
        restrictionNotesList.push("Відсутній або прострочений щорічний медичний скринінг. Не допущений до змагань.");
        injurySummariesList.push("Без діючого скринінгу");
      }
    } else {
      restrictionNotesList.push("Повний допуск до тренувань та матчів без обмежень.");
      injurySummariesList.push("Повний допуск");
    }
  } else if (worstStatus === "restricted" && (!validScreening && screeningStatus === "disqualified")) {
    worstStatus = "unavailable";
    maxMinutes = AVAILABILITY_RULES.DEFAULT_UNAVAILABLE_MAX_MINUTES;
    restrictionNotesList.push("Медичне відсторонення за скринінгом.");
  }

  const teamName = player.teams?.name || player.team_name || "—";
  const teamCategory = player.teams?.category || player.team_category || "academy";

  return {
    id: player.id,
    first_name: player.first_name,
    last_name: player.last_name,
    fullName: `${player.last_name} ${player.first_name}`.trim(),
    position: player.position,
    team_id: player.team_id || player.teams?.id,
    team_name: teamName,
    team_category: teamCategory,
    date_of_birth: player.date_of_birth,
    status: worstStatus,
    legacyStatus: STATUS_TO_LEGACY[worstStatus],
    max_minutes: maxMinutes,
    restriction_notes: restrictionNotesList.join(" • ") || "Повний допуск без обмежень",
    injury_summary: injurySummariesList.join(" | ") || "Повний допуск",
    openInjuriesCount: enrichedInjuries.length,
    worstRtpPhase,
    hasValidScreening: validScreening,
    screeningStatus,
    screeningDate: screening?.date || null,
    screeningValidUntil: screening?.valid_until || null,
    injuries: enrichedInjuries,
  };
}
