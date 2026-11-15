"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPlayerAction, type CreatePlayerState } from "@/actions/create-player-action";
import Card, { Button, Input, Select, Textarea } from "@/components/ui/Card";
import { CANONICAL_POSITIONS, POSITION_FULL_UA, TEAM_CATEGORY_UA } from "@/lib/constants";
import { BLOOD_TYPES } from "@/types/player-anamnesis";
import OneTimePinModal from "@/components/portal/OneTimePinModal";

type Team = { id: string; name: string; category: string };

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState({
    teamId: "",
    lastName: "",
    firstName: "",
    dateOfBirth: "",
    sex: "male",
    position: "",
    dominantLeg: "right",
    dominantArm: "right",
    jerseyNumber: "",
    phone: "",
    height: "",
    weight: "",
    bloodType: "",
    allergies: "",
    pastInjuries: "",
  });

  const handleFieldChange =
    (field: keyof typeof formValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setFormValues((prev) => ({ ...prev, [field]: value }));
    };

  useEffect(() => {
    if (state.success && state.generatedPin) {
      setIsModalOpen(true);
    }
  }, [state.success, state.generatedPin]);

  const youth = teams.filter((t) => t.category === "youth");
  const academy = teams.filter((t) => t.category === "academy");

  return (
    <>
      <Card className="p-6">
        <form action={formAction} className="space-y-5">
          {/* Команда */}
          <Select
            label="Команда *"
            name="teamId"
            required
            value={formValues.teamId}
            onChange={handleFieldChange("teamId")}
          >
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
            <Input
              label="Прізвище *"
              name="lastName"
              required
              placeholder="Іванов"
              value={formValues.lastName}
              onChange={handleFieldChange("lastName")}
            />
            <Input
              label="Ім'я *"
              name="firstName"
              required
              placeholder="Олександр"
              value={formValues.firstName}
              onChange={handleFieldChange("firstName")}
            />
          </div>

          {/* Дата народження + Стать */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Дата народження *"
              name="dateOfBirth"
              type="date"
              required
              value={formValues.dateOfBirth}
              onChange={handleFieldChange("dateOfBirth")}
            />
            <Select
              label="Стать *"
              name="sex"
              required
              value={formValues.sex}
              onChange={handleFieldChange("sex")}
            >
              <option value="male">Хлопець</option>
              <option value="female">Дівчина</option>
            </Select>
          </div>

          {/* Позиція */}
          <Select
            label="Позиція *"
            name="position"
            required
            value={formValues.position}
            onChange={handleFieldChange("position")}
          >
            <option value="">Оберіть позицію</option>
            {CANONICAL_POSITIONS.map((code) => (
              <option key={code} value={code}>
                {code} — {POSITION_FULL_UA[code]}
              </option>
            ))}
          </Select>

          {/* Ведучі нога / рука */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Ведуча нога"
              name="dominantLeg"
              value={formValues.dominantLeg}
              onChange={handleFieldChange("dominantLeg")}
            >
              {sides.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
            <Select
              label="Ведуча рука"
              name="dominantArm"
              value={formValues.dominantArm}
              onChange={handleFieldChange("dominantArm")}
            >
              {sides.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </div>

          {/* Спортивні дані та зв'язок (опціонально) */}
          <div className="pt-3 border-t border-slate-800/80 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
              <span>📋</span> Спортивні дані та зв'язок (опціонально)
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Ігровий номер"
                name="jerseyNumber"
                type="number"
                min={1}
                max={99}
                placeholder="напр. 10"
                value={formValues.jerseyNumber}
                onChange={handleFieldChange("jerseyNumber")}
              />
              <Input
                label="Контактний телефон"
                name="phone"
                type="tel"
                placeholder="+380..."
                value={formValues.phone}
                onChange={handleFieldChange("phone")}
              />
            </div>
          </div>

          {/* Первинний медичний анамнез при вступі (опціонально) */}
          <div className="pt-3 border-t border-slate-800/80 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <span>🩺</span> Первинний медичний анамнез при вступі (опціонально)
            </div>

            {/* Зріст / Вага */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Зріст при вступі (см)"
                name="height"
                type="number"
                step="0.1"
                placeholder="напр. 178"
                value={formValues.height}
                onChange={handleFieldChange("height")}
              />
              <Input
                label="Вага при вступі (кг)"
                name="weight"
                type="number"
                step="0.1"
                placeholder="напр. 68.5"
                value={formValues.weight}
                onChange={handleFieldChange("weight")}
              />
            </div>

            {/* Група крові */}
            <Select
              label="Група крові та Rh-фактор"
              name="bloodType"
              value={formValues.bloodType}
              onChange={handleFieldChange("bloodType")}
            >
              {BLOOD_TYPES.map((bt) => (
                <option key={bt.value} value={bt.value}>
                  {bt.label}
                </option>
              ))}
            </Select>

            {/* Алергії */}
            <Input
              label="Алергії та протипоказання до препаратів"
              name="allergies"
              placeholder="напр. Пеніцилін, НПЗЗ, цитрусові, сезонна алергія"
              value={formValues.allergies}
              onChange={handleFieldChange("allergies")}
            />

            {/* Анамнез травм */}
            <Textarea
              label="Анамнез минулих травм та операцій"
              name="pastInjuries"
              rows={3}
              placeholder="Опишіть перенесені операції або важкі травми до клубу (напр. 2023 — пластика ПКС правого коліна, 2024 — перелом ключиці)"
              value={formValues.pastInjuries}
              onChange={handleFieldChange("pastInjuries")}
            />
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

      {/* Одноразове вікно з 6-значним PIN */}
      {state.generatedPin && (
        <OneTimePinModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            window.location.href = `/players/${state.playerId || ""}`;
          }}
          playerName={state.playerName || "Новий гравець"}
          pin={state.generatedPin}
          portalToken={state.portalToken}
          playerId={state.playerId}
          title="Гравця створено! Тимчасовий PIN-код"
        />
      )}
    </>
  );
}

