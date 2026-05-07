/**
 * /injuries/[id]/page.tsx
 * Картка конкретної травми з RTP прогнозом та класифікацією.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RtpBadge from "@/components/ui/RtpBadge";
import Link from "next/link";
import type { RtpPrediction } from "@/types/database";

type Props = {
  params: Promise<{ id: string }>;
};

const LOCATION_UA: Record<string, string> = {
  knee: "Коліно", ankle: "Гомілково-ступневий", shoulder: "Плече",
  hip: "Стегно (суглоб)", thigh: "Стегно (м'яз)", calf: "Литка",
  foot: "Стопа", groin: "Пах", back: "Спина",
  neck: "Шия", wrist: "Зап'ясток", head: "Голова", other: "Інше",
};
const SEVERITY_UA: Record<string, string> = {
  minimal: "Мінімальна", mild: "Легка", moderate: "Помірна",
  severe: "Тяжка", career_threatening: "Загроза кар'єрі",
};
const STATUS_UA: Record<string, string> = {
  active: "Активна", rehabilitation: "Реабілітація", closed: "Закрита",
};
const STATUS_COLOR: Record<string, string> = {
  active: "bg-status-danger/20 text-status-danger border-status-danger/30",
  rehabilitation: "bg-status-warn/20 text-status-warn border-status-warn/30",
  closed: "bg-gray-800 text-gray-400 border-gray-700",
};
const MUNICH_DESC: Record<string, string> = {
  "1A": "Функціональна: перевтома",
  "1B": "Функціональна: DOMS / мікроушкодження",
  "2A": "Нейром'язова: спінальна",
  "2B": "Нейром'язова: локальна",
  "3A": "Структурна: мікророзрив < 0.5 cm",
  "3B": "Структурна: частковий розрив ≥ 0.5 cm",
  "4":  "Структурна: повний розрив / відрив",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-white text-right">{value}</span>
    </div>
  );
}

export default async function InjuryDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: injury } = await supabase
    .from("injuries")
    .select(`*, players(id, first_name, last_name)`)
    .eq("id", id)
    .single();

  if (!injury) notFound();

  const player = injury.players as any;
  const playerName = player
    ? `${player.last_name} ${player.first_name}`
    : "—";

  const rtp = injury.rtp_prediction as RtpPrediction | null;
  const hasClassification = injury.classification_system !== "none" && injury.classification_system;
  const isTJunction = injury.bamic_location === "c" && (injury.bamic_grade ?? 0) >= 2;

  return (
    <div className="min-h-screen bg-background text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-4">
            {player && (
              <Link
                href={`/players/${player.id}`}
                className="text-gray-500 hover:text-white transition-colors text-sm"
              >
                ← {playerName}
              </Link>
            )}
            <h1 className="text-xl font-bold text-white">
              {LOCATION_UA[injury.location] ?? injury.location}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${STATUS_COLOR[injury.status] ?? STATUS_COLOR.closed}`}>
              {STATUS_UA[injury.status] ?? injury.status}
            </span>
            <Link
              href={`/injuries/${id}/edit`}
              className="text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1 rounded-lg transition-colors"
            >
              Редагувати
            </Link>
          </div>
        </div>

        {/* T-junction попередження */}
        {isTJunction && (
          <div className="flex gap-3 bg-status-danger/10 border border-status-danger/30 rounded-xl p-4">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold text-status-danger text-sm">T-junction — критичний стан</p>
              <p className="text-xs text-status-danger/80 mt-1">
                Пошкодження інтрам'язового сухожилля (BAMIC {injury.bamic_grade}c).
                Термін реабілітації подвоєно. Обов'язковий МРТ-контроль.
              </p>
            </div>
          </div>
        )}

        {/* RTP прогноз */}
        {rtp && (
          <div className={`rounded-xl border p-4 ${
            isTJunction || rtp.max_days >= 60
              ? "bg-status-danger/10 border-status-danger/30"
              : rtp.max_days >= 28
              ? "bg-status-warn/10 border-status-warn/30"
              : "bg-status-ok/10 border-status-ok/30"
          }`}>
            <p className="text-xs text-gray-400 mb-1">Прогноз повернення в стрій (RTP)</p>
            <div className="flex items-end justify-between">
              <p className={`text-3xl font-bold ${
                isTJunction || rtp.max_days >= 60 ? "text-status-danger"
                : rtp.max_days >= 28 ? "text-status-warn" : "text-status-ok"
              }`}>
                {rtp.min_days === rtp.max_days
                  ? `${rtp.min_days} днів`
                  : `${rtp.min_days}–${rtp.max_days} днів`}
              </p>
              <span className="text-xs text-gray-500 mb-1">
                Точність: {rtp.confidence === "high" ? "висока" : "середня"}
              </span>
            </div>
            {rtp.notes && (
              <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-700/50">
                {rtp.notes}
              </p>
            )}
          </div>
        )}

        {/* Основна інформація */}
        <div className="bg-surface rounded-xl border border-gray-800 p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Основна інформація
          </h2>
          <Row label="Дата травми" value={new Date(injury.date_of_injury).toLocaleDateString("uk-UA")} />
          <Row label="Локалізація" value={LOCATION_UA[injury.location] ?? injury.location} />
          <Row label="Сторона" value={injury.side === "left" ? "Ліва" : injury.side === "right" ? "Права" : "Обидві"} />
          <Row label="Тяжкість" value={SEVERITY_UA[injury.severity] ?? injury.severity} />
          <Row label="Механізм" value={
            injury.mechanism === "contact" ? "Контактна"
            : injury.mechanism === "non_contact" ? "Неконтактна"
            : "Перевантаження"
          } />
          {injury.expected_return_date && (
            <Row
              label="Очікуване повернення"
              value={new Date(injury.expected_return_date).toLocaleDateString("uk-UA")}
            />
          )}
          {injury.description && (
            <Row label="Опис" value={injury.description} />
          )}
        </div>

        {/* Класифікація */}
        {hasClassification && (
          <div className="bg-surface rounded-xl border border-gray-800 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Класифікація пошкодження
            </h2>
            <Row
              label="Система"
              value={injury.classification_system === "bamic" ? "BAMIC" : "Munich Consensus"}
            />
            {injury.classification_system === "bamic" && (
              <>
                <Row label="Ступінь" value={`${injury.bamic_grade} / 4`} />
                <Row
                  label="Локалізація"
                  value={
                    injury.bamic_location === "a" ? "a — міофасціальне"
                    : injury.bamic_location === "b" ? "b — внутрішньом'язове"
                    : "c — T-junction ⚠️"
                  }
                />
                <Row
                  label="Код"
                  value={
                    <span className="font-mono font-bold">
                      BAMIC {injury.bamic_grade}{injury.bamic_location}
                    </span>
                  }
                />
              </>
            )}
            {injury.classification_system === "munich" && injury.munich_grade && (
              <>
                <Row label="Тип" value={injury.munich_grade} />
                <Row label="Опис" value={MUNICH_DESC[injury.munich_grade] ?? "—"} />
              </>
            )}
          </div>
        )}

        {/* Якщо класифікація не була вказана */}
        {!hasClassification && (
          <div className="bg-surface rounded-xl border border-gray-800 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Класифікація не вказана</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Додайте Munich/BAMIC для точного прогнозу RTP
              </p>
            </div>
            <Link
              href={`/injuries/${id}/edit`}
              className="text-xs text-brand-blue border border-brand-blue/40 hover:bg-brand-blue/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Додати
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
