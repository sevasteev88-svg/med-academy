export type TreatmentCategory = "physiotherapy" | "injection" | "medication" | "taping";

export type WadaStatus = "allowed" | "prohibited_in_competition" | "prohibited_always" | "requires_tue";

export type MedicalTreatmentEntry = {
  id: string;
  injury_id?: string | null;
  player_id: string;
  date: string;
  category: TreatmentCategory;
  title: string; // e.g. "PRP-терапія (Platelet-Rich Plasma)", "Діклофенак 75мг", "Ударно-хвильова UWT", "Тейпування гомілкостопа"
  dosage_or_params?: string | null; // e.g. "3 мл аутокрові", "1 таб. 2 р/день", "2.0 bar, 2000 ударів"
  doctor_name: string;
  wada_status: WadaStatus;
  notes?: string | null;
  created_at: string;
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
  { label: string; badgeClass: string }
> = {
  allowed: {
    label: "✓ WADA: Дозволено без обмежень",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  prohibited_in_competition: {
    label: "⚠️ WADA: Заборонено в змагальний період (S-list)",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  prohibited_always: {
    label: "🛑 WADA: Заборонено завжди (Повний бан)",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  requires_tue: {
    label: "📋 Потребує TUE (Терапевтичний виняток)",
    badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
};
