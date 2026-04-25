"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const PRESETS = [
  { label: "За весь час",         from: "",           to: "" },
  { label: "Сезон 2025/26",      from: "2025-07-01", to: "2026-06-30" },
  { label: "Останні 12 міс.",    from: "LAST_12M",   to: "" },
  { label: "Останні 6 міс.",     from: "LAST_6M",    to: "" },
  { label: "Останні 3 міс.",     from: "LAST_3M",    to: "" },
];

function calcDate(key: string): string {
  const now = new Date();
  if (key === "LAST_12M") {
    now.setMonth(now.getMonth() - 12);
  } else if (key === "LAST_6M") {
    now.setMonth(now.getMonth() - 6);
  } else if (key === "LAST_3M") {
    now.setMonth(now.getMonth() - 3);
  } else {
    return key;
  }
  return now.toISOString().split("T")[0];
}

const btnBase =
  "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors";
const btnActive =
  "bg-brand-blue/15 text-brand-blue border-brand-blue/30";
const btnInactive =
  "bg-transparent text-slate-500 border-blue-900/15 hover:text-slate-300 hover:border-blue-900/30";

export default function PeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";

  function applyPreset(preset: (typeof PRESETS)[number]) {
    const params = new URLSearchParams();
    const from = calcDate(preset.from);
    const to = preset.to || "";

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function isActive(preset: (typeof PRESETS)[number]): boolean {
    const from = calcDate(preset.from);
    const to = preset.to || "";
    return currentFrom === from && currentTo === to;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => applyPreset(preset)}
          className={`${btnBase} ${isActive(preset) ? btnActive : btnInactive}`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
