"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  GUARDIAN_RELATION_UA,
} from "@/lib/consent-constants";
import {
  requestConsentOtpAction,
  submitConsentWithOtpAction,
  revokeConsentWithOtpAction,
} from "@/actions/consent-actions";
import type { ConsentScope, ConsentDocument, Consent } from "@/types/database";

type Props = {
  rawToken: string;
  initialData: {
    request: {
      id: string;
      scopes: ConsentScope[];
      sentAt: string;
      expiresAt: string;
      usedAt: string | null;
      isExpired: boolean;
      otpAttempts: number;
    };
    clubName: string;
    player: {
      id: string;
      firstName: string;
      lastName: string;
      age: number;
      isMinor: boolean;
      isTeenAssentApplicable: boolean;
    };
    guardian: {
      id: string | null;
      fullName: string;
      relation: string;
      maskedPhone: string;
    };
    documents: Record<ConsentScope, ConsentDocument>;
    latestByScope: Record<string, Consent>;
  };
};

export default function PublicConsentPortalClient({
  rawToken,
  initialData,
}: Props) {
  const hasExistingSigned = Object.values(initialData.latestByScope).some(
    (c) => !c.revoked_at
  );

  // Режими: 'form' (надання згоди) або 'my_consents' («Мої згоди» — квитанція та відкликання з OTP)
  const [mode, setMode] = useState<"form" | "my_consents">(
    initialData.request.usedAt || hasExistingSigned ? "my_consents" : "form"
  );

  // ЗА УМОВОЮ п. 2: кожна область окремим ПЕРЕМИКАЧЕМ, ЗА ЗАМОВЧУВАННЯМ ВИМКНЕНІ, не пов'язані між собою!
  const [switches, setSwitches] = useState<Record<ConsentScope, boolean>>({
    data_processing: false,
    ai_processing: false,
    wearables: false,
    supplements: false,
    gps: false,
    photo: false,
  });

  // Розгорнутий повний текст документа для кожної області
  const [expandedDocs, setExpandedDocs] = useState<Record<ConsentScope, boolean>>({
    data_processing: true,
    ai_processing: false,
    wearables: false,
    supplements: false,
    gps: false,
    photo: false,
  });

  const defaultSignerName =
    initialData.guardian.fullName ||
    (!initialData.player.isMinor
      ? `${initialData.player.lastName} ${initialData.player.firstName}`
      : "");

  const [signerFullName, setSignerFullName] = useState(defaultSignerName);
  const [signerRelation, setSignerRelation] = useState(
    initialData.guardian.relation ||
      (initialData.player.isMinor ? "mother" : "self")
  );
  const [playerAssent, setPlayerAssent] = useState(false);

  // Стан OTP (5 спроб, термін 10 хвилин)
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Стан квитанції після успішного підписання
  const [receipt, setReceipt] = useState<{
    grantedAt: string;
    receiptText: string;
    scopes: Array<{ scope: ConsentScope; label: string; version: string }>;
  } | null>(null);

  // Стан для відкликання у вкладці «Мої згоди»
  const [revokeScopes, setRevokeScopes] = useState<ConsentScope[]>([]);
  const [revokeOtpSent, setRevokeOtpSent] = useState(false);
  const [revokeOtpCode, setRevokeOtpCode] = useState("");
  const [revokeSuccessMsg, setRevokeSuccessMsg] = useState<string | null>(null);
  const [localLatest, setLocalLatest] = useState<Record<string, Consent>>(
    initialData.latestByScope
  );

  const toggleSwitch = (scope: ConsentScope) => {
    setSwitches((prev) => ({
      ...prev,
      [scope]: !prev[scope],
    }));
  };

  const selectedScopes = ALL_CONSENT_SCOPES.filter((s) => switches[s]);

  const handleRequestOtp = (purpose: "grant" | "revoke") => {
    setErrorMsg(null);
    if (purpose === "grant") {
      if (selectedScopes.length === 0) {
        setErrorMsg(
          "Увімкніть хоча б одну область згоди (перемикачем у пункті 1 вище) перед запитом коду OTP."
        );
        return;
      }
      if (!signerFullName.trim()) {
        setErrorMsg(
          initialData.player.isMinor
            ? "Вкажіть ПІБ законного представника (пункт 2 вище) перед запитом коду OTP."
            : "Вкажіть ПІБ гравця (пункт 2 вище) перед запитом коду OTP."
        );
        return;
      }
    } else {
      if (revokeScopes.length === 0) {
        setErrorMsg("Оберіть хоча б одну область для відкликання згоди.");
        return;
      }
    }

    startTransition(async () => {
      const res = await requestConsentOtpAction({
        rawToken,
        purpose,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else {
        if (purpose === "grant") {
          setOtpSent(true);
        } else {
          setRevokeOtpSent(true);
        }
        if (res.devOtpCode) {
          setDevOtpHint(res.devOtpCode);
        }
      }
    });
  };

  const handleSubmitConsent = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const res = await submitConsentWithOtpAction({
        rawToken,
        otpCode,
        selectedScopes,
        signerFullName,
        signerRelation,
        playerAssent,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.success) {
        setReceipt({
          grantedAt: res.grantedAt!,
          receiptText: res.receiptText!,
          scopes: res.scopes!,
        });
        // Оновлюємо локальний стан для вкладки «Мої згоди»
        const nextMap = { ...localLatest };
        for (const sc of selectedScopes) {
          nextMap[sc] = {
            id: `local_${sc}`,
            club_id: "",
            player_id: initialData.player.id,
            guardian_id: initialData.guardian.id,
            scope: sc,
            document_id: initialData.documents[sc].id,
            method: initialData.player.isMinor ? "link_otp" : "adult_self",
            granted_at: res.grantedAt!,
            revoked_at: null,
            evidence: {
              signer_full_name: signerFullName,
              signer_relation: signerRelation,
              document_version: initialData.documents[sc].version,
              otp_verified: true,
            },
            scan_path: null,
            collected_by: null,
          };
        }
        setLocalLatest(nextMap);
        setOtpSent(false);
        setOtpCode("");
        setDevOtpHint(null);
        setMode("my_consents");
      }
    });
  };

  const handleRevokeWithOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRevokeSuccessMsg(null);

    startTransition(async () => {
      const res = await revokeConsentWithOtpAction({
        rawToken,
        otpCode: revokeOtpCode,
        scopesToRevoke: revokeScopes,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.success) {
        const nextMap = { ...localLatest };
        for (const sc of revokeScopes) {
          if (nextMap[sc]) {
            nextMap[sc] = {
              ...nextMap[sc],
              revoked_at: res.revokedAt!,
            };
          }
        }
        setLocalLatest(nextMap);
        setRevokeScopes([]);
        setRevokeOtpSent(false);
        setRevokeOtpCode("");
        setDevOtpHint(null);
        setRevokeSuccessMsg(
          `Згоду успішно відкликано (${new Date(res.revokedAt!).toLocaleString(
            "uk-UA"
          )}). Функції обраних областей негайно вимкнено, а дані позначено згідно з політикою клубу (${
            res.revocationPolicy === "delete" ? "для видалення" : "для знеособлення"
          }).`
        );
      }
    });
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Шапка клубу та гравця */}
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-sky-500/25 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-sky-400">
                Офіційний портал інформованих згод
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                {initialData.clubName}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("form")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  mode === "form"
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                }`}
              >
                ✍️ Надати згоду
              </button>
              <button
                type="button"
                onClick={() => setMode("my_consents")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  mode === "my_consents"
                    ? "bg-sky-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                }`}
              >
                📋 Мої згоди (Квитанція / Відкликання)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-400 block">Ім&apos;я та прізвище гравця (дитини):</span>
              <span className="text-base font-bold text-white">
                {initialData.player.lastName} {initialData.player.firstName}
              </span>{" "}
              <span className="text-slate-400">({initialData.player.age} років)</span>
            </div>
            <div>
              <span className="text-slate-400 block">Телефон для SMS-підтвердження (OTP):</span>
              <span className="font-mono font-bold text-sky-300">
                {initialData.guardian.maskedPhone}
              </span>
            </div>
          </div>
        </div>

        {/* Тестова підказка з кодом OTP (п. 12) */}
        {devOtpHint && (
          <div className="p-4 rounded-2xl bg-sky-950/90 border-2 border-sky-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
            <div>
              <div className="font-bold text-sky-300 flex items-center gap-1.5">
                <span>🧪</span> Тестовий режим (Заглушка відправки SMS)
              </div>
              <div className="text-slate-300 mt-0.5">
                Ваш одноразовий код підтвердження (OTP):{" "}
                <strong className="text-base font-mono text-white bg-slate-900 px-2.5 py-0.5 rounded border border-sky-400">
                  {devOtpHint}
                </strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (mode === "form") setOtpCode(devOtpHint);
                else setRevokeOtpCode(devOtpHint);
              }}
              className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold shrink-0"
            >
              Підставити код автоматично
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            РЕЖИМ 1: ФОРМА НАДАННЯ ЗГОДИ (ПЕРЕМИКАЧІ ВИМКНЕНІ ЗА ЗАМОВЧУВАННЯМ)
           ══════════════════════════════════════════════════════════════ */}
        {mode === "form" && (
          <form onSubmit={handleSubmitConsent} className="space-y-5">
            {initialData.request.isExpired && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                Термін дії цього запиту (7 днів) закінчився. Ви можете переглянути або відкликати раніше надані згоди у вкладці «Мої згоди».
              </div>
            )}

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white">
                  1. Оберіть області згоди (кожна окремим перемикачем)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Усі перемикачі за замовчуванням вимкнені та не пов&apos;язані між собою. Ви можете увімкнути всі або лише окремі області.
                </p>
              </div>

              <div className="space-y-3">
                {ALL_CONSENT_SCOPES.map((scope) => {
                  const meta = CONSENT_SCOPE_META[scope];
                  const doc = initialData.documents[scope];
                  const isOn = switches[scope];
                  const isExpanded = expandedDocs[scope];

                  return (
                    <div
                      key={scope}
                      className={`p-4 rounded-2xl border transition-all ${
                        isOn
                          ? "bg-sky-950/30 border-sky-500/50"
                          : "bg-slate-950/60 border-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{meta.icon}</span>
                            <span className="text-sm font-bold text-white">
                              {meta.label}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700">
                              Версія v{doc.version}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {meta.description}
                          </p>
                        </div>

                        {/* Незалежний ПЕРЕМИКАЧ (Switch) — за замовчуванням вимкнений */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isOn}
                          onClick={() => toggleSwitch(scope)}
                          className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isOn ? "bg-emerald-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                              isOn ? "translate-x-6" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/80">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDocs((prev) => ({
                              ...prev,
                              [scope]: !prev[scope],
                            }))
                          }
                          className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                        >
                          <span>
                            {isExpanded
                              ? "▼ Сховати повний текст документа"
                              : "▶ Показати повний текст актуальної версії документа"}
                          </span>
                          <span>(v{doc.version})</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-2.5 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                            <div className="font-bold text-white mb-2">
                              {doc.title} (Версія v{doc.version})
                            </div>
                            {doc.body_markdown}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Дані законного представника (або гравця 18+) */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 text-xs">
              <h2 className="text-sm font-bold text-white">
                2. Відомості про підписанта
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {initialData.player.isMinor
                      ? "ПІБ законного представника *"
                      : "ПІБ гравця (18+) або законного представника *"}
                  </label>
                  <input
                    type="text"
                    required
                    value={signerFullName}
                    onChange={(e) => setSignerFullName(e.target.value)}
                    placeholder="Введіть Прізвище Ім'я По батькові"
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-white transition-colors ${
                      !signerFullName.trim() && errorMsg
                        ? "border-rose-500 ring-1 ring-rose-500"
                        : "border-slate-700"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Ступінь спорідненості *
                  </label>
                  <select
                    value={signerRelation}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSignerRelation(val);
                      if (val === "self" && !signerFullName.trim()) {
                        setSignerFullName(
                          `${initialData.player.lastName} ${initialData.player.firstName}`
                        );
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white"
                  >
                    <option value="mother">Мати</option>
                    <option value="father">Батько</option>
                    <option value="guardian">Опікун / Піклувальник</option>
                    {!initialData.player.isMinor && (
                      <option value="self">Особисто (повнолітній гравець 18+)</option>
                    )}
                    <option value="other">Інший законний представник</option>
                  </select>
                </div>
              </div>

              {/* Для 14–17 років: додаткова відмітка «Гравець ознайомлений» (assent, п. 5) */}
              {initialData.player.isTeenAssentApplicable && (
                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={playerAssent}
                    onChange={(e) => setPlayerAssent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-indigo-500"
                  />
                  <div>
                    <div className="font-bold text-indigo-200">
                      Гравець ознайомлений (вік 14–17 років)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Підтверджую, що спортсмен ({initialData.player.lastName}{" "}
                      {initialData.player.firstName}) особисто ознайомлений з умовами обробки даних (Assent).
                    </div>
                  </div>
                </label>
              )}
            </div>

            {/* 3. Підтвердження одноразовим кодом OTP (5 спроб, 10 хвилин) */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-sky-500/30 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    3. Підтвердження кодом OTP (SMS)
                  </h2>
                  <p className="text-slate-400 mt-0.5">
                    Запис згоди створюється лише після перевірки одноразового коду (діє 10 хвилин, максимум 5 спроб).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRequestOtp("grant")}
                  disabled={isPending || initialData.request.isExpired}
                  className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shrink-0 disabled:opacity-50 transition-colors"
                >
                  {isPending
                    ? "Відправка..."
                    : otpSent
                    ? "Надіслати код повторно"
                    : "📲 Отримати код OTP"}
                </button>
              </div>

              {/* Сповіщення про помилку валідації прямо в розділі 3 */}
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between">
                  <span>⚠️ {errorMsg}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
                    className="text-rose-400 hover:text-white text-sm px-1.5"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Тестова підказка з кодом OTP прямо в блоці введення */}
              {devOtpHint && (
                <div className="p-3.5 rounded-xl bg-sky-950/90 border-2 border-sky-400 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
                  <div>
                    <div className="font-bold text-sky-300 flex items-center gap-1.5">
                      <span>🧪</span> Тестовий режим (OTP код):
                    </div>
                    <div className="text-slate-200 mt-1">
                      Код підтвердження:{" "}
                      <strong className="text-base font-mono text-white bg-slate-900 px-2.5 py-0.5 rounded border border-sky-400 ml-1">
                        {devOtpHint}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtpHint)}
                    className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold shrink-0"
                  >
                    Вставити код
                  </button>
                </div>
              )}

              {otpSent && (
                <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Введіть 6-значний код OTP"
                    className="w-full sm:w-64 bg-slate-950 border border-sky-400 rounded-xl px-4 py-2.5 text-center font-mono text-base font-bold tracking-widest text-white"
                  />
                  <button
                    type="submit"
                    disabled={isPending || otpCode.trim().length < 6}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    {isPending
                      ? "Перевірка..."
                      : `✓ Підписати та надіслати згоду (${selectedScopes.length})`}
                  </button>
                </div>
              )}
            </div>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════════════
            РЕЖИМ 2: «МОЇ ЗГОДИ» — КВИТАНЦІЯ ТА ВІДКЛИКАННЯ З ПОВТОРНИМ OTP
           ══════════════════════════════════════════════════════════════ */}
        {mode === "my_consents" && (
          <div className="space-y-5">
            {receipt && (
              <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-emerald-300">
                    ✅ Згоду успішно зареєстровано! Квитанцію надіслано.
                  </span>
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 font-bold"
                  >
                    🖨️ Завантажити / Друк PDF-квитанції
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/20 text-slate-200 font-mono text-[11px] whitespace-pre-wrap">
                  {receipt.receiptText}
                </pre>
              </div>
            )}

            {revokeSuccessMsg && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-semibold">
                {revokeSuccessMsg}
              </div>
            )}

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Мої згоди — Поточний статус по областях
                  </h2>
                  <p className="text-slate-400 mt-0.5">
                    Ви можете у будь-який момент відкликати згоду по одній або кількох областях (з підтвердженням OTP).
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {ALL_CONSENT_SCOPES.map((sc) => {
                  const rec = localLatest[sc];
                  const meta = CONSENT_SCOPE_META[sc];
                  const doc = initialData.documents[sc];
                  const isActive = rec && !rec.revoked_at;
                  const isSelectedForRevoke = revokeScopes.includes(sc);

                  return (
                    <div
                      key={sc}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Актуальна версія: v{doc.version}
                          {rec?.granted_at
                            ? ` · Надано: ${new Date(
                                rec.granted_at
                              ).toLocaleString("uk-UA")} (v${
                                rec.evidence?.document_version || "1.0"
                              })`
                            : ""}
                          {rec?.revoked_at
                            ? ` · Відкликано: ${new Date(
                                rec.revoked_at
                              ).toLocaleString("uk-UA")}`
                            : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isActive ? (
                          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelectedForRevoke}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRevokeScopes((prev) => [...prev, sc]);
                                } else {
                                  setRevokeScopes((prev) =>
                                    prev.filter((x) => x !== sc)
                                  );
                                }
                              }}
                              className="rounded accent-rose-500"
                            />
                            <span className="font-bold">Обрати для відкликання</span>
                          </label>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 font-semibold">
                            {rec?.revoked_at ? "✕ Відкликано" : "— Не надано"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Блок відкликання з OTP */}
              {revokeScopes.length > 0 && (
                <form
                  onSubmit={handleRevokeWithOtp}
                  className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-3"
                >
                  <div className="font-bold text-rose-200">
                    Відкликання обраних областей ({revokeScopes.length}) з підтвердженням OTP
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Після відкликання відповідна функція вимикається одразу, а зібрані дані цієї області позначаються для видалення або знеособлення за налаштуванням клубу.
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {errorMsg && (
                      <div className="w-full p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold">
                        ⚠️ {errorMsg}
                      </div>
                    )}
                    {devOtpHint && revokeOtpSent && (
                      <div className="w-full p-2.5 rounded-lg bg-sky-950/80 border border-sky-400 text-xs flex items-center justify-between">
                        <span>🧪 Тестовий OTP код: <strong className="text-white font-mono">{devOtpHint}</strong></span>
                        <button type="button" onClick={() => setRevokeOtpCode(devOtpHint)} className="px-2 py-1 rounded bg-sky-500 text-white font-bold">Вставити</button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRequestOtp("revoke")}
                      disabled={isPending}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    >
                      {isPending
                        ? "Відправка..."
                        : revokeOtpSent
                        ? "Надіслати код повторно"
                        : "📲 Отримати код OTP для відкликання"}
                    </button>

                    {revokeOtpSent && (
                      <>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={revokeOtpCode}
                          onChange={(e) => setRevokeOtpCode(e.target.value)}
                          placeholder="Код OTP (6 цифр)"
                          className="bg-slate-950 border border-rose-400 rounded-xl px-3.5 py-2 font-mono font-bold text-white w-44 text-center"
                        />
                        <button
                          type="submit"
                          disabled={isPending || revokeOtpCode.trim().length < 6}
                          className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold"
                        >
                          Підтвердити відкликання
                        </button>
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Футер */}
        <div className="text-center text-xs text-slate-500 flex items-center justify-center gap-4">
          <Link href="/privacy" className="text-sky-400 hover:underline">
            Політика конфіденційності та шаблони документів (/privacy)
          </Link>
        </div>
      </div>
    </div>
  );
}
