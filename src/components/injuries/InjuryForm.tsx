"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createInjury } from "@/actions/create-injury-action";
import { getPlayerPastInjuries, type PastInjurySummary } from "@/actions/osiics-actions";
import OsiicsPicker from "@/components/injuries/OsiicsPicker";
import {
  getInjuryUefaSeverityInfo,
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
import { Zap, Stethoscope, Clock, Shield, AlertTriangle } from "lucide-react";

export type InjuryFormInitialValues = {
  injuryType?: InjuryType;
  location?: InjuryLocation;
  side?: InjurySide;
  severity?: InjurySeverity;
  mechanism?: InjuryMechanism;
  vasScore?: number;
  dateOfInjury?: string;
  description?: string;
  onset?: InjuryOnset;
  occurrence?: InjuryOccurrence;
  osiicsCode?: string;
  isIllness?: boolean;
};

type Props = {
  playerId: string;
  playerName?: string;
  successRedirectUrl?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  initialValues?: InjuryFormInitialValues;
  userRole?: string;
};

const INJURY_TYPES: { value: InjuryType; label: string }[] = [
  { value: "muscular", label: "М'язова" },
  { value: "ligament", label: "Зв'язкова" },
  { value: "bone", label: "Кісткова" },
  { value: "tendon", label: "Сухожилля" },
  { value: "cartilage", label: "Хрящова" },
  { value: "concussion", label: "Струс мозку" },
  { value: "contusion", label: "Забій" },
  { value: "other", label: "Захворювання / Лікарняний / Інше" },
];

const LOCATIONS: { value: InjuryLocation; label: string }[] = [
  { value: "knee", label: "Коліно" },
  { value: "ankle", label: "Гомілково-ступневий" },
  { value: "shoulder", label: "Плече" },
  { value: "thigh", label: "Стегно" },
  { value: "calf", label: "Литка" },
  { value: "foot", label: "Стопа" },
  { value: "groin", label: "Пах" },
  { value: "spine", label: "Хребет / спина" },
  { value: "elbow", label: "Лікоть" },
  { value: "wrist", label: "Зап'ясток" },
  { value: "head", label: "Голова / ЛОР" },
  { value: "other", label: "Загальне / Інше" },
];

const SEVERITIES: { value: InjurySeverity; label: string }[] = [
  { value: "minimal", label: "Мінімальна (1–3 дні)" },
  { value: "mild", label: "Легка (4–7 днів)" },
  { value: "moderate", label: "Помірна (8–28 днів)" },
  { value: "severe", label: "Тяжка (29–90 днів)" },
  { value: "career_threatening", label: "Загроза кар'єрі (90+ днів)" },
];

const MECHANISMS: { value: InjuryMechanism; label: string }[] = [
  { value: "contact", label: "Контактна" },
  { value: "non_contact", label: "Неконтактна" },
  { value: "overuse", label: "Перевантаження" },
];

// Швидкі пресети найчастіших футбольних травм
interface FootballInjuryPreset {
  id: string;
  name: string;
  badge: string;
  type: InjuryType;
  location: InjuryLocation;
  side: InjurySide;
  mechanism: InjuryMechanism;
  onset: InjuryOnset;
  severity: InjurySeverity;
  vas: number;
  osiicsCode?: string;
  desc: string;
}

const PRESETS: FootballInjuryPreset[] = [
  {
    id: "hamstring",
    name: "Хамстрінг",
    badge: "⚡ Задня пов. стегна",
    type: "muscular",
    location: "thigh",
    side: "left",
    mechanism: "non_contact",
    onset: "acute",
    severity: "moderate",
    vas: 6,
    osiicsCode: "TMHM",
    desc: "Різкий біль при спринті/прискоренні, задня поверхня стегна.",
  },
  {
    id: "ankle",
    name: "Гомілкостоп",
    badge: "🦶 Підворот стопи",
    type: "ligament",
    location: "ankle",
    side: "right",
    mechanism: "contact",
    onset: "acute",
    severity: "mild",
    vas: 5,
    osiicsCode: "AJLS",
    desc: "Інверсійний підворот стопи під час єдиноборства чи приземлення.",
  },
  {
    id: "quad_contusion",
    name: "«Корка» стегна",
    badge: "💥 Забій чотириголового",
    type: "contusion",
    location: "thigh",
    side: "right",
    mechanism: "contact",
    onset: "acute",
    severity: "mild",
    vas: 5,
    osiicsCode: "TMQC",
    desc: "Прямий удар коліном суперника в передню поверхню стегна.",
  },
  {
    id: "knee_ligament",
    name: "Коліно (зв'язка)",
    badge: "🦵 Ротація / клацання",
    type: "ligament",
    location: "knee",
    side: "left",
    mechanism: "non_contact",
    onset: "acute",
    severity: "moderate",
    vas: 7,
    osiicsCode: "KJMS",
    desc: "Неконтактне ротаційне зміщення або клацання в коліні під час зміни напрямку.",
  },
  {
    id: "groin",
    name: "Пах / Аддуктор",
    badge: "🏃 Приводящий м'яз",
    type: "muscular",
    location: "groin",
    side: "left",
    mechanism: "overuse",
    onset: "gradual",
    severity: "moderate",
    vas: 5,
    osiicsCode: "GMTA",
    desc: "Тягнучий біль у паховій ділянці при ударах по м'ячу та зміні напрямку.",
  },
  {
    id: "calf",
    name: "Литка / Ахілл",
    badge: "⚡ Спазм / надрив литки",
    type: "muscular",
    location: "calf",
    side: "right",
    mechanism: "non_contact",
    onset: "acute",
    severity: "mild",
    vas: 6,
    osiicsCode: "CMGS",
    desc: "Відчуття різкого уколу в литковий м'яз під час ривка чи відштовхування.",
  },
  {
    id: "concussion",
    name: "Струс мозку",
    badge: "🧠 Удар головою (SCAT)",
    type: "concussion",
    location: "head",
    side: "bilateral",
    mechanism: "contact",
    onset: "acute",
    severity: "moderate",
    vas: 4,
    osiicsCode: "HNCC",
    desc: "Зіткнення головами / падіння у верховому єдиноборстві.",
  },
];

export default function InjuryForm({
  playerId,
  playerName,
  successRedirectUrl,
  onSuccess,
  onCancel,
  initialValues,
  userRole = "doctor",
}: Props) {
  const router = useRouter();
  const isCoach = userRole === "coach";

  // Режим форми: експрес-звіт тренера чи повний медичний протокол лікаря
  const [formMode, setFormMode] = useState<"coach_quick" | "full_medical">(
    isCoach ? "coach_quick" : "full_medical"
  );

  const [injuryType, setInjuryType] = useState<InjuryType>(
    initialValues?.injuryType || (initialValues?.isIllness ? "other" : "muscular")
  );
  const [location, setLocation] = useState<InjuryLocation | "">(
    initialValues?.location || (initialValues?.isIllness ? "other" : "")
  );
  const [side, setSide] = useState<InjurySide>(
    initialValues?.side || (initialValues?.isIllness ? "bilateral" : "left")
  );
  const [severity, setSeverity] = useState<InjurySeverity>(
    initialValues?.severity || "moderate"
  );
  const [mechanism, setMechanism] = useState<InjuryMechanism>(
    initialValues?.mechanism || "non_contact"
  );
  const [vasScore, setVasScore] = useState<number>(
    initialValues?.vasScore !== undefined
      ? initialValues.vasScore
      : initialValues?.isIllness
      ? 0
      : 5
  );
  const [dateOfInjury, setDateOfInjury] = useState(
    initialValues?.dateOfInjury || new Date().toISOString().split("T")[0]
  );
  const [activityType, setActivityType] = useState<"training" | "match" | "other">("training");
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>("");
  const [description, setDescription] = useState(initialValues?.description || "");

  // Додаткові спортивні поля UEFA (хвилина/фаза, покриття, зняття з гри)
  const [timingPhase, setTimingPhase] = useState<string>("");
  const [pitchSurface, setPitchSurface] = useState<string>("natural");
  const [removalFromPlay, setRemovalFromPlay] = useState<"immediate" | "halftime" | "finished">(
    "immediate"
  );

  // Стандарти OSIICS та UEFA
  const [onset, setOnset] = useState<InjuryOnset>(
    initialValues?.onset || (initialValues?.isIllness ? "gradual" : "acute")
  );
  const [occurrence, setOccurrence] = useState<InjuryOccurrence>(
    initialValues?.occurrence || "new"
  );
  const [osiicsCode, setOsiicsCode] = useState<string>(
    initialValues?.osiicsCode || (initialValues?.isIllness ? "INFC" : "")
  );
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

  // Застосування швидкого пресету
  const applyPreset = (preset: FootballInjuryPreset) => {
    setInjuryType(preset.type);
    setLocation(preset.location);
    setSide(preset.side);
    setMechanism(preset.mechanism);
    setOnset(preset.onset);
    setSeverity(preset.severity);
    setVasScore(preset.vas);
    if (preset.osiicsCode) setOsiicsCode(preset.osiicsCode);
    if (!description || description.trim() === "") {
      setDescription(preset.desc);
    }
  };

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
      // Формуємо додатковий контекст UEFA для опису
      const metaTags: string[] = [];
      if (timingPhase) metaTags.push(`Час: ${timingPhase}`);
      if (pitchSurface) {
        const surfaceName =
          pitchSurface === "natural"
            ? "Газон (натуральний)"
            : pitchSurface === "artificial"
            ? "Штучна трава 3G/4G"
            : pitchSurface === "hybrid"
            ? "Гібрид"
            : "Манеж";
        metaTags.push(`Покриття: ${surfaceName}`);
      }
      if (removalFromPlay) {
        const removalName =
          removalFromPlay === "immediate"
            ? "Негайне зняття з гри"
            : removalFromPlay === "halftime"
            ? "Дограв до заміни/перерви"
            : "Дограв до кінця";
        metaTags.push(`Зняття: ${removalName}`);
      }

      let combinedDescription = description.trim();
      if (metaTags.length > 0) {
        const metaPrefix = `[${metaTags.join(" | ")}]`;
        combinedDescription = combinedDescription
          ? `${metaPrefix} ${combinedDescription}`
          : metaPrefix;
      }

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
        description: combinedDescription || undefined,
        osiicsCode: formMode === "full_medical" ? osiicsCode || undefined : osiicsCode || undefined,
        onset,
        occurrence,
        previousInjuryId:
          occurrence === "recurrence" || occurrence === "exacerbation"
            ? previousInjuryId || undefined
            : undefined,
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
      {/* Інформація про гравця та режим форми */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div>
          <div className="text-xs text-gray-400">Футболіст:</div>
          <div className="text-base font-black text-white">{playerName || "—"}</div>
        </div>

        {/* Перемикач режиму форми */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs self-start sm:self-center">
          <button
            type="button"
            onClick={() => setFormMode("coach_quick")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              formMode === "coach_quick"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Експрес-звіт (Тренер / Поле)</span>
          </button>
          <button
            type="button"
            onClick={() => setFormMode("full_medical")}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
              formMode === "full_medical"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Повний протокол (UEFA / Лікар)</span>
          </button>
        </div>
      </div>

      {/* Швидкі футбольні пресети в один клік */}
      <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-bold text-gray-400 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Швидкі футбольні пресети (в один клік):</span>
          </span>
          <span className="text-[11px] text-gray-500">Автозаповнення полів форми</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-950/80 border border-slate-700/60 hover:border-sky-500/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
            >
              <span>{p.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {initialValues && (
        <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs text-sky-200 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{initialValues.isIllness ? "🤒" : "⚡"}</span>
            <div className="leading-tight">
              <span className="font-bold block text-white">
                {initialValues.isIllness
                  ? "Оформлення лікарняного / захворювання"
                  : "Фіксація за ранковим звітом"}
              </span>
              <span className="text-[11px] text-sky-300/80">
                Поля форми автоматично заповнено з щоденної анкети Hooper-Mackinnon.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Двоколонкова розкладка на десктопі */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ЛІВА КОЛОНКА: Основні параметри ушкодження */}
        <div className="lg:col-span-7 space-y-5">
          {/* Блок 1: Основна інформація */}
          <section className="bg-surface rounded-2xl border border-gray-800 p-5 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-800 pb-2">
              <span>📋</span> Основна інформація
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Тип травми *</label>
                <select
                  value={injuryType}
                  onChange={(e) => setInjuryType(e.target.value as InjuryType)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                >
                  {INJURY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Дата травми *</label>
                <input
                  type="date"
                  value={dateOfInjury}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setDateOfInjury(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                />
              </div>
            </div>

            {/* Обставини (експозиція) */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Обставини (експозиція)</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setActivityType("training")}
                  className={`py-2 text-xs rounded-xl border font-semibold transition ${
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
                  className={`py-2 text-xs rounded-xl border font-semibold transition ${
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
                  className={`py-2 text-xs rounded-xl border font-semibold transition ${
                    activityType === "other"
                      ? "bg-amber-500/20 border-amber-400 text-amber-300"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  🏃 Побут / індивідуально
                </button>
              </div>
            </div>

            {/* Хвилина / фаза та покриття */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {activityType === "match" ? "Хвилина матчу" : "Фаза тренування"}
                </label>
                <input
                  type="text"
                  value={timingPhase}
                  onChange={(e) => setTimingPhase(e.target.value)}
                  placeholder={
                    activityType === "match"
                      ? "напр., 34' (1-й тайм) або 75'"
                      : "напр., Розминка, Двосторонка, Кінець"
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Покриття поля</label>
                <select
                  value={pitchSurface}
                  onChange={(e) => setPitchSurface(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="natural">🌱 Натуральний газон</option>
                  <option value="artificial">🟩 Штучна трава (синтетика 3G/4G)</option>
                  <option value="hybrid">🌿 Гібридне поле</option>
                  <option value="arena">🏟️ Критий манеж / паркет</option>
                </select>
              </div>
            </div>

            {/* Локалізація та Сторона */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Локалізація *</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as InjuryLocation)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="">— оберіть —</option>
                  {LOCATIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Сторона *</label>
                <div className="flex gap-2">
                  {(["left", "right", "bilateral"] as InjurySide[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSide(s)}
                      className={`flex-1 py-2 text-xs rounded-xl border transition-colors ${
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

            {/* Механізм ушкодження */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Механізм ушкодження</label>
              <div className="flex gap-2">
                {MECHANISMS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMechanism(m.value)}
                    className={`flex-1 py-2 text-xs rounded-xl border transition-colors ${
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

            {/* Зняття з гри / тренування */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Зняття з гри / тренування</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "immediate", label: "Негайне зняття", icon: "🚨" },
                  { key: "halftime", label: "Дограв до заміни", icon: "⚠️" },
                  { key: "finished", label: "Закінчив гру", icon: "✅" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRemovalFromPlay(item.key as any)}
                    className={`py-2 px-2 text-xs rounded-xl border font-semibold transition flex items-center justify-center gap-1.5 ${
                      removalFromPlay === item.key
                        ? "bg-slate-800 border-sky-400 text-sky-300"
                        : "border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Блок 2: Рівень болю та опис */}
          <section className="bg-surface rounded-2xl border border-gray-800 p-5 space-y-4 shadow-lg">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-gray-400">
                  Рівень болю (Шкала ВАШ): <span className="text-white font-bold">{vasScore}/10</span>
                </label>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    vasScore <= 3
                      ? "bg-status-ok/20 text-status-ok"
                      : vasScore <= 6
                      ? "bg-status-warn/20 text-status-warn"
                      : "bg-status-danger/20 text-status-danger"
                  }`}
                >
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

              {/* Шкала ВАШ */}
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
              <label className="block text-xs text-gray-400 mb-1">
                Опис / обставини моменту травми (опціонально)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Як саме сталася травма, скарги гравця, чи набрякло місце удару..."
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue resize-none shadow-inner"
              />
            </div>
          </section>
        </div>

        {/* ПРАВА КОЛОНКА: Стандарти UEFA, OSIICS та прогноз */}
        <div className="lg:col-span-5 space-y-5">
          {/* Режим тренера: інформаційна плашка */}
          {formMode === "coach_quick" ? (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <span>⏱️</span>
                <span>Режим експрес-фіксації тренера</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ви вносите первинний звіт про пошкодження гравця на тренуванні чи виїзному матчі.
              </p>
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] text-gray-400 space-y-1">
                <div className="font-semibold text-slate-200">Що відбувається далі:</div>
                <div>• Футболіст автоматично позначається в лазареті.</div>
                <div>• Медичний штаб отримає повідомлення про нову травму.</div>
                <div>• Лікар проведе детальний огляд та внесе код OSIICS і план МРТ/лікування.</div>
              </div>
            </div>
          ) : (
            /* Повний медичний режим: Стандарти UEFA та OSIICS */
            <section className="bg-surface rounded-2xl border border-sky-500/20 p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-sky-500/10 pb-2">
                <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Стандарти UEFA та OSIICS</span>
                </h3>
                <span className="text-[10px] text-gray-400 border border-sky-500/30 px-2 py-0.5 rounded-full">
                  Fuller 2006
                </span>
              </div>

              {/* Клінічна оцінка лікаря (суб'єктивна) */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Клінічна оцінка лікаря (суб'єктивна) *
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as InjurySeverity)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-blue"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Характер виникнення (UEFA Onset) */}
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">
                  Характер виникнення (UEFA Onset) *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOnset("acute")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      onset === "acute"
                        ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                        : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <div className="text-xs font-bold text-sky-300">Гострий (Acute)</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Раптовий момент травми</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnset("gradual")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      onset === "gradual"
                        ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                        : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-300">Поступовий (Overuse)</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Наростання симптомів</div>
                  </button>
                </div>
              </div>

              {/* Тип випадку (UEFA Occurrence) */}
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-medium">
                  Тип випадку (UEFA Occurrence) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "new", label: "Нова травма", desc: "Первинний епізод" },
                    { key: "recurrence", label: "Рецидив", desc: "Після повернення" },
                    { key: "exacerbation", label: "Загострення", desc: "До одужання" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setOccurrence(item.key as InjuryOccurrence)}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        occurrence === item.key
                          ? "bg-sky-500/20 border-sky-400 text-white"
                          : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[9px] text-gray-400 mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Зв'язок рецидиву з попередньою травмою */}
              {(occurrence === "recurrence" || occurrence === "exacerbation") && (
                <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl space-y-1.5">
                  <label className="block text-xs text-sky-200 font-semibold">
                    Попередня травма для зв'язку рецидиву:
                  </label>
                  {isLoadingPastInjuries ? (
                    <p className="text-xs text-gray-400 animate-pulse">Завантаження історії...</p>
                  ) : pastInjuries.length === 0 ? (
                    <p className="text-xs text-amber-300/90">
                      ⚠️ У гравця немає зареєстрованих попередніх травм.
                    </p>
                  ) : (
                    <select
                      value={previousInjuryId}
                      onChange={(e) => setPreviousInjuryId(e.target.value)}
                      className="w-full bg-gray-900 border border-sky-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-blue"
                    >
                      <option value="">— оберіть травму зі списку —</option>
                      {pastInjuries.map((pi) => (
                        <option key={pi.id} value={pi.id}>
                          {pi.date_of_injury} · {pi.location} ({pi.injury_type})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Довідник та код OSIICS */}
              <OsiicsPicker value={osiicsCode} onChange={(val) => setOsiicsCode(val)} />
            </section>
          )}

          {/* Блок RTP прогнозу */}
          <section className="bg-surface rounded-2xl border border-gray-800 p-5 space-y-4 shadow-lg">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-800 pb-2">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>RTP прогноз (Очікуване повернення)</span>
            </h3>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Очікувана дата повернення до тренувань:
              </label>
              <input
                type="date"
                value={expectedReturnDate}
                min={dateOfInjury}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${uefaInfo.colorClass}`}>
              <div>
                <span className="font-bold block text-sm">{uefaInfo.badgeText}</span>
                <span className="text-[11px] opacity-80">
                  {expectedReturnDate
                    ? `Очікувано: ${uefaInfo.expectedDays ?? 0} дн. втрати`
                    : `Поточний термін: ${uefaInfo.timeLossDays} дн. у лазареті`}
                </span>
              </div>
              <span className="text-xl">⏱️</span>
            </div>
          </section>

          {/* Повідомлення про помилку */}
          {error && (
            <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/30 text-status-danger text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Кнопки збереження */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all shadow-glow-sm flex items-center justify-center gap-2"
            >
              <span>{loading ? "Збереження..." : "Зафіксувати травму"}</span>
              <span>→</span>
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-full px-5 border border-gray-700 text-gray-400 hover:border-gray-500 font-medium py-2.5 rounded-xl transition-colors text-xs"
              >
                Скасувати
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
