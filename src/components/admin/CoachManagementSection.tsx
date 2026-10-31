"use client";

import { useState, useEffect, useTransition } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import {
  getClubCoachesAction,
  updateCoachTeamAssignmentsAction,
  removeCoachFromStaffAction,
  createOrInviteCoachAction,
  type ClubCoachItem,
  type CoachTeamInfo,
} from "@/actions/coach-assignment-actions";

export default function CoachManagementSection() {
  const [coaches, setCoaches] = useState<ClubCoachItem[]>([]);
  const [allTeams, setAllTeams] = useState<CoachTeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Режим редагування призначень
  const [editingCoach, setEditingCoach] = useState<ClubCoachItem | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Режим видалення
  const [deletingCoach, setDeletingCoach] = useState<ClubCoachItem | null>(null);

  // Режим додавання нового тренера
  const [isAddingCoach, setIsAddingCoach] = useState(false);
  const [newCoachName, setNewCoachName] = useState("");
  const [newCoachEmail, setNewCoachEmail] = useState("");
  const [newCoachTeamIds, setNewCoachTeamIds] = useState<string[]>([]);

  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function loadCoaches() {
    setLoading(true);
    setError(null);
    try {
      const res = await getClubCoachesAction();
      if (!res.success) {
        setError(res.error || "Не вдалося завантажити тренерів");
      } else {
        setCoaches(res.coaches);
        setAllTeams(res.allTeams);
      }
    } catch (err: any) {
      setError(err.message || "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoaches();
  }, []);

  function showToast(text: string, type: "success" | "error") {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  function handleStartEdit(coach: ClubCoachItem) {
    setEditingCoach(coach);
    setSelectedTeamIds([...coach.assignedTeamIds]);
  }

  function handleToggleTeam(teamId: string) {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  }

  function handleSaveAssignments() {
    if (!editingCoach) return;

    startTransition(async () => {
      const res = await updateCoachTeamAssignmentsAction({
        coachUserId: editingCoach.userId,
        teamIds: selectedTeamIds,
      });

      if (!res.success) {
        showToast(res.error || "Помилка збереження", "error");
      } else {
        showToast(res.message || "Призначення успішно збережено", "success");
        setEditingCoach(null);
        await loadCoaches();
      }
    });
  }

  function handleConfirmDelete() {
    if (!deletingCoach) return;

    startTransition(async () => {
      const res = await removeCoachFromStaffAction({
        coachUserId: deletingCoach.userId,
      });

      if (!res.success) {
        showToast(res.error || "Помилка видалення користувача", "error");
      } else {
        showToast(res.message || "Користувача видалено зі штабу тренерів", "success");
        setDeletingCoach(null);
        if (editingCoach?.userId === deletingCoach.userId) {
          setEditingCoach(null);
        }
        await loadCoaches();
      }
    });
  }

  function handleCreateCoach(e: React.FormEvent) {
    e.preventDefault();
    if (!newCoachName.trim() || !newCoachEmail.trim()) {
      showToast("Заповніть ім'я та email тренера", "error");
      return;
    }

    startTransition(async () => {
      const res = await createOrInviteCoachAction({
        fullName: newCoachName,
        email: newCoachEmail,
        teamIds: newCoachTeamIds,
      });

      if (!res.success) {
        showToast(res.error || "Помилка створення тренера", "error");
      } else {
        showToast(res.message || "Тренера успішно додано", "success");
        setIsAddingCoach(false);
        setNewCoachName("");
        setNewCoachEmail("");
        setNewCoachTeamIds([]);
        await loadCoaches();
      }
    });
  }

  function handleToggleNewCoachTeam(teamId: string) {
    setNewCoachTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  }

  const filteredCoaches = coaches.filter(
    (c) =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  const awaitingCount = coaches.filter((c) => c.isAwaitingAssignment).length;

  return (
    <Card className="p-6 bg-slate-900/60 border-sky-500/15 space-y-6">
      {/* Toast сповіщення */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Заголовок та опис */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>👔</span> Тренерський штаб та розподіл вікових груп
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Керування доступом: кожен тренер бачить виключно закріплені за ним команди. Доступ надається лікарем або адміністратором.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {awaitingCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
              <span>⚠️</span> {awaitingCount} очікують призначення
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsAddingCoach(!isAddingCoach)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm shadow-sky-500/20"
          >
            <span>{isAddingCoach ? "✕ Скасувати" : "➕ Запросити тренера"}</span>
          </button>
          <button
            type="button"
            onClick={loadCoaches}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            🔄 Оновити
          </button>
        </div>
      </div>

      {/* Форма додавання нового тренера */}
      {isAddingCoach && (
        <form
          onSubmit={handleCreateCoach}
          className="p-5 rounded-2xl bg-sky-950/20 border border-sky-500/40 space-y-4 animate-in fade-in"
        >
          <div className="border-b border-sky-500/20 pb-2">
            <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-2">
              <span>➕</span> Додати тренера до штабу клубу
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Створіть офіційний акаунт для тренера та одразу закріпіть за ним вікові категорії.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                ПІБ Тренера
              </label>
              <input
                type="text"
                required
                value={newCoachName}
                onChange={(e) => setNewCoachName(e.target.value)}
                placeholder="наприклад: Згура Сергій"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Email тренера (для входу)
              </label>
              <input
                type="email"
                required
                value={newCoachEmail}
                onChange={(e) => setNewCoachEmail(e.target.value)}
                placeholder="coach@club.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
              Закріпити вікові групи (команди):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {allTeams.map((team) => {
                const isChecked = newCoachTeamIds.includes(team.id);
                return (
                  <label
                    key={team.id}
                    className={`p-2 rounded-lg border text-xs font-medium cursor-pointer select-none flex items-center gap-2 transition-all ${
                      isChecked
                        ? "bg-sky-500/20 border-sky-500 text-white"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleNewCoachTeam(team.id)}
                      className="w-3.5 h-3.5 rounded text-sky-500"
                    />
                    <span className="truncate">{team.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-sky-500/20">
            <button
              type="button"
              onClick={() => setIsAddingCoach(false)}
              className="px-3.5 py-1.5 rounded-xl text-xs bg-slate-800 text-slate-300 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sm disabled:opacity-50"
            >
              {isPending ? "Створення..." : "Зберегти та запросити"}
            </button>
          </div>
        </form>
      )}

      {/* Пошук тренерів */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук тренера за ім'ям або email..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 min-h-[40px]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Стан завантаження / помилки */}
      {loading && coaches.length === 0 && (
        <div className="text-center py-10 text-xs text-slate-400">
          <div className="inline-block animate-spin text-xl mb-2">⏳</div>
          <p>Завантаження тренерського штабу...</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Список тренерів */}
      {!loading && filteredCoaches.length === 0 && (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
          <span className="text-2xl mb-2 block">⚽</span>
          <p className="text-xs font-medium text-slate-300">
            {search ? "Тренерів за вашим запитом не знайдено." : "У клубі ще немає зареєстрованих тренерів."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5">
        {filteredCoaches.map((coach) => {
          const isSelected = editingCoach?.userId === coach.userId;

          return (
            <div
              key={coach.userId}
              className={`p-4 rounded-xl border transition-all ${
                coach.isAwaitingAssignment
                  ? "bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50"
                  : isSelected
                  ? "bg-sky-950/30 border-sky-500/50 shadow-md shadow-sky-900/20"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      {coach.fullName}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      ({coach.email})
                    </span>
                    {coach.isAwaitingAssignment ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        🟡 Очікує призначення команди
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        🟢 Активний доступ
                      </span>
                    )}
                  </div>

                  {/* Закріплені команди */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-400 font-medium">Закріплені команди:</span>
                    {coach.assignedTeams.length === 0 ? (
                      <span className="text-[11px] text-amber-400 italic">
                        Жодної команди не призначено (доступ до гравців заблоковано)
                      </span>
                    ) : (
                      coach.assignedTeams.map((team) => (
                        <span
                          key={team.id}
                          className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30"
                        >
                          ⚽ {team.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(coach)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 min-h-[38px] ${
                      isSelected
                        ? "bg-sky-600 text-white"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700"
                    }`}
                  >
                    <span>⚙️</span>
                    <span>{coach.assignedTeams.length === 0 ? "Призначити команду" : "Змінити доступ"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingCoach(coach)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/25 transition-all flex items-center gap-1.5 min-h-[38px]"
                    title="Видалити зі штабу"
                  >
                    <span>🗑️</span>
                    <span className="hidden sm:inline">Видалити</span>
                  </button>
                </div>
              </div>

              {/* Інлайн-модаль налаштування команд */}
              {isSelected && (
                <div className="mt-4 pt-4 border-t border-sky-500/20 bg-slate-900/90 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>🎯</span> Вибір вікових груп для тренера: {coach.fullName}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Оберіть одну або кілька команд. Тренер бачитиме лише футболістів із цих вікових категорій.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTeamIds(allTeams.map((t) => t.id))}
                        className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 underline"
                      >
                        Обрати всі
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTeamIds([])}
                        className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 underline"
                      >
                        Очистити
                      </button>
                    </div>
                  </div>

                  {/* Чекбокси команд */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {allTeams.map((team) => {
                      const isChecked = selectedTeamIds.includes(team.id);

                      return (
                        <label
                          key={team.id}
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer select-none transition-all ${
                            isChecked
                              ? "bg-sky-500/20 border-sky-500/50 text-white"
                              : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleTeam(team.id)}
                            className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900 bg-slate-950 border-slate-700"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold block truncate">{team.name}</span>
                            <span className="text-[10px] text-slate-500 uppercase">
                              {team.category === "youth" ? "Юнаки" : "Академія"}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Дії збереження / скасування */}
                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingCoach(null)}
                      disabled={isPending}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      Скасувати
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAssignments}
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm shadow-sky-500/30 disabled:opacity-50"
                    >
                      {isPending ? "Збереження..." : `Зберегти призначення (${selectedTeamIds.length})`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Діалог підтвердження видалення */}
      {deletingCoach && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="text-2xl">⚠️</span>
              <h4 className="text-base font-bold text-white">Видалити зі штабу тренерів?</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Ви збираєтесь видалити <strong className="text-white">{deletingCoach.fullName}</strong> ({deletingCoach.email}) зі списку тренерів клубу.
              Всі права доступу до команд та списків гравців будуть миттєво відкликані.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCoach(null)}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {isPending ? "Видалення..." : "Так, видалити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
