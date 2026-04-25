"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Дашборд", icon: "🏠" },
  { href: "/players", label: "Реєстр", icon: "👥" },
  { href: "/availability", label: "Доступність", icon: "🟢" },
  { href: "/injuries/new", label: "Травма", icon: "🩹" },
  { href: "/statistics", label: "Статистика", icon: "📊" },
  { href: "/reports/weekly", label: "Звіт", icon: "📋" },
];

export default function AppNav() {
  const pathname = usePathname();
  function isActive(href: string): boolean { if (href === "/") return pathname === "/"; return pathname.startsWith(href); }
  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-surface border-r border-blue-900/15 flex-col items-center py-4 gap-1 z-50">
        <Link href="/" className="mb-4 shrink-0">
          <Image src="/logo-chr.png" alt="ФК Чорноморець" width={40} height={40} className="rounded-full" />
        </Link>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center transition-colors text-lg relative group ${isActive(item.href) ? "bg-brand-blue/15 text-white" : "text-slate-500 hover:bg-surface-hover hover:text-slate-300"}`}>
            <span>{item.icon}</span>
            <span className="absolute left-full ml-2 px-2 py-1 bg-surface-raised text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-blue-900/20">{item.label}</span>
            {isActive(item.href) && <span className="absolute -left-[1px] top-2 bottom-2 w-[3px] bg-brand-blue rounded-r-full" />}
          </Link>
        ))}
      </aside>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-blue-900/15 flex justify-around items-center h-14 z-50">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${isActive(item.href) ? "text-brand-blue" : "text-slate-500"}`}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-[9px] font-semibold">{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
