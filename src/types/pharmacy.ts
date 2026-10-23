export type TreatmentCategory = "physiotherapy" | "injection" | "medication" | "taping";

export type WadaStatus = "allowed" | "prohibited_in_competition" | "prohibited_always" | "requires_tue";

export type MedicalTreatmentEntry = {
  id: string;
  log_id?: string; // id запису в injury_logs (для відкату/видалення)
  injury_id?: string | null;
  player_id: string;
  player_name?: string;
  team_name?: string;
  date: string;
  category: TreatmentCategory;
  title: string;
  dosage_or_params?: string | null;
  duration_days?: number | null;
  duration_note?: string | null;
  reason?: string | null;
  doctor_name: string;
  wada_status: WadaStatus;
  doctor_wada_confirmed?: boolean;
  doctor_confirmation_note?: string | null;
  notes?: string | null;
  created_at: string;
  pharmacy_item_id?: string | null;
  units_deducted?: number | null;
};

export type PharmacyCategory =
  | "injections"
  | "nsaid_painkillers"
  | "tapes_bandages"
  | "vitamins_supplements"
  | "emergency_antiseptics"
  | "creams_gels";

export interface PharmacyItem {
  id: string;
  name: string;
  active_substance?: string;
  category: PharmacyCategory;
  stock_count: number;
  unit: string; // "ампул", "табл.", "рулонів", "тюбиків", "флаконів"
  min_alert_threshold: number;
  expiry_date: string; // YYYY-MM-DD
  wada_status: WadaStatus;
  storage_location?: string; // "Медкабінет база", "Виїзна валіза 1"
  notes?: string;

  // Нові поля безпеки (3.3 Аптека)
  min_age?: number | null; // Мінімальний вік гравця (років)
  age_note?: string; // Вікове застереження / особливості застосування у юніорів
  requires_review?: boolean; // Потребує повторного огляду / ревізії лікарем
  wada_source_note?: string; // Пункт офіційного списку WADA / нормативне джерело
  washout_note?: string; // Період виведення субстанції з організму перед змаганнями
  indications?: string; // Показання (за офіційною інструкцією препарату)
}

export type ExpiryAlertTier = "expired" | "critical_7" | "warning_30" | "notice_60" | "ok";

export interface ExpiryStatus {
  tier: ExpiryAlertTier;
  daysLeft: number;
  label: string;
  badgeClass: string;
}

export function getExpiryStatus(expiryDate: string, now: Date = new Date()): ExpiryStatus {
  if (!expiryDate) {
    return { tier: "ok", daysLeft: 999, label: "Термін не вказано", badgeClass: "bg-slate-800 text-slate-400 border-slate-700" };
  }
  const exp = new Date(expiryDate);
  const diffMs = exp.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return {
      tier: "expired",
      daysLeft,
      label: `Прострочено (${Math.abs(daysLeft)} дн. тому)`,
      badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse",
    };
  }
  if (daysLeft <= 7) {
    return {
      tier: "critical_7",
      daysLeft,
      label: `Критично: спливає через ${daysLeft} дн.`,
      badgeClass: "bg-red-500/20 text-red-300 border-red-500/40 font-bold",
    };
  }
  if (daysLeft <= 30) {
    return {
      tier: "warning_30",
      daysLeft,
      label: `Увага: ${daysLeft} дн. до кінця`,
      badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold",
    };
  }
  if (daysLeft <= 60) {
    return {
      tier: "notice_60",
      daysLeft,
      label: `Контроль: ${daysLeft} дн.`,
      badgeClass: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    };
  }
  return {
    tier: "ok",
    daysLeft,
    label: `Придатний (${daysLeft} дн.)`,
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
}

export const PHARMACY_CATEGORY_LABELS: Record<PharmacyCategory, { label: string; icon: string }> = {
  injections: { label: "Ін'єкційні розчини / Блокади", icon: "💉" },
  nsaid_painkillers: { label: "НПЗЗ та Знеболювальні", icon: "💊" },
  tapes_bandages: { label: "Тейпи, Бандажі, Фіксація", icon: "🩹" },
  vitamins_supplements: { label: "Вітаміни, Хондропротектори", icon: "🧪" },
  emergency_antiseptics: { label: "Антисептики та Невідкладна допомога", icon: "🚑" },
  creams_gels: { label: "Мазі, Гелі, Розігрів/Кріо", icon: "🧴" },
};

export const TREATMENT_CATEGORY_META: Record<
  TreatmentCategory,
  { label: string; icon: string; badgeClass: string }
> = {
  injection: {
    label: "Ін'єкційна терапія",
    icon: "💉",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  physiotherapy: {
    label: "Фізіотерапія / Апаратне лікування",
    icon: "⚡",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  medication: {
    label: "Фармакотерапія (Медикаменти)",
    icon: "💊",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  taping: {
    label: "Кінезіотейпування / Фіксація",
    icon: "🩹",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
};

export const WADA_META: Record<
  WadaStatus,
  { label: string; badgeClass: string; icon: string }
> = {
  allowed: {
    label: "WADA: Дозволено без обмежень",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    icon: "✓",
  },
  prohibited_in_competition: {
    label: "WADA: Заборонено в змагальний період (S-list)",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    icon: "⚠️",
  },
  prohibited_always: {
    label: "WADA: Заборонено завжди (Повний бан)",
    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    icon: "🛑",
  },
  requires_tue: {
    label: "Потребує TUE (Терапевтичний виняток)",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    icon: "📋",
  },
};
