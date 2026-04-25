"use client";

import { useActionState } from "react";
import { updatePlayerAction, type UpdatePlayerState } from "@/actions/update-player-action";
import Card from "@/components/ui/Card";
import { POSITION_LABELS, POSITION_FULL, TEAM_CATEGORY_UA } from "@/lib/constants";

type Team = { id: string; name: string; category: string };
type Player = {
  id: string; team_id: string; first_name: string; last_name: string;
  date_of_birth: string; position: string; dominant_leg: string; dominant_arm: string;
};

const positions = Object.entries(POSITION_LABELS);
const sides = [
  { value: "right", label: "Права" },
  { value: "left",  label: "Ліва" },
  { value: "both",  label: "Обидві" },
];

const inputClass =
  "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function EditPlayerForm({ player, teams }: { player: Player; teams: Team[] }) {
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

        <div>
          <label className={labelClass}>Дата народження *</label>
          <input name="dateOfBirth" type="date" required defaultValue={player.date_of_birth} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Позиція *</label>
          <select name="position" required className={inputClass} defaultValue={player.position}>
            {positions.map(([code, short]) => (
              <option key={code} value={code}>{short} — {POSITION_FULL[code]}</option>
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
