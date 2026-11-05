"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import { logoutAction } from "@/actions/auth-actions";

import RiskAlertsCenter, { type RiskAlertItem } from "@/components/alerts/RiskAlertsCenter";
import OfflineSyncStatusBadge from "@/components/offline/OfflineSyncStatusBadge";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: string;
  description?: string;
};

export type NavGroup = {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  items: NavItem[];
};

// ─── ГРУПИ МЕНЮ ДЛЯ ЛІКАРЯ ─────────────────────────────────────────────
const DOCTOR_GROUPS: NavGroup[] = [
  {
    id: "team",
    label: "Команда & Склад",
    shortLabel: "Команда",
    icon: "👥",
    items: [
      { href: "/", label: "Дашборд", icon: "🏠", description: "Загальний стан та показники" },
      { href: "/players", label: "Реєстр гравців", icon: "👥", description: "Склад, картки та профілі" },
      { href: "/availability", label: "Доступність", icon: "🟢", description: "Готовність гравців до матчів" },
      { href: "/team/readiness", label: "Готовність (Світлофор)", icon: "🚦", description: "Світлофор ризиків травматизму" },
      { href: "/team/qr-cards", label: "QR-картки команди", icon: "🪪", description: "Швидкий доступ до профілю" },
      { href: "/team/subscriptions", label: "Підписки та Фінанси", icon: "💳", description: "Статус внесків та абонементів" },
    ],
  },
  {
    id: "medical",
    label: "Медичний блок & Реабілітація",
    shortLabel: "Медицина",
    icon: "🩺",
    items: [
      { href: "/injuries", label: "Журнал травм", icon: "🩹", description: "Реєстрація, лікування та анамнез" },
      { href: "/rtp", label: "Return-to-Play", icon: "🏃", description: "Етапи повернення після травм" },
      { href: "/exams/upcoming", label: "Планові огляди", icon: "🗓️", description: "Календар та історія медоглядів" },
      { href: "/pharmacy", label: "Аптека та склад", icon: "💊", description: "Облік препаратів і витратників" },
      { href: "/tue", label: "TUE та WADA", icon: "💉", description: "Терапевтичні винятки та антидопінг" },
      { href: "/growth", label: "Ріст & PHV", icon: "📈", description: "Стрибки росту та біологічний вік" },
      { href: "/rehab-portal", label: "Портал гравця (PIN)", icon: "📱", description: "Особистий кабінет вправ" },
    ],
  },
  {
    id: "training",
    label: "Тренування & Моніторинг",
    shortLabel: "Тренування",
    icon: "⚡",
    items: [
      { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️", description: "Медичне зведення перед заняттям" },
      { href: "/training", label: "Тренування", icon: "⏱️", description: "Журнал занять та RPE команди" },
      { href: "/exposures", label: "Експозиція", icon: "⏱️", description: "Хвилини тренувань та матчів" },
      { href: "/wellness", label: "Велнес-моніторинг", icon: "⚡", description: "Опитування втоми, сну та болю" },
      { href: "/workload", label: "Навантаження (ACWR)", icon: "📊", description: "Коефіцієнт гострого/хронічного" },
      { href: "/hydration", label: "Гідратація", icon: "💧", description: "Контроль питного балансу" },
      { href: "/reports/matchday", label: "Заявка на матч", icon: "📜", description: "Матч-протокол та медичний допуск" },
    ],
  },
  {
    id: "analytics",
    label: "Аналітика & Звіти",
    shortLabel: "Аналітика",
    icon: "📊",
    items: [
      { href: "/statistics", label: "Статистика", icon: "📊", description: "Ключові показники та графіки" },
      { href: "/reports/weekly", label: "Тижневий звіт", icon: "📋", description: "Зведений аналітичний звіт лікаря" },
      { href: "/reports/patterns", label: "Патерни травм", icon: "🔍", description: "Аналіз факторів і кореляцій" },
    ],
  },
  {
    id: "settings",
    label: "Управління & Безпека",
    shortLabel: "Налаштування",
    icon: "⚙️",
    items: [
      { href: "/consents", label: "Згоди батьків", icon: "✍️", description: "Електронні підписи батьків" },
      { href: "/admin/readiness-settings", label: "Пороги готовності", icon: "⚙️", description: "Параметри та ваги світлофора" },
      { href: "/admin/club-settings", label: "Налаштування клубу", icon: "⚙️", description: "Реквізити клубу та сезони" },
      { href: "/admin/security", label: "Безпека (2FA)", icon: "🔐", description: "Двоетапна автентифікація" },
      { href: "/privacy", label: "Конфіденційність", icon: "🔒", description: "Політика приватності даних" },
    ],
  },
];

// ─── ГРУПИ МЕНЮ ДЛЯ ТРЕНЕРА ───────────────────────────────────────────
const COACH_GROUPS: NavGroup[] = [
  {
    id: "team",
    label: "Команда & Склад",
    shortLabel: "Команда",
    icon: "👥",
    items: [
      { href: "/", label: "Дашборд", icon: "🏠", description: "Загальний стан команди" },
      { href: "/availability", label: "Доступність", icon: "🟢", description: "Готовність гравців до гри" },
      { href: "/team/readiness", label: "Готовність (Світлофор)", icon: "🚦", description: "Світлофор ризиків" },
      { href: "/team/qr-cards", label: "QR-картки команди", icon: "🪪", description: "Швидкий доступ до профілю" },
      { href: "/team/subscriptions", label: "Підписки команди", icon: "📋", description: "Статус внесків гравців" },
    ],
  },
  {
    id: "training",
    label: "Тренування & Моніторинг",
    shortLabel: "Тренування",
    icon: "⚡",
    items: [
      { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️", description: "Зведення на сьогодні" },
      { href: "/training", label: "Тренування", icon: "⏱️", description: "Журнал занять та RPE" },
      { href: "/exposures", label: "Експозиція", icon: "⏱️", description: "Ігровий та тренувальний час" },
      { href: "/wellness", label: "Велнес", icon: "⚡", description: "Самопочуття гравців команди" },
      { href: "/workload", label: "Навантаження", icon: "📊", description: "Аналіз тренувального обсягу" },
      { href: "/hydration", label: "Гідратація", icon: "💧", description: "Контроль водного балансу" },
      { href: "/reports/matchday", label: "Заявка на матч", icon: "📜", description: "Матч-протокол та допуск" },
    ],
  },
  {
    id: "medical",
    label: "Медицина & Відновлення",
    shortLabel: "Медицина",
    icon: "🩺",
    items: [
      { href: "/rtp", label: "Return-to-Play", icon: "🏃", description: "Стадії повернення травмованих" },
      { href: "/rehab-portal", label: "Портал гравця (PIN)", icon: "📱", description: "Кабінет реабілітації" },
    ],
  },
  {
    id: "settings",
    label: "Налаштування & Безпека",
    shortLabel: "Налаштування",
    icon: "⚙️",
    items: [
      { href: "/privacy", label: "Конфіденційність", icon: "🔒", description: "Політика приватності" },
    ],
  },
];

// ─── ГРУПИ МЕНЮ ДЛЯ АДМІНІСТРАТОРА ────────────────────────────────────
function getAdminGroups(): NavGroup[] {
  return DOCTOR_GROUPS.map((group) => {
    if (group.id === "settings") {
      return {
        ...group,
        items: [
          ...group.items,
          { href: "/admin/audit", label: "Журнал дій (Audit Log)", icon: "🛡️", description: "Аудит системи та безпеки" },
        ],
      };
    }
    return group;
  });
}

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

  // Дворівневий сайдбар для десктопу
  const [flyoutGroupId, setFlyoutGroupId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Визначення груп для поточної ролі
  const groups: NavGroup[] =
    role === "admin" ? getAdminGroups() : role === "coach" ? COACH_GROUPS : DOCTOR_GROUPS;

  const mobilePrimaryItems = role === "coach" ? COACH_MOBILE_PRIMARY : DOCTOR_MOBILE_PRIMARY;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Знаходимо, до якої групи належить поточна активна сторінка
  const currentActiveGroup = groups.find((group) =>
    group.items.some((item) => isActive(item.href))
  );

  // Відновлення закріплення з localStorage при старті
  useEffect(() => {
    try {
      const savedPin = localStorage.getItem("med_academy_nav_pinned");
      if (savedPin === "true") {
        setIsPinned(true);
      }
    } catch {}
  }, []);

  // Закриття підпанелі по Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && flyoutGroupId && !isPinned) {
        setFlyoutGroupId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flyoutGroupId, isPinned]);

  // Закриття підпанелі при кліку за її межами (якщо вона не закріплена)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (isPinned || !flyoutGroupId) return;
      const target = e.target as Node;
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        asideRef.current &&
        !asideRef.current.contains(target)
      ) {
        setFlyoutGroupId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [flyoutGroupId, isPinned]);

  function togglePin() {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("med_academy_nav_pinned", String(next));
      } catch {}
      return next;
    });
  }

  function handleGroupClick(groupId: string) {
    if (flyoutGroupId === groupId) {
      // Якщо панель уже відкрита для цієї групи і не закріплена — закриваємо
      if (!isPinned) {
        setFlyoutGroupId(null);
      }
    } else {
      setFlyoutGroupId(groupId);
    }
  }

  // Об'єкт поточної відкритої групи для додаткової панелі
  const activeFlyoutGroup = groups.find((g) => g.id === (flyoutGroupId || (isPinned ? currentActiveGroup?.id : null)));

  // Мобільна навігація: чи вибрано щось із додаткового списку
  const isPrimaryActive = mobilePrimaryItems.some((item) => isActive(item.href));
  const isSecondaryActive = !isPrimaryActive && pathname !== "/";

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  // Пацієнти та батьки не бачать навігацію
  if (pathname.startsWith("/rehab-portal") || pathname.startsWith("/consent/")) {
    return null;
  }

  return (
    <>
      {/* ─── ДЕСКТОПНИЙ САЙДБАР: РІВЕНЬ 1 (ПЕРВИННА ПАНЕЛЬ, 64px) ───────── */}
      <aside
        ref={asideRef}
        aria-label="Основна навігація"
        className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-slate-950/90 backdrop-blur-xl border-r border-sky-500/15 flex-col items-center py-3 z-50 shadow-2xl shadow-black/60"
      >
        {/* Клубний логотип */}
        <Link
          href="/"
          className="mb-2 shrink-0 transition-transform hover:scale-105"
          title={`${clubName} · Дашборд`}
          onClick={() => {
            if (!isPinned) setFlyoutGroupId(null);
          }}
        >
          <div className="relative p-0.5 rounded-full ring-2 ring-sky-500/30 hover:ring-sky-400">
            <Image src="/logo-chr.png" alt={clubName} width={36} height={36} className="rounded-full object-contain" />
          </div>
        </Link>

        {/* Дзвінок сповіщень та статус офлайн */}
        <div className="mb-3 shrink-0 flex flex-col items-center gap-2">
          <RiskAlertsCenter alerts={alerts} />
          <OfflineSyncStatusBadge />
        </div>

        {/* ─── ІКОНКИ ГРУП МЕНЮ (5 категорій) ─── */}
        <nav className="flex-1 w-full flex flex-col items-center gap-2 py-1 px-1">
          {groups.map((group) => {
            const isCurrentRouteGroup = currentActiveGroup?.id === group.id;
            const isFlyoutOpen = activeFlyoutGroup?.id === group.id;
            const isHighlighted = isCurrentRouteGroup || isFlyoutOpen;

            return (
              <div key={group.id} className="relative group/btn flex justify-center w-full">
                <button
                  type="button"
                  onClick={() => handleGroupClick(group.id)}
                  aria-expanded={isFlyoutOpen}
                  aria-label={group.label}
                  className={`w-11 h-11 shrink-0 rounded-xl flex flex-col items-center justify-center transition-all text-lg relative ${
                    isHighlighted
                      ? "bg-sky-500/20 text-sky-300 shadow-lg shadow-sky-500/25 border border-sky-500/40 ring-1 ring-sky-400/30"
                      : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  <span className="leading-none text-xl transition-transform group-hover/btn:scale-110">
                    {group.icon}
                  </span>

                  {/* Активна світяща вертикальна смужка зліва */}
                  {isCurrentRouteGroup && (
                    <span className="absolute -left-[1px] top-2.5 bottom-2.5 w-[3px] bg-gradient-to-b from-sky-400 to-blue-500 rounded-r-full shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                  )}

                  {/* Маленький індикатор відкритої підпанелі */}
                  {isFlyoutOpen && !isCurrentRouteGroup && (
                    <span className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-sky-400" />
                  )}
                </button>

                {/* Тултіп при наведенні (назва групи + кількість розділів) */}
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900/95 backdrop-blur-md text-white rounded-lg whitespace-nowrap opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-all shadow-2xl border border-sky-500/20 z-50 flex items-center gap-2">
                  <span className="text-xs font-semibold">{group.label}</span>
                  <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full border border-sky-500/20">
                    {group.items.length}
                  </span>
                </div>
              </div>
            );
          })}
        </nav>

        {/* ─── ФУТЕР САЙДБАРА (Демо, Профіль, Вихід) ─── */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-sky-500/10 shrink-0 w-full">
          <Link
            href="/demo"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-sky-300 hover:bg-sky-500/20 border border-sky-500/20 transition-all group relative"
            title="Демо-клуб ФК «Демо Академія»"
            onClick={() => {
              if (!isPinned) setFlyoutGroupId(null);
            }}
          >
            <span className="text-sm">⚽</span>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-sky-500/20 z-50">
              ФК «Демо Академія» (Стенд)
            </span>
          </Link>

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
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-800/80 transition-colors group relative"
            aria-label="Вийти"
          >
            <span className="text-sm">🚪</span>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-red-500/20 z-50">
              Вийти
            </span>
          </button>
        </div>
      </aside>

      {/* ─── ДЕСКТОПНИЙ САЙДБАР: РІВЕНЬ 2 (ПІДПАНЕЛЬ ПУНКТІВ ОБРАНОЇ ГРУПИ) ─ */}
      {activeFlyoutGroup && (
        <>
          {/* Напівпрозорий фон для швидкого закриття при кліку повз (якщо не закріплено) */}
          {!isPinned && (
            <div
              className="hidden md:block fixed inset-0 left-16 z-30 bg-black/40 backdrop-blur-[1px] transition-opacity"
              onClick={() => setFlyoutGroupId(null)}
              aria-hidden="true"
            />
          )}

          <div
            ref={flyoutRef}
            aria-label={`Розділи групи ${activeFlyoutGroup.label}`}
            className="hidden md:flex fixed left-16 top-0 bottom-0 w-72 bg-slate-950/95 backdrop-blur-2xl border-r border-sky-500/20 z-40 flex-col shadow-2xl shadow-sky-950/40 animate-in slide-in-from-left duration-200"
          >
            {/* Заголовок поточної групи */}
            <div className="p-3.5 border-b border-sky-500/15 flex items-center justify-between shrink-0 bg-slate-900/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl leading-none">{activeFlyoutGroup.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate leading-tight">
                    {activeFlyoutGroup.label}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {activeFlyoutGroup.items.length}{" "}
                    {activeFlyoutGroup.items.length === 1
                      ? "розділ"
                      : activeFlyoutGroup.items.length < 5
                      ? "розділи"
                      : "розділів"}
                  </p>
                </div>
              </div>

              {/* Дії: Закріпити та Закрити */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={togglePin}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${
                    isPinned
                      ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                  title={isPinned ? "Відкріпити панель (плаваючий режим)" : "Закріпити панель відкритою"}
                >
                  📌
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFlyoutGroupId(null);
                    setIsPinned(false);
                  }}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-xs transition-colors"
                  title="Закрити панель (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Прокручуваний список пунктів обраної групи */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.2)_transparent]">
              {activeFlyoutGroup.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (!isPinned) {
                        setFlyoutGroupId(null);
                      }
                    }}
                    className={`flex items-center gap-3 p-2.5 rounded-xl transition-all group ${
                      active
                        ? "bg-sky-500/15 border border-sky-500/35 text-white shadow-sm shadow-sky-500/20"
                        : "text-slate-300 hover:text-white hover:bg-slate-900/90 border border-transparent"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 transition-transform group-hover:scale-105 ${
                        active
                          ? "bg-sky-500/25 border border-sky-400/40 text-sky-300"
                          : "bg-slate-900 border border-slate-800/80 text-slate-300"
                      }`}
                    >
                      {item.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold leading-tight truncate ${active ? "text-sky-300 font-bold" : ""}`}>
                          {item.label}
                        </span>
                        {active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[10px] text-slate-400 truncate leading-snug mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Підказка у футері підпанелі */}
            <div className="p-2 border-t border-sky-500/10 text-center text-[10px] text-slate-500 shrink-0">
              {isPinned ? "📌 Панель закріплена" : "💡 Натисніть Esc або клікніть повз, щоб закрити"}
            </div>
          </div>
        </>
      )}

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

            {/* Scrollable Content inside Drawer organized by groups */}
            <div className="p-4 overflow-y-auto space-y-4 pb-10">
              {groups.map((group) => (
                <div key={group.id}>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-1 flex items-center gap-1.5">
                    <span>{group.icon}</span>
                    <span>{group.label}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileDrawerOpen(false)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold active:scale-98 transition-all min-h-[44px] ${
                          isActive(item.href)
                            ? "bg-sky-500/20 border-sky-400/50 text-sky-300"
                            : "bg-slate-900/70 border-sky-500/15 hover:border-sky-400 text-slate-200"
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {/* Перехід в Демо та Вихід */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <Link
                  href="/demo"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold text-xs hover:bg-sky-500/25 active:scale-98 transition-all min-h-[44px]"
                >
                  <span>⚽</span>
                  <span>Відкрити ФК «Демо Академія»</span>
                </Link>

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
