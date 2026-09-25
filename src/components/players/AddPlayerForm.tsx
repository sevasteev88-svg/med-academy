"use client";

import { useActionState } from "react";
import { createPlayerAction, type CreatePlayerState } from "@/actions/create-player-action";
import Card, { Button, Input, Select } from "@/components/ui/Card";
import { POSITION_LABELS, POSITION_FULL, TEAM_CATEGORY_UA } from "@/lib/constants";

type Team = { id: string; name: string; category: string };

const positions = Object.entries(POSITION_LABELS);
const sides = [
  { value: "right", label: "Права" },
  { value: "left",  label: "Ліва" },
  { value: "both",  label: "Обидві" },
];

export default function AddPlayerForm({ teams }: { teams: Team[] }) {
  const [state, formAction, isPending] = useActionState<CreatePlayerState, FormData>(
    createPlayerAction,
    {}
  );

  const youth = teams.filter((t) => t.category === "youth");
  const academy = teams.filter((t) => t.category === "academy");

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-5">
        {/* Команда */}
        <Select label="Команда *" name="teamId" required>
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
        </Select>

        {/* ПІБ */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Прізвище *" name="lastName" required placeholder="Іванов" />
          <Input label="Ім'я *" name="firstName" required placeholder="Олександр" />
        </div>

        {/* Дата народження + Стать */}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Дата народження *" name="dateOfBirth" type="date" required />
          <Select label="Стать *" name="sex" required defaultValue="male">
            <option value="male">Хлопець</option>
            <option value="female">Дівчина</option>
          </Select>
        </div>

        {/* Позиція */}
        <Select label="Позиція *" name="position" required>
          <option value="">Оберіть позицію</option>
          {positions.map(([code, short]) => (
            <option key={code} value={code}>
              {short} — {POSITION_FULL[code]}
            </option>
          ))}
        </Select>

        {/* Ведучі нога / рука */}
        <div className="grid grid-cols-2 gap-3">
          <Select label="Ведуча нога" name="dominantLeg" defaultValue="right">
            {sides.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Select label="Ведуча рука" name="dominantArm" defaultValue="right">
            {sides.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        {/* Помилка */}
        {state.error && (
          <div className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/20 rounded-lg px-3 py-2">
            {state.error}
          </div>
        )}

        {/* Кнопки */}
        <div className="pt-2">
          <Button type="submit" isLoading={isPending} className="w-full">
            Зберегти гравця
          </Button>
        </div>
      </form>
    </Card>
  );
}
