"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { logoutAction } from "@/actions/auth-actions";

type NavItem = { href: string; label: string; icon: string };

const DOCTOR_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/players", label: "Реєстр", icon: "👥" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/injuries/new", label: "Травма", icon: "🩹" },
  { href: "/statistics", label: "Статистика", icon: "📊" },
  { href: "/uk/reports/weekly", label: "Звіт", icon: "📋" },
  { href: "/uk/reports/patterns", label: "Патерни", icon: "🔍" },
  { href: "/uk/growth", label: "Ріст", icon: "📈" },
];

const COACH_NAV: NavItem[] = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
];

export default function AppNav({ role, userName }: { role: string; userName: string }) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navItems = role === "coach" ? COACH_NAV : DOCTOR_NAV;

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/" || pathname === "/uk";
    const cleanPath = pathname.replace(/^\/uk/, "");
    const cleanHref = href.replace(/^\/uk/, "");
    if (cleanHref === "") return false;
    return cleanPath.startsWith(cleanHref);
  }

  function handleLogout() {
    startTransition(async () => { await logoutAction(); });
  }

  return (
    <>
      {/* Десктоп */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-surface border-r border-blue-900/15 flex-col items-center py-4 gap-1 z-50">
        <Link href="/" className="mb-4 shrink-0">
          <Image src="/logo-chr.png" alt="ФК Чорноморець" width={40} height={40} className="rounded-full" />
        </Link>

        {navItems.map(item => (
          <Link key={item.href} href={item.href}
            className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-colors text-lg relative group ${
              isActive(item.href) ? "bg-brand-blue/15 text-white" : "text-slate-500 hover:bg-surface-hover hover:text-slate-300"
            }`}>
            <span>{item.icon}</span>
            <span className="absolute left-full ml-2 px-2 py-1 bg-surface-raised text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-blue-900/20">{item.label}</span>
            {isActive(item.href) && <span className="absolute -left-[1px] top-2 bottom-2 w-[3px] bg-brand-blue rounded-r-full" />}
          </Link>
        ))}

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="group relative">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              role === "doctor" ? "bg-brand-blue/20 text-brand-blue" : "bg-status-ok/20 text-status-ok"
            }`}>
              {role === "doctor" ? "🩺" : "⚽"}
            </div>
            <span className="absolute left-full ml-2 px-2 py-1 bg-surface-raised text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-blue-900/20">
              {userName} · {role === "doctor" ? "Лікар" : "Тренер"}
            </span>
          </div>
          <button onClick={handleLogout} disabled={isPending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-surface-hover transition-colors group relative">
            <span className="text-sm">🚪</span>
            <span className="absolute left-full ml-2 px-2 py-1 bg-surface-raised text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-blue-900/20">Вийти</span>
          </button>
        </div>
      </aside>

      {/* Мобіль */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-blue-900/15 flex justify-around items-center h-14 z-50">
        {navItems.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              isActive(item.href) ? "text-brand-blue" : "text-slate-500"
            }`}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-[9px] font-semibold">{item.label}</span>
          </Link>
        ))}
        <button onClick={handleLogout}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-slate-500">
          <span className="text-lg">🚪</span>
          <span className="text-[9px] font-semibold">Вийти</span>
        </button>
      </nav>
    </>
  );
}
