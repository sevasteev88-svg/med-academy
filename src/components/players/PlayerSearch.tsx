"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useRef } from "react";

export default function PlayerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentQuery = searchParams.get("q") ?? "";

  function handleChange(value: string) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
  }

  return (
    <input
      type="text"
      defaultValue={currentQuery}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Пошук за прізвищем..."
      className="w-full sm:w-64 bg-surface border border-blue-900/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-blue/50 focus:ring-1 focus:ring-brand-blue/30 transition-colors"
    />
  );
}
