"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  GUARDIAN_RELATION_UA,
} from "@/lib/consent-constants";
import {
  submitParentAttendanceAction,
  submitParentConsentsAction,
  submitParentEmergencyContactsAction,
  submitParentMessageAction,
  submitParentPediatricAnamnesisAction,
  submitParentWellnessAction,
  uploadParentMedicalCertificateAction,
} from "@/actions/parent-portal-actions";
import {
  PARENT_MESSAGE_CATEGORY_META,
  type ParentMessageCategory,
  type ParentMessageRecord,
  type ParentPortalData,
} from "@/types/parent-portal";
import { PAIN_LOCATIONS_LIST } from "@/types/wellness";
import type { ConsentScope } from "@/types/database";
import ParentWellnessQuiz from "./ParentWellnessQuiz";
import SubscriptionPaywall from "@/components/portal/SubscriptionPaywall";

type Props = {
  rawToken: string;
  initialData: ParentPortalData;
};

export default function ParentPortalClient({ rawToken, initialData }: Props) {
  const [data, setData] = useState<ParentPortalData>(initialData);
  const [activeTab, setActiveTab] = useState<
    "status" | "schedule" | "message" | "consents"
  >("status");
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

  // Стан ранкового самопочуття (лише для дітей < 14 років)
  const [wellnessMode, setWellnessMode] = useState<"quiz" | "form">("quiz");
  const [wellnessSubmitted, setWellnessSubmitted] = useState<boolean>(
    Boolean(initialData.wellnessToday?.alreadySubmitted)
  );
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [sleepHours, setSleepHours] = useState<string>("9");
  const [fatigue, setFatigue] = useState<number>(4);
  const [soreness, setSoreness] = useState<number>(4);
  const [hasPain, setHasPain] = useState<boolean>(false);
  const [painLocations, setPainLocations] = useState<string[]>([]);
  const [hasIllness, setHasIllness] = useState<boolean>(false);
  const [wellnessNotes, setWellnessNotes] = useState<string>("");
  const [wellnessFeedback, setWellnessFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан медичної картки (група крові, алергії, хронічні захворювання)
  const hasInitialPediatricData = Boolean(
    initialData.pediatricSummary.bloodType ||
      initialData.pediatricSummary.allergies.length > 0 ||
      initialData.pediatricSummary.chronicConditions.length > 0
  );
  const [isEditingPediatric, setIsEditingPediatric] = useState<boolean>(
    !hasInitialPediatricData
  );
  const [pediatricBloodType, setPediatricBloodType] = useState<string>(
    initialData.pediatricSummary.bloodType || ""
  );
  const [hasAllergies, setHasAllergies] = useState<boolean>(
    initialData.pediatricSummary.allergies.length > 0
  );
  const [allergiesText, setAllergiesText] = useState<string>(
    initialData.pediatricSummary.allergies.join(", ")
  );
  const [hasChronic, setHasChronic] = useState<boolean>(
    initialData.pediatricSummary.chronicConditions.length > 0
  );
  const [chronicText, setChronicText] = useState<string>(
    initialData.pediatricSummary.chronicConditions.join(", ")
  );
  const [pediatricFeedback, setPediatricFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан екстрених контактів сім'ї
  const hasInitialEc = Boolean(
    initialData.emergencyContacts.primaryName &&
      initialData.emergencyContacts.primaryPhone
  );
  const [isEditingEc, setIsEditingEc] = useState<boolean>(!hasInitialEc);
  const [ecPrimaryName, setEcPrimaryName] = useState<string>(
    initialData.emergencyContacts.primaryName
  );
  const [ecPrimaryPhone, setEcPrimaryPhone] = useState<string>(
    initialData.emergencyContacts.primaryPhone
  );
  const [ecSecondaryName, setEcSecondaryName] = useState<string>(
    initialData.emergencyContacts.secondaryName
  );
  const [ecSecondaryPhone, setEcSecondaryPhone] = useState<string>(
    initialData.emergencyContacts.secondaryPhone
  );
  const [ecPickup, setEcPickup] = useState<string>(
    initialData.emergencyContacts.pickupAuthorized
  );
  const [ecDoctorPhone, setEcDoctorPhone] = useState<string>(
    initialData.emergencyContacts.familyDoctorPhone
  );
  const [ecFeedback, setEcFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан присутності на тренуванні (1 клік)
  const [attendanceStatus, setAttendanceStatus] = useState<
    "attending" | "absent" | null
  >(initialData.schedule.todayAttendanceStatus);
  const [attendanceNote, setAttendanceNote] = useState<string>("");
  const [attendanceFeedback, setAttendanceFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан завантаження довідки від педіатра
  const [certTitle, setCertTitle] = useState<string>("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certFeedback, setCertFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Стан продовження підписки у вкладці Дозволи та підписка
  const [showRenewPaywall, setShowRenewPaywall] = useState<boolean>(false);

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

  const togglePainLocation = (locId: string) => {
    setPainLocations((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  };

  const handleSubmitWellness = (e: React.FormEvent) => {
    e.preventDefault();
    setWellnessFeedback(null);
    startTransition(async () => {
      const parsedHours = sleepHours.trim() ? Number(sleepHours) : null;
      const res = await submitParentWellnessAction({
        rawToken,
        sleepQuality,
        sleepHours: parsedHours !== null && Number.isFinite(parsedHours) ? parsedHours : null,
        fatigue,
        soreness,
        pain: hasPain,
        painLocations: hasPain ? painLocations : [],
        illness: hasIllness,
        notes: wellnessNotes.trim() || null,
      });
      if (res.error) {
        setWellnessFeedback({ type: "err", text: res.error });
        return;
      }
      setWellnessSubmitted(true);
      setWellnessFeedback({
        type: "ok",
        text: "Ранковий чекін збережено. Дякуємо!",
      });
    });
  };

  const handleSubmitPediatric = (e: React.FormEvent) => {
    e.preventDefault();
    setPediatricFeedback(null);

    const parsedAllergies = hasAllergies
      ? allergiesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const parsedChronic = hasChronic
      ? chronicText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (hasAllergies && parsedAllergies.length === 0) {
      setPediatricFeedback({
        type: "err",
        text: "Вкажіть, на що саме є алергія (через кому), або оберіть «Алергій немає».",
      });
      return;
    }
    if (hasChronic && parsedChronic.length === 0) {
      setPediatricFeedback({
        type: "err",
        text: "Вкажіть хронічні захворювання чи особливості, або оберіть «Немає».",
      });
      return;
    }

    startTransition(async () => {
      const res = await submitParentPediatricAnamnesisAction({
        rawToken,
        bloodType: pediatricBloodType || null,
        allergies: parsedAllergies,
        chronicConditions: parsedChronic,
      });

      if (res.error) {
        setPediatricFeedback({ type: "err", text: res.error });
        return;
      }

      if (res.pediatricSummary) {
        setData((prev) => ({
          ...prev,
          pediatricSummary: res.pediatricSummary!,
        }));
      }
      setIsEditingPediatric(false);
      setPediatricFeedback({
        type: "ok",
        text: "Медичні дані збережено та передано лікарю клубу.",
      });
    });
  };

  const handleSubmitEc = (e: React.FormEvent) => {
    e.preventDefault();
    setEcFeedback(null);
    startTransition(async () => {
      const res = await submitParentEmergencyContactsAction({
        rawToken,
        primaryName: ecPrimaryName,
        primaryPhone: ecPrimaryPhone,
        secondaryName: ecSecondaryName,
        secondaryPhone: ecSecondaryPhone,
        pickupAuthorized: ecPickup,
        familyDoctorPhone: ecDoctorPhone,
      });
      if (res.error) {
        setEcFeedback({ type: "err", text: res.error });
        return;
      }
      if (res.emergencyContacts) {
        setData((prev) => ({
          ...prev,
          emergencyContacts: res.emergencyContacts!,
        }));
      }
      setIsEditingEc(false);
      setEcFeedback({
        type: "ok",
        text: "Екстрені контакти збережено.",
      });
    });
  };

  const handleAttendanceClick = (status: "attending" | "absent") => {
    setAttendanceFeedback(null);
    startTransition(async () => {
      const res = await submitParentAttendanceAction({
        rawToken,
        status,
        note: attendanceNote,
      });
      if (res.error) {
        setAttendanceFeedback({ type: "err", text: res.error });
        return;
      }
      setAttendanceStatus(status);
      if (res.record) {
        setMessages((prev) => [res.record!, ...prev]);
      }
      setAttendanceNote("");
      setAttendanceFeedback({
        type: "ok",
        text:
          status === "attending"
            ? "Повідомлено: дитина буде на тренуванні."
            : "Повідомлено тренера та лікаря: дитина сьогодні пропустить тренування.",
      });
    });
  };

  const handleUploadCertificate = (e: React.FormEvent) => {
    e.preventDefault();
    setCertFeedback(null);
    if (!certFile) {
      setCertFeedback({
        type: "err",
        text: "Оберіть файл довідки (PDF або фото).",
      });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append("rawToken", rawToken);
      fd.append("title", certTitle);
      fd.append("file", certFile);
      const res = await uploadParentMedicalCertificateAction(fd);
      if (res.error) {
        setCertFeedback({ type: "err", text: res.error });
        return;
      }
      if (res.record) {
        setMessages((prev) => [res.record!, ...prev]);
      }
      setCertTitle("");
      setCertFile(null);
      setCertFeedback({
        type: "ok",
        text: "Довідку завантажено та передано лікарю клубу.",
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
        {!data.subscription.isActive ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-500/15 border border-amber-500/40 p-4 text-xs text-amber-200 flex items-start gap-3">
              <span className="text-lg shrink-0">💳</span>
              <div className="space-y-1">
                <div className="font-bold text-amber-100">
                  Доступ до Сімейного кабінету обмежено до оплати підписки
                </div>
                <p className="text-amber-200/80 leading-relaxed">
                  Після оплати підписки відкриється повний доступ до ранкового квізу самопочуття, статусу допуску, дозволів та зв&apos;язку з лікарем.
                </p>
              </div>
            </div>

            <SubscriptionPaywall
              playerId={data.player.id}
              parentToken={rawToken}
              playerName={`${data.player.lastName} ${data.player.firstName}`}
              teamName={data.player.teamName}
              subscription={{
                status: data.subscription.status,
                amount_uah: data.subscription.amountUah,
                current_period_end: data.subscription.currentPeriodEnd ?? undefined,
                grace_period_ends_at: data.subscription.gracePeriodEndsAt ?? undefined,
              }}
            />
          </div>
        ) : (
          <>
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

        {/* НАВІГАЦІЯ ВКЛАДОК (4 компактні вкладки) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("status")}
            className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
              activeTab === "status"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📌 Стан і допуск
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
              activeTab === "schedule"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            📅 Графік і побут
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("message")}
            className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer ${
              activeTab === "message"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            💬 Лікар і довідки
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("consents")}
            className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === "consents"
                ? "bg-sky-600/30 text-white border border-sky-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🛡️ Дозволи та підписка</span>
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
                <button
                  type="button"
                  onClick={() => setActiveTab("message")}
                  className="text-sky-400 hover:underline font-semibold cursor-pointer print:hidden"
                >
                  Завантажити довідку →
                </button>
              </div>
            </section>

            {/* Нагадування про плановий медогляд (якщо протерміновано або < 30 днів або не внесено) */}
            {(!data.clearance.screeningValidUntil ||
              data.clearance.screeningExpired ||
              (new Date(data.clearance.screeningValidUntil).getTime() - Date.now()) /
                86400000 <=
                30) && (
              <section className="rounded-2xl bg-amber-950/30 border border-amber-500/35 p-4 space-y-2 print:hidden">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-black text-amber-200 flex items-center gap-1.5">
                    <span>🩺</span> Нагадування про плановий медогляд
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("message")}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[11px] font-bold transition cursor-pointer"
                  >
                    Надіслати довідку
                  </button>
                </div>
                <p className="text-[11px] text-amber-100/80 leading-relaxed">
                  Для спортивного допуску зазвичай потрібні: ЕКГ у спокої, огляд педіатра/спортивного лікаря та загальний аналіз крові. Готову довідку можна завантажити у вкладці «Лікар і довідки».
                </p>
              </section>
            )}

            {/* Ранкове самопочуття дитини (ТІЛЬКИ для гравців < 14 років) */}
            {data.player.age < 14 && (
              <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 print:hidden">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                      <span>🌤️</span> Ранкове самопочуття дитини (заповнюють батьки)
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Короткий ранковий чекін допомагає лікарю та тренеру адаптувати навантаження.
                    </p>
                  </div>

                  {!wellnessSubmitted && (
                    <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setWellnessMode("quiz")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          wellnessMode === "quiz"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "text-slate-400 hover:text-white border border-transparent"
                        }`}
                      >
                        📋 Квіз (як у гравця)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWellnessMode("form")}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          wellnessMode === "form"
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "text-slate-400 hover:text-white border border-transparent"
                        }`}
                      >
                        📝 Швидка форма
                      </button>
                    </div>
                  )}
                </div>

                {wellnessSubmitted ? (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs font-bold text-emerald-300">
                    ✓ Сьогоднішній чекін вже заповнено
                  </div>
                ) : wellnessMode === "quiz" ? (
                  <ParentWellnessQuiz
                    playerFirstName={data.player.firstName}
                    sleepQuality={sleepQuality}
                    setSleepQuality={setSleepQuality}
                    sleepHours={sleepHours}
                    setSleepHours={setSleepHours}
                    fatigue={fatigue}
                    setFatigue={setFatigue}
                    soreness={soreness}
                    setSoreness={setSoreness}
                    hasPain={hasPain}
                    setHasPain={setHasPain}
                    painLocations={painLocations}
                    onTogglePainLocation={togglePainLocation}
                    hasIllness={hasIllness}
                    setHasIllness={setHasIllness}
                    wellnessNotes={wellnessNotes}
                    setWellnessNotes={setWellnessNotes}
                    wellnessFeedback={wellnessFeedback}
                    isPending={isPending}
                    onSubmit={handleSubmitWellness}
                  />
                ) : (
                  <form onSubmit={handleSubmitWellness} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Якість сну (1 — погано, 5 — чудово)
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setSleepQuality(n)}
                              className={`py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                sleepQuality === n
                                  ? "bg-sky-600/30 border-sky-500 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Тривалість сну (год)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          value={sleepHours}
                          onChange={(e) => setSleepHours(e.target.value)}
                          placeholder="Напр.: 9"
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Бадьорість (1 — виснажений, 5 — бадьорий)
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setFatigue(n)}
                              className={`py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                fatigue === n
                                  ? "bg-sky-600/30 border-sky-500 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          М&apos;язи / крепатура (1 — сильний біль, 5 — свіжі)
                        </label>
                        <div className="grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setSoreness(n)}
                              className={`py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                soreness === n
                                  ? "bg-sky-600/30 border-sky-500 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasPain}
                          onChange={(e) => setHasPain(e.target.checked)}
                          className="h-4 w-4 rounded accent-amber-500"
                        />
                        <span>Є біль або дискомфорт</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasIllness}
                          onChange={(e) => setHasIllness(e.target.checked)}
                          className="h-4 w-4 rounded accent-rose-500"
                        />
                        <span>Є ознаки нездужання / застуди</span>
                      </label>
                    </div>

                    {hasPain && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-semibold text-slate-400">
                          Де саме болить? (оберіть зони)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {PAIN_LOCATIONS_LIST.map((loc) => {
                            const selected = painLocations.includes(loc.id);
                            return (
                              <button
                                key={loc.id}
                                type="button"
                                onClick={() => togglePainLocation(loc.id)}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                                  selected
                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                                }`}
                              >
                                {loc.icon} {loc.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <input
                        type="text"
                        value={wellnessNotes}
                        onChange={(e) => setWellnessNotes(e.target.value)}
                        placeholder="Коротка примітка (за бажанням, напр. погано спав)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {wellnessFeedback && (
                      <div
                        className={`p-2.5 rounded-xl text-xs font-semibold ${
                          wellnessFeedback.type === "ok"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {wellnessFeedback.text}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                      >
                        {isPending ? "Збереження..." : "Зберегти ранковий чекін"}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}

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
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                    <span>🩺</span> Картка для сімейного лікаря / педіатра
                  </h2>
                  {!hasInitialPediatricData && isEditingPediatric && (
                    <p className="text-[11px] text-amber-300/90 mt-0.5">
                      Будь ласка, заповніть базові медичні дані дитини при першому вході.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 print:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setPediatricFeedback(null);
                      setIsEditingPediatric((v) => !v);
                    }}
                    className="text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    {isEditingPediatric ? "Скасувати" : "✏️ Редагувати"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-xs text-sky-400 hover:underline cursor-pointer"
                  >
                    Друкувати / PDF
                  </button>
                </div>
              </div>

              {pediatricFeedback && !isEditingPediatric && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold ${
                    pediatricFeedback.type === "ok"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {pediatricFeedback.text}
                </div>
              )}

              {isEditingPediatric ? (
                <form onSubmit={handleSubmitPediatric} className="space-y-3 pt-1 print:hidden">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                      Група крові та резус-фактор
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "O (I) Rh+",
                        "O (I) Rh-",
                        "A (II) Rh+",
                        "A (II) Rh-",
                        "B (III) Rh+",
                        "B (III) Rh-",
                        "AB (IV) Rh+",
                        "AB (IV) Rh-",
                      ].map((bt) => (
                        <button
                          key={bt}
                          type="button"
                          onClick={() =>
                            setPediatricBloodType((prev) => (prev === bt ? "" : bt))
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                            pediatricBloodType === bt
                              ? "bg-sky-500/25 border-sky-400 text-white"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {bt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      Алергії (медикаменти, їжа, пилок тощо)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHasAllergies(false)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          !hasAllergies
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Алергій немає
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasAllergies(true)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          hasAllergies
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Є алергії
                      </button>
                    </div>
                    {hasAllergies && (
                      <input
                        type="text"
                        value={allergiesText}
                        onChange={(e) => setAllergiesText(e.target.value)}
                        placeholder="Вкажіть через кому (напр. пеніцилін, горіхи, амброзія)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-400">
                      Хронічні захворювання або особливості анамнезу
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHasChronic(false)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          !hasChronic
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Немає / без особливостей
                      </button>
                      <button
                        type="button"
                        onClick={() => setHasChronic(true)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          hasChronic
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Є хронічні стани
                      </button>
                    </div>
                    {hasChronic && (
                      <input
                        type="text"
                        value={chronicText}
                        onChange={(e) => setChronicText(e.target.value)}
                        placeholder="Вкажіть через кому (напр. бронхіальна астма, міопія)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    )}
                  </div>

                  {pediatricFeedback && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-semibold ${
                        pediatricFeedback.type === "ok"
                          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {pediatricFeedback.text}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isPending ? "Збереження..." : "Зберегти медичну картку"}
                    </button>
                  </div>
                </form>
              ) : (
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
              )}
            </section>

            {/* Історія самопочуття за останні 14 днів */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3 print:hidden">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>📊</span> Історія самопочуття (останні 14 днів)
                </h2>
                <span className="text-[11px] text-slate-400">
                  Записів: {data.wellnessHistory.length}
                </span>
              </div>

              {data.wellnessHistory.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Поки що немає заповнених анкет за останні 14 днів.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-1.5 h-20 pt-2 px-1">
                    {data.wellnessHistory.map((item) => {
                      const pct = Math.max(20, Math.min(100, Math.round((item.totalScore / 20) * 100)));
                      const barColor =
                        item.readinessStatus === "optimal"
                          ? "bg-emerald-500"
                          : item.readinessStatus === "warning"
                          ? "bg-amber-400"
                          : "bg-rose-500";
                      return (
                        <div
                          key={item.date}
                          className="flex-1 flex flex-col items-center gap-1 group"
                          title={`${item.date}: Сон ${item.sleepQuality}/5, Бадьорість ${item.fatigue}/5, М'язи ${item.soreness}/5`}
                        >
                          <div className="w-full bg-slate-950 rounded-t-md h-14 flex items-end overflow-hidden border border-slate-800/70">
                            <div
                              style={{ height: `${pct}%` }}
                              className={`w-full ${barColor} transition-all`}
                            />
                          </div>
                          <span className="text-[9px] font-mono text-slate-500">
                            {item.date.slice(8, 10)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>🟢 Оптимально · 🟡 Увага · 🔴 Ризик</span>
                    <span>Останній сон: {data.wellnessHistory[data.wellnessHistory.length - 1]?.sleepQuality}/5</span>
                  </div>
                </div>
              )}
            </section>

            {/* Екстрені контакти сім'ї та довірених осіб */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>📞</span> Екстрені контакти сім&apos;ї
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setEcFeedback(null);
                    setIsEditingEc((v) => !v);
                  }}
                  className="text-xs font-semibold text-slate-300 hover:text-white cursor-pointer print:hidden"
                >
                  {isEditingEc ? "Скасувати" : "✏️ Редагувати"}
                </button>
              </div>

              {ecFeedback && !isEditingEc && (
                <div className="p-2.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {ecFeedback.text}
                </div>
              )}

              {isEditingEc ? (
                <form onSubmit={handleSubmitEc} className="space-y-3 print:hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Основний контакт (Мама / Тато) *
                      </label>
                      <input
                        type="text"
                        required
                        value={ecPrimaryName}
                        onChange={(e) => setEcPrimaryName(e.target.value)}
                        placeholder="Напр.: Олена Іванова"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Телефон основного контакту *
                      </label>
                      <input
                        type="tel"
                        required
                        value={ecPrimaryPhone}
                        onChange={(e) => setEcPrimaryPhone(e.target.value)}
                        placeholder="+380 67 000 00 00"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Запасний контакт
                      </label>
                      <input
                        type="text"
                        value={ecSecondaryName}
                        onChange={(e) => setEcSecondaryName(e.target.value)}
                        placeholder="Напр.: Сергій Іванов (тато)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Телефон запасного контакту
                      </label>
                      <input
                        type="tel"
                        value={ecSecondaryPhone}
                        onChange={(e) => setEcSecondaryPhone(e.target.value)}
                        placeholder="+380 50 000 00 00"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Хто забирає з тренувань / матчів
                      </label>
                      <input
                        type="text"
                        value={ecPickup}
                        onChange={(e) => setEcPickup(e.target.value)}
                        placeholder="Батьки / бабуся / самостійно"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Телефон сімейного лікаря / педіатра
                      </label>
                      <input
                        type="tel"
                        value={ecDoctorPhone}
                        onChange={(e) => setEcDoctorPhone(e.target.value)}
                        placeholder="За бажанням"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  {ecFeedback && (
                    <div className="p-2.5 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      {ecFeedback.text}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                    >
                      {isPending ? "Збереження..." : "Зберегти контакти"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-bold">
                      Основний контакт
                    </div>
                    <div className="text-white font-bold mt-0.5">
                      {data.emergencyContacts.primaryName || "Не вказано"}
                    </div>
                    <div className="text-sky-400 font-mono text-[11px]">
                      {data.emergencyContacts.primaryPhone || "—"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-bold">
                      Запасний контакт
                    </div>
                    <div className="text-white font-bold mt-0.5">
                      {data.emergencyContacts.secondaryName || "Не вказано"}
                    </div>
                    <div className="text-sky-400 font-mono text-[11px]">
                      {data.emergencyContacts.secondaryPhone || "—"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-bold">
                      Хто забирає
                    </div>
                    <div className="text-white font-semibold mt-0.5">
                      {data.emergencyContacts.pickupAuthorized || "Не вказано"}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-500 text-[10px] uppercase font-bold">
                      Педіатр / сімейний лікар
                    </div>
                    <div className="text-white font-mono text-[11px] mt-0.5">
                      {data.emergencyContacts.familyDoctorPhone || "Не вказано"}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ВКЛАДКА 2: ГРАФІК І ПОБУТ */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            {/* Відмітка присутності в 1 клік */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>✅</span> Присутність на сьогоднішньому тренуванні
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Повідомте тренера та лікаря в 1 клік, чи буде {data.player.firstName} на занятті.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAttendanceClick("attending")}
                  className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    attendanceStatus === "attending"
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-200"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span>✅</span> Буде на тренуванні
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAttendanceClick("absent")}
                  className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    attendanceStatus === "absent"
                      ? "bg-rose-500/20 border-rose-500 text-rose-200"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span>🚫</span> Не буде сьогодні
                </button>
              </div>

              <input
                type="text"
                value={attendanceNote}
                onChange={(e) => setAttendanceNote(e.target.value)}
                placeholder="Коротка причина (за бажанням, напр. школа / застуда / сімейні справи)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
              />

              {attendanceFeedback && (
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold ${
                    attendanceFeedback.type === "ok"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {attendanceFeedback.text}
                </div>
              )}
            </section>

            {/* Найближчі тренування / матчі */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>📅</span> Найближчі заняття ({data.player.teamName})
              </h2>
              {data.schedule.upcomingSessions.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Розклад найближчих тренувань і матчів оновлюється тренером команди.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.schedule.upcomingSessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{s.sessionType === "match" ? "⚽" : "🏃"}</span>
                        <span>{s.title}</span>
                      </div>
                      <span className="font-mono text-sky-300 text-[11px]">
                        {new Date(s.date).toLocaleDateString("uk-UA", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Харчування та гідратація */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <span>💧</span> Харчування та гідратація
              </h2>
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    Звичайний день
                  </div>
                  <div className="text-lg font-black text-sky-300 mt-0.5">
                    {(data.nutritionAndHydration.dailyWaterMl / 1000).toFixed(1)} л
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {data.nutritionAndHydration.weightKg
                      ? `Розрахунок на вагу ${data.nutritionAndHydration.weightKg} кг`
                      : "Базова норма води"}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                  <div className="text-slate-400 text-[10px] uppercase font-bold">
                    День тренування / матчу
                  </div>
                  <div className="text-lg font-black text-emerald-300 mt-0.5">
                    {(data.nutritionAndHydration.trainingDayWaterMl / 1000).toFixed(1)} л
                  </div>
                  <div className="text-[10px] text-slate-400">
                    +500 мл для відновлення
                  </div>
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-slate-300 pt-1">
                {data.nutritionAndHydration.recoveryTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-sky-400">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              {data.nutritionAndHydration.supplements.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">
                    Призначено лікарем клубу:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.nutritionAndHydration.supplements.map((sup) => (
                      <span
                        key={sup.name}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200"
                      >
                        💊 {sup.name}
                        {sup.dosage ? ` — ${sup.dosage}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ВКЛАДКА 3: ЛІКАР І ДОВІДКИ */}
        {activeTab === "message" && (
          <div className="space-y-4">
            {/* Прямий зв'язок з лікарем клубу */}
            {(data.doctorContact?.telegramUrl || data.doctorContact?.phone) && (
              <section className="rounded-2xl bg-gradient-to-br from-sky-950/80 via-slate-900 to-slate-900 border border-sky-500/40 p-5 space-y-3 shadow-lg">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                      <span>👨‍⚕️</span> Прямий зв&apos;язок з лікарем клубу
                    </h2>
                    {data.doctorContact?.name && (
                      <div className="text-xs font-semibold text-sky-300 mt-0.5">
                        {data.doctorContact.name}
                      </div>
                    )}
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      Для термінових запитань про травму чи самопочуття ви можете написати лікарю напряму в Telegram або зателефонувати. Форма нижче також зберігає звернення в медкарту і дублює його в мед-чат клубу.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {data.doctorContact?.telegramUrl && (
                    <a
                      href={data.doctorContact.telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-sky-950/40"
                    >
                      <span>💬</span>
                      <span>Написати лікарю в Telegram</span>
                    </a>
                  )}
                  {data.doctorContact?.phone && (
                    <a
                      href={`tel:${data.doctorContact.phone.replace(/[\s()-]/g, "")}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs sm:text-sm font-bold transition"
                    >
                      <span>📞</span>
                      <span>Зателефонувати ({data.doctorContact.phone})</span>
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Завантаження довідки від педіатра / аналізів */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>📎</span> Завантажити довідку або результати аналізів
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Фото або PDF (до 10 МБ) — файл буде передано безпосередньо лікарю клубу.
                </p>
              </div>
              <form onSubmit={handleUploadCertificate} className="space-y-2.5">
                <input
                  type="text"
                  value={certTitle}
                  onChange={(e) => setCertTitle(e.target.value)}
                  placeholder="Назва документа (напр. Довідка від педіатра / ЕКГ)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-sky-300 hover:file:bg-slate-700 cursor-pointer"
                />
                {certFeedback && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-semibold ${
                      certFeedback.type === "ok"
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {certFeedback.text}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                  >
                    {isPending ? "Завантаження..." : "Надіслати довідку лікарю"}
                  </button>
                </div>
              </form>
            </section>

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

        {/* ВКЛАДКА 4: ДОЗВОЛИ ТА ПІДПИСКА */}
        {activeTab === "consents" && (
          <div className="space-y-4">
            {/* Статус підписки та продовження */}
            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                    <span>💳</span> Підписка на Паспорт здоров&apos;я
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {data.subscription.status === "comped"
                      ? "Стипендіальний доступ від клубу"
                      : data.subscription.billingInterval === "year"
                      ? "Річний абонемент · 2 000 грн / рік"
                      : "Щомісячний план · 200 грн / міс"}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  ✓ Активна
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">
                    Оплачено до
                  </div>
                  <div className="text-white font-bold mt-0.5">
                    {data.subscription.currentPeriodEnd
                      ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString("uk-UA")
                      : "—"}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">
                    Статус / Тариф
                  </div>
                  <div className="text-sky-300 font-bold mt-0.5">
                    {data.subscription.status === "comped"
                      ? "Квота клубу"
                      : `${data.subscription.amountUah} грн`}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowRenewPaywall((v) => !v)}
                  className="px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-xs font-bold transition cursor-pointer"
                >
                  {showRenewPaywall ? "Сховати форму оплати" : "Продовжити або змінити тариф"}
                </button>
              </div>

              {showRenewPaywall && (
                <div className="pt-2">
                  <SubscriptionPaywall
                    playerId={data.player.id}
                    parentToken={rawToken}
                    playerName={`${data.player.lastName} ${data.player.firstName}`}
                    teamName={data.player.teamName}
                    subscription={{
                      status: data.subscription.status,
                      amount_uah: data.subscription.amountUah,
                      current_period_end: data.subscription.currentPeriodEnd ?? undefined,
                      grace_period_ends_at: data.subscription.gracePeriodEndsAt ?? undefined,
                    }}
                  />
                </div>
              )}
            </section>

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
          </>
        )}
      </main>
    </div>
  );
}
