"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useRef } from "react";

type TeamOption = {
  id: string;
  name: string;
};

type Props = {
  teams: TeamOption[];
};

export default function PlayerFilters({ teams }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const currentQuery = searchParams.get("q") ?? "";
  const currentTeam = searchParams.get("team") ?? "all";
  const currentStatus = searchParams.get("status") ?? "all";

  function updateParams(newParams: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, value]) => {
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearchChange(value: string) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateParams({ q: value.trim() || null });
    }, 300);
  }

  return (
    <div className="space-y-3">
      {/* Верхній рядок: Пошук за прізвищем */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
        <input
          type="text"
          defaultValue={currentQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Швидкий пошук за прізвищем чи ім'ям..."
          className="w-full bg-slate-900/80 border border-sky-500/20 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 transition-all shadow-inner"
        />
      </div>

      {/* Фільтри: Команди + Медичний статус */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Команди */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-[11px] font-mono uppercase text-slate-500 mr-1 shrink-0">
            Команда:
          </span>
          <button
            type="button"
            onClick={() => updateParams({ team: "all" })}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
              currentTeam === "all"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "bg-slate-900/60 text-slate-400 border border-white/5 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            Усі
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateParams({ team: t.id })}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
                currentTeam === t.id
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 border border-white/5 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Медичний статус */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-[11px] font-mono uppercase text-slate-500 mr-1 shrink-0">
            Статус:
          </span>
          <button
            type="button"
            onClick={() => updateParams({ status: "all" })}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all ${
              currentStatus === "all"
                ? "bg-slate-800 text-white border border-slate-700 font-bold"
                : "bg-slate-900/60 text-slate-400 border border-white/5 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            Всі
          </button>
          <button
            type="button"
            onClick={() => updateParams({ status: "ok" })}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all border ${
              currentStatus === "ok"
                ? "bg-emerald-500/25 text-emerald-200 border-emerald-500/50 shadow-sm shadow-emerald-950 font-bold"
                : "bg-emerald-950/20 text-emerald-400/80 border-emerald-500/20 hover:text-emerald-200 hover:bg-emerald-500/10"
            }`}
          >
            🟢 Готові
          </button>
          <button
            type="button"
            onClick={() => updateParams({ status: "warn" })}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all border ${
              currentStatus === "warn"
                ? "bg-amber-500/25 text-amber-200 border-amber-500/50 shadow-sm shadow-amber-950 font-bold"
                : "bg-amber-950/20 text-amber-400/80 border-amber-500/20 hover:text-amber-200 hover:bg-amber-500/10"
            }`}
          >
            🟡 Обмежені
          </button>
          <button
            type="button"
            onClick={() => updateParams({ status: "danger" })}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all border ${
              currentStatus === "danger"
                ? "bg-rose-500/25 text-rose-200 border-rose-500/50 shadow-sm shadow-rose-950 font-bold"
                : "bg-rose-950/20 text-rose-400/80 border-rose-500/20 hover:text-rose-200 hover:bg-rose-500/10"
            }`}
          >
            🔴 Травмовані
          </button>
        </div>
      </div>
    </div>
  );
}
