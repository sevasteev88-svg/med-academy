/**
 * mfa.ts — Бізнес-логіка двофакторної автентифікації (2FA / TOTP)
 * та генерація/валідація одноразових кодів відновлення.
 */

import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/types/database";
import type {
  MfaAssuranceLevel,
  MfaPolicyCheckResult,
} from "@/types/mfa";

/**
 * Нормалізація коду (видалення пробілів, тире, приведення до єдиного формату)
 */
export function normalizeMfaCode(input: string): string {
  if (!input) return "";
  return input.trim().replace(/[-\s]/g, "").toLowerCase();
}

/**
 * Хешування одноразового резервного коду (SHA-256) для безпечного зберігання в БД
 */
export function hashRecoveryCode(code: string): string {
  const normalized = normalizeMfaCode(code);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Генерація набору з 8 читабельних одноразових резервних кодів
 * Формат: `xxxx-xxxx-xx` (10 символів, шістнадцятковий алфавіт)
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  while (codes.length < count) {
    const raw = randomBytes(5).toString("hex"); // 10 hex символів
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
    if (!seen.has(formatted)) {
      seen.add(formatted);
      codes.push(formatted);
    }
  }

  return codes;
}

/**
 * Оцінка політики 2FA для поточної ролі та налаштувань клубу:
 * - Admin: 2FA обов'язкова (isEnrolled та AAL2)
 * - Doctor: 2FA обов'язкова, якщо ввімкнено в налаштуваннях клубу (isClubEnforced);
 *           якщо ні — добровільна (але якщо увімкнена, вимагає перевірки AAL2)
 * - Coach/Player: 2FA не вимагається
 */
export function evaluateMfaPolicy(params: {
  role: UserRole;
  isClubEnforced: boolean;
  hasMfaEnrolled: boolean;
  currentAal: MfaAssuranceLevel;
}): MfaPolicyCheckResult {
  const { role, isClubEnforced, hasMfaEnrolled, currentAal } = params;

  // 1. Портал гравця або тренер — без примусового 2FA
  if (role === "coach" || (role as string) === "player") {
    return {
      isRequired: false,
      isEnrolled: hasMfaEnrolled,
      currentAal,
      allowed: true,
      actionRequired: "none",
      reason: "Для вашої ролі 2FA є необов'язковою.",
    };
  }

  // 2. Роль Admin — завжди обов'язкова
  if (role === "admin") {
    if (!hasMfaEnrolled) {
      return {
        isRequired: true,
        isEnrolled: false,
        currentAal,
        allowed: false,
        actionRequired: "enroll",
        reason: "Для адміністратора клубу двофакторна автентифікація є обов'язковою. Будь ласка, налаштуйте 2FA.",
      };
    }

    if (currentAal !== "aal2") {
      return {
        isRequired: true,
        isEnrolled: true,
        currentAal,
        allowed: false,
        actionRequired: "verify",
        reason: "Введіть 6-значний код із додатка-автентифікатора для доступу адміністратора.",
      };
    }

    return {
      isRequired: true,
      isEnrolled: true,
      currentAal,
      allowed: true,
      actionRequired: "none",
      reason: "Адміністративний доступ із підтвердженим 2FA (AAL2).",
    };
  }

  // 3. Роль Doctor (лікар)
  const isDoctorRequired = isClubEnforced;

  if (isDoctorRequired) {
    if (!hasMfaEnrolled) {
      return {
        isRequired: true,
        isEnrolled: false,
        currentAal,
        allowed: false,
        actionRequired: "enroll",
        reason: "Політика клубу вимагає обов'язкову 2FA для медичного штабу. Будь ласка, увімкніть 2FA у профілі.",
      };
    }

    if (currentAal !== "aal2") {
      return {
        isRequired: true,
        isEnrolled: true,
        currentAal,
        allowed: false,
        actionRequired: "verify",
        reason: "Потрібно підтвердити другий фактор (код TOTP) для роботи з медичними даними.",
      };
    }

    return {
      isRequired: true,
      isEnrolled: true,
      currentAal,
      allowed: true,
      actionRequired: "none",
      reason: "Медичний доступ із захистом 2FA (AAL2).",
    };
  }

  // Якщо клубом не примусово, але лікар сам увімкнув 2FA
  if (hasMfaEnrolled && currentAal !== "aal2") {
    return {
      isRequired: false,
      isEnrolled: true,
      currentAal,
      allowed: false,
      actionRequired: "verify",
      reason: "У вашому акаунті активовано 2FA. Підтвердіть вхід одноразовим кодом.",
    };
  }

  return {
    isRequired: false,
    isEnrolled: hasMfaEnrolled,
    currentAal,
    allowed: true,
    actionRequired: "none",
    reason: "Доступ дозволено.",
  };
}

/**
 * Перевірка необхідності додаткового запиту (Step-up Verification)
 * перед критичними діями (експорт повної медкарти 5.2 або незворотне видалення).
 *
 * Якщо 2FA активовано, сесія вимагає свіжого підтвердження (за замовчуванням протягом 15 хвилин).
 */
export function isStepUpVerificationRequired(params: {
  hasMfaEnrolled: boolean;
  lastMfaVerifiedAt?: string | null;
  maxAgeMinutes?: number;
}): boolean {
  if (!params.hasMfaEnrolled) {
    return false; // Якщо у користувача взагалі немає 2FA, step-up не блокує (але аудит фіксує)
  }

  if (!params.lastMfaVerifiedAt) {
    return true; // Якщо ще не підтверджували в поточній сесії — вимагаємо
  }

  const maxAgeMs = (params.maxAgeMinutes ?? 15) * 60 * 1000;
  const elapsed = Date.now() - new Date(params.lastMfaVerifiedAt).getTime();

  return elapsed > maxAgeMs;
}
