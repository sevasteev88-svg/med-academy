"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LOCATION_UA, INJURY_TYPE_UA, vasColor } from "@/lib/constants";
import { rescheduleExamAction } from "@/actions/reschedule-exam-action";

type InjuryExamItem = {
  id: string;
  location: string;
  injury_type: string;
  vas_score: number | null;
  next_exam_date: string;
  status: string;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    teams?: { name: string } | null;
  } | null;
};

type Props = {
  injuries: InjuryExamItem[];
  todayStr: string;
};

function shortName(p: any): string {
  if (!p) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

function initials(p: any): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

export default function UpcomingExamsClient({ injuries, todayStr }: Props) {
  const [filter, setFilter] = useState<"all" | "overdue" | "today" | "week">("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  // Обчислюємо групи
  const overdueList = injuries.filter((i) => i.next_exam_date < todayStr);
  const todayList = injuries.filter((i) => i.next_exam_date === todayStr);
  const futureList = injuries.filter((i) => i.next_exam_date > todayStr);

  // Усі унікальні команди
  const teams = Array.from(
    new Set(
      injuries
        .map((i) => i.players?.teams?.name)
        .filter((t): t is string => Boolean(t))
    )
  ).sort();

  // Фільтрація
  let filtered = injuries;
  if (filter === "overdue") filtered = overdueList;
  if (filter === "today") filtered = todayList;
  if (filter === "week") filtered = injuries.filter((i) => i.next_exam_date >= todayStr);

  if (selectedTeam !== "all") {
    filtered = filtered.filter((i) => i.players?.teams?.name === selectedTeam);
  }

  // Групування
  const groups: { label: string; badgeType: "danger" | "warn" | "normal"; items: InjuryExamItem[] }[] = [];

  const groupedOverdue = filtered.filter((i) => i.next_exam_date < todayStr);
  if (groupedOverdue.length > 0) {
    groups.push({
      label: "Прострочені огляди",
      badgeType: "danger",
      items: groupedOverdue,
    });
  }

  const groupedToday = filtered.filter((i) => i.next_exam_date === todayStr);
  if (groupedToday.length > 0) {
    groups.push({
      label: "Сьогодні",
      badgeType: "warn",
      items: groupedToday,
    });
  }

  // Майбутні по днях
  const futureMap = new Map<string, InjuryExamItem[]>();
  for (const inj of filtered.filter((i) => i.next_exam_date > todayStr)) {
    const list = futureMap.get(inj.next_exam_date) ?? [];
    list.push(inj);
    futureMap.set(inj.next_exam_date, list);
  }

  const sortedDates = Array.from(futureMap.keys()).sort();
  for (const d of sortedDates) {
    const diffDays = Math.floor(
      (new Date(d).getTime() - new Date(todayStr).getTime()) / 86400000
    );
    let label = new Date(d).toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    if (diffDays === 1) label = "Завтра";

    groups.push({
      label,
      badgeType: "normal",
      items: futureMap.get(d) ?? [],
    });
  }

  function handleReschedule(injuryId: string, daysToAdd: number) {
    const newDate = new Date(Date.now() + daysToAdd * 86400000)
      .toISOString()
      .split("T")[0];
    setReschedulingId(injuryId);
    startTransition(async () => {
      await rescheduleExamAction(injuryId, newDate);
      setReschedulingId(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Верхня панель фільтрів за терміновістю */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`p-3 rounded-xl border text-left transition-all ${
            filter === "all"
              ? "bg-brand-blue/15 border-brand-blue text-white ring-1 ring-brand-blue/30"
              : "bg-surface border-blue-900/18 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="text-xl font-bold font-mono text-white">{injuries.length}</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-0.5">Всі огляди</div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("overdue")}
          className={`p-3 rounded-xl border text-left transition-all ${
            filter === "overdue"
              ? "bg-status-danger/15 border-status-danger text-white ring-1 ring-status-danger/30"
              : "bg-surface border-blue-900/18 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="text-xl font-bold font-mono text-status-danger">{overdueList.length}</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-0.5">Прострочено</div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("today")}
          className={`p-3 rounded-xl border text-left transition-all ${
            filter === "today"
              ? "bg-status-warn/15 border-status-warn text-white ring-1 ring-status-warn/30"
              : "bg-surface border-blue-900/18 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="text-xl font-bold font-mono text-status-warn">{todayList.length}</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-0.5">Сьогодні</div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("week")}
          className={`p-3 rounded-xl border text-left transition-all ${
            filter === "week"
              ? "bg-status-ok/15 border-status-ok text-white ring-1 ring-status-ok/30"
              : "bg-surface border-blue-900/18 text-slate-400 hover:border-slate-700"
          }`}
        >
          <div className="text-xl font-bold font-mono text-status-ok">
            {todayList.length + futureList.length}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-0.5">Найближчі 7 днів</div>
        </button>
      </div>

      {/* Фільтр по командах */}
      {teams.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-xs text-slate-500 mr-1 flex-shrink-0">Команда:</span>
          <button
            type="button"
            onClick={() => setSelectedTeam("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
              selectedTeam === "all"
                ? "bg-brand-blue text-white"
                : "bg-surface border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
            }`}
          >
            Всі
          </button>
          {teams.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTeam(selectedTeam === t ? "all" : t)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                selectedTeam === t
                  ? "bg-brand-blue text-white"
                  : "bg-surface border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Якщо оглядів немає */}
      {groups.length === 0 && (
        <div className="bg-surface border border-blue-900/18 rounded-xl p-8 text-center space-y-3">
          <div className="text-3xl">🎉</div>
          <p className="text-slate-300 font-medium text-sm">
            За вибраним фільтром оглядів не знайдено.
          </p>
          <p className="text-slate-500 text-xs">
            Всі контрольні візити проведено або заплановано на пізніший термін.
          </p>
          <Link
            href="/exams/new"
            className="inline-block mt-2 px-4 py-2 rounded-lg bg-brand-blue text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
          >
            + Запланувати новий огляд
          </Link>
        </div>
      )}

      {/* Список оглядів за категоріями */}
      {groups.map((group) => (
        <section key={group.label} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2
              className={`text-xs font-bold uppercase tracking-wider ${
                group.badgeType === "danger"
                  ? "text-status-danger"
                  : group.badgeType === "warn"
                  ? "text-status-warn"
                  : "text-slate-400"
              }`}
            >
              {group.label}
            </h2>
            <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
              {group.items.length}
            </span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <div className="space-y-2.5">
            {group.items.map((inj) => {
              const p = inj.players;
              const isOverdue = group.badgeType === "danger";
              const isToday = group.badgeType === "warn";
              const isThisRescheduling = isPending && reschedulingId === inj.id;

              return (
                <div
                  key={inj.id}
                  className={`bg-surface border rounded-xl p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isOverdue
                      ? "border-status-danger/30 hover:border-status-danger/60 bg-status-danger/[0.03]"
                      : isToday
                      ? "border-status-warn/30 hover:border-status-warn/60 bg-status-warn/[0.02]"
                      : "border-blue-900/18 hover:border-blue-500/40"
                  }`}
                >
                  {/* Ліва колонка: гравець та травма */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm ${
                        isOverdue
                          ? "bg-status-danger/15 text-status-danger"
                          : isToday
                          ? "bg-status-warn/15 text-status-warn"
                          : "bg-brand-blue/15 text-brand-blue"
                      }`}
                    >
                      {initials(p)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/injuries/${inj.id}`}
                          className="text-sm font-bold text-white hover:text-brand-blue transition-colors truncate"
                        >
                          {shortName(p)}
                        </Link>
                        {p?.teams?.name && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {p.teams.name}
                          </span>
                        )}
                        {inj.vas_score != null && (
                          <span className={`text-[10px] font-mono font-bold ${vasColor(inj.vas_score)}`}>
                            ВАШ {inj.vas_score}/10
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{INJURY_TYPE_UA[inj.injury_type] ?? inj.injury_type}</span>
                        <span>·</span>
                        <span className="text-slate-300 font-medium">
                          {LOCATION_UA[inj.location] ?? inj.location}
                        </span>
                        <span>·</span>
                        <span className="text-slate-500">
                          {inj.status === "active" ? "Гостра фаза" : "Реабілітація"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Права колонка: дата та швидкі дії */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right mr-2">
                      <div
                        className={`text-xs font-mono font-bold ${
                          isOverdue
                            ? "text-status-danger"
                            : isToday
                            ? "text-status-warn"
                            : "text-slate-300"
                        }`}
                      >
                        {new Date(inj.next_exam_date).toLocaleDateString("uk-UA", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isOverdue ? "прострочено" : isToday ? "сьогодні" : "за планом"}
                      </div>
                    </div>

                    {/* Швидке перенесення */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isThisRescheduling}
                        onClick={() => handleReschedule(inj.id, 1)}
                        title="Перенести на завтра"
                        className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                      >
                        +1 дн
                      </button>
                      <button
                        type="button"
                        disabled={isThisRescheduling}
                        onClick={() => handleReschedule(inj.id, 3)}
                        title="Перенести на 3 дні"
                        className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                      >
                        +3 дн
                      </button>
                    </div>

                    {/* Прямий перехід на проведення огляду */}
                    <Link
                      href={`/exams/new/${inj.id}`}
                      className="px-3 py-1.5 rounded-lg bg-brand-blue hover:bg-blue-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shadow-brand-blue/30"
                    >
                      <span>🩺</span>
                      <span>Оглянути</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
