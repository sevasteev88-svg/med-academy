/**
 * player-status.ts — сумісний адаптер до єдиного джерела доступності availability-rules.ts
 */

import {
  calculatePlayerAvailability,
  type LegacyPlayerStatus,
} from "./availability-rules";

export type PlayerStatus = LegacyPlayerStatus;

export function playerStatus(player: any): PlayerStatus {
  // Якщо об'єкт уже є результатом calculatePlayerAvailability / getPlayerAvailability
  if (player?.legacyStatus) {
    return player.legacyStatus;
  }
  if (player?.status === "available") return "ok";
  if (player?.status === "restricted") return "warn";
  if (player?.status === "unavailable") return "danger";

  // Розраховуємо через чисту функцію availability
  const res = calculatePlayerAvailability(player);
  return res.legacyStatus;
}
