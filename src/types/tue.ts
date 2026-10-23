/**
 * tue.ts — Типи та константи процесу TUE (Therapeutic Use Exemption — НАДЦ / WADA)
 */

export type TueStatus =
  | "підготовка"
  | "подано"
  | "схвалено"
  | "відхилено"
  | "закінчився";

export const TUE_STATUSES: TueStatus[] = [
  "підготовка",
  "подано",
  "схвалено",
  "відхилено",
  "закінчився",
];

export const TUE_STATUS_DETAILS: Record<
  TueStatus,
  { label: string; badgeClass: string; color: "slate" | "sky" | "green" | "red" | "amber" }
> = {
  підготовка: {
    label: "Підготовка документів",
    badgeClass: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    color: "slate",
  },
  подано: {
    label: "Подано до НАДЦ/WADA",
    badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    color: "sky",
  },
  схвалено: {
    label: "Схвалено (Діє TUE)",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    color: "green",
  },
  відхилено: {
    label: "Відхилено",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    color: "red",
  },
  закінчився: {
    label: "Закінчився термін",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    color: "amber",
  },
};

export type TueCase = {
  id: string;
  club_id: string;
  player_id: string;
  substance: string;
  wada_class: string;
  reason: string; // діагноз або медичне показання
  status: TueStatus;
  submitted_at: string | null; // YYYY-MM-DD
  valid_until: string | null; // YYYY-MM-DD
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateTueCaseInput = {
  player_id: string;
  substance: string;
  wada_class?: string;
  reason: string;
  status?: TueStatus;
  submitted_at?: string | null;
  valid_until?: string | null;
  document_url?: string | null;
  notes?: string | null;
};

export type TueStatusEvaluation = {
  effectiveStatus: TueStatus;
  daysRemaining: number | null;
  isExpiringSoon: boolean; // менше або дорівнює 30 днів
  isExpired: boolean;
  alertText: string | null;
  badgeClass: string;
};

/**
 * Розрахунок актуального статусу TUE та тригера оповіщення за 30 днів до закінчення
 */
export function evaluateTueExpiry(
  tue: { status: TueStatus; valid_until: string | null },
  currentDate = new Date()
): TueStatusEvaluation {
  if (tue.status !== "схвалено" || !tue.valid_until) {
    const details = TUE_STATUS_DETAILS[tue.status] || TUE_STATUS_DETAILS.підготовка;
    return {
      effectiveStatus: tue.status,
      daysRemaining: null,
      isExpiringSoon: false,
      isExpired: tue.status === "закінчився",
      alertText: null,
      badgeClass: details.badgeClass,
    };
  }

  const validUntilDate = new Date(tue.valid_until);
  const diffTime = validUntilDate.getTime() - currentDate.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) {
    return {
      effectiveStatus: "закінчився",
      daysRemaining: 0,
      isExpiringSoon: false,
      isExpired: true,
      alertText: `Термін дії TUE закінчився (${tue.valid_until}). Гравець не має права приймати препарат!`,
      badgeClass: TUE_STATUS_DETAILS.закінчився.badgeClass,
    };
  }

  if (daysRemaining <= 30) {
    return {
      effectiveStatus: "схвалено",
      daysRemaining,
      isExpiringSoon: true,
      isExpired: false,
      alertText: `Увага: TUE діє ще ${daysRemaining} дн. (до ${tue.valid_until}). Необхідно завчасно подати запит на продовження до НАДЦ!`,
      badgeClass: "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse",
    };
  }

  return {
    effectiveStatus: "схвалено",
    daysRemaining,
    isExpiringSoon: false,
    isExpired: false,
    alertText: null,
    badgeClass: TUE_STATUS_DETAILS.схвалено.badgeClass,
  };
}
