"use client";

import { useActionState } from "react";
import { createPlayerAction, type CreatePlayerState } from "@/actions/create-player-action";
import Card from "@/components/ui/Card";
import { POSITION_LABELS, POSITION_FULL, TEAM_CATEGORY_UA } from "@/lib/constants";

type Team = { id: string; name: string; category: string };

const positions = Object.entries(POSITION_LABELS);
const sides = [
  { value: "right", label: "Права" },
  { value: "left",  label: "Ліва" },
  { value: "both",  label: "Обидві" },
];

/* Стилі для полів */
const inputClass =
  "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

export default function AddPlayerForm({ teams }: { teams: Team[] }) {
  const [state, formAction, isPending] = useActionState<CreatePlayerState, FormData>(
    createPlayerAction,
    {}
  );

  const youth = teams.filter((t) => t.category === "youth");
  const academy = teams.filter((t) => t.category === "academy");

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        {/* Команда */}
        <div>
          <label className={labelClass}>Команда *</label>
          <select name="teamId" required className={inputClass}>
            <option value="">Оберіть команду</option>
            {youth.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.youth}>
                {youth.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            )}
            {academy.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.academy}>
                {academy.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* ПІБ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Прізвище *</label>
            <input name="lastName" required placeholder="Іванов" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ім'я *</label>
            <input name="firstName" required placeholder="Олександр" className={inputClass} />
          </div>
        </div>

        {/* Дата народження */}
        <div>
          <label className={labelClass}>Дата народження *</label>
          <input name="dateOfBirth" type="date" required className={inputClass} />
        </div>

        {/* Позиція */}
        <div>
          <label className={labelClass}>Позиція *</label>
          <select name="position" required className={inputClass}>
            <option value="">Оберіть позицію</option>
            {positions.map(([code, short]) => (
              <option key={code} value={code}>
                {short} — {POSITION_FULL[code]}
              </option>
            ))}
          </select>
        </div>

        {/* Ведучі нога / рука */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Ведуча нога</label>
            <select name="dominantLeg" className={inputClass} defaultValue="right">
              {sides.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ведуча рука</label>
            <select name="dominantArm" className={inputClass} defaultValue="right">
              {sides.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Помилка */}
        {state.error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">
            {state.error}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm"
          >
            {isPending ? "Зберігаємо..." : "Зберегти"}
          </button>
        </div>
      </form>
    </Card>
  );
}
