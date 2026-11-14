"use client";

import { useState, useTransition } from "react";
import {
  submitRtpClearanceAction,
} from "@/actions/submit-rtp-clearance-action";
import {
  RTP_PROFILES,
  RTP_CATEGORY_META,
  resolveRtpProfileId,
  calculateRtpClearanceStats,
  type RtpCriteriaState,
  type RtpProfileId,
  type RtpCriterionCategory,
} from "@/lib/rtp-profiles";

type Props = {
  injuryId: string;
  injuryStatus: string;
  playerName: string;
  injuryType?: string | null;
  location?: string | null;
  initialProfileId?: RtpProfileId | null;
  initialCriteria?: RtpCriteriaState | null;
};

const CATEGORY_ORDER: RtpCriterionCategory[] = ["clinical", "strength", "field", "psych"];

export default function RtpClearanceChecklist({
  injuryId,
  injuryStatus,
  playerName,
  injuryType,
  location,
  initialProfileId,
  initialCriteria,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    success?: boolean;
    error?: string;
    msg?: string;
  } | null>(null);

  const autoProfileId = resolveRtpProfileId(injuryType, location);
  const [profileId, setProfileId] = useState<RtpProfileId>(() => {
    const candidate = initialProfileId || initialCriteria?.profileId;
    if (candidate && candidate in RTP_PROFILES) {
      return candidate;
    }
    return autoProfileId;
  });

  const [criteria, setCriteria] = useState<RtpCriteriaState>(() => ({
    ...(initialCriteria || {}),
    doctorNote: (initialCriteria?.doctorNote as string) || "",
  }));

  const [closeInjury, setCloseInjury] = useState(false);

  const activeProfile = RTP_PROFILES[profileId] ?? RTP_PROFILES.base;
  const { passedCriteria: passedCount, totalCriteria: totalCount, clearancePercentage: percentage } =
    calculateRtpClearanceStats(profileId, criteria);

  function toggle(key: string) {
    setCriteria((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const payload: RtpCriteriaState = { ...criteria, profileId };
      const res = await submitRtpClearanceAction(injuryId, payload, closeInjury, profileId);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({
          success: true,
          msg: closeInjury
            ? `✓ Гравець ${playerName} успішно пройшов RTP-допуск (${activeProfile.titleUa})! Травму закрито, гравець готовий до гри.`
            : `✓ Результати тестування збережено (${res.passedCriteria}/${res.totalCriteria} критеріїв · ${activeProfile.titleUa}).`,
        });
      }
    });
  }

  const isClosed = injuryStatus === "closed";

  return (
    <div className="bg-slate-900/80 border border-blue-900/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <h3 className="text-sm font-bold text-white flex flex-wrap items-center gap-2">
              <span>Чек-лист повернення в гру (RTP Clearance)</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                {activeProfile.titleUa}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              {activeProfile.subtitleUa}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                percentage === 100
                  ? "bg-status-ok/15 text-status-ok"
                  : percentage >= 60
                  ? "bg-status-warn/15 text-status-warn"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {passedCount}/{totalCount} ({percentage}%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs px-3 py-1 rounded-lg bg-surface border border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {isOpen ? "Згорнути" : "Розгорнути"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="pt-3 border-t border-slate-800/80 space-y-4">
          {/* Перемикач профілю критеріїв RTP */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] text-slate-400">
              Профіль критеріїв{" "}
              {profileId === autoProfileId ? (
                <span className="text-emerald-400 font-semibold">(автоматично за травмою)</span>
              ) : (
                <span className="text-amber-400 font-semibold">(обрано вручну)</span>
              )}
              :
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(RTP_PROFILES) as RtpProfileId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setProfileId(pid)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    profileId === pid
                      ? "bg-sky-600 text-white border-sky-500"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  {RTP_PROFILES[pid].titleUa}
                </button>
              ))}
            </div>
          </div>

          {/* Критерії згруповані за категоріями */}
          {CATEGORY_ORDER.map((cat) => {
            const items = activeProfile.criteria.filter((c) => c.category === cat);
            if (items.length === 0) return null;
            const meta = RTP_CATEGORY_META[cat];
            return (
              <div key={cat} className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>{meta.icon}</span>
                  <span>{meta.title}</span>
                </div>
                <div className="space-y-1.5 pl-6">
                  {items.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(criteria[item.key])}
                        onChange={() => toggle(item.key)}
                        className="rounded border-slate-700"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Примітка лікаря */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Медичний коментар лікаря (Clearance Notes):
            </label>
            <input
              type="text"
              value={(criteria.doctorNote as string) || ""}
              onChange={(e) =>
                setCriteria((prev) => ({ ...prev, doctorNote: e.target.value }))
              }
              placeholder="Наприклад: допущено до матчу на 45-60 хвилин за погодженням з фітнес-тренером..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Опція закриття травми */}
          {!isClosed && (
            <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="closeInjuryCheck"
                checked={closeInjury}
                onChange={(e) => setCloseInjury(e.target.checked)}
                className="rounded border-slate-700"
              />
              <label
                htmlFor="closeInjuryCheck"
                className="text-xs text-slate-300 cursor-pointer font-medium"
              >
                Оформити повний допуск до гри та <strong>закрити травму</strong> (змінити статус на «Закрита» та обнулити біль ВАШ = 0)
              </label>
            </div>
          )}

          {feedback?.error && (
            <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-xs text-red-300">
              {feedback.error}
            </div>
          )}

          {feedback?.msg && (
            <div className="p-2.5 rounded-lg bg-green-500/15 border border-green-500/30 text-xs text-green-300">
              {feedback.msg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleSave}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                closeInjury
                  ? "bg-status-ok hover:bg-green-600 text-slate-950 shadow-md shadow-status-ok/30"
                  : "bg-brand-blue hover:bg-blue-600 text-white"
              } disabled:opacity-50`}
            >
              {isPending
                ? "Збереження…"
                : closeInjury
                ? "✅ Підтвердити допуск і закрити травму"
                : "💾 Зберегти результати чек-листа"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
