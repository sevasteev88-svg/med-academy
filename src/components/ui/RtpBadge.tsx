/**
 * RtpBadge.tsx
 * Відображає прогноз повернення в стрій (RTP) у вигляді бейджа.
 * Використовується в картці гравця, списку травм, тріажі.
 *
 * Використання:
 *   <RtpBadge prediction={injury.rtp_prediction} />
 */

import type { RtpPrediction } from "@/types/database";

type Props = {
  prediction: RtpPrediction | null | undefined;
  showNotes?: boolean;
};

export default function RtpBadge({ prediction, showNotes = false }: Props) {
  if (!prediction) {
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-md border bg-gray-800 text-gray-400 border-gray-700">
        RTP: не вказано
      </span>
    );
  }

  const { min_days, max_days, is_t_junction_risk, confidence } = prediction;

  // ── Визначаємо колір бейджа ─────────────────────────────
  const variant =
    is_t_junction_risk || max_days >= 60
      ? "danger"
      : max_days >= 28
      ? "warn"
      : "ok";

  const colors = {
    ok: "bg-status-ok/20 text-status-ok border-status-ok/30",
    warn: "bg-status-warn/20 text-status-warn border-status-warn/30",
    danger: "bg-status-danger/20 text-status-danger border-status-danger/30",
  };

  const range =
    min_days === max_days ? `${min_days} дн.` : `${min_days}–${max_days} дн.`;

  const confLabel = {
    high: "",
    medium: " ~",
    low: " ??",
  }[confidence];

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md border ${colors[variant]}`}
      >
        {is_t_junction_risk && <span title="T-junction ризик">⚠️</span>}
        RTP: {range}{confLabel}
      </span>

      {/* Опціональний попереджуючий текст для T-junction */}
      {showNotes && is_t_junction_risk && (
        <p className="text-xs text-status-danger/80 max-w-xs">
          T-junction: термін подвоєно. Потрібен МРТ-контроль.
        </p>
      )}
    </div>
  );
}
