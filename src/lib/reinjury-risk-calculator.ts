export type ReinjuryRiskAssessment = {
  score: number; // 0 - 100%
  riskLevel: "low" | "moderate" | "high" | "critical";
  factors: { title: string; impact: string; severity: "info" | "warning" | "danger" }[];
  recommendation: string;
  badgeClass: string;
};

/**
 * Розраховує багатофакторний предиктивний ризик отримання / рецидиву травми:
 * 1. ACWR (гостре до хронічного навантаження)
 * 2. Hooper-Mackinnon Wellness score
 * 3. Фаза стрибка росту PHV (ризик апофізитів та тендинопатій)
 * 4. Анамнез попередніх травм цієї ж анатомічної зони (Re-injury count)
 */
export function calculateReinjuryRisk(input: {
  acwr?: number | null;
  wellnessScore?: number | null; // 4 - 20
  growthPhase?: string | null; // "phv", "pre_phv", "post_phv"
  previousInjuriesCount?: number;
  hasActiveDiscomfort?: boolean;
}): ReinjuryRiskAssessment {
  let score = 15; // базовий ризик контактного спорту
  const factors: ReinjuryRiskAssessment["factors"] = [];

  // Фактор 1: ACWR
  if (input.acwr != null) {
    if (input.acwr >= 1.5) {
      score += 35;
      factors.push({
        title: `Різкий стрибок навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        impact: "+35% ризику (Danger Zone за Габбеттом)",
        severity: "danger",
      });
    } else if (input.acwr >= 1.3) {
      score += 15;
      factors.push({
        title: `Підвищене навантаження (ACWR = ${input.acwr.toFixed(2)})`,
        impact: "+15% ризику (Caution)",
        severity: "warning",
      });
    } else if (input.acwr < 0.8) {
      score += 10;
      factors.push({
        title: `Недонавантаження (ACWR = ${input.acwr.toFixed(2)})`,
        impact: "+10% ризику (деадаптація тканин)",
        severity: "warning",
      });
    }
  }

  // Фактор 2: Велнес
  if (input.wellnessScore != null) {
    if (input.wellnessScore < 12) {
      score += 25;
      factors.push({
        title: `Низький рівень велнесу (${input.wellnessScore}/20 балів)`,
        impact: "+25% ризику (виснаження ЦНС, недосип або крепатура)",
        severity: "danger",
      });
    } else if (input.wellnessScore <= 15) {
      score += 10;
      factors.push({
        title: `Помірна втома за велнесом (${input.wellnessScore}/20 балів)`,
        impact: "+10% ризику",
        severity: "warning",
      });
    }
  }

  // Фактор 3: PHV пік росту
  if (input.growthPhase === "phv") {
    score += 20;
    factors.push({
      title: "Фаза максимального піку росту (PHV)",
      impact: "+20% ризику тракційних апофізитів (Осгуд-Шлаттер, Севера)",
      severity: "danger",
    });
  }

  // Фактор 4: Попередні травми
  const reinjCount = input.previousInjuriesCount ?? 0;
  if (reinjCount > 0) {
    const pts = Math.min(30, reinjCount * 15);
    score += pts;
    factors.push({
      title: `Анамнез травм у цій зоні (${reinjCount} пошкоджень)`,
      impact: `+${pts}% ризику через утворення рубцевої тканини`,
      severity: "danger",
    });
  }

  if (input.hasActiveDiscomfort) {
    score += 15;
    factors.push({
      title: "Суб'єктивний дискомфорт / біль при розминці",
      impact: "+15% ризику",
      severity: "warning",
    });
  }

  score = Math.min(95, Math.max(5, score));

  if (score >= 70) {
    return {
      score,
      riskLevel: "critical",
      factors,
      recommendation:
        "🛑 Критичний ризик травми: Рекомендовано звільнити від максимальних спринтів та контактних єдиноборств. Індивідуальне відновлювальне тренування.",
      badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
    };
  }

  if (score >= 45) {
    return {
      score,
      riskLevel: "high",
      factors,
      recommendation:
        "⚠️ Підвищений ризик: Обмежити час у грі (до 45-60 хв), провести розширену специфічну розминку (FIFA 11+), контролювати об'єм ударів по м'ячу.",
      badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    };
  }

  if (score >= 25) {
    return {
      score,
      riskLevel: "moderate",
      factors,
      recommendation:
        "🟡 Помірний ризик: Допуск до повного тренування з контролем гідратації та якісною заминкою.",
      badgeClass: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    };
  }

  return {
    score,
    riskLevel: "low",
    factors: factors.length > 0 ? factors : [{ title: "Показники в оптимумі", impact: "Мінімальний базовий ризик", severity: "info" }],
    recommendation: "🟢 Оптимальний стан: Повний допуск без обмежень.",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
}
