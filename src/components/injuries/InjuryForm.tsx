"use client";

/**
 * InjuryForm.tsx
 * Форма фіксації травми з класифікацією Munich Consensus / BAMIC
 * та живим прогнозом RTP.
 *
 * Використання:
 *   <InjuryForm playerId="uuid" onSuccess={() => router.push('/injuries')} />
 */

import { useState } from "react";
import { createInjury } from "@/actions/create-injury-action";
import type {
  BamicGrade,
  BamicLocation,
  ClassificationSystem,
  InjuryLocation,
  InjuryMechanism,
  InjurySeverity,
  InjurySide,
  InjuryType,
  MunichGrade,
  RtpPrediction,
} from "@/types/database";

// ─── Вбудована логіка RTP (щоб не імпортувати серверний модуль) ──
const BAMIC_RTP: Record<number, Record<string, [number, number]>> = {
  0: { a: [0, 7],    b: [0, 7],    c: [0, 7]    },
  1: { a: [7, 14],   b: [10, 18],  c: [14, 28]  },
  2: { a: [16, 25],  b: [16, 25],  c: [40, 60]  },
  3: { a: [21, 35],  b: [28, 42],  c: [50, 80]  },
  4: { a: [42, 90],  b: [60, 120], c: [90, 180] },
};
const MUNICH_RTP: Record<MunichGrade, [number, number]> = {
  "1A": [3, 7], "1B": [7, 14], "2A": [7, 21], "2B": [10, 21],
  "3A": [14, 28], "3B": [21, 42], "4": [60, 180],
};

function calcRtp(
  system: ClassificationSystem,
  munichGrade: MunichGrade | null,
  bamicGrade: BamicGrade | null,
  bamicLocation: BamicLocation | null
): RtpPrediction | null {
  if (system === "bamic" && bamicGrade !== null && bamicLocation) {
    const [min, max] = BAMIC_RTP[bamicGrade][bamicLocation];
    const isTJ = bamicLocation === "c" && bamicGrade >= 2;
    return {
      min_days: min, max_days: max,
      is_t_junction_risk: isTJ,
      confidence: bamicGrade <= 2 ? "high" : "medium",
      notes: isTJ ? "T-junction: термін подвоєно. Потрібен МРТ." : null,
    };
  }
  if (system === "munich" && munichGrade) {
    const [min, max] = MUNICH_RTP[munichGrade];
    const structural = ["3A", "3B", "4"].includes(munichGrade);
    return {
      min_days: min, max_days: max,
      is_t_junction_risk: false,
      confidence: structural ? "medium" : "high",
      notes: structural ? "Уточніть локалізацію за BAMIC для кращого прогнозу." : null,
    };
  }
  return null;
}

// ─── Типи пропсів ──────────────────────────────────────────────
type Props = {
  playerId: string;
  playerName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

// ─── Константи для селектів ────────────────────────────────────
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
  { value: "hip",      label: "Стегно (суглоб)" },
  { value: "thigh",    label: "Стегно (м'яз)" },
  { value: "calf",     label: "Литка" },
  { value: "foot",     label: "Стопа" },
  { value: "groin",    label: "Пах" },
  { value: "back",     label: "Спина" },
  { value: "neck",     label: "Шия" },
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
const MUNICH_GRADES: { value: MunichGrade; label: string; type: "functional" | "neuromuscular" | "structural" }[] = [
  { value: "1A", label: "1A — Перевтома",             type: "functional" },
  { value: "1B", label: "1B — DOMS / мікроушкодження", type: "functional" },
  { value: "2A", label: "2A — Спінальна нейром'язова", type: "neuromuscular" },
  { value: "2B", label: "2B — Локальна нейром'язова",  type: "neuromuscular" },
  { value: "3A", label: "3A — Мікророзрив < 0.5 cm",  type: "structural" },
  { value: "3B", label: "3B — Частковий розрив",       type: "structural" },
  { value: "4",  label: "4 — Повний розрив / відрив",  type: "structural" },
];
const TYPE_COLORS = {
  functional:     "border-status-ok/40 text-status-ok",
  neuromuscular:  "border-status-warn/40 text-status-warn",
  structural:     "border-status-danger/40 text-status-danger",
};
const TYPE_SELECTED = {
  functional:    "bg-status-ok/20 border-status-ok text-status-ok",
  neuromuscular: "bg-status-warn/20 border-status-warn text-status-warn",
  structural:    "bg-status-danger/20 border-status-danger text-status-danger",
};

// ─── Компонент ─────────────────────────────────────────────────
export default function InjuryForm({ playerId, playerName, onSuccess, onCancel }: Props) {
  // Базові поля
  const [injuryType, setInjuryType] = useState<InjuryType>("muscular");
  const [location, setLocation] = useState<InjuryLocation | "">("");
  const [side, setSide] = useState<InjurySide>("left");
  const [severity, setSeverity] = useState<InjurySeverity>("moderate");
  const [mechanism, setMechanism] = useState<InjuryMechanism>("non_contact");
  const [dateOfInjury, setDateOfInjury] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [description, setDescription] = useState("");

  // Класифікація
  const [classSystem, setClassSystem] = useState<ClassificationSystem>("none");
  const [munichGrade, setMunichGrade] = useState<MunichGrade | null>(null);
  const [bamicGrade, setBamicGrade] = useState<BamicGrade | null>(null);
  const [bamicLocation, setBamicLocation] = useState<BamicLocation | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Живий RTP-прогноз
  const rtpPreview = calcRtp(classSystem, munichGrade, bamicGrade, bamicLocation);

  const handleSubmit = async () => {
    if (!location) { setError("Оберіть локалізацію травми"); return; }
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
        description: description || undefined,
        classificationSystem: classSystem,
        munichGrade,
        bamicGrade,
        bamicLocation,
      });
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        onSuccess?.();
      }
    } catch (e) {
      setError("Помилка збереження. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      {playerName && (
        <div className="text-sm text-gray-400">
          Гравець: <span className="text-white font-medium">{playerName}</span>
        </div>
      )}

      {/* ── СЕКЦІЯ 1: Базова інформація ── */}
      <section className="bg-surface rounded-xl border border-gray-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Основна інформація
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Тип травми</label>
            <select
              value={injuryType}
              onChange={e => setInjuryType(e.target.value as InjuryType)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              {INJURY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Дата травми</label>
            <input
              type="date"
              value={dateOfInjury}
              onChange={e => setDateOfInjury(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Локалізація</label>
            <select
              value={location}
              onChange={e => setLocation(e.target.value as InjuryLocation)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              <option value="">— оберіть —</option>
              {LOCATIONS.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Сторона</label>
            <div className="flex gap-2">
              {(["left", "right", "bilateral"] as InjurySide[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                    side === s
                      ? "bg-brand-blue/20 border-brand-blue text-brand-blue"
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
            <label className="block text-xs text-gray-400 mb-1">Тяжкість</label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value as InjurySeverity)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
            >
              {SEVERITIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Механізм</label>
            <div className="flex gap-2">
              {MECHANISMS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMechanism(m.value)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                    mechanism === m.value
                      ? "bg-brand-blue/20 border-brand-blue text-brand-blue"
                      : "border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Опис (опціонально)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Обставини травми, симптоми..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue resize-none"
          />
        </div>
      </section>

      {/* ── СЕКЦІЯ 2: Класифікація м'язових пошкоджень ── */}
      <section className="bg-surface rounded-xl border border-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Класифікація пошкодження
          </h3>
          <span className="text-xs text-gray-600">Munich · BAMIC · Hollabaugh 2024</span>
        </div>

        {/* Вибір системи */}
        <div className="flex gap-2">
          {(["none", "bamic", "munich"] as ClassificationSystem[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setClassSystem(s);
                setMunichGrade(null);
                setBamicGrade(null);
                setBamicLocation(null);
              }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                classSystem === s
                  ? "bg-brand-blue/20 border-brand-blue text-brand-blue font-medium"
                  : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              {s === "none" ? "Не застосовується" : s === "bamic" ? "BAMIC" : "Munich Consensus"}
            </button>
          ))}
        </div>

        {/* BAMIC */}
        {classSystem === "bamic" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ступінь (0–4)</label>
                <select
                  value={bamicGrade ?? ""}
                  onChange={e => setBamicGrade(e.target.value === "" ? null : Number(e.target.value) as BamicGrade)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="">— оберіть —</option>
                  <option value="0">0 — без пошкодження</option>
                  <option value="1">1 — міофасціальне</option>
                  <option value="2">2 — внутрішньом'язове</option>
                  <option value="3">3 — значний розрив</option>
                  <option value="4">4 — повний розрив</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Локалізація{" "}
                  <span className="text-status-danger/70">(критично для RTP!)</span>
                </label>
                <select
                  value={bamicLocation ?? ""}
                  onChange={e => setBamicLocation(e.target.value === "" ? null : e.target.value as BamicLocation)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="">— оберіть —</option>
                  <option value="a">a — міофасціальне (краї м'яза)</option>
                  <option value="b">b — внутрішньом'язове (брюшко)</option>
                  <option value="c">c — T-junction ⚠️ інтрам'язове сухожилля</option>
                </select>
              </div>
            </div>
            {/* T-junction попередження */}
            {bamicLocation === "c" && bamicGrade !== null && bamicGrade >= 2 && (
              <div className="flex gap-3 bg-status-danger/10 border border-status-danger/30 rounded-lg p-3">
                <span className="text-status-danger text-base">⚠️</span>
                <div>
                  <p className="text-xs font-semibold text-status-danger">T-junction — критичний стан</p>
                  <p className="text-xs text-status-danger/80 mt-0.5">
                    Пошкодження інтрам'язового сухожилля. Термін реабілітації подвоєно.
                    Ризик рецидиву підвищений. Обов'язковий МРТ-контроль.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Munich Consensus */}
        {classSystem === "munich" && (
          <div className="grid grid-cols-2 gap-2">
            {MUNICH_GRADES.map(g => (
              <button
                key={g.value}
                type="button"
                onClick={() => setMunichGrade(g.value)}
                className={`text-left px-3 py-2.5 rounded-lg border text-xs transition-colors leading-tight ${
                  munichGrade === g.value
                    ? TYPE_SELECTED[g.type]
                    : `border-gray-800 text-gray-500 hover:${TYPE_COLORS[g.type]} hover:border-opacity-50`
                }`}
              >
                <span className="font-semibold">{g.label.split(" — ")[0]}</span>
                <span className="block text-gray-400 mt-0.5">{g.label.split(" — ")[1]}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Живий RTP-прогноз ── */}
        {rtpPreview && (
          <div className={`rounded-lg border p-4 ${
            rtpPreview.is_t_junction_risk || rtpPreview.max_days >= 60
              ? "bg-status-danger/10 border-status-danger/30"
              : rtpPreview.max_days >= 28
              ? "bg-status-warn/10 border-status-warn/30"
              : "bg-status-ok/10 border-status-ok/30"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Прогноз повернення в стрій (RTP)</p>
                <p className={`text-xl font-bold mt-0.5 ${
                  rtpPreview.is_t_junction_risk || rtpPreview.max_days >= 60
                    ? "text-status-danger"
                    : rtpPreview.max_days >= 28
                    ? "text-status-warn"
                    : "text-status-ok"
                }`}>
                  {rtpPreview.min_days === rtpPreview.max_days
                    ? `${rtpPreview.min_days} днів`
                    : `${rtpPreview.min_days}–${rtpPreview.max_days} днів`}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Точність: {rtpPreview.confidence === "high" ? "висока" : "середня"}</p>
                {rtpPreview.is_t_junction_risk && (
                  <p className="text-status-danger font-medium mt-0.5">⚠️ T-junction</p>
                )}
              </div>
            </div>
            {rtpPreview.notes && (
              <p className="text-xs text-gray-400 mt-2 border-t border-gray-700/50 pt-2">
                {rtpPreview.notes}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Помилка та кнопки ── */}
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
          className="flex-1 bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
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
