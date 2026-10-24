"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { logoutAction } from "@/actions/auth-actions";

import RiskAlertsCenter, { type RiskAlertItem } from "@/components/alerts/RiskAlertsCenter";
import OfflineSyncStatusBadge from "@/components/offline/OfflineSyncStatusBadge";

type NavItem = { href: string; label: string; icon: string; badge?: string };

const DOCTOR_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/players", label: "Реєстр", icon: "👥" },
  { href: "/team/readiness", label: "Готовність (Світлофор)", icon: "🚦" },
  { href: "/admin/readiness-settings", label: "Пороги готовності", icon: "⚙️" },
  { href: "/team/qr-cards", label: "QR-картки команди", icon: "🪪" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/rtp", label: "Return-to-Play", icon: "🏃" },
  { href: "/rehab-portal", label: "Портал гравця (PIN)", icon: "📱" },
  { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️" },
  { href: "/training", label: "Тренування", icon: "⏱️" },
  { href: "/wellness", label: "Велнес", icon: "⚡" },
  { href: "/workload", label: "Навантаження", icon: "📊" },
  { href: "/hydration", label: "Гідратація", icon: "💧" },
  { href: "/injuries", label: "Травми", icon: "🩹" },
  { href: "/exposures", label: "Експозиція", icon: "⏱️" },
  { href: "/pharmacy", label: "Аптека та склад", icon: "💊" },
  { href: "/exams/upcoming", label: "Огляди", icon: "🗓️" },
  { href: "/tue", label: "TUE та WADA", icon: "💉" },
  { href: "/statistics", label: "Статистика", icon: "📊" },
  { href: "/reports/weekly", label: "Звіт", icon: "📋" },
  { href: "/reports/matchday", label: "Заявка на матч", icon: "📜" },
  { href: "/reports/patterns", label: "Патерни", icon: "🔍" },
  { href: "/growth", label: "Ріст", icon: "📈" },
  { href: "/consents", label: "Згоди батьків", icon: "✍️" },
  { href: "/admin/club-settings", label: "Налаштування клубу", icon: "⚙️" },
  { href: "/admin/security", label: "Безпека (2FA)", icon: "🔐" },
  { href: "/privacy", label: "Конфіденційність", icon: "🔒" },
];

const COACH_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/training", label: "Тренування", icon: "⏱️" },
  { href: "/exposures", label: "Експозиція", icon: "⏱️" },
  { href: "/team/readiness", label: "Готовність (Світлофор)", icon: "🚦" },
  { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️" },
  { href: "/team/qr-cards", label: "QR-картки команди", icon: "🪪" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/rtp", label: "Return-to-Play", icon: "🏃" },
  { href: "/rehab-portal", label: "Портал гравця (PIN)", icon: "📱" },
  { href: "/wellness", label: "Велнес", icon: "⚡" },
  { href: "/workload", label: "Навантаження", icon: "📊" },
  { href: "/hydration", label: "Гідратація", icon: "💧" },
  { href: "/reports/matchday", label: "Заявка на матч", icon: "📜" },
  { href: "/privacy", label: "Конфіденційність", icon: "🔒" },
];

const ADMIN_NAV: NavItem[] = [
  ...DOCTOR_NAV,
  { href: "/admin/audit", label: "Журнал дій", icon: "🛡️" },
];

// Основні 5 пунктів для мобільної панелі
const DOCTOR_MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/players", label: "Реєстр", icon: "👥" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/injuries", label: "Травми", icon: "🩹" },
  { href: "/rtp", label: "RTP", icon: "🏃" },
];

const COACH_MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/training", label: "Тренування", icon: "⏱️" },
  { href: "/team/readiness", label: "Готовність", icon: "🚦" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/rtp", label: "RTP", icon: "🏃" },
];

export default function AppNav({
  role,
  userName,
  clubName = "MedAcademy",
  alerts = [],
}: {
  role: string;
  userName: string;
  clubName?: string;
  alerts?: RiskAlertItem[];
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const desktopNavItems = role === "admin" ? ADMIN_NAV : role === "coach" ? COACH_NAV : DOCTOR_NAV;
  const mobilePrimaryItems = role === "coach" ? COACH_MOBILE_PRIMARY : DOCTOR_MOBILE_PRIMARY;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Чи знаходиться користувач у розділі з меню «Ще»
  const isPrimaryActive = mobilePrimaryItems.some((item) => isActive(item.href));
  const isSecondaryActive = !isPrimaryActive && pathname !== "/";

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  // Гравець у кабінеті або батьки за одноразовим посиланням згоди не повинні бачити навігацію лікаря
  if (pathname.startsWith("/rehab-portal") || pathname.startsWith("/consent/")) {
    return null;
  }

  return (
    <>
      {/* ─── ДЕСКТОПНИЙ САЙДБАР (>= md) ─────────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-slate-950/80 backdrop-blur-xl border-r border-sky-500/15 flex-col items-center py-3 z-50 shadow-2xl shadow-black/60 overflow-hidden">
        {/* Клубний логотип */}
        <Link href="/" className="mb-2 shrink-0 transition-transform hover:scale-105" title={clubName}>
          <div className="relative p-0.5 rounded-full ring-2 ring-sky-500/30 hover:ring-sky-400">
            <Image src="/logo-chr.png" alt={clubName} width={36} height={36} className="rounded-full object-contain" />
          </div>
        </Link>

        {/* Дзвінок сповіщень та ризиків */}
        <div className="mb-2 shrink-0 flex flex-col items-center gap-2">
          <RiskAlertsCenter alerts={alerts} />
          <OfflineSyncStatusBadge />
        </div>

        {/* Прокручуваний список пунктів меню */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1.5 py-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {desktopNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`w-11 h-11 shrink-0 rounded-xl flex flex-col items-center justify-center transition-all text-lg relative group ${
                isActive(item.href)
                  ? "bg-sky-500/15 text-sky-400 shadow-md shadow-sky-500/20 border border-sky-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-sky-500/20 z-50">
                {item.label}
              </span>
              {isActive(item.href) && (
                <span className="absolute -left-[1px] top-2.5 bottom-2.5 w-[3px] bg-gradient-to-b from-sky-400 to-blue-500 rounded-r-full shadow-glow-sm" />
              )}
            </Link>
          ))}
        </div>

        {/* Футер сайдбара (Профіль / Вихід) */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-sky-500/10 shrink-0 w-full">
          <div className="group relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                role === "admin"
                  ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                  : role === "doctor"
                  ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              }`}
            >
              {role === "admin" ? "🛡️" : role === "doctor" ? "🩺" : "⚽"}
            </div>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-sky-500/20 z-50">
              {userName} · {role === "admin" ? "Адміністратор" : role === "doctor" ? "Лікар" : "Тренер"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            disabled={isPending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-800/80 transition-colors group relative"
          >
            <span className="text-sm">🚪</span>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-red-500/20 z-50">
              Вийти
            </span>
          </button>
        </div>
      </aside>

      {/* ─── МОБІЛЬНИЙ HEADER (< md) ───────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-13 bg-slate-950/95 backdrop-blur-xl border-b border-sky-500/15 z-40 px-3 flex items-center justify-between shadow-lg">
        <Link href="/" className="flex items-center gap-2.5 min-h-[44px] min-w-[44px]">
          <div className="relative p-0.5 rounded-full ring-1 ring-sky-500/30">
            <Image src="/logo-chr.png" alt={clubName} width={26} height={26} className="rounded-full object-contain" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white truncate max-w-[170px]">
            {clubName}
          </span>
        </Link>

        {/* Сповіщення та статус офлайн — в безпечній зоні хедера */}
        <div className="flex items-center gap-2 shrink-0">
          <OfflineSyncStatusBadge />
          <RiskAlertsCenter alerts={alerts} />
        </div>
      </header>

      {/* ─── МОБІЛЬНИЙ BOTTOM BAR (< md) 5 + 1 «ЩЕ» ────────────────────── */}
      <nav
        aria-label="Мобільна навігація"
        className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-2xl border-t border-sky-500/20 flex items-stretch h-[60px] z-40 shadow-2xl px-1 pb-[max(env(safe-area-inset-bottom),4px)]"
      >
        {mobilePrimaryItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 transition-all rounded-xl relative py-1 ${
                active
                  ? "text-sky-400 font-bold bg-sky-500/10"
                  : "text-slate-400 hover:text-slate-200 active:scale-95"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium leading-none tracking-tight truncate max-w-full px-0.5">
                {item.label}
              </span>
              {active && (
                <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              )}
            </Link>
          );
        })}

        {/* Кнопка «Ще» */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className={`flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 transition-all rounded-xl relative py-1 ${
            mobileDrawerOpen || isSecondaryActive
              ? "text-sky-400 font-bold bg-sky-500/10"
              : "text-slate-400 hover:text-slate-200 active:scale-95"
          }`}
          aria-expanded={mobileDrawerOpen}
          aria-label="Відкрити меню Ще"
        >
          <span className="text-xl leading-none">⋯</span>
          <span className="text-[10px] font-medium leading-none tracking-tight">Ще</span>
          {isSecondaryActive && (
            <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          )}
        </button>
      </nav>

      {/* ─── МОБІЛЬНА ШТОРКА (DRAWER) «ЩЕ» ──────────────────────────────── */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <div className="relative bg-slate-950 border-t border-sky-500/30 rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl shadow-sky-500/20 overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Header Drawer */}
            <div className="p-4 pb-3 border-b border-sky-500/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border ${
                    role === "admin"
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : role === "doctor"
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  }`}
                >
                  {role === "admin" ? "🛡️" : role === "doctor" ? "🩺" : "⚽"}
                </div>
                <div>
                  <div className="text-sm font-bold text-white truncate max-w-[200px]">{userName}</div>
                  <div className="text-[11px] text-slate-400">
                    {role === "admin" ? "Адміністратор" : role === "doctor" ? "Лікар штабу" : "Тренер команди"} ·{" "}
                    <span className="text-sky-400">{clubName}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center text-lg active:scale-95"
                aria-label="Закрити меню"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content inside Drawer */}
            <div className="p-4 overflow-y-auto space-y-4 pb-10">
              {/* Блок: Медичний департамент */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
                  🩺 Медичний блок & Реабілітація
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/pharmacy"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">💊</span>
                    <span className="truncate">Аптека і склад</span>
                  </Link>

                  <Link
                    href="/exams/upcoming"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🗓️</span>
                    <span className="truncate">Огляди</span>
                  </Link>

                  <Link
                    href="/tue"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">💉</span>
                    <span className="truncate">TUE & WADA</span>
                  </Link>

                  <Link
                    href="/wellness"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">⚡</span>
                    <span className="truncate">Велнес</span>
                  </Link>

                  <Link
                    href="/workload"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📊</span>
                    <span className="truncate">Навантаження</span>
                  </Link>

                  <Link
                    href="/hydration"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">💧</span>
                    <span className="truncate">Гідратація</span>
                  </Link>

                  <Link
                    href="/growth"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📈</span>
                    <span className="truncate">Ріст & PHV</span>
                  </Link>

                  <Link
                    href="/rehab-portal"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📱</span>
                    <span className="truncate">Портал гравця</span>
                  </Link>
                </div>
              </div>

              {/* Блок: Команда і тренування */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
                  ⚽ Тренувальний процес & Команда
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/team/readiness"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🚦</span>
                    <span className="truncate">Світлофор готовності</span>
                  </Link>

                  <Link
                    href="/coach-briefing"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🛡️</span>
                    <span className="truncate">Брифінг тренера</span>
                  </Link>

                  <Link
                    href="/training"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">⏱️</span>
                    <span className="truncate">Тренування</span>
                  </Link>

                  <Link
                    href="/exposures"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">⏱️</span>
                    <span className="truncate">Експозиція</span>
                  </Link>

                  <Link
                    href="/team/qr-cards"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🪪</span>
                    <span className="truncate">QR-картки</span>
                  </Link>

                  <Link
                    href="/reports/matchday"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📜</span>
                    <span className="truncate">Матч-протокол</span>
                  </Link>
                </div>
              </div>

              {/* Блок: Аналітика, Звіти & Налаштування */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
                  📊 Аналітика, Безпека & Клуб
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/statistics"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📊</span>
                    <span className="truncate">Статистика</span>
                  </Link>

                  <Link
                    href="/reports/weekly"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">📋</span>
                    <span className="truncate">Тижневий звіт</span>
                  </Link>

                  <Link
                    href="/reports/patterns"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🔍</span>
                    <span className="truncate">Патерни травм</span>
                  </Link>

                  <Link
                    href="/consents"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">✍️</span>
                    <span className="truncate">Згоди батьків</span>
                  </Link>

                  <Link
                    href="/admin/club-settings"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">⚙️</span>
                    <span className="truncate">Налаштування клубу</span>
                  </Link>

                  <Link
                    href="/admin/security"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px]"
                  >
                    <span className="text-base">🔐</span>
                    <span className="truncate">Безпека (2FA)</span>
                  </Link>

                  {role === "admin" && (
                    <Link
                      href="/admin/audit"
                      onClick={() => setMobileDrawerOpen(false)}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-sky-500/15 hover:border-sky-400 text-slate-200 text-xs font-semibold active:bg-sky-500/20 min-h-[44px] col-span-2"
                    >
                      <span className="text-base">🛡️</span>
                      <span className="truncate">Журнал дій (Audit Log)</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Вихід */}
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-xs hover:bg-rose-500/20 active:scale-98 transition-all min-h-[44px]"
                >
                  <span>🚪</span>
                  <span>Вийти з облікового запису</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}