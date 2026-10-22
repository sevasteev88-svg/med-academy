"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import PrintButton from "@/components/ui/PrintButton";
import { daysSince } from "@/lib/constants";
import { type MatchdayProtocolClubSettings } from "@/types/protocol";
import {
  saveMatchdayProtocolSettingsAction,
} from "@/actions/club-settings-actions";

export type ProtocolPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  position: string;
  date_of_birth: string;
  team_name: string;
  injuries?: any[];
  isScreened?: boolean;
  hasValidScreening?: boolean;
  ecgStatusText?: string;
  clearanceText?: string;
  screeningDate?: string | null;
  screeningValidUntil?: string | null;
  availability_status?: "available" | "restricted" | "unavailable";
  max_minutes?: number;
  restriction_notes?: string;
  days_missed?: number | null;
  expected_return_date?: string | null;
};

type Props = {
  players: ProtocolPlayer[];
  teams: string[];
  initialSettings?: MatchdayProtocolClubSettings;
};

export default function MatchdayProtocolClient({
  players,
  teams,
  initialSettings,
}: Props) {
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0] || "U19");
  const [matchOpponent, setMatchOpponent] = useState<string>("ФК «Динамо» Київ U19");
  const [matchDate, setMatchDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [matchLocation, setMatchLocation] = useState<string>("м. Одеса, НТБ «Совіньйон»");

  // Налаштування клубу (за замовчуванням — "Внутрішній протокол допуску", неофіційний)
  const [protocolTitle, setProtocolTitle] = useState<string>(
    initialSettings?.title || "Внутрішній протокол допуску"
  );
  const [isOfficial, setIsOfficial] = useState<boolean>(
    initialSettings?.is_official || false
  );
  const [doctorName, setDoctorName] = useState<string>(
    initialSettings?.default_doctor_name || "Головний лікар Академії"
  );
  const [coachName, setCoachName] = useState<string>(
    initialSettings?.default_coach_name || "Головний тренер"
  );

  const [isSavingSettings, startSavingSettings] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const handleSaveClubSettings = () => {
    setSaveFeedback(null);
    startSavingSettings(async () => {
      const res = await saveMatchdayProtocolSettingsAction({
        title: protocolTitle,
        is_official: isOfficial,
        default_doctor_name: doctorName,
        default_coach_name: coachName,
      });

      if (res.error) {
        setSaveFeedback(`Помилка: ${res.error}`);
      } else {
        setSaveFeedback("Налаштування протоколу збережено для клубу!");
        setTimeout(() => setSaveFeedback(null), 4000);
      }
    });
  };

  const teamPlayers = players.filter((p) => p.team_name === selectedTeam);

  // Травмовані гравці (недоступні для участі)
  const injured = teamPlayers.filter((p) => p.availability_status === "unavailable");

  // Гравці без чинного скринінгу (не можуть автоматично потрапляти до заявки!)
  const unscreened = teamPlayers.filter(
    (p) => !p.hasValidScreening && p.availability_status !== "unavailable"
  );

  // Гравці з чинним скринінгом та медичним допуском
  const eligibleForRoster = teamPlayers.filter(
    (p) => p.hasValidScreening && p.availability_status !== "unavailable"
  );

  // До заявки на матч потрапляють максимум 23 гравці (лише ті, хто має діючий скринінг!)
  const matchRoster = eligibleForRoster.slice(0, 23);

  const getBirthYear = (dobString?: string) => {
    if (!dobString) return "—";
    const d = new Date(dobString);
    return isNaN(d.getTime()) ? "—" : d.getFullYear();
  };

  return (
    <div className="space-y-6">
      {/* Панель керування та налаштувань (приховується при друку) */}
      <div className="bg-slate-900/90 border border-blue-900/30 rounded-2xl p-5 space-y-4 print:hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/20 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋</span> Налаштування передматчевого медичного протоколу
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isOfficial ? "Офіційний бланк змагань" : "Внутрішній протокол Академії"} · Автоматична фільтрація гравців за наявністю скринінгу
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveClubSettings}
              disabled={isSavingSettings}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-blue-500/30 text-sky-300 text-xs font-semibold transition-all disabled:opacity-50"
              title="Зберегти поточну назву, статус офіційності та П.І.Б. лікаря/тренера як типові для клубу"
            >
              {isSavingSettings ? "Збереження..." : "💾 Зберегти як типові для клубу"}
            </button>
            <PrintButton
              label={
                isOfficial
                  ? "🖨️ Друкувати офіційний протокол (PDF)"
                  : "🖨️ Друкувати внутрішній протокол (PDF)"
              }
            />
          </div>
        </div>

        {saveFeedback && (
          <div className={`p-2.5 rounded-lg text-xs font-medium ${saveFeedback.startsWith("Помилка") ? "bg-rose-500/15 text-rose-300 border border-rose-500/30" : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"}`}>
            {saveFeedback}
          </div>
        )}

        {/* Налаштування бланка */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-blue-900/20">
          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Назва бланка протоколу
            </label>
            <input
              type="text"
              value={protocolTitle}
              onChange={(e) => setProtocolTitle(e.target.value)}
              placeholder="Внутрішній протокол допуску"
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
            />
          </div>

          <div className="flex flex-col justify-center pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={isOfficial}
                onChange={(e) => setIsOfficial(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-0"
              />
              <span className="text-xs font-semibold">
                Офіційний статус («Офіційний протокол»)
              </span>
            </label>
            <span className="text-[10px] text-slate-500 ml-6">
              {isOfficial ? "Містить позначку «Офіційний» та бланк М-23/УПЛ" : "За замовчуванням: Внутрішній протокол"}
            </span>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Лікар команди (з налаштувань)
            </label>
            <input
              type="text"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">
              Головний тренер (з налаштувань)
            </label>
            <input
              type="text"
              value={coachName}
              onChange={(e) => setCoachName(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>
        </div>

        {/* Параметри матчу */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Команда клубу</label>
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
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Місце проведення</label>
            <input
              type="text"
              value={matchLocation}
              onChange={(e) => setMatchLocation(e.target.value)}
              className="w-full bg-slate-950 border border-blue-900/40 rounded-lg p-2 text-white"
            />
          </div>
        </div>

        {/* Попередження, якщо є гравці без скринінгу */}
        {unscreened.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <strong className="font-bold">Увага! {unscreened.length} гравців без чинного скринінгу не потрапили до заявки:</strong>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {unscreened.map((p) => (
                  <span
                    key={p.id}
                    className="px-2 py-0.5 rounded bg-slate-900/80 border border-amber-500/30 text-slate-200 font-mono text-[11px]"
                  >
                    {p.last_name} {p.first_name} ({p.ecgStatusText || "Немає даних"})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PRINT-READY PROTOCOL (A4 FORMAT) */}
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
                {isOfficial ? `ОФІЦІЙНИЙ ${protocolTitle.toUpperCase()} ТА ЗАЯВКА НА МАТЧ` : `${protocolTitle.toUpperCase()}`}
              </h1>
              <div className="text-xs text-slate-600 font-semibold">
                {isOfficial
                  ? "Офіційний медичний протокол допуску до змагань УПЛ / ДЮФЛУ"
                  : "Медична служба СДЮШОР / Академії (Внутрішній облік)"}
              </div>
            </div>
          </div>

          <div className="text-right text-xs font-mono">
            <div><strong>Команда:</strong> {selectedTeam}</div>
            <div><strong>Дата:</strong> {new Date(matchDate).toLocaleDateString("uk-UA")}</div>
            <div className="text-[10px] text-slate-500">
              {isOfficial ? "Бланк форми М-23/УПЛ" : "Форма внутрішнього допуску"}
            </div>
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
            <span className="text-slate-500">В заявці (допущено):</span>{" "}
            <strong className="text-emerald-800">{matchRoster.length} гравців</strong>
          </div>
          <div>
            <span className="text-slate-500">Травмовані / Без допуску:</span>{" "}
            <strong className="text-red-700">{injured.length + unscreened.length} гравців</strong>
          </div>
        </div>

        {/* Table 1: Matchday Roster */}
        <div className="mb-6">
          <h3 className="text-xs uppercase tracking-wider font-black text-slate-800 mb-2 flex items-center justify-between">
            <span>I. Заявковий список гравців, допущених до матчу</span>
            <span className="text-[10px] font-normal text-slate-500">
              Максимум 23 футболісти з чинним скринінгом
            </span>
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
              {matchRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 italic">
                    Немає гравців з підтвердженим скринінгом для заявки.
                  </td>
                </tr>
              ) : (
                matchRoster.map((player, idx) => {
                  const isRestricted = player.availability_status === "restricted";
                  const ecg = player.ecgStatusText || "Немає даних";
                  const clearance = player.clearanceText || "Допущений без обмежень";

                  return (
                    <tr key={player.id} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 border border-slate-300 text-center font-mono font-bold">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-900">
                        {player.last_name} {player.first_name}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-300 text-center font-mono">
                        {getBirthYear(player.date_of_birth)}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-slate-700">
                        {player.position}
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 text-center font-bold text-[11px]">
                        <span
                          className={
                            ecg === "Норма"
                              ? "text-emerald-700"
                              : ecg === "Прикордонна"
                              ? "text-amber-700"
                              : ecg === "Патологія"
                              ? "text-red-700"
                              : "text-slate-500"
                          }
                        >
                          {ecg}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 text-center font-semibold text-[11px]">
                        {isRestricted ? (
                          <span className="text-amber-800 font-bold">
                            {clearance}
                          </span>
                        ) : (
                          <span className="text-emerald-800 font-bold">
                            {clearance}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
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
                  <th className="py-2 px-3 border border-slate-300">Медичний статус / Обмеження</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Днів у лазареті</th>
                  <th className="py-2 px-3 border border-slate-300">Очікуваний термін повернення</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {injured.map((player) => {
                  const inj = (player.injuries || []).find(
                    (i: any) => i.status === "active" || i.status === "rehabilitation"
                  );
                  const statusNote =
                    player.restriction_notes ||
                    (inj
                      ? "Лазарет / медичне відновлення"
                      : "Не допущений за медичними показниками");

                  const days =
                    player.days_missed != null
                      ? player.days_missed
                      : inj?.date_of_injury
                      ? daysSince(inj.date_of_injury)
                      : "—";

                  const returnDate =
                    player.expected_return_date || inj?.expected_return_date;

                  return (
                    <tr key={player.id}>
                      <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-900">
                        {player.last_name} {player.first_name}
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 text-slate-800">
                        {statusNote}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-red-700 font-bold">
                        {days !== "—" ? `${days} дн.` : "—"}
                      </td>
                      <td className="py-1.5 px-3 border border-slate-300 font-mono text-slate-700">
                        {returnDate
                          ? new Date(returnDate).toLocaleDateString("uk-UA")
                          : "В процесі реабілітації"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table 3: Unscreened Players List (No active screening = excluded from roster) */}
        {unscreened.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs uppercase tracking-wider font-black text-slate-700 mb-2 flex items-center justify-between">
              <span>III. Гравці без чинного медичного допуску (Не включені до заявки)</span>
              <span className="text-[10px] font-normal text-slate-500">
                Потребують проходження або оновлення скринінгу
              </span>
            </h3>
            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 text-slate-700 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2 px-3 border border-slate-300">Футболіст</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Рік народж.</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Амплуа</th>
                  <th className="py-2 px-3 border border-slate-300 text-center">ЕКГ</th>
                  <th className="py-2 px-3 border border-slate-300">Причина недопуску</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {unscreened.map((player) => (
                  <tr key={player.id} className="bg-slate-50/50">
                    <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-800">
                      {player.last_name} {player.first_name}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-slate-600">
                      {getBirthYear(player.date_of_birth)}
                    </td>
                    <td className="py-1.5 px-2 border border-slate-300 text-center font-mono text-slate-600">
                      {player.position}
                    </td>
                    <td className="py-1.5 px-3 border border-slate-300 text-center font-mono text-slate-500 text-[11px]">
                      {player.ecgStatusText || "Немає даних"}
                    </td>
                    <td className="py-1.5 px-3 border border-slate-300 text-rose-700 font-medium text-[11px]">
                      {player.isScreened
                        ? "Термін дії скринінгу вичерпано або статус не підтверджено"
                        : "Передсезонний скринінг не внесено в базу (Немає даних)"}
                    </td>
                  </tr>
                ))}
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
