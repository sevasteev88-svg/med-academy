import React from "react";

type BadgeVariant = "ok" | "warn" | "danger" | "neutral";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
};

const variantStyles: Record<BadgeVariant, string> = {
  ok: "bg-status-ok/10 text-status-ok border-status-ok/20",
  warn: "bg-status-warn/10 text-status-warn border-status-warn/20",
  danger: "bg-status-danger/10 text-status-danger border-status-danger/20",
  neutral: "bg-slate-800 text-slate-400 border-slate-700",
};

export default function Badge({ children, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded-md border ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
}
