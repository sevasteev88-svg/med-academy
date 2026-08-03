/**
 * player-status.ts — єдина логіка статусу готовності гравця.
 *
 * ВАЖЛИВО: наявність активної/реабілітаційної травми ЗАВЖДИ означає
 * мінімум "обмежений" статус, незалежно від ВАШ (навіть якщо ВАШ
 * не внесений або низький). "Готовий" можливий лише за відсутності
 * активних травм взагалі.
 */

export type PlayerStatus = "ok" | "warn" | "danger";

export function playerStatus(player: { injuries?: { status: string; vas_score: number | null }[] }): PlayerStatus {
  const active = (player.injuries ?? []).filter(
    (i) => i.status === "active" || i.status === "rehabilitation"
  );

  if (active.length === 0) return "ok";

  const maxVas = Math.max(...active.map((i) => i.vas_score ?? 0));
  if (maxVas >= 7) return "danger";

  // Будь-яка активна травма — мінімум "обмежений", навіть без ВАШ
  return "warn";
}