export type DentalStatus = "sanitized" | "requires_treatment" | "critical_focus";

export type NutritionProfile = {
  id: string;
  player_id: string;
  date: string;

  // 1. Стоматологія
  dental_status: DentalStatus;
  last_dental_check_date: string;
  dental_focus_notes?: string | null; // e.g. "Карієс 2.6, ризик тендинопатії ахілла"
  uses_mouthguard: boolean; // чи використовує капу для контактної гри

  // 2. Спортивне харчування / Нутрицевтики
  supplements_creatine: boolean; // Креатин моногідрат (5г)
  supplements_omega3: boolean; // Омега-3 жирні кислоти
  supplements_collagen_vit_c: boolean; // Колаген + вітамін С (для зв'язок за 45 хв до тренування)
  supplements_whey_protein: boolean; // Сироватковий протеїн
  supplements_iron: boolean; // Препарати заліза (за показами феритину)
  supplements_custom?: string | null;

  // 3. Алергії та особливості
  allergies: string[]; // e.g. ["лактоза", "арахіс"]
  dietary_type: "standard" | "halal" | "vegetarian";
  notes?: string | null;
  created_at: string;
};
