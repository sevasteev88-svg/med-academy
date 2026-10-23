"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getMfaStatusAction,
  enrollMfaTotpAction,
  verifyMfaEnrollmentAction,
  unenrollMfaAction,
  updateClubMfaPolicyAction,
} from "@/actions/mfa-actions";
import type { MfaEnrollmentResult, MfaPolicyCheckResult } from "@/types/mfa";

type Props = {
  userRole?: string;
  className?: string;
};

export default function MfaSetupCard({ userRole = "doctor", className = "" }: Props) {
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<MfaPolicyCheckResult | null>(null);
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([]);
  const [remainingCodes, setRemainingCodes] = useState<number>(0);
  const [enforceDoctorMfa, setEnforceDoctorMfa] = useState<boolean>(false);

  // Enrollment flow states
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<MfaEnrollmentResult | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // Unenroll flow states
  const [showUnenrollConfirm, setShowUnenrollConfirm] = useState(false);
  const [unenrollCode, setUnenrollCode] = useState("");

  const [isPending, startTransition] = useTransition();

  const loadStatus = async () => {
    setLoading(true);
    const res = await getMfaStatusAction();
    if (res.success && res.policy) {
      setPolicy(res.policy);
      setFactors(res.factors || []);
      setRemainingCodes(res.remainingRecoveryCodesCount || 0);
      setEnforceDoctorMfa(Boolean(res.enforceDoctorMfa));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Початок реєстрації TOTP
  const handleStartEnrollment = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await enrollMfaTotpAction();
      if (res.success && res.enrollment) {
        setEnrollData(res.enrollment);
        setIsEnrolling(true);
      } else {
        setFeedback({ type: "error", message: res.error || "Не вдалося ініціалізувати 2FA" });
      }
    });
  };

  // Затвердження кодом
  const handleConfirmEnrollment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await verifyMfaEnrollmentAction({
        factorId: enrollData.factorId,
        code: verificationCode,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          message: "Двофакторну автентифікацію успішно активовано! Збережіть ваші резервні коди.",
        });
        setIsEnrolling(false);
        setVerificationCode("");
        loadStatus();
      } else {
        setFeedback({ type: "error", message: res.error || "Невірний код перевірки" });
      }
    });
  };

  // Вимкнення 2FA
  const handleUnenroll = (e: React.FormEvent) => {
    e.preventDefault();
    const activeFactor = factors.find((f) => f.status === "verified");
    if (!activeFactor) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await unenrollMfaAction({
        factorId: activeFactor.id,
        verificationCode: unenrollCode,
      });

      if (res.success) {
        setFeedback({ type: "success", message: "2FA успішно вимкнено" });
        setShowUnenrollConfirm(false);
        setUnenrollCode("");
        loadStatus();
      } else {
        setFeedback({ type: "error", message: res.error || "Помилка при вимкненні" });
      }
    });
  };

  // Зміна налаштування клубу для лікарів (лише Admin)
  const handleToggleClubPolicy = (val: boolean) => {
    startTransition(async () => {
      const res = await updateClubMfaPolicyAction(val);
      if (res.success) {
        setEnforceDoctorMfa(val);
        setFeedback({
          type: "success",
          message: val
            ? "Обов'язкову 2FA для медичного штабу ввімкнено"
            : "Вимогу 2FA для медичного штабу переведено в добровільний режим",
        });
        loadStatus();
      } else {
        setFeedback({ type: "error", message: res.error || "Помилка оновлення політики клубу" });
      }
    });
  };

  const isEnrolled = Boolean(policy?.isEnrolled);
  const isAdmin = userRole === "admin";

  if (loading) {
    return (
      <div className={`p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs animate-pulse ${className}`}>
        Завантаження статусу безпеки 2FA...
      </div>
    );
  }

  return (
    <div className={`p-5 rounded-2xl bg-slate-900/90 border border-sky-500/20 space-y-5 shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-500/15 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-xl shadow-inner">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Двофакторна автентифікація (2FA / TOTP)
              </h3>
              {isEnrolled ? (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Активна (AAL2)
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Вимкнена
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Захист медичних даних та операцій експорту через додаток-автентифікатор
            </p>
          </div>
        </div>

        {/* Кнопка дії */}
        {!isEnrolling && (
          <div>
            {!isEnrolled ? (
              <button
                type="button"
                onClick={handleStartEnrollment}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-md transition disabled:opacity-50"
              >
                + Налаштувати 2FA
              </button>
            ) : (
              !isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowUnenrollConfirm(!showUnenrollConfirm)}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition"
                >
                  {showUnenrollConfirm ? "Скасувати" : "Вимкнути 2FA"}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Політика клубу та попередження */}
      {isAdmin && (
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-sky-500/15 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">
              Політика клубу: Вимагати 2FA для медичного штабу (лікарів)
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enforceDoctorMfa}
                onChange={(e) => handleToggleClubPolicy(e.target.checked)}
                disabled={isPending}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Якщо увімкнено, жоден лікар клубу не зможе зайти без активації 2FA та підтвердження кодом.
          </p>
        </div>
      )}

      {/* Сповіщення зворотного зв'язку */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs border ${
            feedback.type === "success"
              ? "bg-emerald-950/40 text-emerald-200 border-emerald-500/40"
              : "bg-rose-950/40 text-rose-200 border-rose-500/40"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Стан АКТИВНОЇ 2FA */}
      {isEnrolled && !showUnenrollConfirm && (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-sky-500/15 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              Одноразові коди відновлення (Backup Codes):
            </span>
            <span className="font-mono font-bold text-sky-400">
              {remainingCodes} з 8 залишилось
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            Використовуйте додаток <strong>Google Authenticator</strong>, <strong>Apple Passwords</strong> або <strong>1Password</strong> під час входу та перед експортом медичних даних.
          </div>

          {remainingCodes < 3 && remainingCodes > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              ⚠️ Залишилося менше 3 резервних кодів. Рекомендуємо оновити 2FA, щоб отримати новий комплект кодів.
            </div>
          )}
        </div>
      )}

      {/* Діалог вимкнення */}
      {showUnenrollConfirm && (
        <form onSubmit={handleUnenroll} className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/40 space-y-3 text-xs">
          <div className="font-bold text-rose-200">
            Вимкнення двофакторної автентифікації
          </div>
          <p className="text-[11px] text-slate-400">
            Введіть поточний 6-значний код із застосунку або резервний код для підтвердження вимкнення:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="123456 або код відновлення"
              value={unenrollCode}
              onChange={(e) => setUnenrollCode(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
            />
            <button
              type="submit"
              disabled={isPending || !unenrollCode.trim()}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition disabled:opacity-50"
            >
              Підтвердити
            </button>
          </div>
        </form>
      )}

      {/* Форма підключення 2FA (Enrollment Flow) */}
      {isEnrolling && enrollData && (
        <form onSubmit={handleConfirmEnrollment} className="p-5 rounded-xl bg-slate-950/80 border border-sky-500/30 space-y-4 text-xs">
          <div className="font-bold text-white text-sm border-b border-slate-800 pb-2">
            Крок 1: Відскануйте QR-код застосунком-автентифікатором
          </div>

          <div className="flex flex-col md:flex-row items-center gap-5">
            {/* QR Code Container */}
            <div className="p-3 bg-white rounded-xl shadow-lg flex items-center justify-center shrink-0">
              {enrollData.qrCodeUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={enrollData.qrCodeUri}
                  alt="2FA QR Code"
                  className="w-44 h-44 object-contain"
                />
              ) : (
                <div className="w-44 h-44 bg-slate-200 text-slate-700 flex items-center justify-center text-center p-2 text-[11px]">
                  Не вдалося згенерувати QR
                </div>
              )}
            </div>

            {/* Текстовий ключ для ручного вводу */}
            <div className="space-y-3 flex-1 w-full">
              <div>
                <label className="block text-slate-400 font-bold mb-1">
                  Або введіть секретний ключ вручну:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={enrollData.totpSecret}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono text-sky-300 text-xs select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(enrollData.totpSecret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition shrink-0"
                  >
                    {copiedSecret ? "✓ Скопійовано" : "Копіювати"}
                  </button>
                </div>
              </div>

              {/* 8 Одноразових резервних кодів */}
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    🔑 Одноразові коди відновлення (8 шт):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(enrollData.recoveryCodes.join("\n"));
                      setCopiedRecovery(true);
                      setTimeout(() => setCopiedRecovery(false), 2000);
                    }}
                    className="text-[11px] text-amber-400 hover:underline"
                  >
                    {copiedRecovery ? "✓ Всі скопійовано" : "Скопіювати всі"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Збережіть ці коди в надійному місці. Вони допоможуть увійти, якщо ви втратите доступ до телефону.
                </p>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {enrollData.recoveryCodes.map((code, idx) => (
                    <span
                      key={idx}
                      className="font-mono text-[11px] bg-slate-900/80 px-2 py-1 rounded text-slate-300 border border-slate-800 text-center"
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Крок 2: Введення 6-значного коду */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <label className="block text-white font-bold">
              Крок 2: Введіть 6-значний код із застосунку для підтвердження активації:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                className="max-w-[200px] bg-slate-900 border border-sky-500/40 rounded-xl p-2.5 text-center text-lg tracking-widest text-white font-mono font-bold focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                disabled={isPending || verificationCode.length !== 6}
                className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition shadow-lg disabled:opacity-50"
              >
                {isPending ? "Перевірка..." : "Активувати 2FA"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEnrolling(false);
                  setEnrollData(null);
                }}
                className="px-3 py-2.5 rounded-xl text-slate-400 hover:text-white transition"
              >
                Скасувати
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
