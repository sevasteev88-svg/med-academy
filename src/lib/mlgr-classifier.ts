// src/lib/mlgr-classifier.ts
// ═══════════════════════════════════════════════════════════════
// Класифікатор м'язових травм: MLG-R (Valle 2017) + BAMIC + Munich
// Чиста логіка та дані. Без React, без Supabase.
// Джерело: MedRehab MlgrClassifier, адаптовано під MedAcademy.
// ═══════════════════════════════════════════════════════════════

import type {
  MlgrMuscle,
  MlgrMechanism,
  MlgrLocation,
  MlgrGrade,
  BamicGrade,
  BamicLocation,
  MunichType,
  RtpRisk,
} from "@/types/database";

// ─── MLG-R: Механізми ─────────────────────────────────────────
export const MLGR_MECHANISMS: {
  key: MlgrMechanism;
  label: string;
  desc: string;
  color: string;
}[] = [
  { key: "T",   label: "T — Пряма (контузія)",        desc: "Зовнішній удар, менше пошкодження ECM",        color: "#F59E0B" },
  { key: "I-p", label: "I-p — Непряма (спринт)",      desc: "Під час прискорення/спринту, часто BFlh",      color: "#EF4444" },
  { key: "I-s", label: "I-s — Непряма (стретч)",      desc: "Під час розтяжки/махів, часто танцюристи",     color: "#EF4444" },
  { key: "N-p", label: "N-p — МРТ-негативна (спринт)", desc: "Клінічно позитивна, МРТ без змін",            color: "#7B8FA1" },
  { key: "N-s", label: "N-s — МРТ-негативна (стретч)", desc: "Клінічно позитивна, МРТ без змін",            color: "#7B8FA1" },
];

// ─── MLG-R: Локалізації (третини м'яза × MTJ) ────────────────
export const MLGR_LOCATIONS: {
  key: MlgrLocation;
  label: string;
  risk: "low" | "moderate" | "high";
}[] = [
  { key: "Pp", label: "P-p — Проксимальна 1/3, проксимальний MTJ", risk: "high" },
  { key: "Pd", label: "P-d — Проксимальна 1/3, дистальний MTJ",    risk: "moderate" },
  { key: "Mp", label: "M-p — Середня 1/3, проксимальний MTJ",      risk: "moderate" },
  { key: "Md", label: "M-d — Середня 1/3, дистальний MTJ",         risk: "low" },
  { key: "Dp", label: "D-p — Дистальна 1/3, проксимальний MTJ",    risk: "moderate" },
  { key: "Dd", label: "D-d — Дистальна 1/3, дистальний MTJ",       risk: "low" },
];

// ─── MLG-R: Грейди (0-3) ──────────────────────────────────────
export const MLGR_GRADES: {
  key: MlgrGrade;
  label: string;
  desc: string;
  mri: string;
  color: string;
  days: string;
}[] = [
  { key: 0, label: "Grade 0", desc: "Клінічно +, МРТ −",                          mri: "Без змін на МРТ",                                                 color: "#7B8FA1", days: "3–7" },
  { key: 1, label: "Grade 1", desc: "Набряк без порушення архітектури",            mri: "Feathery hyperintensity на T2/STIR, pennation angle збережений",  color: "#22C55E", days: "7–14" },
  { key: 2, label: "Grade 2", desc: "Набряк + мінімальне порушення архітектури",   mri: "Fiber blurring, pennation angle distortion, без quantifiable gap", color: "#F59E0B", days: "14–28" },
  { key: 3, label: "Grade 3", desc: "Вимірюваний gap між волокнами",               mri: "Hyperintense focal defect, часткова ретракція ± гематома",        color: "#EF4444", days: "28–56" },
];

// ─── MLG-R: М'язи (19 у 5 групах) ─────────────────────────────
export type MuscleGroup = "hamstring" | "quadriceps" | "adductor" | "calf" | "gluteal";

export const MLGR_MUSCLES: {
  key: MlgrMuscle;
  label: string;
  group: MuscleGroup;
}[] = [
  { key: "BFlh", label: "Biceps femoris (довга головка)",  group: "hamstring" },
  { key: "BFsh", label: "Biceps femoris (коротка головка)", group: "hamstring" },
  { key: "ST",   label: "Semitendinosus",                   group: "hamstring" },
  { key: "SM",   label: "Semimembranosus",                  group: "hamstring" },
  { key: "RF",   label: "Rectus femoris",                   group: "quadriceps" },
  { key: "VL",   label: "Vastus lateralis",                 group: "quadriceps" },
  { key: "VM",   label: "Vastus medialis",                  group: "quadriceps" },
  { key: "VI",   label: "Vastus intermedius",               group: "quadriceps" },
  { key: "AL",   label: "Adductor longus",                  group: "adductor" },
  { key: "AB",   label: "Adductor brevis",                  group: "adductor" },
  { key: "AM",   label: "Adductor magnus",                  group: "adductor" },
  { key: "GR",   label: "Gracilis",                         group: "adductor" },
  { key: "GM",   label: "Gastrocnemius (medial)",           group: "calf" },
  { key: "GL",   label: "Gastrocnemius (lateral)",          group: "calf" },
  { key: "SOL",  label: "Soleus",                           group: "calf" },
  { key: "PLT",  label: "Plantaris",                        group: "calf" },
  { key: "GMed", label: "Gluteus medius",                   group: "gluteal" },
  { key: "GMin", label: "Gluteus minimus",                  group: "gluteal" },
  { key: "PIR",  label: "Piriformis",                       group: "gluteal" },
];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  hamstring: "Хамстринги",
  quadriceps: "Квадрицепс",
  adductor: "Аддуктори",
  calf: "Литка",
  gluteal: "Сідниці",
};

// ─── BAMIC ────────────────────────────────────────────────────
export const BAMIC_GRADES: { key: string; label: string; desc: string }[] = [
  { key: "0a", label: "0a", desc: "Клінічно +, МРТ норма" },
  { key: "0b", label: "0b", desc: "DOMS (відкладена болючість)" },
  { key: "1",  label: "1 (mild)",     desc: "STIR сигнал <10% CSA або <5 см CC" },
  { key: "2",  label: "2 (moderate)", desc: "10–50% CSA або 5–15 см CC" },
  { key: "3",  label: "3 (extensive)", desc: ">50% CSA або >15 см CC" },
  { key: "4",  label: "4 (complete)", desc: "Повний розрив міотендинозної одиниці" },
];

export const BAMIC_LOCATIONS: { key: BamicLocation; label: string; desc: string }[] = [
  { key: "a", label: "a — Myofascial",       desc: "Периферична (міофасціальна junction)" },
  { key: "b", label: "b — Musculotendinous", desc: "MTJ / м'язове черевце" },
  { key: "c", label: "c — Intratendinous",   desc: "Внутрішньосухожильна зона — найгірший прогноз ⚠️" },
];

// ─── Munich ───────────────────────────────────────────────────
export const MUNICH_TYPES: {
  key: MunichType;
  label: string;
  desc: string;
  category: "functional" | "structural";
}[] = [
  { key: "1A", label: "1A — Fatigue-induced",  desc: "Функціональне: втома м'язів",          category: "functional" },
  { key: "1B", label: "1B — DOMS",             desc: "Функціональне: крепатура",             category: "functional" },
  { key: "2A", label: "2A — Neurogenic",       desc: "Функціональне: спінальне/нейрогенне",  category: "functional" },
  { key: "2B", label: "2B — Muscle-related",   desc: "Функціональне: м'язове",               category: "functional" },
  { key: "3A", label: "3A — Minor partial",    desc: "Структурне: мікророзрив",              category: "structural" },
  { key: "3B", label: "3B — Moderate partial", desc: "Структурне: частковий розрив",         category: "structural" },
  { key: "4",  label: "4 — (Sub)total tear",   desc: "Структурне: повний/субтотальний розрив", category: "structural" },
];

// ─── Вхідні дані для розрахунку ───────────────────────────────
export type ClassificationInput = {
  muscle: MlgrMuscle | "";
  mechanism: MlgrMechanism | "";
  location: MlgrLocation | "";
  grade: MlgrGrade | null;
  hasR: boolean;
  csaPct: number | null;
  reinjury: number;
  bamicGrade: string;   // "0a","0b","1","2","3","4" або ""
  bamicLocation: BamicLocation | "";
  munichType: MunichType | "";
};

// ─── RTP прогноз ──────────────────────────────────────────────
export type RtpResult = {
  minDays: number;
  maxDays: number;
  avgDays: number;
  risk: RtpRisk;
};

/**
 * Прогноз повернення в стрій (Return to Play).
 * Перенесено з MedRehab predictRTP, логіка 1:1.
 */
export function predictRTP(input: ClassificationInput): RtpResult | null {
  const { grade, csaPct, hasR, mechanism, muscle, reinjury, bamicGrade, bamicLocation } = input;

  if (grade == null) return null;

  let baseDays = 14;

  // База від MLG-R грейду
  if (grade === 0) baseDays = 5;
  else if (grade === 1) baseDays = 12;
  else if (grade === 2) baseDays = 21;
  else if (grade === 3) baseDays = 35;

  // CSA модифікатор для grade 3
  if (grade === 3 && csaPct) {
    if (csaPct > 50) baseDays = Math.max(baseDays, 50);
    else if (csaPct > 25) baseDays = Math.max(baseDays, 35);
  }

  // Інтратендинальне (r) — найгірший прогноз
  if (hasR) baseDays = Math.max(baseDays, 45);

  // BAMIC c-зона
  if (bamicLocation === "c") baseDays = Math.max(baseDays, 40);

  // BAMIC грейд модифікатор
  if (bamicGrade === "3") baseDays = Math.max(baseDays, 42);
  if (bamicGrade === "4") baseDays = Math.max(baseDays, 90);

  // М'язо-специфічні
  if (muscle === "BFlh") baseDays = Math.round(baseDays * 1.15);
  if (muscle === "SOL")  baseDays = Math.round(baseDays * 1.1);

  // Штраф за рецидив
  if (reinjury >= 1) baseDays = Math.round(baseDays * 1.3);
  if (reinjury >= 2) baseDays = Math.round(baseDays * 1.5);

  // Пряма травма — коротше
  if (mechanism === "T") baseDays = Math.round(baseDays * 0.7);

  // МРТ-негативна — найкоротше
  if (mechanism === "N-p" || mechanism === "N-s") baseDays = Math.min(baseDays, 10);

  const minDays = Math.max(3, Math.round(baseDays * 0.8));
  const maxDays = Math.round(baseDays * 1.3);

  // Рівень ризику
  let risk: RtpRisk = "low";
  if (hasR || bamicLocation === "c" || grade >= 3 || reinjury >= 2) risk = "high";
  else if (grade >= 2 || bamicLocation === "b" || reinjury >= 1) risk = "moderate";

  return { minDays, maxDays, avgDays: baseDays, risk };
}

// ─── Збірка кодів ─────────────────────────────────────────────

/**
 * Повний код MLG-R, напр. "I-p Pp Gr3(20%) R1"
 * Формат: Mechanism Location G[r]Grade[(csa%)] R[reinjury]
 */
export function buildMlgrCode(input: ClassificationInput): string | null {
  const { mechanism, location, grade, hasR, csaPct, reinjury } = input;
  if (!mechanism || !location || grade == null) return null;
  const rFlag = hasR ? "r" : "";
  const csaPart = grade === 3 && csaPct ? `(${csaPct}%)` : "";
  return `${mechanism} ${location} G${rFlag}${grade}${csaPart} R${reinjury}`;
}

/** BAMIC код, напр. "2c" */
export function buildBamicCode(input: ClassificationInput): string | null {
  const { bamicGrade, bamicLocation } = input;
  if (!bamicGrade || !bamicLocation) return null;
  return `${bamicGrade}${bamicLocation}`;
}

/** Munich тип як код (просто значення) */
export function buildMunichCode(input: ClassificationInput): string | null {
  return input.munichType || null;
}

// ─── UI-хелпери ───────────────────────────────────────────────
export const RTP_RISK_LABELS: Record<RtpRisk, string> = {
  low: "Низький ризик",
  moderate: "Помірний ризик",
  high: "Високий ризик",
};

export const RTP_RISK_COLORS: Record<RtpRisk, string> = {
  low: "#22C55E",
  moderate: "#F59E0B",
  high: "#EF4444",
};

/** Чи є комбінація небезпечною T-junction (BAMIC c) */
export function isTJunction(bamicLocation: string): boolean {
  return bamicLocation === "c";
}
