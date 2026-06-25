"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInjury } from "@/actions/create-injury-action";
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
  const [dateOfInjury, setDateOfInjury] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!location) { setError("Оберіть локалізацію травми"); return; }
    setError(null);
    setLoading(true);
    try {
      const result = await createInjury({
        playerId, injuryType,
        location: location as InjuryLocation,
        side, severity, mechanism, dateOfInjury,
        description: description || undefined,
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
            <label className="block text-xs text-gray-400 mb-1">Тип травми</label>
            <select value={injuryType} onChange={e => setInjuryType(e.target.value as InjuryType)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue">
              {INJURY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Дата травми</label>
            <input type="date" value={dateOfInjury} onChange={e => setDateOfInjury(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Локалізація</label>
            <select value={location} onChange={e => setLocation(e.target.value as InjuryLocation)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue">
              <option value="">— оберіть —</option>
              {LOCATIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Сторона</label>
            <div className="flex gap-2">
              {(["left", "right", "bilateral"] as InjurySide[]).map(s => (
                <button key={s} type="button" onClick={() => setSide(s)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${side === s ? "bg-brand-blue/20 border-brand-blue text-brand-blue" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                  {s === "left" ? "Ліва" : s === "right" ? "Права" : "Обидві"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Тяжкість</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as InjurySeverity)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue">
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Механізм</label>
            <div className="flex gap-2">
              {MECHANISMS.map(m => (
                <button key={m.value} type="button" onClick={() => setMechanism(m.value)}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${mechanism === m.value ? "bg-brand-blue/20 border-brand-blue text-brand-blue" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Опис (опціонально)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="Обставини травми, симптоми..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-blue resize-none" />
        </div>
      </section>

      {error && <p className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg px-4 py-2">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={handleSubmit} disabled={loading}
          className="flex-1 bg-brand-blue hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
          {loading ? "Збереження..." : "Зафіксувати травму"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 border border-gray-700 text-gray-400 hover:border-gray-500 font-medium py-3 rounded-lg transition-colors">
            Скасувати
          </button>
        )}
      </div>
    </div>
  );
}
