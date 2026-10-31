"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  recordManualParentPaymentAction,
  grantCompedSubscriptionAction,
  revokeCompedSubscriptionAction,
} from "@/actions/billing-actions";
import type { SubscriptionStatus, BillingPlanCode } from "@/types/billing";
import { POSITION_LABELS } from "@/lib/constants";

interface PlayerSubItem {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  teamId: string;
  teamName: string;
  subscription: {
    status: SubscriptionStatus;
    planCode: string;
    amountUah: number;
    billingInterval: string;
    currentPeriodEnd: string;
    compedReason?: string | null;
    compedBy?: string | null;
    isActive: boolean;
  } | null;
}

interface StatsData {
  totalPlayers: number;
  activePaidCount: number;
  compedCount: number;
  unpaidCount: number;
  totalMonthlyRevenueUah: number;
  collectionRatePercent: number;
}

interface Props {
  initialPlayers: PlayerSubItem[];
  teams: { id: string; name: string }[];
  initialStats: StatsData;
  monobankJarUrl: string;
  currentTeamId?: string;
  userRole?: string;
}

const PRESET_QUOTA_REASONS = [
  "Рішення керівництва / директора академії",
  "Соціальна квота (багатодітна родина)",
  "Спортивна стипендія клубу (топ-талант)",
  "Тестовий пілотний період",
];

export default function TeamSubscriptionsClient({
  initialPlayers,
  teams,
  initialStats,
  monobankJarUrl,
  currentTeamId = "all",
  userRole,
}: Props) {
  const isCoach = userRole === "coach";
  const [players, setPlayers] = useState<PlayerSubItem[]>(initialPlayers);
  const [stats, setStats] = useState<StatsData>(initialStats);
  const [selectedTeam, setSelectedTeam] = useState<string>(currentTeamId);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "comped" | "unpaid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Стан для модалки оплати
  const [payTargetPlayer, setPayTargetPlayer] = useState<PlayerSubItem | null>(null);
  const [payPlan, setPayPlan] = useState<BillingPlanCode>("monthly_150_uah");
  const [payMethod, setPayMethod] = useState("Переказ на картку Monobank");

  // Стан для модалки квоти
  const [quotaTargetPlayer, setQuotaTargetPlayer] = useState<PlayerSubItem | null>(null);
  const [quotaDays, setQuotaDays] = useState(90);
  const [quotaReason, setQuotaReason] = useState(PRESET_QUOTA_REASONS[0]);
  const [customQuotaReason, setCustomQuotaReason] = useState("");

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Фільтрація списку гравців
  const filteredPlayers = players.filter((p) => {
    // 1. Фільтр команди
    if (selectedTeam !== "all" && p.teamId !== selectedTeam) return false;

    // 2. Фільтр статусу
    const isAct = p.subscription?.status === "active" && p.subscription?.isActive;
    const isCmp = p.subscription?.status === "comped" && p.subscription?.isActive;
    const isUnp = !p.subscription || !p.subscription.isActive || p.subscription.status === "unpaid";

    if (isCoach) {
      if (statusFilter === "active" && !(isAct || isCmp)) return false;
      if (statusFilter === "unpaid" && !isUnp) return false;
    } else {
      if (statusFilter === "active" && !isAct) return false;
      if (statusFilter === "comped" && !isCmp) return false;
      if (statusFilter === "unpaid" && !isUnp) return false;
    }

    // 3. Пошуковий запит
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const fullName = `${p.lastName} ${p.firstName}`.toLowerCase();
      return fullName.includes(q);
    }

    return true;
  });

  const getDaysLeft = (dateStr?: string) => {
    if (!dateStr) return 0;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const recalculateStats = (updatedList: PlayerSubItem[]) => {
    let activePaid = 0;
    let comped = 0;
    let unpaid = 0;
    let revenue = 0;

    for (const p of updatedList) {
      if (p.subscription?.isActive) {
        if (p.subscription.status === "active") {
          activePaid++;
          revenue += p.subscription.billingInterval === "year" ? Math.round(1500 / 12) : 150;
        } else if (p.subscription.status === "comped") {
          comped++;
        }
      } else {
        unpaid++;
      }
    }

    const total = updatedList.length;
    setStats({
      totalPlayers: total,
      activePaidCount: activePaid,
      compedCount: comped,
      unpaidCount: unpaid,
      totalMonthlyRevenueUah: revenue,
      collectionRatePercent: total > 0 ? Math.round(((activePaid + comped) / total) * 100) : 0,
    });
  };

  // Підтвердження оплати батьків
  const handleConfirmPayment = () => {
    if (!payTargetPlayer) return;
    setNotification(null);

    startTransition(async () => {
      const res = await recordManualParentPaymentAction({
        playerId: payTargetPlayer.id,
        planCode: payPlan,
        paymentNote: payMethod,
      });

      if (res.success) {
        const isAnn = payPlan === "annual_1500_uah";
        const futureDate = new Date();
        if (isAnn) futureDate.setFullYear(futureDate.getFullYear() + 1);
        else futureDate.setMonth(futureDate.getMonth() + 1);

        const updated = players.map((p) => {
          if (p.id === payTargetPlayer.id) {
            return {
              ...p,
              subscription: {
                status: "active" as SubscriptionStatus,
                planCode: payPlan,
                amountUah: isAnn ? 1500 : 150,
                billingInterval: isAnn ? "year" : "month",
                currentPeriodEnd: futureDate.toISOString(),
                compedReason: payMethod,
                isActive: true,
              },
            };
          }
          return p;
        });

        setPlayers(updated);
        recalculateStats(updated);
        setPayTargetPlayer(null);
        setNotification({ type: "success", text: `Оплату гравця ${payTargetPlayer.lastName} підтверджено!` });
      } else {
        setNotification({ type: "error", text: res.error || "Помилка збереження" });
      }
    });
  };

  // Надання квоти клубу
  const handleGrantQuota = () => {
    if (!quotaTargetPlayer) return;
    setNotification(null);

    startTransition(async () => {
      const finalReason = customQuotaReason.trim() ? customQuotaReason.trim() : quotaReason;
      const res = await grantCompedSubscriptionAction({
        playerId: quotaTargetPlayer.id,
        reason: finalReason,
        daysDuration: quotaDays,
      });

      if (res.success) {
        const futureDate = new Date(Date.now() + quotaDays * 86400000).toISOString();

        const updated = players.map((p) => {
          if (p.id === quotaTargetPlayer.id) {
            return {
              ...p,
              subscription: {
                status: "comped" as SubscriptionStatus,
                planCode: "monthly_150_uah",
                amountUah: 150,
                billingInterval: "month",
                currentPeriodEnd: futureDate,
                compedReason: finalReason,
                isActive: true,
              },
            };
          }
          return p;
        });

        setPlayers(updated);
        recalculateStats(updated);
        setQuotaTargetPlayer(null);
        setNotification({ type: "success", text: `Квоту для гравця ${quotaTargetPlayer.lastName} надано на ${quotaDays} дн.!` });
      } else {
        setNotification({ type: "error", text: res.error || "Помилка збереження квоти" });
      }
    });
  };

  // Скасування доступу (переведення на soft-lock)
  const handleRevoke = (player: PlayerSubItem) => {
    if (!confirm(`Перевести гравця ${player.lastName} ${player.firstName} у статус «Очікує оплати»? Вхід у його кабінет буде заблоковано.`)) {
      return;
    }

    setNotification(null);
    startTransition(async () => {
      const res = await revokeCompedSubscriptionAction({ playerId: player.id });
      if (res.success) {
        const updated = players.map((p) => {
          if (p.id === player.id) {
            return {
              ...p,
              subscription: p.subscription ? { ...p.subscription, status: "unpaid" as SubscriptionStatus, isActive: false } : null,
            };
          }
          return p;
        });

        setPlayers(updated);
        recalculateStats(updated);
        setNotification({ type: "success", text: `Гравця ${player.lastName} переведено в очікування оплати.` });
      } else {
        setNotification({ type: "error", text: res.error || "Помилка скасування" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Верхня панель заголовка */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-white tracking-tight">
              {isCoach ? "Доступи та готовність команди" : "Підписки та Фінанси (B2B2C)"}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full border text-xs font-bold ${
                isCoach
                  ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              }`}
            >
              {isCoach ? "Склад команди" : "SaaS Live"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isCoach
              ? "Моніторинг статусів готовності та доступів гравців до цифрового паспорта здоров'я"
              : "Контроль батьківських підписок, клубних квот та надходжень у Monobank"}
          </p>
        </div>

        {/* Швидкі дії */}
        <div className="flex items-center gap-3">
          {!isCoach && monobankJarUrl && (
            <a
              href={monobankJarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-white font-bold text-xs tracking-wide shadow-md flex items-center gap-2 hover:bg-slate-800 transition-all"
            >
              <span>🏦</span>
              <span>Відкрити Банку в Monobank ↗</span>
            </a>
          )}

          {/* Вибір команди */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2.5 outline-none focus:border-sky-500 transition-colors"
          >
            <option value="all">Усі команди клубу</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
            notification.type === "success"
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              : "bg-rose-500/15 text-rose-300 border-rose-500/30"
          }`}
        >
          <span>{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Метрики / Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isCoach ? (
          <>
            {/* Всього у складі */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Всього у складі</div>
              <div className="text-xl font-black text-white">
                {stats.totalPlayers} <span className="text-xs font-bold text-slate-400">гравців</span>
              </div>
              <div className="text-[10px] text-slate-500">активна заявка команди</div>
            </div>

            {/* Активний профіль */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Активний профіль</div>
              <div className="text-xl font-black text-emerald-400">
                {stats.activePaidCount + stats.compedCount}{" "}
                <span className="text-xs font-bold text-slate-400">/ {stats.totalPlayers}</span>
              </div>
              <div className="text-[10px] text-emerald-400/80">доступ відкрито</div>
            </div>

            {/* Очікують оплати */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Очікують оплати</div>
              <div className="text-xl font-black text-amber-400">
                {stats.unpaidCount} <span className="text-xs font-bold text-slate-400">гравців</span>
              </div>
              <div className="text-[10px] text-amber-300/80">обмежений доступ (soft-lock)</div>
            </div>

            {/* Охоплення готовності */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Готовність доступу</div>
              <div className="text-xl font-black text-sky-400">
                {stats.collectionRatePercent}%
              </div>
              <div className="text-[10px] text-sky-300/80">команди на моніторингу</div>
            </div>
          </>
        ) : (
          <>
            {/* MRR */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Прогноз доходу (MRR)</div>
              <div className="text-xl font-black text-emerald-400">
                {stats.totalMonthlyRevenueUah.toLocaleString()}{" "}
                <span className="text-xs font-bold text-slate-400">грн/міс</span>
              </div>
              <div className="text-[10px] text-slate-500">з оплат батьків</div>
            </div>

            {/* Оплачено батьками */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Оплачено батьками</div>
              <div className="text-xl font-black text-sky-400">
                {stats.activePaidCount}{" "}
                <span className="text-xs font-bold text-slate-400">/ {stats.totalPlayers}</span>
              </div>
              <div className="text-[10px] text-sky-300/80">активні підписки</div>
            </div>

            {/* Квота клубу */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Клубна квота</div>
              <div className="text-xl font-black text-emerald-300">
                {stats.compedCount} <span className="text-xs font-bold text-slate-400">гравців</span>
              </div>
              <div className="text-[10px] text-emerald-400/80">безкоштовно від клубу</div>
            </div>

            {/* Очікують оплати */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold text-slate-400">Очікують оплати</div>
              <div className="text-xl font-black text-amber-400">
                {stats.unpaidCount} <span className="text-xs font-bold text-slate-400">гравців</span>
              </div>
              <div className="text-[10px] text-amber-300/80">Soft-lock в кабінеті</div>
            </div>
          </>
        )}
      </div>

      {/* Панель пошуку та швидкі фільтри */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
        {/* Таби статусів */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(isCoach
            ? [
                { id: "all", label: `Всі (${players.length})` },
                { id: "active", label: `Активні (${stats.activePaidCount + stats.compedCount})` },
                { id: "unpaid", label: `Очікують (${stats.unpaidCount})` },
              ]
            : [
                { id: "all", label: `Всі (${players.length})` },
                { id: "active", label: `Оплачено (${stats.activePaidCount})` },
                { id: "comped", label: `Квота (${stats.compedCount})` },
                { id: "unpaid", label: `Очікують (${stats.unpaidCount})` },
              ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                  : "bg-slate-950/60 text-slate-400 border border-slate-800/80 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Пошук */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Пошук за прізвищем..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1.5 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Таблиця гравців команди */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Гравець</th>
                <th className="py-3 px-3">Команда</th>
                <th className="py-3 px-3">Статус доступу</th>
                {!isCoach && <th className="py-3 px-3">Тариф</th>}
                <th className="py-3 px-3">Діє до</th>
                <th className="py-3 px-3">Примітка</th>
                {!isCoach && <th className="py-3 px-4 text-right">Швидкі дії</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={isCoach ? 5 : 7} className="py-8 text-center text-slate-500 text-xs">
                    Гравців за вибраними фільтрами не знайдено
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((p) => {
                  const sub = p.subscription;
                  const isAct = sub?.status === "active" && sub?.isActive;
                  const isCmp = sub?.status === "comped" && sub?.isActive;
                  const isUnp = !sub || !sub.isActive || sub.status === "unpaid";

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Гравець */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/players/${p.id}`}
                          className="font-bold text-white hover:text-sky-300 transition-colors flex items-center gap-2"
                        >
                          <span className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 flex items-center justify-center text-[10px] font-mono">
                            {p.lastName[0]}
                            {p.firstName[0]}
                          </span>
                          <span>
                            {p.lastName} {p.firstName}
                          </span>
                        </Link>
                      </td>

                      {/* Команда та позиція */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-300">{p.teamName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {POSITION_LABELS[p.position] || p.position}
                        </div>
                      </td>

                      {/* Статус */}
                      <td className="py-3 px-3">
                        {isCoach ? (
                          isAct || isCmp ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Активний профіль
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Очікує оплати
                            </span>
                          )
                        ) : (
                          <>
                            {isAct && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                Оплачено батьками
                              </span>
                            )}
                            {isCmp && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Квота клубу
                              </span>
                            )}
                            {isUnp && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Очікує оплати
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Тариф */}
                      {!isCoach && (
                        <td className="py-3 px-3">
                          {isAct ? (
                            <span className="font-semibold text-slate-200">
                              {sub?.planCode === "annual_1500_uah" ? "1 500 грн / рік" : "150 грн / міс"}
                            </span>
                          ) : isCmp ? (
                            <span className="text-emerald-400 font-medium">Безкоштовно</span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      )}

                      {/* Діє до */}
                      <td className="py-3 px-3">
                        {sub?.isActive && sub?.currentPeriodEnd ? (
                          <div>
                            <span className="font-mono text-slate-200">
                              {new Date(sub.currentPeriodEnd).toLocaleDateString("uk-UA")}
                            </span>
                            <div className="text-[10px] text-slate-400">
                              залишилось {getDaysLeft(sub.currentPeriodEnd)} дн.
                            </div>
                          </div>
                        ) : (
                          <span className="text-amber-400 text-[11px] font-medium">
                            {isCoach ? "Очікує оплати" : "Заблоковано"}
                          </span>
                        )}
                      </td>

                      {/* Примітка */}
                      <td className="py-3 px-3 max-w-[180px] truncate text-slate-400 text-[11px]">
                        {isCoach
                          ? isAct || isCmp
                            ? "Доступ відкрито"
                            : "Soft-lock в кабінеті"
                          : sub?.compedReason || (isAct ? "Monobank" : "—")}
                      </td>

                      {/* Швидкі дії */}
                      {!isCoach && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Підтвердити оплату */}
                            <button
                              type="button"
                              onClick={() => {
                                setPayTargetPlayer(p);
                                setPayPlan("monthly_150_uah");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] transition-colors"
                              title="Зарахувати оплату батьків"
                            >
                              💳 Оплата
                            </button>

                            {/* Квота */}
                            <button
                              type="button"
                              onClick={() => {
                                setQuotaTargetPlayer(p);
                                setQuotaDays(90);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-[11px] transition-colors"
                              title="Надати або продовжити квоту"
                            >
                              🎁 Квота
                            </button>

                            {/* Скасувати (якщо активний) */}
                            {(isAct || isCmp) && (
                              <button
                                type="button"
                                onClick={() => handleRevoke(p)}
                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/30 text-[11px] transition-colors"
                                title="Перевести в очікування оплати"
                              >
                                🔒
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модалка 1: Зарахування оплати батьків */}
      {!isCoach && payTargetPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <h4 className="font-bold text-sm text-white">
                  Підтвердження оплати: {payTargetPlayer.lastName} {payTargetPlayer.firstName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPayTargetPlayer(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Оберіть сплачений тариф:</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPayPlan("monthly_150_uah")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    payPlan === "monthly_150_uah"
                      ? "bg-sky-500/20 border-sky-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-400">1 місяць</div>
                  <div className="text-base font-black text-white">150 грн</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPayPlan("annual_1500_uah")}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    payPlan === "annual_1500_uah"
                      ? "bg-emerald-500/20 border-emerald-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-400">1 рік (12 міс)</div>
                  <div className="text-base font-black text-emerald-300">1 500 грн</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Спосіб переказу:</label>
              <div className="space-y-1.5">
                {[
                  "Переказ на картку Monobank",
                  "Переказ на картку ПриватБанк",
                  "Оплата на розрахунковий рахунок (IBAN)",
                  "Готівка тренеру",
                ].map((m) => (
                  <label
                    key={m}
                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer text-xs text-slate-300 hover:border-slate-700"
                  >
                    <input
                      type="radio"
                      name="pay-method-team"
                      checked={payMethod === m}
                      onChange={() => setPayMethod(m)}
                      className="text-emerald-500 focus:ring-0"
                    />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPayTargetPlayer(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmPayment}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg disabled:opacity-50"
              >
                {isPending ? "Зарахування..." : "Зарахувати платіж"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка 2: Надання квоти клубу */}
      {!isCoach && quotaTargetPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎁</span>
                <h4 className="font-bold text-sm text-white">
                  Квота клубу: {quotaTargetPlayer.lastName} {quotaTargetPlayer.firstName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setQuotaTargetPlayer(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Тривалість квоти:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { d: 30, label: "1 міс (30 дн)" },
                  { d: 90, label: "3 міс (90 дн)" },
                  { d: 180, label: "6 міс (180 дн)" },
                  { d: 365, label: "1 рік (365 дн)" },
                ].map((item) => (
                  <button
                    key={item.d}
                    type="button"
                    onClick={() => setQuotaDays(item.d)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all ${
                      quotaDays === item.d
                        ? "bg-sky-500/20 border-sky-500 text-sky-200"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Причина надання:</label>
              <div className="space-y-1.5">
                {PRESET_QUOTA_REASONS.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 text-xs text-slate-300 transition-colors"
                  >
                    <input
                      type="radio"
                      name="quota-reason-team"
                      checked={quotaReason === r && !customQuotaReason}
                      onChange={() => {
                        setQuotaReason(r);
                        setCustomQuotaReason("");
                      }}
                      className="text-sky-500 focus:ring-0"
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>

              <input
                type="text"
                placeholder="Або вкажіть іншу причину..."
                value={customQuotaReason}
                onChange={(e) => setCustomQuotaReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setQuotaTargetPlayer(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleGrantQuota}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg disabled:opacity-50"
              >
                {isPending ? "Збереження..." : "Підтвердити надання"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
