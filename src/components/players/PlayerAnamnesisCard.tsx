"use client";

import React from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import type { PlayerMedicalAnamnesis } from "@/types/player-anamnesis";

interface PlayerAnamnesisCardProps {
  playerId: string;
  playerName: string;
  anamnesis: PlayerMedicalAnamnesis | null;
}

export default function PlayerAnamnesisCard({
  playerId,
  playerName,
  anamnesis,
}: PlayerAnamnesisCardProps) {
  const hasData =
    anamnesis &&
    (anamnesis.blood_type ||
      anamnesis.allergies ||
      anamnesis.past_injuries ||
      anamnesis.phone ||
      anamnesis.jersey_number ||
      anamnesis.initial_height ||
      anamnesis.initial_weight);

  return (
    <Card className="p-5 md:p-6 bg-slate-900/60 backdrop-blur-xl border border-sky-500/20 shadow-xl space-y-4">
      {/* Шапка картки */}
      <div className="flex items-center justify-between border-b border-sky-500/15 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-lg">
            🩺
          </span>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Первинний медичний анамнез та особливості
            </h3>
            <p className="text-xs text-slate-400">
              Базові медичні показники, група крові та історія травм до вступу в клуб
            </p>
          </div>
        </div>

        <Link
          href={`/players/${playerId}/edit`}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          ✏️ Редагувати
        </Link>
      </div>

      {!hasData ? (
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center space-y-2">
          <p className="text-xs text-slate-400">
            Первинний медичний анамнез гравця ще не внесено.
          </p>
          <Link
            href={`/players/${playerId}/edit`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300"
          >
            <span>+ Додати анамнез, групу крові чи алергії</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          {/* Верхня сітка швидких індикаторів */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Група крові */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                Група крові
              </span>
              {anamnesis.blood_type ? (
                <div className="flex items-center gap-1.5 font-bold text-rose-400 text-sm">
                  <span>🩸</span>
                  <span>{anamnesis.blood_type}</span>
                </div>
              ) : (
                <span className="text-slate-500">Не вказано</span>
              )}
            </div>

            {/* Ігровий номер */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                Номер у клубі
              </span>
              {anamnesis.jersey_number ? (
                <div className="font-mono font-black text-sky-300 text-sm">
                  #{anamnesis.jersey_number}
                </div>
              ) : (
                <span className="text-slate-500">Не закріплено</span>
              )}
            </div>

            {/* Зріст при вступі */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                Зріст при вступі
              </span>
              {anamnesis.initial_height ? (
                <div className="font-mono font-bold text-slate-200 text-sm">
                  {anamnesis.initial_height} см
                </div>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>

            {/* Вага при вступі */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                Вага при вступі
              </span>
              {anamnesis.initial_weight ? (
                <div className="font-mono font-bold text-slate-200 text-sm">
                  {anamnesis.initial_weight} кг
                </div>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>
          </div>

          {/* Алергії та протипоказання (якщо є) */}
          {anamnesis.allergies && (
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-2.5 text-amber-300">
              <span className="text-base shrink-0">⚠️</span>
              <div>
                <strong className="block font-bold mb-0.5">
                  Алергії та медикаментозні протипоказання:
                </strong>
                <p className="text-amber-200/90 leading-relaxed">
                  {anamnesis.allergies}
                </p>
              </div>
            </div>
          )}

          {/* Минулі серйозні травми та операції */}
          {anamnesis.past_injuries && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-200">
                <span>🩹</span>
                <span>Анамнез травм та операцій до вступу в клуб:</span>
              </div>
              <p className="text-slate-300 whitespace-pre-wrap leading-relaxed text-[11px] bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                {anamnesis.past_injuries}
              </p>
            </div>
          )}

          {/* Контактний телефон */}
          {anamnesis.phone && (
            <div className="flex items-center gap-2 text-slate-400 text-[11px] pt-1">
              <span>📞 Контактний зв'язок (гравець / батьки):</span>
              <span className="text-slate-200 font-mono font-semibold">
                {anamnesis.phone}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
