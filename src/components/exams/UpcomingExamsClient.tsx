"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatLocation, formatInjuryType, vasColor } from "@/lib/constants";
import { rescheduleExamAction } from "@/actions/reschedule-exam-action";
import { bulkRescheduleExamsAction } from "@/actions/bulk-reschedule-exams-action";

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

      {/* Повідомлення про масові дії */}
      {bulkMessage && (
        <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-medium animate-fade-in flex items-center justify-between">
          <span>{bulkMessage}</span>
          <button type="button" onClick={() => setBulkMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Плаваюча панель масових дій для обраних оглядів */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-sky-500/40 shadow-2xl flex flex-wrap items-center justify-between gap-3 sticky top-4 z-20 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-xs font-bold text-white">
              Вибрано {selectedIds.length} {selectedIds.length === 1 ? "огляд" : selectedIds.length < 5 ? "огляди" : "оглядів"}
            </span>
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
                <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {group.items.length}
                </span>
              </div>

              {/* Швидкі масові дії для групи прострочених */}
              {isOverdueGroup && group.items.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleBulkReschedule(groupIds, 1)}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                    title="Перенести всі прострочені на завтра"
                  >
                    <span>⚡</span> Перенести всі на завтра
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(group.items)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 text-[11px] transition-colors"
                  >
                    {allGroupSelected ? "Зняти всі" : "Вибрати всі"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              {group.items.map((inj) => {
                const p = inj.players;
                const isOverdue = group.badgeType === "danger";
                const isToday = group.badgeType === "warn";
                const isThisRescheduling = isPending && reschedulingId === inj.id;
                const isSelected = selectedIds.includes(inj.id);

                // Точний розрахунок запізнення для прострочених
                let overdueDays = 0;
                if (isOverdue && inj.next_exam_date) {
                  const diffMs = new Date(todayStr).getTime() - new Date(inj.next_exam_date).getTime();
                  overdueDays = Math.max(1, Math.floor(diffMs / 86400000));
                }

                return (
                  <div
                    key={inj.id}
                    className={`bg-surface border rounded-xl p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? "border-sky-500 bg-sky-950/20 ring-1 ring-sky-500/40"
                        : isOverdue
                        ? "border-status-danger/30 hover:border-status-danger/60 bg-status-danger/[0.03]"
                        : isToday
                        ? "border-status-warn/30 hover:border-status-warn/60 bg-status-warn/[0.02]"
                        : "border-blue-900/18 hover:border-blue-500/40"
                    }`}
                  >
                    {/* Ліва колонка: чекбокс, гравець та травма */}
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(inj.id)}
                        className="w-4 h-4 rounded border-slate-700 text-brand-blue focus:ring-0 focus:ring-offset-0 bg-slate-900 cursor-pointer"
                        title="Вибрати для масового перенесення"
                      />

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
                        <div className="flex items-center gap-2 flex-wrap">
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
                          {isOverdue && (
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Прострочено на {overdueDays} {overdueDays === 1 ? "день" : overdueDays < 5 ? "дні" : "днів"}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{formatInjuryType(inj.injury_type)}</span>
                          <span>·</span>
                          <span className="text-slate-300 font-medium">
                            {formatLocation(inj.location)}
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
                          {isOverdue ? `затримка ${overdueDays} дн.` : isToday ? "сьогодні" : "за планом"}
                        </div>
                      </div>

                      {/* Швидке перенесення по одиниці */}
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
        );
      })}
    </div>
  );
}
