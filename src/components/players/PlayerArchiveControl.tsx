"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archivePlayerAction,
  restorePlayerAction,
  hardDeletePlayerAction,
} from "@/actions/delete-player-action";

type Props = {
  playerId: string;
  playerLastName: string;
  playerFirstName: string;
  isArchived: boolean;
  archivedAt?: string | null;
  archiveReason?: string | null;
  hasOpenInjuries: boolean;
  openInjuriesCount: number;
  isAdmin: boolean;
};

const PRESET_REASONS = [
  "Завершення контракту",
  "Перехід в інший клуб",
  "Завершення кар'єри",
  "Тривала пауза / відрахування",
  "Зміна громадянства / виїзд",
];

export default function PlayerArchiveControl({
  playerId,
  playerLastName,
  playerFirstName,
  isArchived,
  archivedAt,
  archiveReason,
  hasOpenInjuries,
  openInjuriesCount,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Стан модалок
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Стан полів
  const [reason, setReason] = useState("");
  const [confirmLastName, setConfirmLastName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Дія: В архів
  const handleArchive = () => {
    if (!reason.trim()) {
      setErrorMessage("Вкажіть причину перенесення в архів");
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const res = await archivePlayerAction(playerId, reason.trim());
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setShowArchiveModal(false);
        router.refresh();
      }
    });
  };

  // 2. Дія: Відновити
  const handleRestore = () => {
    if (!confirm(`Відновити гравця ${playerLastName} ${playerFirstName} з архіву до основного складу?`)) {
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const res = await restorePlayerAction(playerId);
      if (res?.error) {
        alert(`Помилка відновлення: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  };

  // 3. Дія: Повне видалення (admin only)
  const handleHardDelete = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await hardDeletePlayerAction(playerId, confirmLastName);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setShowDeleteModal(false);
        router.push("/players");
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Якщо гравець в архіві — виводимо інформаційний блок */}
      {isArchived && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">📦</span>
              <span className="font-bold text-amber-300 text-sm">
                Гравець перебуває в архіві
              </span>
              {archivedAt && (
                <span className="text-[11px] font-mono text-slate-400">
                  з {new Date(archivedAt).toLocaleDateString("uk-UA")}
                </span>
              )}
            </div>
            {archiveReason && (
              <p className="text-xs text-slate-300">
                <span className="text-slate-400">Причина:</span> {archiveReason}
              </p>
            )}
            <p className="text-[11px] text-slate-400">
              Гравець прихований із реєстру, доступності, брифінгу та протоколів.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRestore}
            disabled={isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-md shadow-emerald-700/20 active:scale-95 disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
          >
            <span>🔄</span> {isPending ? "Відновлення..." : "Відновити в склад"}
          </button>
        </div>
      )}

      {/* Кнопки дій */}
      <div className="flex flex-wrap items-center gap-2">
        {!isArchived ? (
          <button
            type="button"
            onClick={() => {
              setReason("");
              setErrorMessage(null);
              setShowArchiveModal(true);
            }}
            className="border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <span>📦</span> В архів
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRestore}
            disabled={isPending}
            className="border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center gap-1.5 active:scale-95"
          >
            <span>🔄</span> Відновити
          </button>
        )}

        {/* Кнопка повного видалення — доступна ТІЛЬКИ для Admin */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setConfirmLastName("");
              setErrorMessage(null);
              setShowDeleteModal(true);
            }}
            className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center gap-1.5 active:scale-95 ml-auto"
            title="Безповоротне повне видалення (тільки адміністратор клубу)"
          >
            <span>🗑</span> Повне видалення (Admin)
          </button>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          МОДАЛЬНЕ ВІКНО: В АРХІВ
      ───────────────────────────────────────────────────────────── */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📦</span> Перенести в архів
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Гравець: <strong className="text-white">{playerLastName} {playerFirstName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 bg-slate-800/60 p-3 rounded-xl border border-white/5 leading-relaxed">
              Гравець буде прихований зі списку активного складу, списків доступності,
              тренерського брифінгу та протоколів. Вся його медична історія збережеться, і його можна буде будь-коли відновити.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Оберіть або введіть причину архівації <span className="text-rose-400">*</span>:
              </label>

              {/* Швидкі пресети */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                      reason === preset
                        ? "bg-amber-500/20 text-amber-200 border-amber-500/50 font-semibold"
                        : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Вкажіть причину або коментар (наприклад, Перейшов до іншої команди)..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
              />
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={isPending || !reason.trim()}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-amber-600/20"
              >
                {isPending ? "Збереження..." : "Перенести в архів"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          МОДАЛЬНЕ ВІКНО: ПОВНЕ ВИДАЛЕННЯ (ADMIN ONLY)
      ───────────────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-rose-300 flex items-center gap-2">
                  <span>⚠️</span> Повне безповоротне видалення
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Гравець: <strong className="text-white">{playerLastName} {playerFirstName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Блокування, якщо є відкриті травми */}
            {hasOpenInjuries ? (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                  <span>⛔</span> Дія заблокована: відкриті травми
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  У цього гравця зафіксовано <strong>{openInjuriesCount}</strong> відкриту(их) травму(р).
                  Видалення гравця з активним лікуванням заборонено медичним регламентом.
                </p>
                <p className="text-[11px] text-slate-400">
                  Спочатку переведіть травму в статус «Закрита» або скористайтеся безпечною функцією <strong>«В архів»</strong>.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-300 bg-rose-950/30 p-3 rounded-xl border border-rose-500/20 leading-relaxed">
                  Ця дія призведе до <strong>повного видалення</strong> гравця та очищення зв'язків.
                  Цю дію <strong>неможливо скасувати</strong>. Факт видалення буде зафіксовано в незмінному журналі аудиту.
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Для підтвердження введіть прізвище гравця (<strong>{playerLastName}</strong>):
                  </label>
                  <input
                    type="text"
                    value={confirmLastName}
                    onChange={(e) => setConfirmLastName(e.target.value)}
                    placeholder={playerLastName}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 font-semibold"
                  />
                </div>
              </>
            )}

            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Скасувати
              </button>
              {!hasOpenInjuries && (
                <button
                  type="button"
                  onClick={handleHardDelete}
                  disabled={
                    isPending ||
                    confirmLastName.trim().toLowerCase() !== playerLastName.trim().toLowerCase()
                  }
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-rose-600/30"
                >
                  {isPending ? "Видалення..." : "Так, видалити назавжди"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
