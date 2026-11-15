import type { Consent, ConsentDocument, ConsentScope } from "./database";
import type { AvailabilityStatus } from "@/lib/availability-rules";
import type { GrowthPhase } from "@/lib/phv-calculator";

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
  created_at: string;
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
}
