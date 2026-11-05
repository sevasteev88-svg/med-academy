/**
 * player-anamnesis.ts — Типи та константи для первинного медичного анамнезу та спортивних даних
 */

export const BLOOD_TYPES = [
  { value: "", label: "Не вказано / Невідомо" },
  { value: "O(I) Rh+", label: "O(I) Rh+ (Перша позитивна)" },
  { value: "O(I) Rh-", label: "O(I) Rh- (Перша негативна)" },
  { value: "A(II) Rh+", label: "A(II) Rh+ (Друга позитивна)" },
  { value: "A(II) Rh-", label: "A(II) Rh- (Друга негативна)" },
  { value: "B(III) Rh+", label: "B(III) Rh+ (Третя позитивна)" },
  { value: "B(III) Rh-", label: "B(III) Rh- (Третя негативна)" },
  { value: "AB(IV) Rh+", label: "AB(IV) Rh+ (Четверта позитивна)" },
  { value: "AB(IV) Rh-", label: "AB(IV) Rh- (Четверта негативна)" },
] as const;

export type PlayerMedicalAnamnesis = {
  player_id: string;
  jersey_number?: string | null;
  phone?: string | null;
  blood_type?: string | null;
  allergies?: string | null;
  past_injuries?: string | null;
  initial_height?: number | null;
  initial_weight?: number | null;
  created_at?: string;
  updated_at?: string;
};
