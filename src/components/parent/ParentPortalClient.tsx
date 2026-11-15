"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  GUARDIAN_RELATION_UA,
} from "@/lib/consent-constants";
import {
  submitParentConsentsAction,
  submitParentMessageAction,
} from "@/actions/parent-portal-actions";
import {
  PARENT_MESSAGE_CATEGORY_META,
  type ParentMessageCategory,
  type ParentMessageRecord,
  type ParentPortalData,
} from "@/types/parent-portal";
import type { ConsentScope } from "@/types/database";

type Props = {
  rawToken: string;
  initialData: ParentPortalData;
};

export default function ParentPortalClient({ rawToken, initialData }: Props) {
  const [data, setData] = useState<ParentPortalData>(initialData);
  const [activeTab, setActiveTab] = useState<"status" | "message" | "consents">(
    "status"
  );
  const [showOnboarding, setShowOnboarding] = useState<boolean>(
    initialData.needsOnboardingConsents && initialData.consents.missingScopes.length > 0
  );

  // Стан перемикачів згод (ЗА ЗАМОВЧУВАННЯМ ВИМКНЕНІ за стандартом GDPR)
  const [switches, setSwitches] = useState<Record<ConsentScope, boolean>>({
    data_processing: false,
    ai_processing: false,
    wearables: false,
    supplements: false,
    gps: false,
    photo: false,
  });
  const [signerName, setSignerName] = useState("");
  const [signerRelation, setSignerRelation] = useState("mother");
  const [playerAssent, setPlayerAssent] = useState(false);
  const [consentFeedback, setConsentFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан повідомлення лікарю
  const [msgCategory, setMsgCategory] = useState<ParentMessageCategory>("illness");
  const [msgText, setMsgText] = useState("");
  const [messages, setMessages] = useState<ParentMessageRecord[]>(
    initialData.messages
  );
  const [msgFeedback, setMsgFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const missingScopes = data.consents.missingScopes;
  const grantedScopesCount = ALL_CONSENT_SCOPES.length - missingScopes.length;

  const toggleScope = (scope: ConsentScope) => {
    setSwitches((prev) => ({ ...prev, [scope]: !prev[scope] }));
  };

  const handleEnableAllMissing = () => {
    setSwitches((prev) => {
      const next = { ...prev };
      for (const s of missingScopes) {
        next[s] = true;
      }
      return next;
    });
  };

  const handleSubmitConsents = (e: React.FormEvent) => {
    e.preventDefault();
    setConsentFeedback(null);

    const selectedScopes = missingScopes.filter((s) => switches[s]);
    if (!signerName.trim()) {
      setConsentFeedback({
        type: "err",
        text: "Вкажіть ваше ПІБ (законного представника).",
      });
      return;
    }
    if (selectedScopes.length === 0) {
      setConsentFeedback({
        type: "err",
        text: "Увімкніть хоча б один дозвіл або натисніть «Обрати всі дозволи».",
      });
      return;
    }

    startTransition(async () => {
      const res = await submitParentConsentsAction({
        rawToken,
        selectedScopes,
        signerFullName: signerName.trim(),
        signerRelation,
        playerAssent,
      });

      if (res.error) {
        setConsentFeedback({ type: "err", text: res.error });
        return;
      }

      // Оновлюємо локальний стан підписаних згод
      const nextMissing = missingScopes.filter((s) => !selectedScopes.includes(s));
      const nextLatest = { ...data.consents.latestByScope };
      const nowIso = new Date().toISOString();
      for (const s of selectedScopes) {
        nextLatest[s] = {
          ...(nextLatest[s] || ({} as any)),
          scope: s,
          granted_at: nowIso,
          revoked_at: null,
          evidence: { signed_by_name: signerName.trim() } as any,
        };
      }

      setData((prev) => ({
        ...prev,
        needsOnboardingConsents: false,
        consents: {
          ...prev.consents,
          latestByScope: nextLatest,
          missingScopes: nextMissing,
        },
      }));
      setShowOnboarding(false);
      setConsentFeedback({
        type: "ok",
        text: `Збережено дозволів: ${res.grantedCount}. Дякуємо!`,
      });
    });
  };

  const handleSendMessage = (
    e?: React.FormEvent,
    overrideCat?: ParentMessageCategory,
    overrideText?: string
  ) => {
    if (e) e.preventDefault();
    setMsgFeedback(null);
    const cat = overrideCat || msgCategory;
    const text = (overrideText ?? msgText).trim();
    if (text.length < 3) {
      setMsgFeedback({
        type: "err",
        text: "Напишіть короткий опис (мінімум 3 символи).",
      });
      return;
    }

    startTransition(async () => {
      const res = await submitParentMessageAction({
        rawToken,
        category: cat,
        message: text,
      });
      if (res.error) {
        setMsgFeedback({ type: "err", text: res.error });
        return;
      }
      if (res.record) {
        setMessages((prev) => [res.record!, ...prev]);
      }
      if (!overrideText) setMsgText("");
      setMsgFeedback({
        type: "ok",
        text: "Повідомлення надіслано лікарю клубу.",
      });
    });
  };

  const statusColors = {
    available: {
      bg: "bg-emerald-500/15 border-emerald-500/35",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      icon: "🟢",
    },
    restricted: {
      bg: "bg-amber-500/15 border-amber-500/35",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      icon: "🟡",
    },
    unavailable: {
      bg: "bg-rose-500/15 border-rose-500/35",
      badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      icon: "🔴",
    },
  }[data.clearance.status];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-12">
      {/* Шапка */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-lg shrink-0">
              👨‍👩‍👦
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400 truncate">
                {data.clubName} · Сімейний кабінет
              </div>
              <h1 className="text-sm sm:text-base font-black text-white truncate">
                {data.player.lastName} {data.player.firstName} ·{" "}
                <span className="text-slate-400 font-semibold">
                  {data.player.teamName}
                </span>
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            🖨️ Довідка
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* БАНЕР ПЕРШОГО ВХОДУ / ЗАПИТ УСІХ ДОЗВОЛІВ */}
        {showOnboarding && missingScopes.length > 0 && (
          <section className="rounded-2xl bg-gradient-to-br from-sky-950/90 via-slate-900 to-slate-900 border border-sky-500/40 p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-500/30 mb-1.5">
                  Перший вхід · Необхідні дозволи
                </span>
                <h2 className="text-base sm:text-lg font-black text-white">
                  Надайте дозволи для медичного супроводу дитини
                </h2>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Щоб лікар та тренер могли повноцінно стежити за здоров&apos;ям,
                  навантаженнями та відновленням, будь ласка, перегляньте та
                  увімкніть потрібні дозволи нижче.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 shrink-0 cursor-pointer"
              >
                Пізніше
              </button>
            </div>

            <form onSubmit={handleSubmitConsents} className="space-y-3">
              <div className="flex items-center justify-between gap-2 pb-1">
                <span className="text-xs font-semibold text-slate-400">
                  Доступно для підписання: {missingScopes.length}
                </span>
                <button
                  type="button"
                  onClick={handleEnableAllMissing}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition cursor-pointer"
                >
                  ✓ Обрати всі дозволи ({missingScopes.length})
                </button>
              </div>

              <div className="space-y-2">
                {missingScopes.map((scope) => {
                  const meta = CONSENT_SCOPE_META[scope];
                  const active = switches[scope];
                  return (
                    <label
                      key={scope}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                        active
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleScope(scope)}
                        className="mt-1 h-4 w-4 rounded border-slate-600 accent-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{meta.icon}</span>
                          <span className="text-xs sm:text-sm font-bold text-white">
                            {meta.label}
                          </span>
                          {!meta.isOptional && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                              Базовий
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          {meta.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    ПІБ законного представника *
                  </label>
                  <input
                    type="text"
                    required
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Напр.: Коваленко Олена Сергіївна"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Ким доводитесь гравцю
                  </label>
                  <select
                    value={signerRelation}
                    onChange={(e) => setSignerRelation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                  >
                    {Object.entries(GUARDIAN_RELATION_UA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {data.player.isTeenAssentApplicable && (
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={playerAssent}
                    onChange={(e) => setPlayerAssent(e.target.checked)}
                    className="h-4 w-4 rounded accent-sky-500"
                  />
                  Підтверджую, що гравець (14–17 років) ознайомлений та згоден (асенс)
                </label>
              )}

              {consentFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold ${
                    consentFeedback.type === "ok"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {consentFeedback.text}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Link
                  href="/privacy"
                  className="text-[11px] text-sky-400 hover:underline"
                >
                  Політика конфіденційності
                </Link>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition cursor-pointer"
                >
                  {isPending ? "Збереження..." : "Підтвердити обрані дозволи"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* НАВІГАЦІЯ ВКЛАДОК */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("status")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "status"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📌 Стан і допуск
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("message")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "message"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💬 Написати лікарю
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("consents")}
            className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "consents"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>✍️ Дозволи</span>
            {missingScopes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {missingScopes.length}
              </span>
            )}
          </button>
        </div>

        {/* ВКЛАДКА 1: СТАН, ДОПУСК, ЛФК, PHV, СТРУС МОЗКУ */}
        {activeTab === "status" && (
          <div className="space-y-4">
            {/* Картка допуску */}
            <section className={`rounded-2xl border p-5 space-y-2.5 ${statusColors.bg}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Поточний медичний допуск
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${statusColors.badge}`}
                >
                  <span>{statusColors.icon}</span>
                  {data.clearance.title}
                </span>
              </div>

              <p className="text-sm text-slate-100 leading-relaxed">
                {data.clearance.description}
              </p>

              {data.clearance.restrictionsNotes && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                  <span className="font-bold text-slate-200">Висновок лікаря: </span>
                  {data.clearance.restrictionsNotes}
                </div>
              )}

              <div className="pt-1 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                <span>
                  Плановий медогляд:{" "}
                  {data.clearance.screeningValidUntil ? (
                    <strong
                      className={
                        data.clearance.screeningExpired
                          ? "text-rose-300"
                          : "text-emerald-300"
                      }
                    >
                      дійсний до{" "}
                      {new Date(data.clearance.screeningValidUntil).toLocaleDateString(
                        "uk-UA"
                      )}
                      {data.clearance.screeningExpired ? " (потребує оновлення)" : ""}
                    </strong>
                  ) : (
                    <span>очікує внесення</span>
                  )}
                </span>
              </div>
            </section>

            {/* Пам'ятка при струсі мозку (якщо активний) */}
            {data.concussionCare.isActive && (
              <section className="rounded-2xl bg-rose-950/40 border border-rose-500/40 p-5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧠</span>
                  <h2 className="text-sm sm:text-base font-black text-rose-200">
                    Пам&apos;ятка батькам при підозрі / струсі мозку
                  </h2>
                </div>
                {data.concussionCare.stageTitle && (
                  <div className="text-xs font-bold text-amber-300">
                    Поточний етап відновлення (GRTP {data.concussionCare.stageNumber}/6):{" "}
                    {data.concussionCare.stageTitle}
                  </div>
                )}
                {data.concussionCare.activities && (
                  <p className="text-xs text-slate-200">
                    <strong>Режим зараз:</strong> {data.concussionCare.activities}
                  </p>
                )}
                <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
                  <li>Перші 24–48 годин максимально обмежте екранний час (телефон, ігри, ТБ).</li>
                  <li>Не давайте знеболювальні без погодження з лікарем у першу добу.</li>
                  <li>
                    <strong className="text-rose-300">Терміново до лікаря / швидкої</strong>,
                    якщо з&apos;явились: повторне блювання, наростаючий головний біль, двоїння в
                    очах, сильна сонливість чи порушення мовлення.
                  </li>
                </ul>
              </section>
            )}

            {/* Домашнє ЛФК / Реабілітація */}
            {(data.rehab.activeInjuryLabel || data.rehab.exercises.length > 0) && (
              <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                      <span>🏋️</span> Домашнє ЛФК та відновлення
                    </h2>
                    {data.rehab.rtpPhaseLabel && (
                      <p className="text-xs text-sky-400 font-semibold mt-0.5">
                        {data.rehab.rtpPhaseLabel}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleSendMessage(
                        undefined,
                        "lfk_done",
                        "Домашній комплекс ЛФК виконано сьогодні вдома."
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition cursor-pointer"
                  >
                    ✅ Позначити ЛФК виконаним
                  </button>
                </div>

                {data.rehab.exercises.length > 0 ? (
                  <div className="space-y-2">
                    {data.rehab.exercises.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-white">{ex.name}</div>
                          {ex.notes && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {ex.notes}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-sky-300">
                            {ex.setsReps}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {ex.frequency}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Індивідуальний комплекс домашніх вправ ще не призначено лікарем.
                  </p>
                )}
              </section>
            )}

            {/* Ріст і дозрівання (PHV) */}
            {data.growth.title && (
              <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <h2 className="text-sm font-black text-white">
                    {data.growth.title}
                  </h2>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {data.growth.advice}
                </p>
              </section>
            )}

            {/* Вижимка для сімейного лікаря / педіатра */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>🩺</span> Картка для сімейного лікаря / педіатра
                </h2>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="text-xs text-sky-400 hover:underline print:hidden cursor-pointer"
                >
                  Друкувати / PDF
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">
                    Група крові
                  </div>
                  <div className="text-white font-bold mt-0.5">
                    {data.pediatricSummary.bloodType || "Не вказано"}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">
                    Алергії
                  </div>
                  <div className="text-white font-bold mt-0.5">
                    {data.pediatricSummary.allergies.length > 0
                      ? data.pediatricSummary.allergies.join(", ")
                      : "Не зафіксовано"}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">
                    Особливості анамнезу
                  </div>
                  <div className="text-white font-bold mt-0.5">
                    {data.pediatricSummary.chronicConditions.length > 0
                      ? data.pediatricSummary.chronicConditions.join(", ")
                      : "Без особливостей"}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ВКЛАДКА 2: ПОВІДОМИТИ ЛІКАРЯ */}
        {activeTab === "message" && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h2 className="text-sm font-black text-white">
                Повідомити лікаря клубу про стан дитини
              </h2>
              <p className="text-xs text-slate-400">
                Якщо у дитини піднялась температура, стався забій вдома або ви
                пропускаєте тренування — напишіть сюди до початку заняття.
              </p>

              <form onSubmit={(e) => handleSendMessage(e)} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    Object.keys(PARENT_MESSAGE_CATEGORY_META) as ParentMessageCategory[]
                  ).map((cat) => {
                    const meta = PARENT_MESSAGE_CATEGORY_META[cat];
                    const selected = msgCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setMsgCategory(cat)}
                        className={`text-left px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                          selected
                            ? "bg-sky-600/25 border-sky-500/50 text-white"
                            : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  rows={3}
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder={PARENT_MESSAGE_CATEGORY_META[msgCategory].placeholder}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-sky-500"
                />

                {msgFeedback && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-semibold ${
                      msgFeedback.type === "ok"
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {msgFeedback.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition cursor-pointer"
                  >
                    {isPending ? "Надсилання..." : "Надіслати лікарю"}
                  </button>
                </div>
              </form>
            </section>

            {/* Історія повідомлень */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Історія звернень ({messages.length})
              </h3>
              {messages.length === 0 ? (
                <p className="text-xs text-slate-500">Поки що звернень немає.</p>
              ) : (
                <div className="space-y-2">
                  {messages.map((m) => {
                    const meta = PARENT_MESSAGE_CATEGORY_META[m.category];
                    return (
                      <div
                        key={m.id}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold text-sky-300">
                            {meta?.icon} {meta?.label || m.category}
                          </span>
                          <span className="text-slate-500">
                            {new Date(m.created_at).toLocaleString("uk-UA", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {m.is_read_by_staff ? " · ✓ Прочитано штабом" : ""}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200">{m.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ВКЛАДКА 3: ДОЗВОЛИ ТА ЗГОДИ */}
        {activeTab === "consents" && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-sm font-black text-white">
                    Дозволи на обробку даних ({grantedScopesCount}/{ALL_CONSENT_SCOPES.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Прозорий контроль, які саме дані клуб має право використовувати.
                  </p>
                </div>
                {missingScopes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowOnboarding(true)}
                    className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition cursor-pointer"
                  >
                    + Надати відсутні дозволи
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {ALL_CONSENT_SCOPES.map((scope) => {
                  const meta = CONSENT_SCOPE_META[scope];
                  const signed = data.consents.latestByScope[scope];
                  const isActive = Boolean(signed && !signed.revoked_at);
                  return (
                    <div
                      key={scope}
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                        isActive
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-slate-950 border-slate-800"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {isActive ? "✓ Надано" : "Не надано"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
