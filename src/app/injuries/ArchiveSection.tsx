"use client";
// src/app/injuries/ArchiveSection.tsx
// Згортуваний блок архіву закритих травм

import { useState } from "react";

export default function ArchiveSection({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 mb-2 group"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap group-hover:text-slate-400 transition-colors">
          Архів · закриті ({count})
        </span>
        <div className="flex-1 h-px bg-blue-900/15" />
        <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
          {open ? "▲ сховати" : "▼ показати"}
        </span>
      </button>
      {open && children}
    </section>
  );
}
