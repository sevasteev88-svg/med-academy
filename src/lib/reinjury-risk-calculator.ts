export type ReinjuryRiskCategory = "low" | "moderate" | "high" | "insufficient_data";

export type ReinjuryRiskInput = {
  // 1. Зріст / PHV (мінімум: ≥2 замірів зросту за 12 міс. або зафіксований PHV)
  heightMeasurementsCount12m?: number;
  growthPhase?: string | null; // "phv", "pre_phv", "post_phv"
  hasPhvRecorded?: boolean;

  // 2. Навантаження (мінімум: ≥28 днів історії навантажень)
  workloadDaysMonitored?: number;
  acwr?: number | null;

  // 3. Велнес (мінімум: велнес за ≥7 днів)
  wellnessDaysRecorded?: number;
  wellnessScore?: number | null; // 4 - 20 балів

  // Додаткові клінічні фактори
  previousInjuriesCount?: number;
  hasActiveDiscomfort?: boolean;
};

export type ReinjuryRiskFactor = {
  title: string;
  description: string;
  severity: "info" | "warning" | "danger";
};

export type ReinjuryRiskAssessment = {
  isInsufficientData: boolean;
  missingDataReasons: string[];
  riskCategory: ReinjuryRiskCategory;
  categoryLabelUa: "Низький" | "Помірний" | "Підвищений" | "Недостатньо даних";
  disclaimer: string;
  factors: ReinjuryRiskFactor[];
  recommendation: string;
  badgeClass: string;
};

export const REINJURY_RISK_DISCLAIMER = "Орієнтовна оцінка, не прогноз";

/**
 * AI-аналітик ризику / функціонального стану.
 * Правило задачі 3.1: чесні індикатори.
 * Розраховується ТІЛЬКИ при мінімумі даних:
 * 1. ≥2 замірів зросту за останні 12 міс. АБО зафіксована фаза PHV.
 * 2. ≥28 днів історії моніторингу навантаження.
 * 3. Велнес-анкети за ≥7 днів.
 * 
 * Без відсотків «15% ймовірність». Використовує прозорі якісні категорії:
 * «Низький», «Помірний», «Підвищений» з обов'язковою позначкою «орієнтовна оцінка, не прогноз».
 */
export function calculateReinjuryRisk(input: ReinjuryRiskInput): ReinjuryRiskAssessment {
  const missingDataReasons: string[] = [];

  // 1. Перевірка мінімуму даних: Зріст / PHV
  const hasPhv = input.growthPhase === "phv" || input.hasPhvRecorded === true;
  const heightCount = input.heightMeasurementsCount12m ?? 0;
  const hasSufficientGrowth = hasPhv || heightCount >= 2;
  if (!hasSufficientGrowth) {
    missingDataReasons.push(
      `Виміри зросту: потрібно ≥2 замірів за 12 міс. або статус PHV (наявно: ${heightCount})`
    );
  }

  // 2. Перевірка мінімуму даних: Навантаження (≥28 днів)
  const workloadDays = input.workloadDaysMonitored ?? 0;
  const hasSufficientWorkload = workloadDays >= 28;
  if (!hasSufficientWorkload) {
    missingDataReasons.push(
      `Моніторинг навантаження: потрібно ≥28 днів історії (наявно: ${workloadDays} дн.)`
    );
  }

  // 3. Перевірка мінімуму даних: Велнес (≥7 днів)
  const wellnessDays = input.wellnessDaysRecorded ?? 0;
  const hasSufficientWellness = wellnessDays >= 7;
  if (!hasSufficientWellness) {
    missingDataReasons.push(
      `Велнес-анкети: потрібно щонайменше 7 днів заповнення (наявно: ${wellnessDays} дн.)`
    );
  }

  // Якщо хоча б одного компонента не вистачає — чесно повертаємо «Недостатньо даних»
  if (missingDataReasons.length > 0) {
    return {
      isInsufficientData: true,
      missingDataReasons,
      riskCategory: "insufficient_data",
      categoryLabelUa: "Недостатньо даних",
      disclaimer: REINJURY_RISK_DISCLAIMER,
      factors: [],
      recommendation:
        "Для формування оцінки функціонального стану гравця необхідно завершити збір мінімального пакета спостережень: систематичний зріст, не менше 28 днів обліку навантажень та мінімум 7 днів щоденного велнесу.",
      badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
    };
  }

  // Якщо всі мінімальні дані присутні — аналізуємо фактори
  const factors: ReinjuryRiskFactor[] = [];
  let dangerTriggers = 0;
  let warningTriggers = 0;

  // Фактор 1: ACWR (навантаження)
  if (input.acwr != null) {
    if (input.acwr >= 1.5) {
      dangerTriggers++;
      factors.push({
        title: `Різкий стрибок навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        description: "Гостре навантаження суттєво перевищує хронічну базу гравця (зона спайку навантаження).",
        severity: "danger",
      });
    } else if (input.acwr >= 1.3) {
      warningTriggers++;
      factors.push({
        title: `Підвищене навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        description: "Навантаження вище звичного оптимуму, рекомендовано контроль відновлення.",
        severity: "warning",
      });
    } else if (input.acwr < 0.8) {
      warningTriggers++;
      factors.push({
        title: `Знижене навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        description: "Потенційний ризик деадаптації зв'язково-м'язового апарату після тривалої паузи.",
        severity: "warning",
      });
    } else {
      factors.push({
        title: `Збалансоване навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        description: "Гостре навантаження відповідає хронічній адаптації тканин (Sweet Spot).",
        severity: "info",
      });
    }
  }

  // Фактор 2: Велнес
  if (input.wellnessScore != null) {
    if (input.wellnessScore < 12) {
      dangerTriggers++;
      factors.push({
        title: `Знижений рівень велнесу (${input.wellnessScore}/20 балів)`,
        description: "Ознаки суттєвої втоми ЦНС, дефіциту сну або вираженої крепатури.",
        severity: "danger",
      });
    } else if (input.wellnessScore <= 15) {
      warningTriggers++;
      factors.push({
        title: `Помірна втома за велнесом (${input.wellnessScore}/20 балів)`,
        description: "Легке накопичення втоми, бажано оптимізувати режим сну та гідратації.",
        severity: "warning",
      });
    } else {
      factors.push({
        title: `Сприятливий рівень відновлення (${input.wellnessScore}/20 балів)`,
        description: "Показники сну, бадьорості та м'язової готовності на доброму рівні.",
        severity: "info",
      });
    }
  }

  // Фактор 3: PHV пік росту
  if (hasPhv) {
    warningTriggers++;
    factors.push({
      title: "Фаза максимального піку росту (PHV)",
      description: "Підвищена механічна вразливість зон росту та апофізів (Осгуд-Шлаттер, Север).",
      severity: "warning",
    });
  }

  // Фактор 4: Попередні травми
  const reinjCount = input.previousInjuriesCount ?? 0;
  if (reinjCount > 0) {
    if (reinjCount >= 2) {
      dangerTriggers++;
      factors.push({
        title: `Обтяжений анамнез травм (${reinjCount} ушкоджень)`,
        description: "Наявність множинних попередніх травм вимагає особливого контролю ексцентричного навантаження.",
        severity: "danger",
      });
    } else {
      warningTriggers++;
      factors.push({
        title: `Анамнез травми (${reinjCount} ушкодження)`,
        description: "Потребує додаткової специфічної розминки (FIFA 11+) та якісної заминки.",
        severity: "warning",
      });
    }
  }

  // Фактор 5: Суб'єктивний дискомфорт
  if (input.hasActiveDiscomfort) {
    warningTriggers++;
    factors.push({
      title: "Суб'єктивний дискомфорт / біль при розминці",
      description: "Зафіксовано скарги на дискомфорт або скутість м'язів під час тренувального дня.",
      severity: "warning",
    });
  }

  // Визначення категорії
  if (dangerTriggers >= 2 || (dangerTriggers >= 1 && warningTriggers >= 2)) {
    return {
      isInsufficientData: false,
      missingDataReasons: [],
      riskCategory: "high",
      categoryLabelUa: "Підвищений",
      disclaimer: REINJURY_RISK_DISCLAIMER,
      factors,
      recommendation:
        "⚠️ Підвищений рівень навантажувального ризику: Рекомендовано знизити обсяг високошвидкісних спринтів та контактних єдиноборств. Провести розширену розминку FIFA 11+, індивідуалізувати відновлення.",
      badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    };
  }

  if (dangerTriggers >= 1 || warningTriggers >= 1) {
    return {
      isInsufficientData: false,
      missingDataReasons: [],
      riskCategory: "moderate",
      categoryLabelUa: "Помірний",
      disclaimer: REINJURY_RISK_DISCLAIMER,
      factors,
      recommendation:
        "🟡 Помірний рівень ризику: Повний тренувальний допуск з контролем індивідуального темпу, дотриманням протоколу питного режиму та якісною заминкою.",
      badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    };
  }

  return {
    isInsufficientData: false,
    missingDataReasons: [],
    riskCategory: "low",
    categoryLabelUa: "Низький",
    disclaimer: REINJURY_RISK_DISCLAIMER,
    factors: factors.length > 0 ? factors : [
      {
        title: "Показники в оптимумі",
        description: "Навантаження та відновлення збалансовані відповідно до адаптаційних можливостей.",
        severity: "info",
      },
    ],
    recommendation: "🟢 Оптимальний функціональний стан: Повний допуск до тренувань без обмежень.",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
}
