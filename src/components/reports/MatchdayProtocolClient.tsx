"use client";

import { useState } from "react";
import Image from "next/image";
import PrintButton from "@/components/ui/PrintButton";
import { playerStatus } from "@/lib/player-status";
import { LOCATION_UA, INJURY_TYPE_UA, daysSince } from "@/lib/constants";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  date_of_birth: string;
  team_name: string;
  injuries: any[];
  isScreened: boolean;
};

type Props = {
  players: Player[];
  teams: string[];
};

export default function MatchdayProtocolClient({ players, teams }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0] || "U19");
  const [matchOpponent, setMatchOpponent] = useState<string>("ФК «Динамо» Київ U19");
  const [matchDate, setMatchDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [matchLocation, setMatchLocation] = useState<string>("м. Одеса, НТБ «Совіньйон»");
  const [doctorName, setDoctorName] = useState<string>("Головний лікар Академії");
  const [coachName, setCoachName] = useState<string>("Головний тренер");

  const teamPlayers = players.filter((p) => p.team_name === selectedTeam);

  // Available vs Unavailable
  const available = teamPlayers.filter((p) => playerStatus(p) === "ok");
  const modified = teamPlayers.filter((p) => playerStatus(p) === "warn");
  const injured = teamPlayers.filter((p) => playerStatus(p) === "danger");

  // Roster 23 players limit
  const matchRoster = [...available, ...modified].slice(0, 23);

  return (
    <div className="space-y-6">
      {/* Controls (Hidden in Print) */}
      <div className="bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4 print:hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/20 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Налаштування передматчевого медичного протоколу
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Офіційний бланк допуску гравців до матчу чемпіонату УПЛ / ДЮФЛУ
            </p>
          </div>
          <PrintButton label="🖨️ Друкувати офіційний протокол (PDF)" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Команда</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
            >
              {teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Суперник</label>
            <input
              type="text"
              value={matchOpponent}
              onChange={(e) => setMatchOpponent(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Дата матчу</label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Місце проведення</label>
            <input
              type="text"
              value={matchLocation}
              onChange={(e) => setMatchLocation(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Лікар команди (П.І.Б.)</label>
            <input
              type="text"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Головний тренер (П.І.Б.)</label>
            <input
              type="text"
              value={coachName}
              onChange={(e) => setCoachName(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>
        </div>
      </div>

      {/* PRINT-READY OFFICIAL PROTOCOL (A4 FORMAT) */}
      <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-2xl max-w-4xl mx-auto print:shadow-none print:p-2 print:max-w-none print:w-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-chr.png"
              alt="ФК Чорноморець"
              width={64}
              height={64}
              className="object-contain"
            />
            <div>
              <div className="text-xs uppercase tracking-widest font-black text-slate-500">
                Футбольний Клуб «Чорноморець» Одеса
              </div>
              <h1 className="text-xl font-black tracking-tight text-slate-950">
                МЕДИЧНИЙ ДОПУСК ТА ЗАЯВКА НА МАТЧ
              </h1>
              <div className="text-xs text-slate-600 font-semibold">
                Медична служба СДЮШОР / Академії
              </div>
            </div>
          </div>

          <div className="text-right text-xs font-mono">
            <div><strong>Команда:</strong> {selectedTeam}</div>
            <div><strong>Дата:</strong> {new Date(matchDate).toLocaleDateString("uk-UA")}</div>
            <div className="text-[10px] text-slate-500">Бланк форми М-23/УПЛ</div>
          </div>
        </div>

        {/* Match Details Strip */}
        <div className="bg-slate-100 p-3 rounded-lg text-xs mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 border border-slate-200">
          <div>
            <span className="text-slate-500">Матч:</span>{" "}
            <strong>{selectedTeam} — {matchOpponent}</strong>
          </div>
          <div>
            <span className="text-slate-500">Локація:</span> <strong>{matchLocation}</strong>
          </div>
          <div>
            <span className="text-slate-500">В заявці:</span>{" "}
            <strong>{matchRoster.length} гравців</strong>
          </div>
          <div>
            <span className="text-slate-500">Травмовані:</span>{" "}
            <strong className="text-red-700">{injured.length} гравців</strong>
          </div>
        </div>

        {/* Table 1: Matchday Roster */}
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider font-black text-slate-800 mb-2 flex items-center justify-between">
            <span>I. Заявковий список гравців, допущених до матчу</span>
            <span className="text-[10px] font-normal text-slate-500">Максимум 23 футболісти</span>
          </h3>

          <table className="w-full text-left text-xs border border-slate-300">
            <thead className="bg-slate-200 text-slate-700 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-2 px-2 border border-slate-300 w-8 text-center">№</th>
                <th className="py-2 px-3 border border-slate-300">Прізвище, Ім'я</th>
                <th className="py-2 px-2 border border-slate-300 text-center">Рік народж.</th>
                <th className="py-2 px-2 border border-slate-300 text-center">Амплуа</th>
                <th className="py-2 px-3 border border-slate-300 text-center">Кардіодопуск (ЕКГ)</th>
                <th className="py-2 px-3 border border-slate-300 text-center">Медичний висновок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-sans">
              {matchRoster.map((player, idx) => {
                const isModified = playerStatus(player) === "warn";
                return (
                  <tr key={player.id} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2 border border-slate-300 text-center font-mono font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-900">
                      {player.last_name} {player.first_name}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-300 text-center font-mono">
                      {new Date(player.date_of_birth).getFullYear()}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-slate-700">
                      {player.position}
                    </td>
                    <td className="py-1.5 px-3 border border-slate-300 text-center font-bold text-emerald-700 text-[11px]">
                      Норма (Дійсний)
                    </td>
                    <td className="py-1.5 px-3 border border-slate-300 text-center font-semibold">
                      {isModified ? (
                        <span className="text-amber-800 font-bold text-[11px]">
                          Обмежений (до 60 хв)
                        </span>
                      ) : (
                        <span className="text-emerald-800 font-bold text-[11px]">
                          Допущений без обмежень
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table 2: Hospital / Injured List */}
        {injured.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs uppercase tracking-wider font-black text-red-800 mb-2">
              II. Список травмованих гравців (Недоступні для участі)
            </h3>
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-red-50 text-red-900 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2 px-3 border border-slate-300">Футболіст</th>
                  <th className="py-2 px-3 border border-slate-300">Діагноз / Локалізація</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Днів у лазареті</th>
                  <th className="py-2 px-3 border border-slate-300">Очікуваний термін повернення</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {injured.map((player) => {
                  const inj = (player.injuries || []).find(
                    (i) => i.status === "active" || i.status === "rehabilitation"
                  );
                  return (
                    <tr key={player.id}>
                      <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-900">
                        {player.last_name} {player.first_name}
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 text-slate-800">
                        {inj ? (
                          <span>
                            {INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type} (
                            {LOCATION_UA[inj.location] ?? inj.location})
                          </span>
                        ) : (
                          "Травма ОРА"
                        )}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-red-700 font-bold">
                        {inj ? daysSince(inj.date_of_injury) : "—"} дн.
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 font-mono text-slate-700">
                        {inj?.expected_return_date
                          ? new Date(inj.expected_return_date).toLocaleDateString("uk-UA")
                          : "В процесі реабілітації"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Doctor & Coach Signatures */}
        <div className="pt-8 border-t-2 border-slate-900 grid grid-cols-2 gap-8 text-xs">
          <div>
            <div className="text-slate-500 mb-1">Головний лікар:</div>
            <div className="font-bold text-slate-900 mb-4">{doctorName}</div>
            <div className="border-b border-slate-400 w-48 mb-1" />
            <div className="text-[10px] text-slate-400">(Підпис, особиста печатка лікаря)</div>
          </div>

          <div>
            <div className="text-slate-500 mb-1">Головний тренер:</div>
            <div className="font-bold text-slate-900 mb-4">{coachName}</div>
            <div className="border-b border-slate-400 w-48 mb-1" />
            <div className="text-[10px] text-slate-400">(Підпис)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
