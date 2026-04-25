"use client";

import { useActionState, useState } from "react";
import { createInjuryAction, type CreateInjuryState } from "@/actions/create-injury-action";
import Card from "@/components/ui/Card";
import {
  INJURY_TYPE_UA, LOCATION_UA, SIDE_UA,
  SEVERITY_UA, MECHANISM_UA, TEAM_CATEGORY_UA,
} from "@/lib/constants";

type Player = { id: string; first_name: string; last_name: string };
type Team = { id: string; name: string; category: string; players: Player[] };

const inputClass =
  "w-full bg-surface-raised border border-blue-900/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors";
const labelClass = "block text-xs text-slate-500 mb-1.5";

function vasColor(v: number): string {
  if (v >= 7) return "#ef4444";
  if (v >= 4) return "#eab308";
  return "#22c55e";
}

export default function AddInjuryForm({
  teams,
  preselectedPlayerId,
}: {
  teams: Team[];
  preselectedPlayerId?: string;
}) {
  const [state, formAction, isPending] = useActionState<CreateInjuryState, FormData>(
    createInjuryAction, {}
  );
  const [vas, setVas] = useState(5);

  const youth = teams.filter((t) => t.category === "youth");
  const academy = teams.filter((t) => t.category === "academy");

  return (
    <Card>
      <form action={formAction} className="space-y-5">
        <div>
          <label className={labelClass}>Гравець *</label>
          <select name="playerId" required className={inputClass} defaultValue={preselectedPlayerId ?? ""}>
            <option value="">Оберіть гравця</option>
            {youth.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.youth}>
                {youth.map((t) =>
                  (t.players ?? []).sort((a, b) => a.last_name.localeCompare(b.last_name, "uk")).map((p) => (
                    <option key={p.id} value={p.id}>{t.name} — {p.last_name} {p.first_name}</option>
                  ))
                )}
              </optgroup>
            )}
            {academy.length > 0 && (
              <optgroup label={TEAM_CATEGORY_UA.academy}>
                {academy.map((t) =>
                  (t.players ?? []).sort((a, b) => a.last_name.localeCompare(b.last_name, "uk")).map((p) => (
                    <option key={p.id} value={p.id}>{t.name} — {p.last_name} {p.first_name}</option>
                  ))
                )}
              </optgroup>
            )}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Тип травми *</label>
            <select name="injuryType" required className={inputClass}>
              <option value="">Оберіть тип</option>
              {Object.entries(INJURY_TYPE_UA).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Локалізація *</label>
            <select name="location" required className={inputClass}>
              <option value="">Оберіть</option>
              {Object.entries(LOCATION_UA).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Сторона *</label>
            <select name="side" required className={inputClass}>
              {Object.entries(SIDE_UA).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Тяжкість *</label>
            <select name="severity" required className={inputClass}>
              <option value="">Оберіть</option>
              {Object.entries(SEVERITY_UA).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Механізм</label>
            <select name="mechanism" className={inputClass} defaultValue="non_contact">
              {Object.entries(MECHANISM_UA).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Дата травми *</label>
            <input name="dateOfInjury" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Рівень болю (ВАШ) *</label>
          <div className="flex items-center gap-4">
            <input
              type="range" name="vasScore" min={0} max={10} value={vas}
              onChange={(e) => setVas(Number(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(to right, ${vasColor(vas)} 0%, ${vasColor(vas)} ${vas * 10}%, #1e293b ${vas * 10}%, #1e293b 100%)` }}
            />
            <span className="text-2xl font-extrabold font-mono w-12 text-center" style={{ color: vasColor(vas) }}>{vas}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
            <span>Без болю</span><span>Нестерпний</span>
          </div>
        </div>

        <div>
          <label className={labelClass}>Очікувана дата повернення</label>
          <input name="expectedReturnDate" type="date" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Опис / деталі</label>
          <textarea name="description" rows={3} placeholder="Обставини травми, первинний огляд..." className={inputClass + " resize-none"} />
        </div>

        {state.error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">{state.error}</div>
        )}

        <button type="submit" disabled={isPending} className="w-full bg-brand-blue hover:bg-brand-blue-light disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-sm transition-colors shadow-glow-sm">
          {isPending ? "Зберігаємо..." : "Зафіксувати травму"}
        </button>
      </form>
    </Card>
  );
}
