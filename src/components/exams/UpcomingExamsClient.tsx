"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  formatLocation,
  formatInjuryType,
  vasColor,
  EXAM_GRADE_UA,
  ROM_GRADE_UA,
  MUSCLE_TONE_UA,
} from "@/lib/constants";
import { rescheduleExamAction } from "@/actions/reschedule-exam-action";
import { bulkRescheduleExamsAction } from "@/actions/bulk-reschedule-exams-action";

export type InjuryExamItem = {
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

export type PastExamItem = {
  id: string;
  date: string;
  vas_score: number | null;
  edema?: string | null;
  hematoma?: string | null;
  rom?: string | null;
  palpation_pain?: string | null;
  muscle_tone?: string | null;
  objective_note?: string | null;
  subjective_note?: string | null;
  created_at?: string;
  injuries: {
    id: string;
    location: string;
    injury_type: string;
    status: string;
    players: {
      id: string;
      first_name: string;
      last_name: string;
      teams?: { name: string } | null;
    } | null;
  } | null;
};

type Props = {
  injuries: InjuryExamItem[];
  pastExams?: PastExamItem[];
  todayStr: string;
  initialTab?: "upcoming" | "past";
};

function shortName(p: any): string {
  if (!p) return "—";
  return `${p.last_name} ${p.first_name?.[0] ?? ""}.`;
}

function initials(p: any): string {
  if (!p) return "??";
  return `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`;
}

function gradeColor(g?: string | null): string {
  if (!g || g === "none" || g === "full" || g === "normal") return "text-emerald-400";
  if (g === "mild" || g === "slightly_limited") return "text-amber-400";
  return "text-rose-400";
}

function statusBadge(s?: string | null) {
  if (s === "closed") return { text: "Закрита", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
  if (s === "rehabilitation") return { text: "Реабілітація", cls: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
  return { text: "Активна", cls: "bg-rose-500/10 text-rose-400 border-rose-500/25" };
}

export default function UpcomingExamsClient({
  injuries,
  pastExams = [],
  todayStr,
  initialTab,
}: Props) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">(
    initialTab || (injuries.length === 0 && pastExams.length > 0 ? "past" : "upcoming")
  );
  const [filter, setFilter] = useState<"all" | "overdue" | "today" | "week">("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

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

  function handleBulkReschedule(idsToReschedule: string[], daysToAdd: number) {
    if (idsToReschedule.length === 0) return;
    setBulkMessage("Переносимо огляди...");
    startTransition(async () => {
      const res = await bulkRescheduleExamsAction(idsToReschedule, daysToAdd);
      if (res.error) {
        setBulkMessage(`Помилка: ${res.error}`);
      } else {
        setBulkMessage(`Успішно перенесено ${res.count} огляд(ів) на ${res.nextExamDate}`);
        setSelectedIds([]);
      }
      setTimeout(() => setBulkMessage(null), 4000);
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll(items: InjuryExamItem[]) {
    const itemIds = items.map((i) => i.id);
    const allSelected = itemIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !itemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...itemIds])));
    }
  }

  return (
    <div className="space-y-6">
      {/* Головні таби: Заплановані vs Проведені */}
      <div className="flex items-center gap-2 border-b border-sky-500/15 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("upcoming")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "upcoming"
              ? "bg-sky-500/15 border border-sky-500/40 text-sky-300 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
          }`}
        >
          <span>📅 Заплановані огляди</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              injuries.length > 0 ? "bg-sky-500/25 text-sky-200" : "bg-slate-800 text-slate-400"
            }`}
          >
            {injuries.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("past")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === "past"
              ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30"
              : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
          }`}
        >
          <span>📋 Проведені за 7 днів</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              pastExams.length > 0 ? "bg-emerald-500/25 text-emerald-200" : "bg-slate-800 text-slate-400"
            }`}
          >
            {pastExams.length}
          </span>
        </button>
      </div>

      {/* ──────────────── Вкладка 1: ЗАПЛАНОВАНІ ──────────────── */}
      {activeTab === "upcoming" && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
                Всі команди ({injuries.length})
              </button>
              {teams.map((t) => {
                const cnt = injuries.filter((i) => i.players?.teams?.name === t).length;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTeam(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                      selectedTeam === t
                        ? "bg-brand-blue text-white"
                        : "bg-surface border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    {t} ({cnt})
                  </button>
                );
              })}
            </div>
          )}

          {/* Повідомлення про групову дію */}
          {bulkMessage && (
            <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-200 font-medium">
              {bulkMessage}
            </div>
          )}

          {/* Плаваюча панель групових дій */}
          {selectedIds.length > 0 && (
            <div className="sticky top-4 z-20 bg-slate-900 border border-sky-500/40 rounded-xl p-3 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-medium text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                <span>Вибрано оглядів: <strong>{selectedIds.length}</strong></span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleBulkReschedule(selectedIds, 1)}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                >
                  <span>⚡</span> Перенести на завтра (+1 дн)
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleBulkReschedule(selectedIds, 3)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all disabled:opacity-50 border border-slate-700"
                >
                  +3 дні
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Скинути вибір
                </button>
              </div>
            </div>
          )}

          {/* Якщо запланованих оглядів немає */}
          {groups.length === 0 && (
            <div className="bg-surface border border-blue-900/18 rounded-2xl p-8 text-center space-y-3">
              <div className="text-3xl">🎉</div>
              <p className="text-slate-200 font-bold text-sm">
                Запланованих оглядів не знайдено
              </p>
              <p className="text-slate-400 text-xs max-w-md mx-auto">
                Всі активні гравці пройшли планові візити або дата наступного огляду ще не була встановлена лікарем.
              </p>
              {pastExams.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("past")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/25 transition-all"
                  >
                    <span>📋</span>
                    <span>Переглянути проведені огляди ({pastExams.length})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Список запланованих оглядів */}
          {groups.map((group) => {
            const isOverdueGroup = group.badgeType === "danger";
            const groupIds = group.items.map((i) => i.id);
            const allGroupSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));

            return (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2
                      className={`text-xs font-bold uppercase tracking-wider ${
                        isOverdueGroup
                          ? "text-status-danger"
                          : group.badgeType === "warn"
                          ? "text-status-warn"
                          : "text-slate-400"
                      }`}
                    >
                      {group.label}
                    </h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 font-mono text-slate-400 font-semibold">
                      {group.items.length}
                    </span>
                  </div>

                  {group.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleSelectAll(group.items)}
                      className="text-[11px] text-slate-400 hover:text-sky-400 transition-colors"
                    >
                      {allGroupSelected ? "Зняти всі" : "Вибрати всі в групі"}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {group.items.map((inj) => {
                    const isSelected = selectedIds.includes(inj.id);
                    const isOverdue = inj.next_exam_date < todayStr;
                    const isToday = inj.next_exam_date === todayStr;
                    const isThisRescheduling = reschedulingId === inj.id;

                    const overdueDays = isOverdue
                      ? Math.floor(
                          (new Date(todayStr).getTime() - new Date(inj.next_exam_date).getTime()) /
                            86400000
                        )
                      : 0;

                    return (
                      <div
                        key={inj.id}
                        className={`bg-surface border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? "border-sky-500 bg-sky-950/20 shadow-md shadow-sky-500/10"
                            : isOverdue
                            ? "border-status-danger/40 hover:border-status-danger"
                            : isToday
                            ? "border-status-warn/40 hover:border-status-warn"
                            : "border-blue-900/18 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(inj.id)}
                            className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer flex-shrink-0"
                          />

                          <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-slate-300 flex-shrink-0">
                            {initials(inj.players)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-white truncate">
                                {shortName(inj.players)}
                              </span>
                              {inj.players?.teams?.name && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                                  {inj.players.teams.name}
                                </span>
                              )}
                              {inj.vas_score != null && (
                                <span className={`text-[10px] font-mono font-bold ${vasColor(inj.vas_score)}`}>
                                  ВАШ {inj.vas_score}/10
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 truncate mt-0.5">
                              {formatInjuryType(inj.injury_type)} · {formatLocation(inj.location)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-white">
                              {new Date(inj.next_exam_date).toLocaleDateString("uk-UA", {
                                day: "numeric",
                                month: "short",
                              })}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {isOverdue ? `затримка ${overdueDays} дн.` : isToday ? "сьогодні" : "за планом"}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isThisRescheduling || isPending}
                              onClick={() => handleReschedule(inj.id, 1)}
                              title="Перенести на завтра"
                              className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                              +1 дн
                            </button>
                            <button
                              type="button"
                              disabled={isThisRescheduling || isPending}
                              onClick={() => handleReschedule(inj.id, 3)}
                              title="Перенести на 3 дні"
                              className="px-2 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                            >
                              +3 дн
                            </button>
                          </div>

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
            );
          })}
        </div>
      )}

      {/* ──────────────── Вкладка 2: ПРОВЕДЕНІ ЗА 7 ДНІВ ──────────────── */}
      {activeTab === "past" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Виконані огляди за останній тиждень ({pastExams.length})
            </h2>
            <span className="text-[11px] text-slate-500 font-medium">
              Останні 7 днів
            </span>
          </div>

          {pastExams.length === 0 ? (
            <div className="bg-surface border border-blue-900/18 rounded-2xl p-8 text-center space-y-3">
              <div className="text-3xl">🩺</div>
              <p className="text-slate-200 font-bold text-sm">
                За останні 7 днів проведених оглядів не зафіксовано
              </p>
              <p className="text-slate-400 text-xs max-w-md mx-auto">
                Коли лікар проводить контрольний або первинний огляд травми, він автоматично фіксується тут.
              </p>
              <Link
                href="/exams/new"
                className="inline-block mt-2 px-4 py-2 rounded-xl bg-brand-blue text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
              >
                + Провести новий огляд
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {pastExams.map((exam) => {
                const inj = exam.injuries;
                const p = inj?.players;
                const status = statusBadge(inj?.status);

                return (
                  <div
                    key={exam.id}
                    className="bg-surface border border-blue-900/18 hover:border-sky-500/30 rounded-2xl p-4.5 space-y-3 transition-all"
                  >
                    {/* Верхня стрічка: Гравець, Дата, ВАШ */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-xs font-bold font-mono text-emerald-400 flex-shrink-0">
                          {initials(p)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white truncate">
                              {p ? `${p.last_name} ${p.first_name}` : "Гравець"}
                            </span>
                            {p?.teams?.name && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                                {p.teams.name}
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${status.cls}`}>
                              {status.text}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {inj ? `${formatInjuryType(inj.injury_type)} · ${formatLocation(inj.location)}` : "Травма"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-white">
                            {new Date(exam.date).toLocaleDateString("uk-UA", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {exam.date === todayStr ? "Сьогодні" : "Огляд зафіксовано"}
                          </div>
                        </div>

                        {exam.vas_score != null && (
                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-extrabold font-mono border ${
                              exam.vas_score >= 7
                                ? "bg-red-500/15 text-red-400 border-red-500/30"
                                : exam.vas_score >= 4
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            ВАШ {exam.vas_score}/10
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Клінічні параметри огляду */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Набряк</span>
                        <span className={`font-semibold ${gradeColor(exam.edema)}`}>
                          {EXAM_GRADE_UA[exam.edema || "none"] ?? exam.edema ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Гематома</span>
                        <span className={`font-semibold ${gradeColor(exam.hematoma)}`}>
                          {EXAM_GRADE_UA[exam.hematoma || "none"] ?? exam.hematoma ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Рухи (ROM)</span>
                        <span className={`font-semibold ${gradeColor(exam.rom)}`}>
                          {ROM_GRADE_UA[exam.rom || "full"] ?? exam.rom ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Пальпація</span>
                        <span className={`font-semibold ${gradeColor(exam.palpation_pain)}`}>
                          {EXAM_GRADE_UA[exam.palpation_pain || "none"] ?? exam.palpation_pain ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Тонус м&apos;язів</span>
                        <span className={`font-semibold ${gradeColor(exam.muscle_tone)}`}>
                          {MUSCLE_TONE_UA[exam.muscle_tone || "normal"] ?? exam.muscle_tone ?? "—"}
                        </span>
                      </div>
                    </div>

                    {/* Нотатки лікаря */}
                    {(exam.objective_note || exam.subjective_note) && (
                      <div className="text-xs space-y-1 text-slate-300 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
                        {exam.objective_note && (
                          <div>
                            <strong className="text-slate-400 font-semibold">Об&apos;єктивно: </strong>
                            <span>{exam.objective_note}</span>
                          </div>
                        )}
                        {exam.subjective_note && (
                          <div>
                            <strong className="text-slate-400 font-semibold">Суб&apos;єктивно: </strong>
                            <span>{exam.subjective_note}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Дії: Перехід до картки травми */}
                    {inj && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Link
                          href={`/injuries/${inj.id}`}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                        >
                          Переглянути картку травми →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
