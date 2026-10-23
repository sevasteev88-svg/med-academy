"use client";

import React, { useState } from "react";
import { FileDown } from "lucide-react";
import { EhrExportModal } from "./EhrExportModal";

interface PlayerEhrTransferButtonProps {
  playerId: string;
  playerName: string;
  doctorName?: string;
}

export function PlayerEhrTransferButton({
  playerId,
  playerName,
  doctorName,
}: PlayerEhrTransferButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 transition"
        title="Експорт медичної картки для трансферу або консультації (PDF/JSON)"
      >
        <FileDown className="w-3.5 h-3.5" />
        <span>Експорт медкарти</span>
      </button>

      <EhrExportModal
        playerId={playerId}
        playerName={playerName}
        doctorName={doctorName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
