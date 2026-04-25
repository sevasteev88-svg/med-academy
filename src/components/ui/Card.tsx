import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: "danger" | "warn" | "ok" | null;
};

export default function Card({
  children,
  className = "",
  interactive = false,
  accent = null,
}: CardProps) {
  const accentColors = {
    danger: "border-l-status-danger",
    warn: "border-l-status-warn",
    ok: "border-l-status-ok",
  };

  return (
    <div
      className={`
        relative bg-surface rounded-xl
        border border-blue-900/20 p-4
        ${accent ? `border-l-[3px] ${accentColors[accent]}` : ""}
        ${interactive ? "transition-all duration-200 hover:border-blue-800/40 hover:bg-surface-hover cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
