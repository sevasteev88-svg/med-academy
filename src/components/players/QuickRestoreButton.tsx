"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restorePlayerAction } from "@/actions/delete-player-action";

type Props = {
  playerId: string;
  playerName: string;
};

export default function QuickRestoreButton({ playerId, playerName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRestore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Відновити гравця ${playerName} з архіву до активного складу?`)) {
      return;
    }

    startTransition(async () => {
      const res = await restorePlayerAction(playerId);
      if (res?.error) {
        alert(`Помилка відновлення: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={isPending}
      className="bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-1 px-2.5 rounded-lg text-[11px] transition-all shadow-sm active:scale-95 flex items-center gap-1 shrink-0"
      title="Відновити гравця до основного складу"
    >
      <span>🔄</span> {isPending ? "..." : "Відновити"}
    </button>
  );
}
