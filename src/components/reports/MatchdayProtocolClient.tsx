"use client";

import { useState, useTransition, useMemo } from "react";
import Image from "next/image";
import PrintButton from "@/components/ui/PrintButton";
import { daysSince } from "@/lib/constants";
import { type MatchdayProtocolClubSettings } from "@/types/protocol";
import { type MatchdayRoster, type RosterPlayerSlot } from "@/types/roster";
import { validateMatchdayRoster } from "@/lib/roster-guardrails";
import {
  saveMatchdayProtocolSettingsAction,
} from "@/actions/club-settings-actions";
import {
  saveMatchdayRosterAction,
  getMatchdayRosterAction,
} from "@/actions/match-roster-actions";

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
  max_minutes?: number | null;
  restriction_notes?: string | null;
  days_missed?: number | null;
  expected_return_date?: string | null;
};

type Props = {
  players: ProtocolPlayer[];
  teams: string[];
  allClubTeams?: string[];
  initialSettings?: MatchdayProtocolClubSettings;
  initialRoster?: MatchdayRoster | null;
  userRole?: string;
  coachHasNoTeams?: boolean;
};

const FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "4-1-4-1", "3-4-3"];

export default function MatchdayProtocolClient({
  players,
  teams,
  allClubTeams = [],
  initialSettings,
  initialRoster,
  userRole = "doctor",
  coachHasNoTeams = false,
}: Props) {
  // Tabs: 'builder' = Конструктор заявки, 'protocol' = Бланк для друку (PDF)
  const [activeTab, setActiveTab] = useState<"builder" | "protocol">("builder");

  const isCoach = userRole === "coach";
  const effectiveTeams = teams.length > 0 ? teams : allClubTeams;
  const [selectedTeam, setSelectedTeam] = useState<string>(
    effectiveTeams[0] || "U19"
  );

  const [matchOpponent, setMatchOpponent] = useState<string>(
    initialRoster?.opponent || "ФК «Динамо» Київ"
  );
  const [matchDate, setMatchDate] = useState<string>(
    initialRoster?.matchDate || new Date().toISOString().split("T")[0]
  );
  const [matchLocation, setMatchLocation] = useState<string>(
    initialRoster?.location || "м. Одеса, НТБ «Совіньйон»"
  );
  const [formation, setFormation] = useState<string>(
    initialRoster?.formation || "4-3-3"
  );
  const [tacticalNotes, setTacticalNotes] = useState<string>(
    initialRoster?.tacticalNotes || ""
  );

  // Lineup state: Starters (XI) and Substitutes (Bench)
  const [starters, setStarters] = useState<RosterPlayerSlot[]>(
    initialRoster?.starters || []
  );
  const [substitutes, setSubstitutes] = useState<RosterPlayerSlot[]>(
    initialRoster?.substitutes || []
  );

  // Confirmation alert for adding unavailable player
  const [guardrailAlert, setGuardrailAlert] = useState<{
    show: boolean;
    player?: ProtocolPlayer;
    target: "starters" | "substitutes";
    warningText: string;
  } | null>(null);

  // Settings
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

  const [isSavingRoster, startSavingRoster] = useTransition();
  const [rosterFeedback, setRosterFeedback] = useState<string | null>(null);

  const [isSavingSettings, startSavingSettings] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Filter players of currently selected team
  const teamPlayers = useMemo(
    () => players.filter((p) => p.team_name === selectedTeam),
    [players, selectedTeam]
  );

  // Map of players for quick lookup
  const playerMap = useMemo(() => {
    const map = new Map<string, ProtocolPlayer>();
    teamPlayers.forEach((p) => map.set(p.id, p));
    return map;
  }, [teamPlayers]);

  // Guardrail validation
  const guardrails = useMemo(
    () => validateMatchdayRoster(starters, substitutes, teamPlayers),
    [starters, substitutes, teamPlayers]
  );

  // Categorize squad players:
  // 1. Starters IDs
  const starterIds = useMemo(
    () => new Set(starters.map((s) => s.playerId)),
    [starters]
  );
  // 2. Substitutes IDs
  const subIds = useMemo(
    () => new Set(substitutes.map((s) => s.playerId)),
    [substitutes]
  );

  // 3. Reserves: Available healthy players not in starters or subs
  const availableReserves = useMemo(
    () =>
      teamPlayers.filter(
        (p) =>
          !starterIds.has(p.id) &&
          !subIds.has(p.id) &&
          p.availability_status !== "unavailable" &&
          p.hasValidScreening
      ),
    [teamPlayers, starterIds, subIds]
  );

  // 4. Restricted players not in lineup
  const unassignedRestricted = useMemo(
    () =>
      teamPlayers.filter(
        (p) =>
          !starterIds.has(p.id) &&
          !subIds.has(p.id) &&
          p.availability_status === "restricted" &&
          p.hasValidScreening
      ),
    [teamPlayers, starterIds, subIds]
  );

  // 5. Injured / Hospital (Unavailable)
  const injured = useMemo(
    () => teamPlayers.filter((p) => p.availability_status === "unavailable"),
    [teamPlayers]
  );

  // 6. Unscreened (no valid screening)
  const unscreened = useMemo(
    () =>
      teamPlayers.filter(
        (p) => !p.hasValidScreening && p.availability_status !== "unavailable"
      ),
    [teamPlayers]
  );

  // Switch team handler
  const handleTeamChange = async (newTeam: string) => {
    setSelectedTeam(newTeam);
    setRosterFeedback(null);
    const res = await getMatchdayRosterAction(newTeam);
    if (res.roster) {
      setStarters(res.roster.starters || []);
      setSubstitutes(res.roster.substitutes || []);
      if (res.roster.opponent) setMatchOpponent(res.roster.opponent);
      if (res.roster.matchDate) setMatchDate(res.roster.matchDate);
      if (res.roster.location) setMatchLocation(res.roster.location);
      if (res.roster.formation) setFormation(res.roster.formation);
      if (res.roster.tacticalNotes) setTacticalNotes(res.roster.tacticalNotes);
    } else {
      setStarters([]);
      setSubstitutes([]);
    }
  };

  // Add player to starters with Medical Guardrail
  const handleAddToStarters = (player: ProtocolPlayer) => {
    if (player.availability_status === "unavailable") {
      setGuardrailAlert({
        show: true,
        player,
        target: "starters",
        warningText: `⛔ МЕДИЧНЕ ЗАСТЕРЕЖЕННЯ: Гравець ${player.last_name} ${player.first_name} травмований або не допущений лікарем (${player.restriction_notes || "лазарет"}). Вихід на поле загрожує погіршенням травми!`,
      });
      return;
    }

    if (!player.hasValidScreening) {
      setGuardrailAlert({
        show: true,
        player,
        target: "starters",
        warningText: `🫀 ЗАСТЕРЕЖЕННЯ: У гравця ${player.last_name} ${player.first_name} відсутній чинний кардіодопуск (ЕКГ/скринінг). Включення до старту заборонено медичним регламентом змагань.`,
      });
      return;
    }

    executeAddToStarters(player);
  };

  const executeAddToStarters = (player: ProtocolPlayer) => {
    // Remove from subs if already there
    setSubstitutes((prev) => prev.filter((s) => s.playerId !== player.id));
    // Add to starters
    setStarters((prev) => {
      if (prev.some((s) => s.playerId === player.id)) return prev;
      const nextNum = prev.length + 1;
      return [...prev, { playerId: player.id, number: nextNum }];
    });
    setGuardrailAlert(null);
  };

  // Add player to substitutes with Medical Guardrail
  const handleAddToSubstitutes = (player: ProtocolPlayer) => {
    if (player.availability_status === "unavailable") {
      setGuardrailAlert({
        show: true,
        player,
        target: "substitutes",
        warningText: `⛔ МЕДИЧНЕ ЗАСТЕРЕЖЕННЯ: Гравець ${player.last_name} ${player.first_name} травмований (${player.restriction_notes || "лазарет"}). Чи дійсно ви бажаєте включити його до лави запасних?`,
      });
      return;
    }

    executeAddToSubstitutes(player);
  };

  const executeAddToSubstitutes = (player: ProtocolPlayer) => {
    setStarters((prev) => prev.filter((s) => s.playerId !== player.id));
    setSubstitutes((prev) => {
      if (prev.some((s) => s.playerId === player.id)) return prev;
      const nextNum = starters.length + prev.length + 1;
      return [...prev, { playerId: player.id, number: nextNum }];
    });
    setGuardrailAlert(null);
  };

  // Remove player completely from roster
  const handleRemoveFromRoster = (playerId: string) => {
    setStarters((prev) => prev.filter((s) => s.playerId !== playerId));
    setSubstitutes((prev) => prev.filter((s) => s.playerId !== playerId));
  };

  // Update jersey number
  const handleUpdateNumber = (
    playerId: string,
    target: "starters" | "substitutes",
    val: string
  ) => {
    if (target === "starters") {
      setStarters((prev) =>
        prev.map((s) => (s.playerId === playerId ? { ...s, number: val } : s))
      );
    } else {
      setSubstitutes((prev) =>
        prev.map((s) => (s.playerId === playerId ? { ...s, number: val } : s))
      );
    }
  };

  // Toggle captain
  const handleToggleCaptain = (playerId: string) => {
    setStarters((prev) =>
      prev.map((s) => ({
        ...s,
        isCaptain: s.playerId === playerId ? !s.isCaptain : false,
      }))
    );
  };

  // Quick Auto-Fill: 1 GK + 10 healthy outfield players into Starters, rest into Subs
  const handleAutoFill = () => {
    const eligible = teamPlayers.filter(
      (p) => p.hasValidScreening && p.availability_status !== "unavailable"
    );

    const gks = eligible.filter((p) => {
      const pos = (p.position || "").toUpperCase();
      return pos === "ВР" || pos === "GK";
    });

    const outfield = eligible.filter((p) => {
      const pos = (p.position || "").toUpperCase();
      return pos !== "ВР" && pos !== "GK";
    });

    const selectedStarters: RosterPlayerSlot[] = [];
    const selectedSubs: RosterPlayerSlot[] = [];

    // 1 GK in starters
    if (gks.length > 0) {
      selectedStarters.push({ playerId: gks[0].id, number: 1 });
    }

    // 10 Outfield in starters
    const outfieldForStarters = outfield.slice(0, 10);
    outfieldForStarters.forEach((p, idx) => {
      selectedStarters.push({
        playerId: p.id,
        number: idx + 2,
        isCaptain: idx === 0,
      });
    });

    // Remaining GKs and outfield go to substitutes (up to 12)
    const remainingGks = gks.slice(1);
    const remainingOutfield = outfield.slice(10);
    const allRemaining = [...remainingGks, ...remainingOutfield].slice(0, 12);

    allRemaining.forEach((p, idx) => {
      selectedSubs.push({
        playerId: p.id,
        number: selectedStarters.length + idx + 1,
      });
    });

    setStarters(selectedStarters);
    setSubstitutes(selectedSubs);
    setRosterFeedback("Склад автоматично заповнено здоровими футболістами!");
    setTimeout(() => setRosterFeedback(null), 3000);
  };

  // Clear roster
  const handleClearRoster = () => {
    setStarters([]);
    setSubstitutes([]);
    setRosterFeedback("Заявку очищено.");
    setTimeout(() => setRosterFeedback(null), 2500);
  };

  // Save roster
  const handleSaveRoster = () => {
    setRosterFeedback(null);
    startSavingRoster(async () => {
      const res = await saveMatchdayRosterAction({
        teamName: selectedTeam,
        matchDate,
        opponent: matchOpponent,
        location: matchLocation,
        formation,
        starters,
        substitutes,
        tacticalNotes,
      });

      if (res.error) {
        setRosterFeedback(`Помилка: ${res.error}`);
      } else {
        setRosterFeedback("✅ Заявку та розстановку на матч успішно збережено!");
        setTimeout(() => setRosterFeedback(null), 4000);
      }
    });
  };

  // Save club protocol default settings
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

  const getBirthYear = (dobString?: string) => {
    if (!dobString) return "—";
    const d = new Date(dobString);
    return isNaN(d.getTime()) ? "—" : d.getFullYear();
  };

  // If coach has no teams assigned, show helpful notice
  if (coachHasNoTeams) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center max-w-xl mx-auto my-12 space-y-4">
        <div className="text-4xl">⚽</div>
        <h2 className="text-lg font-bold text-white">Очікування призначення команди</h2>
        <p className="text-sm text-slate-300">
          Ваш обліковий запис тренера ще не закріплений за жодною віковою категорією (U19, U17 тощо).
        </p>
        <p className="text-xs text-slate-400">
          Зверніться до адміністратора або головного лікаря клубу для відкриття доступу до ваших футболістів.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar: Tabs & Quick Action Controls (Hidden when printing) */}
      <div className="bg-slate-900/90 border border-blue-900/40 rounded-2xl p-5 space-y-4 print:hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/30 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚽</span>
              <h1 className="text-lg font-black text-white tracking-wide">
                Матч-центр та медичний допуск
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/20 text-sky-300 border border-blue-500/30">
                {selectedTeam}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Інтерактивний конструктор заявки з «захистом від дурака» та офіційний медичний бланк М-23/УПЛ
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-blue-900/40">
            <button
              onClick={() => setActiveTab("builder")}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                activeTab === "builder"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span>📋</span> Конструктор заявки (Lineup)
              {guardrails.criticalCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("protocol")}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                activeTab === "protocol"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <span>🖨️</span> Друкований протокол (A4 PDF)
            </button>
          </div>
        </div>

        {/* Global Match & Team Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs bg-slate-950/60 p-3.5 rounded-xl border border-blue-900/30">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Команда (Вік)</label>
            <select
              value={selectedTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/50 rounded-lg p-2 text-white font-bold text-xs focus:ring-2 focus:ring-blue-500"
            >
              {effectiveTeams.map((t) => (
                <option key={t} value={t}>
                  {t} {isCoach ? "(Закріплена)" : ""}
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
              placeholder="ФК «Динамо»"
              className="w-full bg-slate-900 border border-blue-900/50 rounded-lg p-2 text-white text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Дата матчу</label>
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/50 rounded-lg p-2 text-white font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Тактична схема</label>
            <select
              value={formation}
              onChange={(e) => setFormation(e.target.value)}
              className="w-full bg-slate-900 border border-blue-900/50 rounded-lg p-2 text-sky-400 font-mono font-bold text-xs"
            >
              {FORMATIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Місце проведення</label>
            <input
              type="text"
              value={matchLocation}
              onChange={(e) => setMatchLocation(e.target.value)}
              placeholder="м. Одеса"
              className="w-full bg-slate-900 border border-blue-900/50 rounded-lg p-2 text-white text-xs"
            />
          </div>
        </div>

        {/* FEEDBACK BANNER */}
        {rosterFeedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
              rosterFeedback.startsWith("Помилка")
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
            }`}
          >
            <span>{rosterFeedback}</span>
            <button
              onClick={() => setRosterFeedback(null)}
              className="text-slate-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* CONFIRMATION / GUARDRAIL WARNING MODAL */}
      {guardrailAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-rose-500/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <span className="text-3xl p-2 bg-rose-500/20 rounded-xl">⛔</span>
              <div>
                <h3 className="text-base font-black text-rose-300">
                  Медичне блокування виходу на поле
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Система запобігання травматизму виявила серйозний ризик
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-200 leading-relaxed">
              {guardrailAlert.warningText}
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-950/80 p-3 rounded-lg border border-slate-800">
              <strong className="text-slate-200">Медичний протокол MedAcademy:</strong> Допуск травмованих гравців або гравців без обстеження серця (ЕКГ) є порушенням регламенту та несе загрозу здоров'ю футболіста.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setGuardrailAlert(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
              >
                Скасувати (Рекомендовано)
              </button>
              <button
                onClick={() => {
                  if (guardrailAlert.player) {
                    if (guardrailAlert.target === "starters") {
                      executeAddToStarters(guardrailAlert.player);
                    } else {
                      executeAddToSubstitutes(guardrailAlert.player);
                    }
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-black transition-all shadow-lg shadow-rose-700/30"
              >
                Примусово додати під свою відповідальність
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: INTERACTIVE LINEUP BUILDER */}
      {activeTab === "builder" && (
        <div className="space-y-6">
          {/* Medical Guardrails Live Status Bar */}
          <div className="bg-slate-900/90 border border-blue-900/40 rounded-2xl p-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {/* Starters counter */}
                <div
                  className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border ${
                    starters.length === 11
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  }`}
                >
                  <span>Стартовий склад:</span>
                  <strong className="text-sm font-mono">{starters.length}/11</strong>
                </div>

                {/* Substitutes counter */}
                <div className="px-3 py-1.5 rounded-xl font-bold bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1.5">
                  <span>Запасні:</span>
                  <strong className="text-sm font-mono">{substitutes.length}/12</strong>
                </div>

                {/* Goalkeepers */}
                <div
                  className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border ${
                    guardrails.gkStarterCount === 1
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  }`}
                >
                  <span>🧤 Воротарів у старті:</span>
                  <strong className="text-sm font-mono">{guardrails.gkStarterCount}</strong>
                </div>

                {/* Critical Issues */}
                {guardrails.criticalCount > 0 && (
                  <div className="px-3 py-1.5 rounded-xl font-black bg-rose-500/20 border border-rose-500/50 text-rose-300 flex items-center gap-1.5 animate-pulse">
                    <span>⛔ Ризики травм/ЕКГ:</span>
                    <strong className="text-sm font-mono">{guardrails.criticalCount}</strong>
                  </div>
                )}

                {/* Minute Limit Warnings */}
                {guardrails.warningCount > 0 && (
                  <div className="px-3 py-1.5 rounded-xl font-bold bg-amber-500/20 border border-amber-500/50 text-amber-300 flex items-center gap-1.5">
                    <span>⏱️ Ліміт хвилин:</span>
                    <strong className="text-sm font-mono">{guardrails.warningCount}</strong>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAutoFill}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-500/30 text-sky-300 text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Автоматично розставити здорових гравців з допуском"
                >
                  <span>⚡</span> Автопідбір здорових
                </button>
                <button
                  onClick={handleClearRoster}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all"
                  title="Очистити стартовий склад і лаву запасних"
                >
                  🗑️ Очистити
                </button>
                <button
                  onClick={handleSaveRoster}
                  disabled={isSavingRoster}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingRoster ? "Збереження..." : "💾 Зберегти заявку"}
                </button>
              </div>
            </div>

            {/* LIVE GUARDRAILS EXPANDED BANNER (IF CRITICAL OR WARNING ISSUES EXIST) */}
            {guardrails.issues.length > 0 && (
              <div className="mt-4 pt-4 border-t border-blue-900/30 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  ⚠️ Медичний контроль заявки (Захист від помилок):
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {guardrails.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                        issue.severity === "critical"
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                          : issue.severity === "warning"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                          : "bg-blue-500/10 border-blue-500/30 text-sky-200"
                      }`}
                    >
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>
                            {issue.severity === "critical"
                              ? "⛔"
                              : issue.severity === "warning"
                              ? "⚠️"
                              : "ℹ️"}
                          </span>
                          <span>{issue.title}</span>
                        </div>
                        <p className="text-[11px] opacity-90 mt-0.5">{issue.message}</p>
                      </div>

                      {issue.playerId && (
                        <button
                          onClick={() => handleRemoveFromRoster(issue.playerId)}
                          className="px-2 py-1 rounded bg-black/40 hover:bg-black/60 text-[10px] font-bold shrink-0"
                          title="Вилучити зі складу"
                        >
                          Вилучити
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MAIN 3-ZONE LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ZONE 1: STARTING XI (Col 1-5) */}
            <div className="lg:col-span-5 bg-slate-900/90 border border-blue-900/40 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-blue-900/30 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🟢</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wide">
                      I. Стартовий склад (XI)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-sky-400">
                      Схема: {formation}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold font-mono ${
                        starters.length === 11
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {starters.length}/11
                    </span>
                  </div>
                </div>

                {starters.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs italic border-2 border-dashed border-slate-800 rounded-xl p-4">
                    Стартовий склад порожній. Натисніть «⚡ Автопідбір здорових» або додайте гравців із списку праворуч.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {starters.map((slot, idx) => {
                      const p = playerMap.get(slot.playerId);
                      if (!p) return null;

                      const isRestricted = p.availability_status === "restricted";
                      const isUnavailable = p.availability_status === "unavailable";
                      const isUnscreened = !p.hasValidScreening;
                      const isGk = (p.position || "").toUpperCase() === "ВР" || (p.position || "").toUpperCase() === "GK";

                      return (
                        <div
                          key={slot.playerId}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                            isUnavailable
                              ? "bg-rose-950/40 border-rose-500/60 text-rose-200"
                              : isUnscreened
                              ? "bg-amber-950/40 border-amber-500/60 text-amber-200"
                              : isRestricted
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-100"
                              : "bg-slate-950/60 border-slate-800 text-white hover:border-blue-500/40"
                          }`}
                        >
                          {/* Number & Pos */}
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="text"
                              value={slot.number || idx + 1}
                              onChange={(e) =>
                                handleUpdateNumber(slot.playerId, "starters", e.target.value)
                              }
                              className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-center font-mono font-black text-xs text-sky-300"
                              title="Ігровий номер"
                            />
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                isGk
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {p.position}
                            </span>
                          </div>

                          {/* Player Info & Guardrails */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="text-xs font-bold truncate">
                                {p.last_name} {p.first_name}
                              </span>
                              {slot.isCaptain && (
                                <span className="text-[10px] px-1.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-black">
                                  К
                                </span>
                              )}
                            </div>

                            {/* Medical badges */}
                            <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                              {isUnavailable && (
                                <span className="text-rose-400 font-bold">
                                  ⛔ Травма ({p.restriction_notes || "лазарет"})
                                </span>
                              )}
                              {!isUnavailable && isRestricted && (
                                <span className="text-amber-400 font-bold">
                                  ⏱️ Ліміт: {p.max_minutes || 45} хв (Заміна!)
                                </span>
                              )}
                              {!isUnavailable && isUnscreened && (
                                <span className="text-amber-400">
                                  🫀 Без ЕКГ
                                </span>
                              )}
                              {!isUnavailable && !isRestricted && !isUnscreened && (
                                <span className="text-emerald-400">
                                  ✓ Допущений
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleToggleCaptain(slot.playerId)}
                              className={`p-1.5 rounded-lg text-[10px] font-black transition-all ${
                                slot.isCaptain
                                  ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/50"
                                  : "bg-slate-800 text-slate-400 hover:text-white"
                              }`}
                              title={slot.isCaptain ? "Зняти капітана" : "Призначити капітаном"}
                            >
                              (К)
                            </button>
                            <button
                              onClick={() => executeAddToSubstitutes(p)}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold"
                              title="Перевести на лаву запасних"
                            >
                              В запас
                            </button>
                            <button
                              onClick={() => handleRemoveFromRoster(slot.playerId)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-[11px]"
                              title="Вилучити із заявки"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tactical Notes Input */}
              <div className="mt-4 pt-3 border-t border-blue-900/30">
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Тактичні вказівки та таймінг замін (на матч):
                </label>
                <textarea
                  value={tacticalNotes}
                  onChange={(e) => setTacticalNotes(e.target.value)}
                  placeholder="Наприклад: Заміна опорного півзахисника на 45-й хв через ліміт лікаря..."
                  rows={2}
                  className="w-full bg-slate-950 border border-blue-900/40 rounded-xl p-2 text-xs text-white placeholder-slate-600 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* ZONE 2: SUBSTITUTES BENCH (Col 6-9) */}
            <div className="lg:col-span-4 bg-slate-900/90 border border-blue-900/40 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-blue-900/30 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🟡</span>
                  <h3 className="text-sm font-black text-white uppercase tracking-wide">
                    II. Лава запасних
                  </h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold font-mono bg-slate-800 text-slate-300">
                  {substitutes.length}/12
                </span>
              </div>

              {substitutes.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs italic border-2 border-dashed border-slate-800 rounded-xl p-4">
                  Лава запасних порожня. Переведіть сюди гравців із стартового складу або резерву.
                </div>
              ) : (
                <div className="space-y-2">
                  {substitutes.map((slot, idx) => {
                    const p = playerMap.get(slot.playerId);
                    if (!p) return null;

                    const isRestricted = p.availability_status === "restricted";
                    const isUnavailable = p.availability_status === "unavailable";
                    const isUnscreened = !p.hasValidScreening;

                    return (
                      <div
                        key={slot.playerId}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          isUnavailable
                            ? "bg-rose-950/40 border-rose-500/60 text-rose-200"
                            : isUnscreened
                            ? "bg-amber-950/40 border-amber-500/60 text-amber-200"
                            : isRestricted
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-100"
                            : "bg-slate-950/60 border-slate-800 text-white hover:border-blue-500/40"
                        }`}
                      >
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            value={slot.number || starters.length + idx + 1}
                            onChange={(e) =>
                              handleUpdateNumber(slot.playerId, "substitutes", e.target.value)
                            }
                            className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-center font-mono font-bold text-xs text-sky-300"
                            title="Ігровий номер"
                          />
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {p.position}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate">
                            {p.last_name} {p.first_name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                            {isUnavailable && (
                              <span className="text-rose-400 font-bold">⛔ Травма</span>
                            )}
                            {!isUnavailable && isRestricted && (
                              <span className="text-amber-400 font-bold">
                                ⏱️ До {p.max_minutes || 45} хв
                              </span>
                            )}
                            {!isUnavailable && !isRestricted && (
                              <span className="text-emerald-400">✓ Запасний</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleAddToStarters(p)}
                            className="px-2 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-sky-300 hover:text-white text-[10px] font-bold transition-all"
                            title="Перевести в стартовий склад"
                          >
                            У старт
                          </button>
                          <button
                            onClick={() => handleRemoveFromRoster(slot.playerId)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-[11px]"
                            title="Вилучити"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ZONE 3: RESERVES & HOSPITAL (Col 10-12) */}
            <div className="lg:col-span-3 space-y-4">
              {/* Healthy Available Reserves */}
              <div className="bg-slate-900/90 border border-blue-900/40 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-blue-900/30 pb-2 mb-3">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>⚪</span> Резерв ({availableReserves.length + unassignedRestricted.length})
                  </h4>
                  <span className="text-[10px] text-slate-500">Доступні</span>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {[...unassignedRestricted, ...availableReserves].length === 0 ? (
                    <div className="py-4 text-center text-slate-500 text-xs italic">
                      Всі здорові гравці вже включені до заявки.
                    </div>
                  ) : (
                    [...unassignedRestricted, ...availableReserves].map((p) => {
                      const isRestricted = p.availability_status === "restricted";
                      return (
                        <div
                          key={p.id}
                          className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-1.5 text-xs hover:border-slate-700"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-200 truncate text-[11px]">
                              {p.last_name} {p.first_name}
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <span className="text-slate-400 font-mono">{p.position}</span>
                              {isRestricted && (
                                <span className="text-amber-400 font-bold">
                                  ⏱️ {p.max_minutes}хв
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleAddToStarters(p)}
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-blue-600 text-[10px] font-bold text-slate-300 hover:text-white"
                              title="Додати до старту"
                            >
                              + Старт
                            </button>
                            <button
                              onClick={() => handleAddToSubstitutes(p)}
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300"
                              title="Додати до запасу"
                            >
                              + Запас
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* HOSPITAL / INJURED (Unavailable) */}
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-3">
                  <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <span>🔴</span> Лазарет ({injured.length})
                  </h4>
                  <span className="text-[10px] text-rose-400/80 font-bold">Недопущені</span>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {injured.length === 0 ? (
                    <div className="py-3 text-center text-emerald-400 text-xs">
                      ✓ У лазареті немає гравців!
                    </div>
                  ) : (
                    injured.map((p) => {
                      const inj = (p.injuries || []).find(
                        (i: any) => i.status === "active" || i.status === "rehabilitation"
                      );
                      const days =
                        p.days_missed != null
                          ? p.days_missed
                          : inj?.date_of_injury
                          ? daysSince(inj.date_of_injury)
                          : "—";

                      return (
                        <div
                          key={p.id}
                          className="p-2 rounded-xl bg-slate-950/80 border border-rose-500/20 text-xs flex items-center justify-between gap-1.5"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-rose-200 text-[11px] truncate">
                              {p.last_name} {p.first_name}
                            </div>
                            <div className="text-[10px] text-rose-400/90 truncate">
                              {p.restriction_notes || "Відновлення після травми"}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono">
                              У лазареті: {days !== "—" ? `${days} дн.` : "—"}
                            </div>
                          </div>

                          <button
                            onClick={() => handleAddToStarters(p)}
                            className="px-1.5 py-1 rounded bg-rose-900/40 hover:bg-rose-800 text-[10px] font-bold text-rose-300 shrink-0"
                            title="Примусово включити до заявки під медичну відповідальність"
                          >
                            + Заявка
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: OFFICIAL PRINT-READY PROTOCOL (A4 FORMAT) */}
      <div className={activeTab === "protocol" ? "block space-y-4" : "hidden print:block space-y-4"}>
        {/* Print controls bar */}
        <div className="bg-slate-900/90 border border-blue-900/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden shadow-xl">
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span>📄</span> Офіційний бланк заявки на матч (A4)
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Сформовано автоматично з вибраних у конструкторі стартових 11 та запасних
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveClubSettings}
              disabled={isSavingSettings}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-blue-500/30 text-sky-300 text-xs font-semibold transition-all disabled:opacity-50"
            >
              {isSavingSettings ? "Збереження..." : "💾 Типові налаштування"}
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
          <div className="p-2.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 print:hidden">
            {saveFeedback}
          </div>
        )}

        {/* PRINT CANVAS */}
        <div className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-2xl max-w-4xl mx-auto print:shadow-none print:p-2 print:max-w-none print:w-full">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center gap-4">
              <Image
                src="/logo-chr.png"
                alt="Клуб"
                width={64}
                height={64}
                className="object-contain"
              />
              <div>
                <div className="text-xs uppercase tracking-widest font-black text-slate-500">
                  {initialSettings?.title || "Футбольний Клуб · Медичний департамент"}
                </div>
                <h1 className="text-xl font-black tracking-tight text-slate-950">
                  {isOfficial
                    ? `ОФІЦІЙНИЙ ${protocolTitle.toUpperCase()} ТА ЗАЯВКА НА МАТЧ`
                    : `${protocolTitle.toUpperCase()}`}
                </h1>
                <div className="text-xs text-slate-600 font-semibold">
                  {isOfficial
                    ? "Офіційний медичний протокол допуску до змагань УПЛ / ДЮФЛУ"
                    : "Медична служба СДЮШОР / Академії (Внутрішній облік)"}
                </div>
              </div>
            </div>

            <div className="text-right text-xs font-mono">
              <div>
                <strong>Команда:</strong> {selectedTeam}
              </div>
              <div>
                <strong>Дата:</strong> {new Date(matchDate).toLocaleDateString("uk-UA")}
              </div>
              <div className="text-[10px] text-slate-500">
                {isOfficial ? "Бланк форми М-23/УПЛ" : "Форма внутрішнього допуску"}
              </div>
            </div>
          </div>

          {/* Match Details Strip */}
          <div className="bg-slate-100 p-3 rounded-lg text-xs mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 border border-slate-200">
            <div>
              <span className="text-slate-500">Матч:</span>{" "}
              <strong>
                {selectedTeam} — {matchOpponent}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Локація:</span>{" "}
              <strong>{matchLocation}</strong>
            </div>
            <div>
              <span className="text-slate-500">Старт + Запас:</span>{" "}
              <strong className="text-emerald-800">
                {starters.length} + {substitutes.length} гравців
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Схема / Лазарет:</span>{" "}
              <strong className="text-slate-800">
                {formation} · {injured.length} травм.
              </strong>
            </div>
          </div>

          {/* SECTION I: STARTING XI */}
          <div className="mb-6">
            <h3 className="text-xs uppercase tracking-wider font-black text-slate-800 mb-2 flex items-center justify-between">
              <span>I. Стартовий склад (XI)</span>
              <span className="text-[10px] font-normal text-slate-500">
                Схема розстановки: {formation}
              </span>
            </h3>

            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-200 text-slate-700 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2 px-2 border border-slate-300 w-10 text-center">№</th>
                  <th className="py-2 px-3 border border-slate-300">Прізвище, Ім'я</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Рік народж.</th>
                  <th className="py-2 px-2 border border-slate-300 text-center">Амплуа</th>
                  <th className="py-2 px-3 border border-slate-300 text-center">Кардіодопуск (ЕКГ)</th>
                  <th className="py-2 px-3 border border-slate-300 text-center">Медичний допуск</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {starters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500 italic">
                      Стартовий склад ще не вибрано в конструкторі.
                    </td>
                  </tr>
                ) : (
                  starters.map((slot, idx) => {
                    const player = playerMap.get(slot.playerId);
                    if (!player) return null;

                    const isRestricted = player.availability_status === "restricted";
                    const isUnavailable = player.availability_status === "unavailable";
                    const ecg = player.ecgStatusText || "Немає даних";
                    const clearance = player.clearanceText || "Допущений без обмежень";

                    return (
                      <tr key={player.id} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2 border border-slate-300 text-center font-mono font-black">
                          {slot.number || idx + 1}
                        </td>
                        <td className="py-1.5 px-3 border border-slate-300 font-bold text-slate-900">
                          {player.last_name} {player.first_name}
                          {slot.isCaptain && (
                            <span className="ml-1.5 px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-black text-[10px]">
                              (К)
                            </span>
                          )}
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
                                : "text-rose-700"
                            }
                          >
                            {ecg}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 border border-slate-300 text-center font-semibold text-[11px]">
                          {isUnavailable ? (
                            <span className="text-rose-700 font-black">
                              ⛔ {clearance}
                            </span>
                          ) : isRestricted ? (
                            <span className="text-amber-800 font-bold">
                              ⏱️ {clearance}
                            </span>
                          ) : (
                            <span className="text-emerald-800 font-bold">
                              ✓ {clearance}
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

          {/* SECTION II: SUBSTITUTES */}
          {substitutes.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-wider font-black text-slate-800 mb-2 flex items-center justify-between">
                <span>II. Запасні футболісти</span>
                <span className="text-[10px] font-normal text-slate-500">
                  До 12 гравців на лаві запасних
                </span>
              </h3>

              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-slate-200 text-slate-700 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-2 px-2 border border-slate-300 w-10 text-center">№</th>
                    <th className="py-2 px-3 border border-slate-300">Прізвище, Ім'я</th>
                    <th className="py-2 px-2 border border-slate-300 text-center">Рік народж.</th>
                    <th className="py-2 px-2 border border-slate-300 text-center">Амплуа</th>
                    <th className="py-2 px-3 border border-slate-300 text-center">Кардіодопуск (ЕКГ)</th>
                    <th className="py-2 px-3 border border-slate-300 text-center">Медичний висновок</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-sans">
                  {substitutes.map((slot, idx) => {
                    const player = playerMap.get(slot.playerId);
                    if (!player) return null;

                    const isRestricted = player.availability_status === "restricted";
                    const isUnavailable = player.availability_status === "unavailable";
                    const ecg = player.ecgStatusText || "Немає даних";
                    const clearance = player.clearanceText || "Допущений без обмежень";

                    return (
                      <tr key={player.id} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2 border border-slate-300 text-center font-mono font-bold">
                          {slot.number || starters.length + idx + 1}
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
                                : "text-rose-700"
                            }
                          >
                            {ecg}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 border border-slate-300 text-center font-semibold text-[11px]">
                          {isUnavailable ? (
                            <span className="text-rose-700 font-black">
                              ⛔ {clearance}
                            </span>
                          ) : isRestricted ? (
                            <span className="text-amber-800 font-bold">
                              ⏱️ {clearance}
                            </span>
                          ) : (
                            <span className="text-emerald-800 font-bold">
                              ✓ {clearance}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* SECTION III: HOSPITAL / INJURED LIST */}
          {injured.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-wider font-black text-red-800 mb-2">
                III. Список травмованих гравців (Недоступні для участі в матчі)
              </h3>
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-red-50 text-red-900 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-2 px-3 border border-slate-300">Футболіст</th>
                    <th className="py-2 px-3 border border-slate-300">Медичний статус / Травма</th>
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

          {/* SECTION IV: UNSCREENED PLAYERS */}
          {unscreened.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-wider font-black text-slate-700 mb-2 flex items-center justify-between">
                <span>IV. Гравці без чинного медичного допуску (Не включені до заявки)</span>
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

          {/* SECTION V: TACTICAL NOTES (IF ANY) */}
          {tacticalNotes && (
            <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wide">
                V. Спеціальні медико-тактичні примітки тренера:
              </span>
              <p className="mt-1 text-slate-800 italic">{tacticalNotes}</p>
            </div>
          )}

          {/* SECTION VI: SIGNATURES */}
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
    </div>
  );
}
