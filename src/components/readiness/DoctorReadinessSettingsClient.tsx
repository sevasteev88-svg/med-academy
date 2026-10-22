"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  type ClubReadinessConfig,
  type ReadinessThresholds,
  type CoachCategoryVisibility,
  DEFAULT_READINESS_THRESHOLDS,
  DEFAULT_COACH_CATEGORY_VISIBILITY,
  DRAFT_STATUS_LABEL,
  APPROVED_STATUS_LABEL,
} from "@/lib/readiness-constants";
import { saveClubReadinessConfigAction } from "@/actions/readiness-actions";

interface Props {
  initialConfig: ClubReadinessConfig;
  userRole: string;
}

export default function DoctorReadinessSettingsClient({
  initialConfig,
  userRole,
}: Props) {
  const [config, setConfig] = useState<ClubReadinessConfig>(initialConfig);
  const [thresholds, setThresholds] = useState<ReadinessThresholds>(
    initialConfig.thresholds
  );
  const [visibility, setVisibility] = useState<CoachCategoryVisibility>(
    initialConfig.visibility
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  const isDraft = config.status === "draft";

  const handleSave = async (approve: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveClubReadinessConfigAction({
        thresholds,
        visibility,
        morningReminder: config.morningReminder,
        approve,
      });

      if (res.success && res.config) {
        setConfig(res.config);
        setMessage({
          type: "success",
          text: approve
            ? "Порогові значення успішно затверджено лікарем клубу!"
            : "Чернетку порогових значень збережено.",
        });
      } else {
        setMessage({
          type: "error",
          text: res.error || "Помилка збереження налаштувань.",
        });
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Непередбачена помилка.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setThresholds({ ...DEFAULT_READINESS_THRESHOLDS });
    setVisibility({ ...DEFAULT_COACH_CATEGORY_VISIBILITY });
    setMessage({
      type: "success",
      text: "Встановлено рекомендовані значення за замовчуванням (не забудьте зберегти/затвердити).",
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 1. БАНЕР СТАТУСУ ЗАТВЕРДЖЕННЯ */}
      <div
        className={`p-5 rounded-2xl border backdrop-blur-md transition-all ${
          isDraft
            ? "bg-amber-950/30 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
            : "bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isDraft ? "⚠️" : "🛡️"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs uppercase font-extrabold px-2.5 py-0.5 rounded-full border ${
                    isDraft
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  }`}
                >
                  {isDraft ? "Потребує підтвердження" : "Офіційний регламент"}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                {config.statusLabel}
              </h2>
              {config.approvedByDoctorName && config.approvedAt && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Підтвердив: {config.approvedByDoctorName} (
                  {new Date(config.approvedAt).toLocaleDateString("uk-UA")})
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
            >
              {saving ? "Збереження..." : "✓ Затвердити лікарем"}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 2. НАЛАШТУВАННЯ ПОРОГОВИХ ЗНАЧЕНЬ */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>⚙️</span>
            <span>Порогові правила спрацьовування світлофора</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Клінічні пороги для розрахунку відхилень від особистої норми гравця та індикації червоних і жовтих прапорців.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Мінімальна кількість днів для розрахунку норми */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1.5">
            <label className="text-xs font-bold text-slate-200">
              Мінімум заповнених анкет за 28 днів:
            </label>
            <p className="text-[11px] text-slate-400">
              Якщо менше — статус сірий («Збір базових даних»), порівняння з нормою не проводиться.
            </p>
            <input
              type="number"
              min={7}
              max={28}
              value={thresholds.baselineRequiredDays}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  baselineRequiredDays: parseInt(e.target.value) || 14,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Вікно збору норми в днях */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1.5">
            <label className="text-xs font-bold text-slate-200">
              Вікно розрахунку норми (днів):
            </label>
            <p className="text-[11px] text-slate-400">
              Період для розрахунку середнього значення та стандартного відхилення.
            </p>
            <input
              type="number"
              min={14}
              max={60}
              value={thresholds.baselineWindowDays}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  baselineWindowDays: parseInt(e.target.value) || 28,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Поріг ВАШ для червоного прапорця */}
          <div className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/20 space-y-1.5">
            <label className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <span>🔴</span>
              <span>Поріг болю ВАШ (Червоний прапорець):</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Біль за шкалою ВАШ $\ge$ цьому значенню переводить гравця в статус «Поговорити з гравцем / повідомити лікаря».
            </p>
            <input
              type="number"
              min={1}
              max={10}
              value={thresholds.painVasRedThreshold}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  painVasRedThreshold: parseInt(e.target.value) || 5,
                })
              }
              className="w-full bg-slate-900 border border-rose-500/30 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-rose-500 focus:outline-none"
            />
          </div>

          {/* Поріг ВАШ для жовтого прапорця */}
          <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-500/20 space-y-1.5">
            <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span>🟡</span>
              <span>Поріг болю ВАШ (Жовтий прапорець):</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Помірний біль за шкалою ВАШ $\ge$ цьому значенню переводить у статус «Потребує уваги».
            </p>
            <input
              type="number"
              min={1}
              max={9}
              value={thresholds.painVasYellowThreshold}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  painVasYellowThreshold: parseInt(e.target.value) || 3,
                })
              }
              className="w-full bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Z-score червоний */}
          <div className="p-4 rounded-xl bg-rose-950/15 border border-rose-500/20 space-y-1.5">
            <label className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <span>🔴</span>
              <span>Відхилення Z-score (Червоний поріг):</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Падіння композиту на вказану кількість стандартних відхилень нижче норми (за замовчуванням $\le -1.5$).
            </p>
            <input
              type="number"
              step="0.1"
              value={thresholds.zScoreRedThreshold}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  zScoreRedThreshold: parseFloat(e.target.value) || -1.5,
                })
              }
              className="w-full bg-slate-900 border border-rose-500/30 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-rose-500 focus:outline-none"
            />
          </div>

          {/* Z-score жовтий */}
          <div className="p-4 rounded-xl bg-amber-950/15 border border-amber-500/20 space-y-1.5">
            <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span>🟡</span>
              <span>Відхилення Z-score (Жовтий поріг):</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Помірне падіння композиту нижче особистої норми (за замовчуванням $\le -1.0$).
            </p>
            <input
              type="number"
              step="0.1"
              value={thresholds.zScoreYellowThreshold}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  zScoreYellowThreshold: parseFloat(e.target.value) || -1.0,
                })
              }
              className="w-full bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* 8.5 Детекція монотонних відповідей N днів поспіль */}
          <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Поріг однакових відповідей поспіль (Детекція монотонності N днів):</span>
            </label>
            <p className="text-[11px] text-slate-400">
              Якщо гравець відповідає абсолютно однаково N днів поспіль (за замовчуванням 7), гравцю показується м&apos;яка підказка «Все гаразд? Можна додати нотатку», а лікарю відображається позначка на огляді. Тренеру не показується.
            </p>
            <input
              type="number"
              min={3}
              max={30}
              value={thresholds.monotonyThresholdDays || 7}
              onChange={(e) =>
                setThresholds({
                  ...thresholds,
                  monotonyThresholdDays: parseInt(e.target.value) || 7,
                })
              }
              className="w-full bg-slate-900 border border-purple-500/40 rounded-lg px-3 py-2 text-white text-xs mt-2 focus:border-purple-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. НАЛАШТУВАННЯ ВИДИМОСТІ ДЛЯ ТРЕНЕРА */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>👁️</span>
            <span>Видимість фізичних категорій для тренерського штабу</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Налаштування того, які фізичні теги відображаються на екрані тренера. Нагадування: стрес, приватні коментарі, локалізація, шкала ВАШ та діагнози <strong>суворо приховані</strong> від тренера незалежно від цих перемикачів.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer hover:bg-slate-800/60">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>⚡</span>
                <span>Категорія «Біль»</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Показувати тренеру тег наявності болю / крепатури
              </div>
            </div>
            <input
              type="checkbox"
              checked={visibility.showPainCategory}
              onChange={(e) =>
                setVisibility({ ...visibility, showPainCategory: e.target.checked })
              }
              className="w-4 h-4 rounded text-sky-500 focus:ring-0 focus:outline-none"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer hover:bg-slate-800/60">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>🔋</span>
                <span>Категорія «Втома»</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Показувати тренеру тег підвищеної втоми
              </div>
            </div>
            <input
              type="checkbox"
              checked={visibility.showFatigueCategory}
              onChange={(e) =>
                setVisibility({ ...visibility, showFatigueCategory: e.target.checked })
              }
              className="w-4 h-4 rounded text-sky-500 focus:ring-0 focus:outline-none"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer hover:bg-slate-800/60">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>🌙</span>
                <span>Категорія «Сон»</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Показувати тренеру тег порушення сну
              </div>
            </div>
            <input
              type="checkbox"
              checked={visibility.showSleepCategory}
              onChange={(e) =>
                setVisibility({ ...visibility, showSleepCategory: e.target.checked })
              }
              className="w-4 h-4 rounded text-sky-500 focus:ring-0 focus:outline-none"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 cursor-pointer hover:bg-slate-800/60">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>🤒</span>
                <span>Категорія «Нездужання»</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Показувати тренеру позначку «хворію»
              </div>
            </div>
            <input
              type="checkbox"
              checked={visibility.showIllnessCategory}
              onChange={(e) =>
                setVisibility({ ...visibility, showIllnessCategory: e.target.checked })
              }
              className="w-4 h-4 rounded text-sky-500 focus:ring-0 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* 4. КНОПКИ ЗБЕРЕЖЕННЯ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs text-slate-400 hover:text-slate-300 font-medium underline"
        >
          Відновити значення за замовчуванням
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all disabled:opacity-50"
          >
            Зберегти як чернетку
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
          >
            {saving ? "Збереження..." : "✓ Затвердити порогові значення лікарем"}
          </button>
        </div>
      </div>
    </div>
  );
}
