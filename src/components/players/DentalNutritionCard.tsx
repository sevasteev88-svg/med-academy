"use client";

import { useState, useTransition } from "react";
import {
  type NutritionProfile,
  type DentalStatus,
} from "@/types/nutrition";
import { saveNutritionAction } from "@/actions/save-nutrition-action";

type Props = {
  playerId: string;
  playerName: string;
  initialProfile: NutritionProfile | null;
};

export default function DentalNutritionCard({
  playerId,
  playerName,
  initialProfile,
}: Props) {
  const [profile, setProfile] = useState<NutritionProfile | null>(initialProfile);
  const [isOpen, setIsOpen] = useState(false);

  // Form states
  const [dentalStatus, setDentalStatus] = useState<DentalStatus>(
    profile?.dental_status ?? "sanitized"
  );
  const [lastCheck, setLastCheck] = useState(
    profile?.last_dental_check_date ?? new Date().toISOString().split("T")[0]
  );
  const [dentalNotes, setDentalNotes] = useState(profile?.dental_focus_notes ?? "");
  const [mouthguard, setMouthguard] = useState(profile?.uses_mouthguard ?? false);

  const [creatine, setCreatine] = useState(profile?.supplements_creatine ?? true);
  const [omega3, setOmega3] = useState(profile?.supplements_omega3 ?? true);
  const [collagen, setCollagen] = useState(profile?.supplements_collagen_vit_c ?? true);
  const [protein, setProtein] = useState(profile?.supplements_whey_protein ?? true);
  const [iron, setIron] = useState(profile?.supplements_iron ?? false);
  const [customSupp, setCustomSupp] = useState(profile?.supplements_custom ?? "");
  const [diet, setDiet] = useState<NutritionProfile["dietary_type"]>(profile?.dietary_type ?? "standard");

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const res = await saveNutritionAction({
        player_id: playerId,
        date: new Date().toISOString().split("T")[0],
        dental_status: dentalStatus,
        last_dental_check_date: lastCheck,
        dental_focus_notes: dentalNotes.trim() || null,
        uses_mouthguard: mouthguard,
        supplements_creatine: creatine,
        supplements_omega3: omega3,
        supplements_collagen_vit_c: collagen,
        supplements_whey_protein: protein,
        supplements_iron: iron,
        supplements_custom: customSupp.trim() || null,
        allergies: [],
        dietary_type: diet,
      });

      if (res.profile) {
        setProfile(res.profile);
        setIsOpen(false);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xl">
            🦷
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Стоматологічний та нутриціологічний паспорт
            </h3>
            <p className="text-[11px] text-slate-400">
              Санація хронічних вогнищ інфекції та протокол спортивних суплементів
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition-all"
        >
          {isOpen ? "✕ Закрити" : profile ? "✏️ Оновити дані" : "+ Внести аудит"}
        </button>
      </div>

      {profile && !isOpen && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Dental */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-blue-900/20 space-y-2">
            <div className="font-bold text-slate-300 flex items-center justify-between">
              <span>🦷 Стан ротової порожнини:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  profile.dental_status === "sanitized"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : profile.dental_status === "requires_treatment"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-red-500/15 text-red-300 border-red-500/30"
                }`}
              >
                {profile.dental_status === "sanitized"
                  ? "✓ Повністю санований"
                  : profile.dental_status === "requires_treatment"
                  ? "⚠️ Потребує лікування"
                  : "🛑 Вогнище інфекції (ризик зв'язок)"}
              </span>
            </div>
            <div className="text-slate-400">
              Останній огляд: <strong className="text-white">{profile.last_dental_check_date}</strong>
            </div>
            {profile.dental_focus_notes && (
              <div className="text-slate-400 bg-slate-900/50 p-2 rounded text-[11px]">
                {profile.dental_focus_notes}
              </div>
            )}
            <div className="text-slate-400">
              Індивідуальна капа: <strong className="text-white">{profile.uses_mouthguard ? "✓ Використовує" : "— Немає"}</strong>
            </div>
          </div>

          {/* Supplements */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-blue-900/20 space-y-2">
            <div className="font-bold text-slate-300 flex items-center justify-between">
              <span>🥤 Протокол суплементації:</span>
              <span className="font-mono text-[10px] text-slate-500">
                Дієта: {profile.dietary_type}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.supplements_collagen_vit_c && (
                <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-semibold">
                  Колаген + Vit C
                </span>
              )}
              {profile.supplements_creatine && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                  Креатин 5г
                </span>
              )}
              {profile.supplements_omega3 && (
                <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                  Омега-3
                </span>
              )}
              {profile.supplements_whey_protein && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                  Протеїн
                </span>
              )}
              {profile.supplements_iron && (
                <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 text-[10px] font-semibold">
                  Препарат заліза
                </span>
              )}
            </div>
            {profile.supplements_custom && (
              <div className="text-[11px] text-slate-400 mt-1">
                Додатково: {profile.supplements_custom}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form */}
      {isOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 p-4 rounded-xl border border-blue-900/30 space-y-4 text-xs">
          <div className="font-bold text-blue-300">
            Оновлення стоматологічного та нутриціологічного профілю · {playerName}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Статус санації зубів</label>
              <select
                value={dentalStatus}
                onChange={(e) => setDentalStatus(e.target.value as any)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
              >
                <option value="sanitized">🟢 Повністю санований (без карієсу)</option>
                <option value="requires_treatment">🟡 Потребує санації (лікування)</option>
                <option value="critical_focus">🔴 Вогнище інфекції (ризик сухожиль)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Дата огляду стоматолога</label>
              <input
                type="date"
                value={lastCheck}
                onChange={(e) => setLastCheck(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Тип дієти</label>
              <select
                value={diet}
                onChange={(e) => setDiet(e.target.value as any)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              >
                <option value="standard">Стандартна</option>
                <option value="halal">Халяль</option>
                <option value="vegetarian">Вегетаріанська</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Коментар стоматолога (зубні вогнища, контакт з ахіллами)
            </label>
            <input
              type="text"
              placeholder="напр. Карієс 1.6, лікування призначено на середу"
              value={dentalNotes}
              onChange={(e) => setDentalNotes(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>

          {/* Supplements check */}
          <div>
            <label className="block text-slate-400 font-bold mb-2">
              Призначені суплементи / спортивне харчування:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={collagen}
                  onChange={(e) => setCollagen(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Колаген + Вітамін С</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={creatine}
                  onChange={(e) => setCreatine(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Креатин моногідрат (5г)</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={omega3}
                  onChange={(e) => setOmega3(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Омега-3 жирні кислоти</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={protein}
                  onChange={(e) => setProtein(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Сироватковий протеїн</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={iron}
                  onChange={(e) => setIron(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Препарат заліза</span>
              </label>

              <label className="flex items-center gap-2 bg-slate-900 p-2 rounded-lg border border-blue-900/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mouthguard}
                  onChange={(e) => setMouthguard(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Захисна капа (ротова)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-blue-900/20">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              {isPending ? "Збереження..." : "Затвердити нутриціологічний профіль"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
