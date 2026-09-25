export type RtpPhaseNumber = 1 | 2 | 3 | 4 | 5;

export interface RtpPhaseConfig {
  number: RtpPhaseNumber;
  title: string;
  shortTitle: string;
  tagline: string;
  color: string;
  badgeClass: string;
  bgClass: string;
  borderClass: string;
  allowedActivity: string;
  prohibitedActivity: string;
  clinicalCriteria: string[];
}

export const RTP_PHASES: Record<RtpPhaseNumber, RtpPhaseConfig> = {
  1: {
    number: 1,
    title: "Фаза 1: Клінічна та Зал",
    shortTitle: "1. Зал / Клініка",
    tagline: "Ліквідація болю, набряку та ізометрична активація",
    color: "#EF4444",
    badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    bgClass: "bg-rose-950/20",
    borderClass: "border-rose-500/30",
    allowedActivity: "Фізіотерапія, ЛФК, пасивна/активна амплітуда (ROM), велотренажер без опору, ізометрія",
    prohibitedActivity: "Будь-який біг на полі, стрибки, контакт, осьові ударні навантаження",
    clinicalCriteria: [
      "Біль 0/10 у спокої",
      "Купірування гострого запалення та набряку",
      "Відновлення амплітуди рухів (ROM) > 80% від здорової кінцівки",
      "Безболісне ізометричне скорочення",
    ],
  },
  2: {
    number: 2,
    title: "Фаза 2: Лінійний біг та кардіо",
    shortTitle: "2. Біг по прямій",
    tagline: "Аеробна адаптація та механіка бігу без зміни напрямку",
    color: "#F59E0B",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    bgClass: "bg-amber-950/20",
    borderClass: "border-amber-500/30",
    allowedActivity: "Біг підтюпцем по газону, прискорення по прямій (до 60-70%), крострейнінг, еліпсоїд",
    prohibitedActivity: "Різкі гальмування, зміна напрямку (CoD), удари по м'ячу, контактні єдиноборства",
    clinicalCriteria: [
      "Відсутність кульгавості при бігу",
      "Відсутність реактивного випоту чи болю через 24 год після бігу",
      "Силовий дефіцит ураженої групи < 20% порівняно зі здоровою кінцівкою",
    ],
  },
  3: {
    number: 3,
    title: "Фаза 3: Індивідуальна робота з м'ячем",
    shortTitle: "3. Робота з м'ячем",
    tagline: "Специфічна футбольна техніка, агіліті та прискорення",
    color: "#38BDF8",
    badgeClass: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    bgClass: "bg-sky-950/20",
    borderClass: "border-sky-500/30",
    allowedActivity: "Дриблінг, передачі, координаційні сходи, човниковий біг, удари середньої сили",
    prohibitedActivity: "Загальна група, тактичні ігри з єдиноборствами, верхові стики",
    clinicalCriteria: [
      "Успішне виконання тесту на зміну напрямку (505 / T-test)",
      "Спринт > 85% від максимальної швидкості без страху та болю",
      "Ексцентричний контроль м'яза у повній амплітуді",
    ],
  },
  4: {
    number: 4,
    title: "Фаза 4: Група з обмеженнями (Жовтий жилет)",
    shortTitle: "4. Група (обмежено)",
    tagline: "Тактична інтеграція, квадрати та контроль хвилин",
    color: "#818CF8",
    badgeClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    bgClass: "bg-indigo-950/20",
    borderClass: "border-indigo-500/30",
    allowedActivity: "Розминка в групі, квадрати 4х2 / 5х5 як нейтральний (жовтий жилет), ліміт 30-45 хв",
    prohibitedActivity: "Жорсткі підкати, гра 11х11 повний матч, верхові єдиноборства",
    clinicalCriteria: [
      "Повне тренування з командою без болю",
      "Відновлення за велнес-опитуванням > 4/5 наступного ранку",
      "Силовий дефіцит симетрії ліва/права < 10%",
    ],
  },
  5: {
    number: 5,
    title: "Фаза 5: Повний допуск (Матч)",
    shortTitle: "5. Повний допуск",
    tagline: "100% готовність до гри та конкурентних єдиноборств",
    color: "#10B981",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    bgClass: "bg-emerald-950/20",
    borderClass: "border-emerald-500/30",
    allowedActivity: "Повні ігрові хвилини, змагальні матчі, повні навантаження",
    prohibitedActivity: "Немає обмежень (регулярний моніторинг відновлення)",
    clinicalCriteria: [
      "100% максимальний спринт зафіксований GPS-трекером",
      "Повна психологічна впевненість (ACL-RSI / I-PRRS > 85%)",
      "Фінальний допуск головного лікаря клубу",
    ],
  },
};

export interface RtpPhaseLog {
  injury_id: string;
  phase: RtpPhaseNumber;
  target_date: string;
  doctor_note?: string;
  criteria_met?: string[];
  updated_at: string;
}
