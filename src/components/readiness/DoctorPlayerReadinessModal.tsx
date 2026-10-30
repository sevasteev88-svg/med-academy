"use client";

import React, { useState, useEffect } from "react";
import type { PlayerReadinessResult } from "@/lib/readiness";
import { WEARABLES_DISCLAIMER_TEXT } from "@/lib/wearables-constants";
import { formatPainLocation } from "@/lib/dictionaries";
import {
  getPlayerTelegramBindingAction,
  sendDoctorRecommendationAction,
  getPlayerDoctorRecommendationAction,
  DEFAULT_DOCTOR_PHONE,
  DEFAULT_DOCTOR_TG_URL,
} from "@/actions/telegram-actions";

export const PAIN_SYMPTOM_MAP_UA: Record<string, string> = {
  sharp_movement: "⚡ Різкий при русі",
  shooting: "🎯 Прострілює / коле",
  aching: "🌊 Ниючий / тягне",
  stiffness: "🧱 Скутість / спазм",
  pulsing: "💥 Пульсуючий",
  impact_contusion: "🤕 Наслідок удару / стику",
  pain_at_rest: "🛏️ Біль у спокої",
};

export const ILLNESS_SYMPTOM_MAP_UA: Record<string, string> = {
  sore_throat: "🗣️ Біль у горлі",
  runny_nose: "🤧 Нежить / закладеність",
  cough: "😮‍💨 Кашель",
  fever_chills: "🌡️ Озноб / жар",
  body_aches: "🦴 Ломота в тілі",
  headache: "🤕 Головний біль",
  nausea_gi: "🤢 Нудота / розлад",
  weakness: "🥱 Слабкість",
};

export const DOCTOR_TEMPLATES = [
  {
    icon: "🏠",
    title: "Залишайся вдома",
    text: "Залишайся вдома, призначено постільний режим та рясне тепле пиття. Тренування в загальній групі скасовано. О 14:00 вийдемо на зв'язок для контролю стану.",
  },
  {
    icon: "🩺",
    title: "Чекаю на базі",
    text: "Приїжджай на базу на 45 хвилин раніше початку тренування. Чекаю в медичному кабінеті на індивідуальний огляд та тестування перед виходом на поле.",
  },
  {
    icon: "🏋️",
    title: "Індивідуальний зал",
    text: "Сьогодні працюєш за індивідуальною відновлювальною програмою в тренажерному залі / з реабілітологом без осьового навантаження на травмовану зону.",
  },
  {
    icon: "💊",
    title: "Знеболювальне / схема",
    text: "Прийми призначений протизапальний препарат за схемою після їжі. Нанеси охолоджувальний гель на уражену ділянку. Повторний звіт про стан о 12:00.",
  },
];

export interface DoctorPlayerReadinessModalProps {
  player: PlayerReadinessResult;
  onClose: () => void;
  onAcknowledge?: (playerId: string, date: string) => void;
  isPendingAck?: boolean;
  initialDate?: string;
}

export function DoctorPlayerReadinessModal({
  player,
  onClose,
  onAcknowledge,
  isPendingAck,
  initialDate,
}: DoctorPlayerReadinessModalProps) {
  const [activeDate, setActiveDate] = useState<string>(initialDate || player.date);

  // Знаходимо точку тренду для вибраного дня
  const activePoint = player.trendLast7Days?.find((pt) => pt.date === activeDate);
  const isSelectedToday = activeDate === player.date;

  // Деталі анкети для вибраного дня (якщо сьогодні — з doctorDetails, якщо інший день — з activePoint.details)
  const details = isSelectedToday
    ? player.doctorDetails
    : activePoint?.details || null;

  const isAck = isSelectedToday
    ? player.isAcknowledged
    : Boolean(activePoint?.isAcknowledged);

  const ackRole = isSelectedToday
    ? player.reviewedByRole
    : activePoint?.reviewedByRole;

  const wearables = isSelectedToday ? player.doctorDetails?.wearables : null;

  // Telegram та відповідь лікаря
  const [telegramStatus, setTelegramStatus] = useState<{
    loading: boolean;
    isBound: boolean;
    username?: string | null;
  }>({ loading: true, isBound: false });

  const [recommendationText, setRecommendationText] = useState("");
  const [isSendingRec, setIsSendingRec] = useState(false);
  const [recFeedback, setRecFeedback] = useState<{ success?: boolean; msg?: string } | null>(null);
  const [savedRecommendation, setSavedRecommendation] = useState<any>(
    details?.doctorRecommendation || null
  );
  const [isRefreshingReplies, setIsRefreshingReplies] = useState(false);

  const fetchLatestRecommendation = React.useCallback(async () => {
    if (!player.playerId || !activeDate) return;
    try {
      const res = await getPlayerDoctorRecommendationAction({
        playerId: player.playerId,
        date: activeDate,
      });
      if (res.success && res.recommendation) {
        setSavedRecommendation(res.recommendation);
      }
    } catch {}
  }, [player.playerId, activeDate]);

  useEffect(() => {
    fetchLatestRecommendation();
    const timer = setInterval(() => {
      fetchLatestRecommendation();
    }, 6000);
    return () => clearInterval(timer);
  }, [fetchLatestRecommendation]);

  const handleManualRefresh = async () => {
    setIsRefreshingReplies(true);
    await fetchLatestRecommendation();
    setTimeout(() => setIsRefreshingReplies(false), 500);
  };

  useEffect(() => {
    let isMounted = true;
    if (player.playerId) {
      getPlayerTelegramBindingAction(player.playerId).then((res) => {
        if (isMounted) {
          setTelegramStatus({
            loading: false,
            isBound: Boolean(res.isBound),
            username: res.username || null,
          });
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [player.playerId]);

  useEffect(() => {
    setSavedRecommendation(details?.doctorRecommendation || null);
    setRecommendationText(details?.doctorRecommendation?.text || "");
    setRecFeedback(null);
  }, [activeDate, details]);

  const handleSendRecommendation = async () => {
    if (!recommendationText.trim()) return;
    setIsSendingRec(true);
    setRecFeedback(null);
    try {
      const res = await sendDoctorRecommendationAction({
        playerId: player.playerId,
        date: activeDate,
        recommendation: recommendationText.trim(),
      });
      if (res.success) {
        setSavedRecommendation({
          text: recommendationText.trim(),
          sentAt: new Date().toISOString(),
          sentToTelegram: res.sentToTelegram,
          doctorPhone: DEFAULT_DOCTOR_PHONE,
          playerReply: savedRecommendation?.playerReply || null,
          replies: savedRecommendation?.replies || [],
        });
        setRecFeedback({
          success: true,
          msg: res.sentToTelegram
            ? "Вказівку збережено та успішно надіслано гравцю в Telegram! ✈️"
            : "Вказівку збережено в картку гравця (Telegram гравцем ще не підключено).",
        });
        if (onAcknowledge) {
          onAcknowledge(player.playerId, activeDate);
        }
      } else {
        setRecFeedback({ success: false, msg: res.error || "Помилка відправки" });
      }
    } catch (e: any) {
      setRecFeedback({ success: false, msg: e.message || "Помилка мережі" });
    } finally {
      setIsSendingRec(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-5 sm:p-6 space-y-5 text-slate-100">
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tracking-tight">
                {player.playerName || "Гравець"}
              </span>
              {player.position && (
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  {player.position}
                </span>
              )}
              <span className="text-xs text-slate-400 font-mono">
                {player.date}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Детальний медичний звіт: анкета Hooper-Mackinnon + біометрія з носимих пристроїв
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 7-ДЕННИЙ МІНІ-КАЛЕНДАР ДЛЯ ПЕРЕГЛЯДУ ІСТОРІЇ ГРАВЦЯ */}
        <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🗓️</span>
              <span>Історія анкети за 7 днів</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              Оберіть день для перегляду
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {player.trendLast7Days.map((pt) => {
              const isSelected = pt.date === activeDate;
              const isTodayDay = pt.date === player.date;
              const dotBg =
                pt.status === "green"
                  ? "bg-emerald-400"
                  : pt.status === "yellow"
                  ? "bg-amber-400"
                  : pt.status === "red"
                  ? "bg-rose-500"
                  : "bg-slate-600";

              const parts = pt.date.split("-");
              const shortDate = parts.length === 3 ? `${parts[2]}.${parts[1]}` : pt.date;

              return (
                <button
                  key={pt.date}
                  type="button"
                  onClick={() => setActiveDate(pt.date)}
                  className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/20 border-sky-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.3)] ring-1 ring-sky-400"
                      : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="text-[11px] font-mono font-bold leading-tight">
                    {shortDate}
                  </span>
                  <span className="text-[9px] text-slate-400 leading-tight mt-0.5 truncate max-w-full">
                    {isTodayDay ? "Сьогодні" : pt.label}
                  </span>
                  <span className={`w-2 h-2 rounded-full mt-1.5 ${dotBg}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* СТАТУС СВІТЛОФОРА ТА РЕКОМЕНДАЦІЯ ДЛЯ ОБРАНОГО ДНЯ */}
        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
                Статус готовності на {activeDate}
              </span>
              {!isSelectedToday && (
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Архівний день
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-bold text-white">
                {isSelectedToday ? player.statusLabel : (activePoint?.label || (activePoint?.status === "gray" ? "Не заповнив" : "Заповнено"))}
              </span>
              <span className="text-xs text-slate-400">
                • {isSelectedToday ? player.actionPrompt : (details ? "Звіт збережено" : "Анкету в цей день не заповнено")}
              </span>
            </div>
          </div>

          {onAcknowledge && (
            <div className="shrink-0 flex flex-col sm:items-end gap-1">
              {isAck ? (
                <div className="flex flex-col sm:items-end gap-1">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                    <span>✓</span>
                    <span>
                      Взято до уваги ({ackRole === "doctor" ? "лікар" : "штаб"})
                    </span>
                  </span>
                  <span className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-1">
                    <span>📱</span>
                    <span>Футболіст бачить відмітку у додатку</span>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isPendingAck || !details}
                  onClick={() => onAcknowledge(player.playerId, activeDate)}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-sky-600/25 active:scale-95 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>👁️</span>
                  <span>{isPendingAck ? "Збереження..." : "Взято до уваги"}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 1. ВІДПОВІДІ АНКЕТИ (ВКЛЮЧНО З ПРИВАТНИМИ ПОЛЯМИ СТРЕСУ ТА КОМЕНТАРЕМ) */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <span>📋</span>
            <span>Відповіді щоденної анкети</span>
          </h4>

          {details ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Якість сну</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.sleepQuality} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.sleepHours ? `${details.sleepHours} год` : "—"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Бадьорість / Втома</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.fatigue} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.fatigue >= 4 ? "Свіжий" : details.fatigue <= 2 ? "Втомлений" : "Помірно"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-400 block">М&apos;язи / Крепатура</span>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.soreness} / 5
                </span>
                <span className="text-[10px] text-slate-500">
                  {details.soreness <= 2 ? "Відчутний біль" : "Свіжі"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-300 font-bold block">Стрес</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-200">
                    тільки лікар
                  </span>
                </div>
                <span className="text-sm font-bold text-white mt-0.5 block">
                  {details.stress ?? "—"} / 5
                </span>
                <span className="text-[10px] text-slate-400">
                  {details.stress && details.stress <= 2 ? "Підвищений" : "Спокійний"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs space-y-1">
              <span className="text-2xl block">📭</span>
              <span className="font-semibold text-slate-300">Анкету за {activeDate} не заповнено</span>
              <p className="text-[11px] text-slate-500">
                Гравець у цей день не надсилав ранковий звіт самопочуття.
              </p>
            </div>
          )}

          {/* Біль та стан здоров'я */}
          {details && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Картка болю */}
                <div className={`p-3.5 rounded-2xl border ${
                  details.pain
                    ? "bg-rose-950/20 border-rose-500/40 text-rose-200"
                    : "bg-slate-950/60 border-slate-800 text-slate-300"
                }`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider block">
                    {details.pain ? "⚠️ Біль присутній" : "🍏 Скарг на біль немає"}
                  </span>
                  {details.pain && (
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Шкала ВАШ:</span>
                        <strong className="text-rose-400 font-mono text-sm px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/30">
                          {details.painVas ?? 0} / 10
                        </strong>
                      </div>
                      {details.painLocations && details.painLocations.length > 0 && (
                        <div className="text-[11px] text-slate-200 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                          <span className="text-slate-400 block mb-0.5">Локалізація:</span>
                          <strong className="text-sky-300 font-semibold">
                            {details.painLocations.map((loc) => formatPainLocation(loc)).join(", ")}
                          </strong>
                        </div>
                      )}
                      {/* Характер болю */}
                      {details.painSymptoms && details.painSymptoms.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-amber-300 font-bold uppercase block">
                            Характер болю:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {details.painSymptoms.map((sym: string) => (
                              <span
                                key={sym}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 font-medium"
                              >
                                {PAIN_SYMPTOM_MAP_UA[sym] || sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Коментар до болю */}
                      {details.painComment && (
                        <div className="p-2 rounded-xl bg-slate-900/80 border border-amber-500/30 text-[11px] text-amber-200 italic">
                          📝 «{details.painComment}»
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Картка хвороби / ГРВІ */}
                <div className={`p-3.5 rounded-2xl border ${
                  details.illness
                    ? "bg-rose-950/20 border-rose-500/40 text-rose-200"
                    : "bg-slate-950/60 border-slate-800 text-slate-300"
                }`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider block">
                    {details.illness ? "🤒 Ознаки захворювання / ГРВІ" : "🍏 Соматично здоровий"}
                  </span>
                  {details.illness ? (
                    <div className="mt-2 space-y-2 text-xs">
                      {/* Температура */}
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Температура:</span>
                        <strong className={`font-mono text-sm px-2 py-0.5 rounded border ${
                          details.temperature && Number(String(details.temperature).replace("+", "")) >= 37.2
                            ? "bg-rose-500/25 border-rose-500/40 text-rose-300"
                            : "bg-amber-500/20 border-amber-500/30 text-amber-200"
                        }`}>
                          🌡️ {details.temperature ? `${details.temperature}°C` : "Не вказано"}
                        </strong>
                      </div>

                      {/* Симптоми ГРВІ */}
                      {details.illnessSymptoms && details.illnessSymptoms.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-rose-300 font-bold uppercase block">
                            Симптоми:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {details.illnessSymptoms.map((sym: string) => (
                              <span
                                key={sym}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 font-medium"
                              >
                                {ILLNESS_SYMPTOM_MAP_UA[sym] || sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Коментар до хвороби */}
                      {details.illnessComment && (
                        <div className="p-2 rounded-xl bg-slate-900/80 border border-rose-500/30 text-[11px] text-rose-200 italic">
                          💬 «{details.illnessComment}»
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 mt-2 block">
                      Симптоми ГРВІ та підвищена температура відсутні.
                    </span>
                  )}
                </div>
              </div>

              {/* Загальний коментар для лікаря */}
              {details.comment && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">
                    💬 Особистий коментар гравця для лікаря (приховано для тренера):
                  </span>
                  <p className="text-xs text-white leading-relaxed italic">
                    «{details.comment}»
                  </p>
                </div>
              )}

              {/* СЕКЦІЯ ВІДПОВІДІ / РЕКОМЕНДАЦІЇ ЛІКАРЯ В TELEGRAM */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-sky-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">👨‍⚕️</span>
                    <span className="text-xs font-bold text-sky-300 tracking-tight">
                      Оперативна вказівка / Рекомендація лікаря
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {telegramStatus.loading ? (
                      <span className="text-[10px] text-slate-500">Перевірка Telegram...</span>
                    ) : telegramStatus.isBound ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1">
                        <span>📲</span> Telegram підключено {telegramStatus.username ? `(@${telegramStatus.username})` : ""}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                        <span>⚠️</span> Telegram не прив&apos;язано (буде в кабінеті)
                      </span>
                    )}
                  </div>
                </div>

                {/* Швидкі шаблони */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Швидкі шаблони в один клік:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {DOCTOR_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.title}
                        type="button"
                        onClick={() => setRecommendationText(tpl.text)}
                        className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-left transition-all active:scale-95 group cursor-pointer"
                      >
                        <div className="text-sm mb-0.5">{tpl.icon}</div>
                        <div className="text-[11px] font-bold text-slate-200 group-hover:text-sky-300 truncate">
                          {tpl.title}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Поле вводу рекомендації */}
                <div className="space-y-1.5">
                  <textarea
                    rows={3}
                    value={recommendationText}
                    onChange={(e) => setRecommendationText(e.target.value)}
                    placeholder="Введіть рекомендацію або оберіть шаблон вище (наприклад: залишайся вдома, спокій, зв'язок о 14:00)..."
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-sky-500 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors leading-relaxed"
                  />
                </div>

                {/* Фідбек відправки */}
                {recFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    recFeedback.success
                      ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-200"
                      : "bg-rose-950/40 border border-rose-500/30 text-rose-200"
                  }`}>
                    <span>{recFeedback.success ? "✓" : "⚠️"}</span>
                    <span>{recFeedback.msg}</span>
                  </div>
                )}

                {/* Кнопка відправки */}
                <div className="flex items-center justify-between pt-1">
                  {savedRecommendation?.sentAt ? (
                    <span className="text-[10px] text-slate-400">
                      Надіслано: {new Date(savedRecommendation.sentAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                      {savedRecommendation.sentToTelegram ? " (в Telegram ✓)" : " (в кабінет)"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Вказівка ще не надсилалась</span>
                  )}

                  <button
                    type="button"
                    disabled={isSendingRec || !recommendationText.trim()}
                    onClick={handleSendRecommendation}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition-all flex items-center gap-2 shadow-md active:scale-95"
                  >
                    <span>{isSendingRec ? "⏳" : "✈️"}</span>
                    <span>{isSendingRec ? "Відправка..." : "Надіслати вказівку гравцю"}</span>
                  </button>
                </div>

                {/* ПРЯМИЙ КОНТАКТ З ЛІКАРЕМ */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="text-sm">📞</span>
                    <span>
                      Прямий контакт лікаря:{" "}
                      <span className="font-mono font-bold text-sky-400">{DEFAULT_DOCTOR_PHONE}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={DEFAULT_DOCTOR_TG_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-[11px] font-medium transition-colors"
                    >
                      <span>💬</span>
                      <span>Відкрити мій Telegram</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      disabled={isRefreshingReplies}
                      title="Оновити відповіді з Telegram"
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <span className={isRefreshingReplies ? "animate-spin" : ""}>🔄</span>
                      <span>{isRefreshingReplies ? "Оновлення..." : "Оновити"}</span>
                    </button>
                  </div>
                </div>

                {/* ВІДПОВІДЬ ГРАВЦЯ З TELEGRAM */}
                {savedRecommendation?.playerReply ? (
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-950/50 to-slate-900 border border-indigo-500/40 space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                        <span className="text-sm">💬</span>
                        <span>Відповідь гравця з Telegram:</span>
                        {savedRecommendation.playerReply.username && (
                          <span className="text-[11px] text-indigo-200/80 font-normal">
                            ({savedRecommendation.playerReply.username})
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(savedRecommendation.playerReply.receivedAt).toLocaleTimeString("uk-UA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/90 border border-indigo-500/25 text-xs text-slate-100 font-medium whitespace-pre-wrap leading-relaxed shadow-inner">
                      {savedRecommendation.playerReply.text}
                    </div>

                    {/* Історія попередніх повідомлень гравця за день, якщо їх декілька */}
                    {Array.isArray(savedRecommendation.replies) && savedRecommendation.replies.length > 1 && (
                      <div className="space-y-1 pt-1.5 border-t border-indigo-500/20">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Попередня історія за день ({savedRecommendation.replies.length}):
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                          {savedRecommendation.replies.slice(0, -1).map((r: any, idx: number) => (
                            <div
                              key={idx}
                              className="text-[11px] text-slate-300 bg-slate-900/60 p-2 rounded-lg border border-slate-800 flex items-start justify-between gap-2"
                            >
                              <span className="line-clamp-2">{r.text}</span>
                              <span className="text-[9px] text-slate-500 shrink-0 font-mono">
                                {new Date(r.receivedAt).toLocaleTimeString("uk-UA", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : savedRecommendation?.sentToTelegram ? (
                  <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      <span>Вказівку доставлено в Telegram. Очікується відповідь гравця або дзвінок.</span>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* 2. БІОМЕТРІЯ З НОСИМИХ ПРИСТРОЇВ (8.8) */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span>⌚</span>
              <span>Дані з годинника (Wearables)</span>
              {wearables && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/30 font-medium">
                  {wearables.deviceType.toUpperCase()} • {wearables.hrvMetric.toUpperCase()}
                </span>
              )}
            </h4>

            {/* ОБОВ'ЯЗКОВА ПОЗНАЧКА «Дані внесені гравцем, не перевірені» */}
            <span className="text-[10px] font-medium text-amber-400/90 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25">
              ⚠️ {WEARABLES_DISCLAIMER_TEXT}
            </span>
          </div>

          {wearables ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Пульс спокою */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Пульс спокою (RHR)</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.restingHrBpm ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">уд/хв</span>
                  </div>
                  {wearables.restingHrZScore !== null && (
                    <span className={`text-[10px] font-mono font-bold block mt-1 ${
                      wearables.restingHrZScore >= 1.5
                        ? "text-rose-400"
                        : wearables.restingHrZScore <= -1.5
                        ? "text-sky-400"
                        : "text-emerald-400"
                    }`}>
                      Z: {wearables.restingHrZScore > 0 ? `+${wearables.restingHrZScore}` : wearables.restingHrZScore} SD
                    </span>
                  )}
                </div>

                {/* HRV */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">
                    HRV ({wearables.hrvMetric.toUpperCase()})
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.hrvMs ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">мс</span>
                  </div>
                  {wearables.hrvZScore !== null && (
                    <span className={`text-[10px] font-mono font-bold block mt-1 ${
                      wearables.hrvZScore <= -1.5
                        ? "text-rose-400"
                        : wearables.hrvZScore >= 1.5
                        ? "text-emerald-400"
                        : "text-emerald-400"
                    }`}>
                      Z: {wearables.hrvZScore > 0 ? `+${wearables.hrvZScore}` : wearables.hrvZScore} SD
                    </span>
                  )}
                </div>

                {/* Сон трекера */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Сон (трекер)</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.sleepDurationMin
                        ? `${Math.floor(wearables.sleepDurationMin / 60)}г ${wearables.sleepDurationMin % 60}хв`
                        : "—"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    {wearables.sleepDurationMin ? `${wearables.sleepDurationMin} хв` : "—"}
                  </span>
                </div>

                {/* Показник відновлення пристрою */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block truncate">
                    {wearables.deviceScoreName || "Індекс трекера"}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold font-mono text-white">
                      {wearables.deviceScore ?? "—"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {wearables.deviceScore !== null ? "%" : ""}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 truncate">
                    {wearables.deviceScoreName || "Оцінка пристрою"}
                  </span>
                </div>
              </div>

              {/* Порівняння з особистою нормою */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Особиста норма (вікно 28 днів):</span>
                  <span className="text-[11px] font-mono text-sky-400">
                    {wearables.baselineStatus === "ready"
                      ? "Норма розрахована"
                      : "Збір базових даних (< 14 днів)"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Показники порівнюються <strong>виключно з особистою нормою гравця</strong> за тим самим
                  пристроєм ({wearables.deviceType}) та методикою ({wearables.hrvMetric.toUpperCase()}). З іншими гравцями чи пристроями не порівнюється.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center text-xs text-slate-500">
              Сьогодні гравець не вносив показники з годинника або відсутня згода батьків.
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}
