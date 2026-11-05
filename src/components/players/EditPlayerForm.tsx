"use client";

import { useActionState } from "react";
import { updatePlayerAction, type UpdatePlayerState } from "@/actions/update-player-action";
import Card from "@/components/ui/Card";
import { CANONICAL_POSITIONS, POSITION_FULL_UA, TEAM_CATEGORY_UA, normalizePosition } from "@/lib/constants";
import { BLOOD_TYPES, type PlayerMedicalAnamnesis } from "@/types/player-anamnesis";

type Team = { id: string; name: string; category: string };
type Player = {
  id: string; team_id: string; first_name: string; last_name: string;
  date_of_birth: string; sex: string | null; position: string; dominant_leg: string; dominant_arm: string;
};

const sides = [
  { value: "right", label: "Права" },
  { value: "left",  label: "Ліва" },
  { value: "both",  label: "Обидві" },
];

const inputClass =
  "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function EditPlayerForm({
  player,
  teams,
  initialAnamnesis,
}: {
  player: Player;
  teams: Team[];
  initialAnamnesis?: PlayerMedicalAnamnesis | null;
}) {
  const [state, formAction, isPending] = useActionState<UpdatePlayerState, FormData>(
    updatePlayerAction, {}
  );

  const youth = teams.filter((t) => t.category === "youth");
  const academy = teams.filter((t) => t.category === "academy");

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="playerId" value={player.id} />

        <div>
          <label className={labelClass}>Команда *</label>
          <select name="teamId" required className={inputClass} defaultValue={player.team_id}>
            {youth.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.youth}>
                {youth.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
            {academy.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.academy}>
                {academy.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Прізвище *</label>
            <input name="lastName" required defaultValue={player.last_name} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ім'я *</label>
            <input name="firstName" required defaultValue={player.first_name} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Дата народження *</label>
            <input name="dateOfBirth" type="date" required defaultValue={player.date_of_birth} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Стать *</label>
            <select name="sex" required className={inputClass} defaultValue={player.sex ?? "male"}>
              <option value="male">Хлопець</option>
              <option value="female">Дівчина</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Позиція *</label>
          <select name="position" required className={inputClass} defaultValue={normalizePosition(player.position)}>
            {CANONICAL_POSITIONS.map((code) => (
              <option key={code} value={code}>{code} — {POSITION_FULL_UA[code]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Ведуча нога</label>
            <select name="dominantLeg" className={inputClass} defaultValue={player.dominant_leg}>
              {sides.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ведуча рука</label>
            <select name="dominantArm" className={inputClass} defaultValue={player.dominant_arm}>
              {sides.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Спортивні дані та зв'язок */}
        <div className="pt-3 border-t border-slate-800 space-y-3.5">
          <div className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
            <span>📋</span> Спортивні дані та зв'язок (опціонально)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ігровий номер</label>
              <input
                name="jerseyNumber"
                type="number"
                min={1}
                max={99}
                defaultValue={initialAnamnesis?.jersey_number ?? ""}
                placeholder="напр. 10"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Контактний телефон</label>
              <input
                name="phone"
                type="tel"
                defaultValue={initialAnamnesis?.phone ?? ""}
                placeholder="+380..."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Первинний медичний анамнез */}
        <div className="pt-3 border-t border-slate-800 space-y-3.5">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <span>🩺</span> Первинний медичний анамнез та особливості (опціонально)
          </div>

          <div>
            <label className={labelClass}>Група крові та Rh-фактор</label>
            <select
              name="bloodType"
              className={inputClass}
              defaultValue={initialAnamnesis?.blood_type ?? ""}
            >
              {BLOOD_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>
                  {bt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Алергії та протипоказання до препаратів</label>
            <input
              name="allergies"
              defaultValue={initialAnamnesis?.allergies ?? ""}
              placeholder="напр. Пеніцилін, НПЗЗ, цитрусові, сезонна алергія"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Анамнез травм та операцій до вступу в клуб</label>
            <textarea
              name="pastInjuries"
              rows={3}
              defaultValue={initialAnamnesis?.past_injuries ?? ""}
              placeholder="Опишіть перенесені операції або важкі травми до клубу"
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        {state.error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">{state.error}</div>
        )}

        <button type="submit" disabled={isPending} className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm">
          {isPending ? "Зберігаємо..." : "Зберегти зміни"}
        </button>
      </form>
    </Card>
  );
}
