import type { Consent, ConsentDocument, ConsentScope } from "./database";
import type { AvailabilityStatus } from "@/lib/availability-rules";
import type { GrowthPhase } from "@/lib/phv-calculator";
import type { SubscriptionStatus } from "./billing";

export type ParentMessageCategory =
  | "illness"
  | "home_injury"
  | "absence"
  | "question"
  | "lfk_done";

export const PARENT_MESSAGE_CATEGORY_META: Record<
  ParentMessageCategory,
  { label: string; icon: string; placeholder: string }
> = {
  illness: {
    label: "Самопочуття / Хвороба вдома",
    icon: "🤒",
    placeholder: "Напр.: Вчора ввечері піднялась температура 37.6, сьогодні пропускає тренування.",
  },
  home_injury: {
    label: "Травма поза клубом",
    icon: "🩹",
    placeholder: "Напр.: Підвернув гомілкостоп у школі на фізкультурі, є легкий набряк.",
  },
  absence: {
    label: "Повідомити про пропуск",
    icon: "📅",
    placeholder: "Напр.: Будемо відсутні у вівторок через сімейні обставини.",
  },
  lfk_done: {
    label: "Домашнє ЛФК виконано",
    icon: "✅",
    placeholder: "Напр.: Виконали весь комплекс вправ після обіду, болю не було.",
  },
  question: {
    label: "Запитання лікарю клубу",
    icon: "💬",
    placeholder: "Напр.: Чи можна вже повертатися до бігових вправ цього тижня?",
  },
};

export interface ParentPortalTokenInfo {
  id: string;
  label: string;
  is_active: boolean;
  first_opened_at: string | null;
  last_opened_at: string | null;
  created_at: string;
}

export interface ParentMessageRecord {
  id: string;
  player_id: string;
  category: ParentMessageCategory;
  message: string;
  is_read_by_staff: boolean;
  is_read_by_coach?: boolean;
  created_at: string;
}

export const COACH_MASKED_MEDICAL_ALERT_TEXT =
  "Батьки повідомили про нездужання / домашню травму — очікує огляду лікаря";

export type CoachVisibleParentMessageCategory = Exclude<ParentMessageCategory, "question">;

export interface CoachParentAlertItem {
  id: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string;
  category: CoachVisibleParentMessageCategory;
  displayText: string;
  isMasked: boolean;
  createdAt: string;
}

/**
 * Безпечне маскування повідомлень батьків для тренера із захистом лікарської таємниці:
 * - question -> null (тренеру не повертається взагалі)
 * - illness / home_injury -> знеособлений текст без діагнозів та меддеталей
 * - absence / lfk_done -> оригінальний текст повідомлення
 */
export function maskParentMessageForCoach(
  category: ParentMessageCategory,
  message: string
): {
  visible: boolean;
  category?: CoachVisibleParentMessageCategory;
  displayText?: string;
  isMasked?: boolean;
} {
  if (category === "question") {
    return { visible: false };
  }
  if (category === "illness" || category === "home_injury") {
    return {
      visible: true,
      category,
      displayText: COACH_MASKED_MEDICAL_ALERT_TEXT,
      isMasked: true,
    };
  }
  return {
    visible: true,
    category,
    displayText: message,
    isMasked: false,
  };
}

/**
 * Перевірка вікового обмеження для ранкового самопочуття від батьків (< 14 років).
 */
export function isParentWellnessAllowedForAge(age: number): boolean {
  return Number.isFinite(age) && age < 14;
}

export interface ParentRehabExerciseItem {
  name: string;
  setsReps: string;
  frequency: string;
  notes?: string;
}

export interface ParentPortalData {
  tokenId: string;
  tokenLabel: string;
  isFirstVisit: boolean;
  needsOnboardingConsents: boolean;
  clubName: string;
  player: {
    id: string;
    firstName: string;
    lastName: string;
    age: number;
    isMinor: boolean;
    isTeenAssentApplicable: boolean;
    teamName: string;
  };
  clearance: {
    status: AvailabilityStatus;
    title: string;
    description: string;
    restrictionsNotes: string | null;
    screeningValidUntil: string | null;
    screeningExpired: boolean;
  };
  concussionCare: {
    isActive: boolean;
    stageNumber: number | null;
    stageTitle: string | null;
    activities: string | null;
  };
  rehab: {
    activeInjuryLabel: string | null;
    rtpPhaseLabel: string | null;
    exercises: ParentRehabExerciseItem[];
  };
  growth: {
    phase: GrowthPhase | null;
    title: string | null;
    advice: string | null;
  };
  pediatricSummary: {
    bloodType: string | null;
    allergies: string[];
    chronicConditions: string[];
  };
  consents: {
    documents: Record<ConsentScope, ConsentDocument>;
    latestByScope: Record<string, Consent>;
    missingScopes: ConsentScope[];
  };
  messages: ParentMessageRecord[];
  wellnessToday?: {
    isUnder14: boolean;
    alreadySubmitted: boolean;
    date: string;
    submittedAt?: string | null;
  };
  subscription: {
    isActive: boolean;
    status: SubscriptionStatus;
    amountUah: number;
    currentPeriodEnd?: string | null;
    gracePeriodEndsAt?: string | null;
  };
}
