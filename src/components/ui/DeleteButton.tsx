"use client";
import { useState, useTransition } from "react";

export default function DeleteButton({ onDelete, itemName, className = "" }: { onDelete: () => Promise<any>; itemName: string; className?: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!showConfirm) {
    return (<button onClick={() => setShowConfirm(true)} className={`border border-status-danger/30 text-status-danger hover:bg-status-danger/10 font-semibold py-2 px-4 rounded-lg text-xs transition-colors ${className}`}>🗑 Видалити</button>);
  }
  return (
    <div className="flex items-center gap-2 bg-status-danger/[0.06] border border-status-danger/20 rounded-lg p-3">
      <span className="text-xs text-status-danger">Видалити {itemName}? Цю дію не можна скасувати.</span>
      <button onClick={() => startTransition(async () => { await onDelete(); })} disabled={isPending} className="bg-status-danger hover:bg-red-600 disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors whitespace-nowrap">{isPending ? "..." : "Так, видалити"}</button>
      <button onClick={() => setShowConfirm(false)} className="text-slate-500 hover:text-slate-300 text-xs px-2">Скасувати</button>
    </div>
  );
}
