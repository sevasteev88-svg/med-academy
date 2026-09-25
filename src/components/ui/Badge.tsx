import React from "react";

type BadgeVariant = "ok" | "warn" | "danger" | "neutral";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
};

const variantStyles: Record<BadgeVariant, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30 shadow-sm shadow-amber-500/10",
  danger: "bg-red-500/15 text-red-400 border-red-500/30 shadow-sm shadow-red-500/10",
  neutral: "bg-slate-800/80 text-slate-300 border-slate-700/60",
};

export default function Badge({ children, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-lg border backdrop-blur-sm ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
