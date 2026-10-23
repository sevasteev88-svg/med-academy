"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createInjury } from "@/actions/create-injury-action";
import { getPlayerPastInjuries, type PastInjurySummary } from "@/actions/osiics-actions";
import OsiicsPicker from "@/components/injuries/OsiicsPicker";
import {
  getInjuryUefaSeverityInfo,
  ONSET_UA,
  OCCURRENCE_UA,
  type InjuryOnset,
  type InjuryOccurrence,
} from "@/lib/uefa-severity";
import type {
  InjuryLocation,
  InjuryMechanism,
  InjurySeverity,
  InjurySide,
  InjuryType,
} from "@/types/database";

type Props = {
  playerId: string;
  playerName?: string;
  successRedirectUrl?: string; // ← куди редиректити після збереження
  onSuccess?: () => void;
  onCancel?: () => void;
};

const INJURY_TYPES: { value: InjuryType; label: string }[] = [
  { value: "muscular",    label: "М'язова" },
  { value: "ligament",   label: "Зв'язкова" },
  { value: "bone",       label: "Кісткова" },
  { value: "tendon",     label: "Сухожилля" },
  { value: "cartilage",  label: "Хрящова" },
  { value: "concussion", label: "Струс мозку" },
  { value: "contusion",  label: "Забій" },
  { value: "other",      label: "Інше" },
];

const LOCATIONS: { value: InjuryLocation; label: string }[] = [
  { value: "knee",     label: "Коліно" },
  { value: "ankle",    label: "Гомілково-ступневий" },
  { value: "shoulder", label: "Плече" },
  { value: "thigh",    label: "Стегно" },
  { value: "calf",     label: "Литка" },
  { value: "foot",     label: "Стопа" },
  { value: "groin",    label: "Пах" },
  { value: "spine",    label: "Хребет / спина" },
  { value: "elbow",    label: "Лікоть" },
  { value: "wrist",    label: "Зап'ясток" },
  { value: "head",     label: "Голова" },
  { value: "other",    label: "Інше" },
];

const SEVERITIES: { value: InjurySeverity; label: string }[] = [
  { value: "minimal",            label: "Мінімальна (1–3 дні)" },
  { value: "mild",               label: "Легка (4–7 днів)" },
  { value: "moderate",           label: "Помірна (8–28 днів)" },
  { value: "severe",             label: "Тяжка (29–90 днів)" },
  { value: "career_threatening", label: "Загроза кар'єрі (90+ днів)" },
];

const MECHANISMS: { value: InjuryMechanism; label: string }[] = [
  { value: "contact",     label: "Контактна" },
  { value: "non_contact", label: "Неконтактна" },
  { value: "overuse",     label: "Перевантаження" },
];

export default function InjuryForm({
  playerId, playerName, successRedirectUrl, onSuccess, onCancel
}: Props) {
  const router = useRouter();

  const [injuryType, setInjuryType] = useState<InjuryType>("muscular");
  const [location, setLocation] = useState<InjuryLocation | "">("");
  const [side, setSide] = useState<InjurySide>("left");
  const [severity, setSeverity] = useState<InjurySeverity>("moderate");
  const [mechanism, setMechanism] = useState<InjuryMechanism>("non_contact");
  const [vasScore, setVasScore] = useState<number>(5);
  const [dateOfInjury, setDateOfInjury] = useState(new Date().toISOString().split("T")[0]);
  const [activityType, setActivityType] = useState<"training" | "match" | "other">("training");
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>("");
  const [description, setDescription] = useState("");

  // Стандарти OSIICS та UEFA
  const [onset, setOnset] = useState<InjuryOnset>("acute");
  const [occurrence, setOccurrence] = useState<InjuryOccurrence>("new");
  const [osiicsCode, setOsiicsCode] = useState<string>("");
  const [previousInjuryId, setPreviousInjuryId] = useState<string>("");
  const [pastInjuries, setPastInjuries] = useState<PastInjurySummary[]>([]);
  const [isLoadingPastInjuries, setIsLoadingPastInjuries] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Завантаження минулих травм для зв'язку рецидивів
  useEffect(() => {
    if (occurrence === "recurrence" || occurrence === "exacerbation") {
      setIsLoadingPastInjuries(true);
      getPlayerPastInjuries(playerId)
        .then((data) => {
          setPastInjuries(data);
          if (data.length > 0 && !previousInjuryId) {
            setPreviousInjuryId(data[0].id);
          }
        })
        .finally(() => setIsLoadingPastInjuries(false));
    }
  }, [playerId, occurrence, previousInjuryId]);

  // Розрахунок попередньої тяжкості за UEFA
  const uefaInfo = useMemo(() => {
    return getInjuryUefaSeverityInfo({
      dateOfInjury,
      expectedReturnDate: expectedReturnDate || null,
      status: "active",
    });
  }, [dateOfInjury, expectedReturnDate]);

  const handleSubmit = async () => {
    if (!location) {
      setError("Оберіть локалізацію травми");
      return;
    }

    if (new Date(dateOfInjury) > new Date()) {
      setError("Дата травми не може бути в майбутньому");
      return;
    }

    if (expectedReturnDate && new Date(expectedReturnDate) < new Date(dateOfInjury)) {
      setError("Очікувана дата повернення не може бути раніше дати отримання травми");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = await createInjury({
        playerId,
        injuryType,
        location: location as InjuryLocation,
        side,
        severity,
        mechanism,
        dateOfInjury,
        expectedReturnDate: expectedReturnDate || undefined,
        vasScore,
        activityType,
        description: description || undefined,
        osiicsCode: osiicsCode || undefined,
        onset,
        occurrence,
        previousInjuryId: (occurrence === "recurrence" || occurrence === "exacerbation") ? previousInjuryId || undefined : undefined,
      });

      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onSuccess?.();
        if (successRedirectUrl) router.push(successRedirectUrl);
      }
    } catch {
      setError("Помилка збереження. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {playerName && (
        <div className="text-sm text-gray-400">
          Гравець: <span className="text-white font-medium">{playerName}</span>
        </div>
      )}

      {/* Основна інформація */}
      <section className="bg-surface rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Основна інформація</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Тип травми *</label>
            <select
              value={injuryType}
              onChange={e => setInjuryType(e.target.value as InjuryType)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              {INJURY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Дата травми *</label>
            <input
              type="date"
              value={dateOfInjury}
              max={new Date().toISOString().split("T")[0]}
              onChange={e => setDateOfInjury(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Обставини виникнення (експозиція)</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActivityType("training")}
              className={`py-2 text-xs rounded-lg border font-semibold transition ${
                activityType === "training"
                  ? "bg-sky-500/20 border-sky-400 text-sky-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              ⏱️ Тренування
            </button>
            <button
              type="button"
              onClick={() => setActivityType("match")}
              className={`py-2 text-xs rounded-lg border font-semibold transition ${
                activityType === "match"
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              ⚽ Матч
            </button>
            <button
              type="button"
              onClick={() => setActivityType("other")}
              className={`py-2 text-xs rounded-lg border font-semibold transition ${
                activityType === "other"
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              🏃 Інше (побут/індивідуально)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Локалізація *</label>
            <select
              value={location}
              onChange={e => setLocation(e.target.value as InjuryLocation)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              <option value="">— оберіть —</option>
              {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Сторона *</label>
            <div className="flex gap-2">
              {(["left", "right", "bilateral"] as InjurySide[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                    side === s
                      ? "bg-brand-blue/20 border-brand-blue text-brand-blue font-bold"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {s === "left" ? "Ліва" : s === "right" ? "Права" : "Обидві"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Клінічна оцінка лікаря (суб'єктивна) *
            </label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as InjurySeverity)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Механізм ушкодження</label>
            <div className="flex gap-2">
              {MECHANISMS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMechanism(m.value)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                    mechanism === m.value
                      ? "bg-brand-blue/20 border-brand-blue text-brand-blue font-bold"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Очікувана дата повернення та попередня тяжкість за UEFA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Очікувана дата повернення (RTP прогноз)
            </label>
            <input
              type="date"
              value={expectedReturnDate}
              min={dateOfInjury}
              onChange={e => setExpectedReturnDate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            />
          </div>

          <div className="flex flex-col justify-end">
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${uefaInfo.colorClass}`}>
              <div>
                <span className="font-semibold block">{uefaInfo.badgeText}</span>
                <span className="text-[11px] opacity-80">
                  {expectedReturnDate
                    ? `Очікувано: ${uefaInfo.expectedDays ?? 0} дн. від дати травми`
                    : `Поточний термін: ${uefaInfo.timeLossDays} дн. у лазареті`}
                </span>
              </div>
              <span className="text-base">⏱️</span>
            </div>
          </div>
        </div>
      </section>

      {/* Стандарти обліку травм UEFA та OSIICS */}
      <section className="bg-surface rounded-xl border border-sky-500/20 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-2">
            <span>🛡️</span>
            <span>Стандарти обліку UEFA та класифікація OSIICS</span>
          </h3>
          <span className="text-[10px] text-gray-400 border border-sky-500/30 px-2 py-0.5 rounded-full">
            Fuller / UEFA Consensus 2006
          </span>
        </div>

        {/* Характер виникнення (UEFA Onset) */}
        <div>
          <label className="block text-xs text-gray-300 mb-1.5 font-medium">
            Характер виникнення (UEFA Onset) *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOnset("acute")}
              className={`p-3 rounded-xl border text-left transition-all ${
                onset === "acute"
                  ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              <div className="text-xs font-bold text-sky-300">Гострий (Acute)</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Раптовий початок, чіткий момент травми (ривок, підкат, удар)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setOnset("gradual")}
              className={`p-3 rounded-xl border text-left transition-all ${
                onset === "gradual"
                  ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
              }`}
            >
              <div className="text-xs font-bold text-amber-300">Поступовий (Overuse / Gradual)</div>
              <div className="text-[11px] text-gray-400 mt-1">
                Поступове наростання симптомів без ідентифікованого моменту
              </div>
            </button>
          </div>
        </div>

        {/* Тип випадку (UEFA Occurrence) */}
        <div>
          <label className="block text-xs text-gray-300 mb-1.5 font-medium">
            Тип випадку (UEFA Occurrence) *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "new", label: "Нова травма", desc: "Первинний епізод" },
              { key: "recurrence", label: "Рецидив (Recurrence)", desc: "Після повного повернення" },
              { key: "exacerbation", label: "Загострення", desc: "До повного одужання" },
            ].map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOccurrence(item.key as InjuryOccurrence)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  occurrence === item.key
                    ? "bg-sky-500/20 border-sky-400 text-white"
                    : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                }`}
              >
                <div className="text-xs font-bold text-white">{item.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Селектор зв'язку з попередньою травмою при рецидиві або загостренні */}
        {(occurrence === "recurrence" || occurrence === "exacerbation") && (
          <div className="p-3.5 bg-sky-950/40 border border-sky-500/30 rounded-xl space-y-2">
            <label className="block text-xs text-sky-200 font-semibold">
              Попередня травма для зв'язку рецидиву:
            </label>
            {isLoadingPastInjuries ? (
              <p className="text-xs text-gray-400 animate-pulse">Завантаження історії травм гравця...</p>
            ) : pastInjuries.length === 0 ? (
              <p className="text-xs text-amber-300/90">
                ⚠️ У гравця немає зареєстрованих попередніх травм у базі. Запис буде збережено як рецидив без зовнішнього посилання.
              </p>
            ) : (
              <select
                value={previousInjuryId}
                onChange={e => setPreviousInjuryId(e.target.value)}
                className="w-full bg-gray-900 border border-sky-700/60 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-blue"
              >
                <option value="">— оберіть травму зі списку —</option>
                {pastInjuries.map(pi => (
                  <option key={pi.id} value={pi.id}>
                    {pi.date_of_injury} · {pi.location} ({pi.injury_type}) · {pi.status} {pi.osiics_code ? `[${pi.osiics_code}]` : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-sky-300/70">
              * Відповідно до UEFA, рецидив фіксується при ушкодженні тієї ж локалізації після повернення до повного тренування.
            </p>
          </div>
        )}

        {/* Довідник та код OSIICS */}
        <OsiicsPicker
          value={osiicsCode}
          onChange={(val) => setOsiicsCode(val)}
        />
      </section>

      {/* Рівень болю (ВАШ 0-10) */}
      <section className="bg-surface rounded-xl border border-gray-800 p-5 space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs text-gray-400">
              Рівень болю (Шкала ВАШ): <span className="text-white font-bold">{vasScore}/10</span>
            </label>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
              vasScore <= 3
                ? "bg-status-ok/20 text-status-ok"
                : vasScore <= 6
                ? "bg-status-warn/20 text-status-warn"
                : "bg-status-danger/20 text-status-danger"
            }`}>
              {vasScore === 0
                ? "Без болю"
                : vasScore <= 3
                ? "Слабкий біль"
                : vasScore <= 6
                ? "Помірний біль"
                : vasScore <= 8
                ? "Сильний біль"
                : "Нестерпний біль"}
            </span>
          </div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => i).map((score) => {
              const isSelected = vasScore === score;
              const colorClass =
                score <= 3
                  ? isSelected
                    ? "bg-status-ok border-status-ok text-white font-bold"
                    : "border-gray-700 text-gray-400 hover:border-status-ok/50"
                  : score <= 6
                  ? isSelected
                    ? "bg-status-warn border-status-warn text-white font-bold"
                    : "border-gray-700 text-gray-400 hover:border-status-warn/50"
                  : isSelected
                  ? "bg-status-danger border-status-danger text-white font-bold"
                  : "border-gray-700 text-gray-400 hover:border-status-danger/50";

              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => setVasScore(score)}
                  className={`py-2 text-xs rounded-lg border transition-all text-center ${colorClass}`}
                >
                  {score}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Опис (опціонально)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Обставини травми, симптоми, механізм..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue resize-none"
          />
        </div>
      </section>

      {error && (
        <p className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors shadow-glow-sm"
        >
          {loading ? "Збереження..." : "Зафіксувати травму"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 border border-gray-700 text-gray-400 hover:border-gray-500 font-medium py-3 rounded-lg transition-colors"
          >
            Скасувати
          </button>
        )}
      </div>
    </div>
  );
}
