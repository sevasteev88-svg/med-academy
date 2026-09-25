"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/actions/auth-actions";

import RiskAlertsCenter, { type RiskAlertItem } from "@/components/alerts/RiskAlertsCenter";

type NavItem = { href: string; label: string; icon: string };

const DOCTOR_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/players", label: "Реєстр", icon: "👥" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/rtp", label: "Return-to-Play", icon: "🏃" },
  { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️" },
  { href: "/wellness", label: "Велнес", icon: "⚡" },
  { href: "/workload", label: "Навантаження", icon: "⏱️" },
  { href: "/hydration", label: "Гідратація", icon: "💧" },
  { href: "/injuries", label: "Травми", icon: "🩹" },
  { href: "/exams/upcoming", label: "Огляди", icon: "🗓️" },
  { href: "/statistics", label: "Статистика", icon: "📊" },
  { href: "/reports/weekly", label: "Звіт", icon: "📋" },
  { href: "/reports/matchday", label: "Заявка на матч", icon: "📜" },
  { href: "/reports/patterns", label: "Патерни", icon: "🔍" },
  { href: "/growth", label: "Ріст", icon: "📈" },
];

const COACH_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/coach-briefing", label: "Брифінг тренера", icon: "🛡️" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/rtp", label: "Return-to-Play", icon: "🏃" },
  { href: "/wellness", label: "Велнес", icon: "⚡" },
  { href: "/workload", label: "Навантаження", icon: "⏱️" },
  { href: "/hydration", label: "Гідратація", icon: "💧" },
  { href: "/reports/matchday", label: "Заявка на матч", icon: "📜" },
];

export default function AppNav({
  role,
  userName,
  alerts = [],
}: {
  role: string;
  userName: string;
  alerts?: RiskAlertItem[];
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navItems = role === "coach" ? COACH_NAV : DOCTOR_NAV;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function handleLogout() {
    startTransition(async () => { await logoutAction(); });
  }

  return (
    <>
      {/* Десктоп / Планшет / Ландшафт */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-slate-950/80 backdrop-blur-xl border-r border-sky-500/15 flex-col items-center py-3 z-50 shadow-2xl shadow-black/60 overflow-hidden">
        {/* Клубний логотип */}
        <Link href="/" className="mb-2 shrink-0 transition-transform hover:scale-105">
          <div className="relative p-0.5 rounded-full ring-2 ring-sky-500/30 hover:ring-sky-400">
            <Image src="/logo-chr.png" alt="ФК Чорноморець" width={36} height={36} className="rounded-full" />
          </div>
        </Link>

        {/* Дзвінок сповіщень та ризиків */}
        <div className="mb-2 shrink-0">
          <RiskAlertsCenter alerts={alerts} />
        </div>

        {/* Прокручуваний список пунктів меню */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1.5 py-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className={`w-11 h-11 shrink-0 rounded-xl flex flex-col items-center justify-center transition-all text-lg relative group ${
                isActive(item.href)
                  ? "bg-sky-500/15 text-sky-400 shadow-md shadow-sky-500/20 border border-sky-500/30"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}>
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
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
              role === "doctor"
                ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            }`}>
              {role === "doctor" ? "🩺" : "⚽"}
            </div>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-sky-500/20 z-50">
              {userName} · {role === "doctor" ? "Лікар" : "Тренер"}
            </span>
          </div>
          <button onClick={handleLogout} disabled={isPending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-800/80 transition-colors group relative">
            <span className="text-sm">🚪</span>
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl border border-red-500/20 z-50">
              Вийти
            </span>
          </button>
        </div>
      </aside>

      {/* Мобіль */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-xl border-t border-sky-500/15 flex justify-around items-center h-14 z-50 shadow-2xl">
        {navItems.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              isActive(item.href) ? "text-sky-400 font-bold" : "text-slate-400"
            }`}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-[9px] font-medium">{item.label}</span>
          </Link>
        ))}
        <button onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-slate-400 hover:text-red-400">
          <span className="text-lg">🚪</span>
          <span className="text-[9px] font-medium">Вийти</span>
        </button>
      </nav>

      {/* Мобільна кнопка сповіщень (плаваюча справа вгорі) */}
      <div className="md:hidden fixed top-3 right-3 z-40">
        <RiskAlertsCenter alerts={alerts} />
      </div>
    </>
  );
}
