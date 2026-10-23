"use client";

import React, { useState } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { EhrImportModal } from "./EhrImportModal";

export function EhrImportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = (playerId: string) => {
    setIsOpen(false);
    router.push(`/players/${playerId}`);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-slate-900/80 hover:bg-slate-800 text-emerald-400 hover:text-white border border-emerald-500/25 font-bold py-2.5 px-3.5 rounded-xl text-xs transition-all shadow-md active:scale-95 whitespace-nowrap flex items-center justify-center gap-1.5"
        title="Імпортувати медичну карту новачка з іншого клубу (JSON v1.0.0)"
      >
        <Upload className="w-3.5 h-3.5" />
        <span>Імпорт медкарти</span>
      </button>

      <EhrImportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
