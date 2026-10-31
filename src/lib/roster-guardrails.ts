import type { RosterPlayerSlot, MedicalGuardrailIssue } from "@/types/roster";

export type RosterPlayerDetail = {
  id: string;
  first_name: string;
  last_name: string;
  position?: string;
  availability_status?: "available" | "restricted" | "unavailable";
  max_minutes?: number | null;
  restriction_notes?: string | null;
  hasValidScreening?: boolean;
  injuries?: any[];
};

export interface GuardrailValidationResult {
  issues: MedicalGuardrailIssue[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  hasCriticalIssues: boolean;
  gkStarterCount: number;
  startersCount: number;
  subsCount: number;
}

export function validateMatchdayRoster(
  starters: RosterPlayerSlot[],
  substitutes: RosterPlayerSlot[],
  players: RosterPlayerDetail[]
): GuardrailValidationResult {
  const issues: MedicalGuardrailIssue[] = [];
  const playerMap = new Map<string, RosterPlayerDetail>();
  for (const p of players) {
    playerMap.set(p.id, p);
  }

  let gkStarterCount = 0;

  // 1. Check Starters
  starters.forEach((slot, index) => {
    const player = playerMap.get(slot.playerId);
    if (!player) return;

    const fullName = `${player.last_name} ${player.first_name}`.trim();
    const pos = (player.position || "").toUpperCase();
    if (pos === "ВР" || pos === "GK") {
      gkStarterCount++;
    }

    // Critical 1: Player is unavailable / injured in Starting XI
    if (player.availability_status === "unavailable") {
      issues.push({
        id: `starter-unavailable-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "critical",
        type: "unavailable_player",
        title: "Травмований гравець у стартовому складі",
        message: `${fullName} має медичний статус «Недоступний» (${player.restriction_notes || "у лазареті"}). Заборонено випускати на поле без допуску лікаря!`,
      });
    }

    // Critical / Warning: No valid screening
    if (player.hasValidScreening === false) {
      issues.push({
        id: `starter-unscreened-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "critical",
        type: "unscreened_player",
        title: "Відсутній кардіодопуск (ЕКГ/Скринінг)",
        message: `${fullName} не має підтвердженого передсезонного скринінгу/ЕКГ. Участь в офіційних змаганнях є порушенням медичного регламенту!`,
      });
    }

    // Warning: Restricted player in Starting XI
    if (player.availability_status === "restricted") {
      const maxMin = player.max_minutes || 45;
      issues.push({
        id: `starter-restricted-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "warning",
        type: "minute_limit_starter",
        title: `Ліміт хвилин: не більше ${maxMin} хв`,
        message: `${fullName} має медичне обмеження до ${maxMin} хв (${player.restriction_notes || "етап реабілітації"}). Вихід у старті несе високий ризик рецидиву. Рекомендується вихід на заміну в 2-му таймі.`,
      });
    }
  });

  // 2. Check Substitutes
  substitutes.forEach((slot) => {
    const player = playerMap.get(slot.playerId);
    if (!player) return;

    const fullName = `${player.last_name} ${player.first_name}`.trim();

    // Critical: Player is unavailable / injured on bench
    if (player.availability_status === "unavailable") {
      issues.push({
        id: `sub-unavailable-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "critical",
        type: "unavailable_player",
        title: "Травмований гравець на лаві запасних",
        message: `${fullName} має статус «Недоступний» (${player.restriction_notes || "лазарет"}). Включення до протоколу створює ризик помилкового виходу на поле.`,
      });
    }

    // Warning: Unscreened on bench
    if (player.hasValidScreening === false) {
      issues.push({
        id: `sub-unscreened-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "warning",
        type: "unscreened_player",
        title: "Запасний без скринінгу/ЕКГ",
        message: `${fullName} не має діючого скринінгу. Допустіть гравця до обстеження перед участю в матчі.`,
      });
    }

    // Info: Restricted player on bench - this is normal, but note the limit
    if (player.availability_status === "restricted") {
      const maxMin = player.max_minutes || 45;
      issues.push({
        id: `sub-restricted-${player.id}`,
        playerId: player.id,
        playerName: fullName,
        severity: "info",
        type: "minute_limit_starter",
        title: `Контроль хвилин на заміні (${maxMin} хв)`,
        message: `${fullName} може вийти на заміну максимум на ${maxMin} хв згідно з вказівкою лікаря.`,
      });
    }
  });

  // 3. Squad Structure Rules
  if (starters.length > 0) {
    if (gkStarterCount === 0) {
      issues.push({
        id: "tactical-no-gk",
        playerId: "",
        playerName: "Команда",
        severity: "warning",
        type: "no_goalkeeper",
        title: "Відсутній воротар у старті",
        message: "У стартовому складі не вибрано жодного номінального воротаря (ВР/GK).",
      });
    } else if (gkStarterCount > 1) {
      issues.push({
        id: "tactical-multi-gk",
        playerId: "",
        playerName: "Команда",
        severity: "info",
        type: "multiple_goalkeepers",
        title: "Більше одного воротаря",
        message: `У стартовому складі вибрано ${gkStarterCount} воротарів.`,
      });
    }

    if (starters.length !== 11) {
      issues.push({
        id: "tactical-starters-count",
        playerId: "",
        playerName: "Команда",
        severity: "info",
        type: "roster_size",
        title: `Стартовий склад: ${starters.length}/11`,
        message: starters.length < 11
          ? `У стартовому складі не вистачає ${11 - starters.length} гравців.`
          : `У стартовому складі вибрано більше 11 гравців (${starters.length}).`,
      });
    }
  }

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  return {
    issues,
    criticalCount,
    warningCount,
    infoCount,
    hasCriticalIssues: criticalCount > 0,
    gkStarterCount,
    startersCount: starters.length,
    subsCount: substitutes.length,
  };
}
