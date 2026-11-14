"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

type MiniPlayer = {
  id: string;
  fullName: string;
  position: string;
  team_id: string;
  team_name: string;
  status: "available" | "restricted" | "unavailable";
  max_minutes: number;
  restriction_notes: string;
};

type MiniTeam = {
  id: string;
  name: string;
};

type Tab = "today" | "training" | "report";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        HapticFeedback?: {
          notificationOccurred: (type: "success" | "warning" | "error") => void;
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
        };
      };
    };
  }
}

export default function TgCoachMiniApp() {
  const [initData, setInitData] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("Тренер");
  const [teams, setTeams] = useState<MiniTeam[]>([]);
  const [players, setPlayers] = useState<MiniPlayer[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<Tab>("today");

  // Training form state
  const [sessionType, setSessionType] = useState("training_team");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [rpeScore, setRpeScore] = useState(5);
  const [surface, setSurface] = useState("Натуральний газон");
  const [incident, setIncident] = useState<"none" | "injury">("none");
  const [notes, setNotes] = useState("");
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingSuccess, setTrainingSuccess] = useState<string | null>(null);

  // Injury report state
  const [reportPlayerId, setReportPlayerId] = useState("");
  const [reportKind, setReportKind] = useState("Ушиб / Зіткнення");
  const [reportSummary, setReportSummary] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  function loadData(tgInitData: string) {
    setLoading(true);
    setError(null);
    fetch("/api/tg-coach", {
      headers: { "x-telegram-init-data": tgInitData },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Помилка завантаження");
        setCoachName(data.coachName || "Тренер");
        setTeams(data.teams || []);
        setPlayers(data.players || []);
        if ((data.teams || []).length === 1) {
          setSelectedTeamId(data.teams[0].id);
        }
      })
      .catch((err) => {
        setError(err.message || "Не вдалося завантажити дані");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const raw = tg.initData || "";
      setInitData(raw);
      if (raw) {
        loadData(raw);
      } else {
        setLoading(false);
        setError("Відкрийте цей екран через кнопку в Telegram-боті.");
      }
    } else {
      // Якщо скрипт ще вантажиться — перевіримо через 300мс
      const timer = setTimeout(() => {
        const tgDelayed = window.Telegram?.WebApp;
        if (tgDelayed) {
          tgDelayed.ready();
          tgDelayed.expand();
          const raw = tgDelayed.initData || "";
          setInitData(raw);
          if (raw) {
            loadData(raw);
            return;
          }
        }
        setLoading(false);
        setError("Відкрийте цей екран через кнопку «Відкрити Міні-додаток» у Telegram-боті.");
      }, 350);
      return () => clearTimeout(timer);
    }
  }, []);

  const visiblePlayers = useMemo(() => {
    if (selectedTeamId === "all") return players;
    return players.filter((p) => p.team_id === selectedTeamId);
  }, [players, selectedTeamId]);

  const counts = useMemo(() => {
    let available = 0;
    let restricted = 0;
    let unavailable = 0;
    for (const p of visiblePlayers) {
      if (p.status === "available") available++;
      else if (p.status === "restricted") restricted++;
      else unavailable++;
    }
    return { available, restricted, unavailable };
  }, [visiblePlayers]);

  async function handleSaveTraining() {
    setSavingTraining(true);
    setTrainingSuccess(null);
    setError(null);
    try {
      const targetTeamId =
        selectedTeamId !== "all" ? selectedTeamId : teams[0]?.id;
      const res = await fetch("/api/tg-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({
          action: "save_training",
          teamId: targetTeamId,
          sessionType,
          durationMinutes,
          rpeScore,
          surface,
          incident,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Не вдалося зберегти");
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setTrainingSuccess("✅ Тренування збережено! Лікар та аналітика оновлені.");
      setNotes("");
    } catch (err: any) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setError(err.message || "Помилка збереження");
    } finally {
      setSavingTraining(false);
    }
  }

  async function handleSendReport() {
    if (!reportPlayerId) {
      setError("Оберіть гравця зі списку");
      return;
    }
    setSavingReport(true);
    setReportSuccess(null);
    setError(null);
    try {
      const res = await fetch("/api/tg-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({
          action: "report_injury",
          playerId: reportPlayerId,
          kind: reportKind,
          summary: reportSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Не вдалося надіслати");
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setReportSuccess("✅ Сигнал надіслано лікарю!");
      setReportSummary("");
      setReportPlayerId("");
    } catch (err: any) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
      setError(err.message || "Помилка відправки");
    } finally {
      setSavingReport(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />

      {/* Компактна шапка */}
      <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-sky-400 font-semibold uppercase tracking-wider">Кабінет тренера</p>
          <h1 className="text-base font-bold text-white leading-tight">{coachName}</h1>
        </div>
        {teams.length > 1 && (
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
          >
            <option value="all">Усі групи</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-3 gap-2">
              <div className="h-16 bg-slate-900 rounded-2xl" />
              <div className="h-16 bg-slate-900 rounded-2xl" />
              <div className="h-16 bg-slate-900 rounded-2xl" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-slate-900 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Вкладка 1: Склад на сьогодні */}
            {activeTab === "today" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="text-xl font-black text-emerald-400">{counts.available}</div>
                    <div className="text-[11px] text-emerald-200/80">Можна все</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <div className="text-xl font-black text-amber-400">{counts.restricted}</div>
                    <div className="text-[11px] text-amber-200/80">Обмеження</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                    <div className="text-xl font-black text-rose-400">{counts.unavailable}</div>
                    <div className="text-[11px] text-rose-200/80">Пропускають</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {visiblePlayers.map((p) => {
                    const badge =
                      p.status === "available"
                        ? { dot: "🟢", cls: "border-slate-800 bg-slate-900/70", label: "Готовий" }
                        : p.status === "restricted"
                        ? { dot: "🟡", cls: "border-amber-500/30 bg-amber-950/20", label: `Макс ${p.max_minutes} хв` }
                        : { dot: "🔴", cls: "border-rose-500/30 bg-rose-950/20", label: "Без навантажень" };

                    return (
                      <div
                        key={p.id}
                        className={`p-3 rounded-2xl border ${badge.cls} flex items-center justify-between gap-3`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span>{badge.dot}</span>
                            <span className="font-semibold text-sm text-white truncate">{p.fullName}</span>
                          </div>
                          {p.restriction_notes && (
                            <p className="text-[11px] text-amber-200/80 mt-0.5 pl-6">{p.restriction_notes}</p>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-slate-300 shrink-0">{badge.label}</span>
                      </div>
                    );
                  })}
                  {visiblePlayers.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-8">Список гравців порожній.</p>
                  )}
                </div>
              </div>
            )}

            {/* Вкладка 2: Запис тренування */}
            {activeTab === "training" && (
              <div className="space-y-4">
                {trainingSuccess && (
                  <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs">
                    {trainingSuccess}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">1. Тип заняття</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "training_team", label: "🏃 Тренування" },
                      { id: "match", label: "⚽ Матч" },
                      { id: "gym_strength", label: "🏋️ Зал" },
                      { id: "recovery", label: "🧘 Відновлення" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSessionType(opt.id)}
                        className={`p-3 rounded-2xl text-xs font-semibold border transition ${
                          sessionType === opt.id
                            ? "bg-sky-500/20 border-sky-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">2. Тривалість (хв)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[45, 60, 75, 90, 105, 120].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setDurationMinutes(min)}
                        className={`py-2.5 rounded-2xl text-xs font-bold border transition ${
                          durationMinutes === min
                            ? "bg-sky-500/20 border-sky-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        {min} хв
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">3. Важкість заняття</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { val: 3, label: "🟢 Легке" },
                      { val: 5, label: "🟡 Середнє" },
                      { val: 7, label: "🟠 Важке" },
                      { val: 9, label: "🔴 Максимальне" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setRpeScore(opt.val)}
                        className={`p-3 rounded-2xl text-xs font-semibold border transition ${
                          rpeScore === opt.val
                            ? "bg-sky-500/20 border-sky-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">4. Покриття</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["Натуральний газон", "Штучне поле", "Манеж/Зал", "Тренажерний зал"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSurface(s)}
                        className={`p-2.5 rounded-2xl text-xs font-medium border transition ${
                          surface === s
                            ? "bg-sky-500/20 border-sky-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">5. Чи були травми на занятті?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIncident("none")}
                      className={`p-3 rounded-2xl text-xs font-semibold border ${
                        incident === "none"
                          ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      ✅ Без травм
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncident("injury")}
                      className={`p-3 rounded-2xl text-xs font-semibold border ${
                        incident === "injury"
                          ? "bg-rose-500/20 border-rose-400 text-rose-200"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      ⚠️ Була травма
                    </button>
                  </div>
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Короткий коментар (необов'язково)..."
                  rows={2}
                  className="w-full rounded-2xl bg-slate-900 border border-slate-800 p-3 text-xs text-white placeholder:text-slate-500"
                />

                <button
                  type="button"
                  disabled={savingTraining}
                  onClick={handleSaveTraining}
                  className="w-full py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition"
                >
                  {savingTraining ? "Збереження..." : "💾 Зберегти тренування"}
                </button>
              </div>
            )}

            {/* Вкладка 3: Швидкий сигнал лікарю */}
            {activeTab === "report" && (
              <div className="space-y-4">
                {reportSuccess && (
                  <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs">
                    {reportSuccess}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Хто з гравців?</label>
                  <select
                    value={reportPlayerId}
                    onChange={(e) => setReportPlayerId(e.target.value)}
                    className="w-full rounded-2xl bg-slate-900 border border-slate-800 p-3 text-sm text-white"
                  >
                    <option value="">— Оберіть гравця —</option>
                    {visiblePlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.team_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Що трапилося?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Ушиб / Зіткнення",
                      "Біль / Дискомфорт",
                      "Заміна через травму",
                      "Погане самопочуття",
                    ].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setReportKind(k)}
                        className={`p-3 rounded-2xl text-xs font-semibold border text-left ${
                          reportKind === k
                            ? "bg-amber-500/20 border-amber-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={reportSummary}
                  onChange={(e) => setReportSummary(e.target.value)}
                  placeholder="Де болить або що сталося (коротко)..."
                  rows={3}
                  className="w-full rounded-2xl bg-slate-900 border border-slate-800 p-3 text-xs text-white placeholder:text-slate-500"
                />

                <button
                  type="button"
                  disabled={savingReport}
                  onClick={handleSendReport}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm transition"
                >
                  {savingReport ? "Відправка..." : "⚠️ Повідомити лікаря"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Нижня навігація під палець */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur border-t border-slate-800 grid grid-cols-3 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("today")}
          className={`py-2 rounded-xl flex flex-col items-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "today" ? "text-sky-400 bg-sky-500/10" : "text-slate-400"
          }`}
        >
          <span className="text-base">👥</span>
          <span>Сьогодні</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("training")}
          className={`py-2 rounded-xl flex flex-col items-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "training" ? "text-sky-400 bg-sky-500/10" : "text-slate-400"
          }`}
        >
          <span className="text-base">⏱️</span>
          <span>Тренування</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("report")}
          className={`py-2 rounded-xl flex flex-col items-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "report" ? "text-amber-400 bg-amber-500/10" : "text-slate-400"
          }`}
        >
          <span className="text-base">⚠️</span>
          <span>Сигнал лікарю</span>
        </button>
      </nav>
    </div>
  );
}
