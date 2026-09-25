"use client";

import React from "react";

interface PrintButtonProps {
  label?: string;
  variant?: "primary" | "secondary";
  className?: string;
}

export default function PrintButton({
  label = "📥 Завантажити PDF",
  variant = "secondary",
  className = "",
}: PrintButtonProps) {
  return (
    <button
      onClick={() => window.print()}
      className={`font-bold py-2 px-3.5 rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1.5 print:hidden shadow-sm ${
        variant === "primary"
          ? "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white shadow-sky-600/20"
          : "border border-sky-500/25 bg-slate-900/80 hover:bg-slate-800 text-sky-300 hover:text-white"
      } ${className}`}
    >
      <span>🖨️</span>
      <span>{label}</span>
    </button>
  );
}
