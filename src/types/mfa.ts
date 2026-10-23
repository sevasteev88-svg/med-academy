/**
 * mfa.ts — Типи та інтерфейси для двофакторної автентифікації (2FA / Supabase MFA TOTP)
 *
 * Відповідає вимогам:
 * - Роль admin: MFA обов'язкова за замовчуванням
 * - Роль doctor: MFA вмикається налаштуванням клубу (enforce_doctor_mfa) або добровільно
 * - Портал гравця (player): MFA не застосовується
 * - Одноразові резервні коди відновлення (8 штук, хешовані SHA-256)
 * - Step-up перевірка перед експортом медичної карти (5.2) та видаленням даних
 */

import type { UserRole } from "@/types/database";

export type MfaAssuranceLevel = "aal1" | "aal2";

export type MfaFactorType = "totp";

export type MfaFactorStatus = "unverified" | "verified";

export type MfaFactor = {
  id: string;
  factor_type: MfaFactorType;
  status: MfaFactorStatus;
  friendly_name?: string;
  created_at: string;
  updated_at: string;
};

export type MfaRecoveryCodeRecord = {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: string | null;
  created_at: string;
};

export type MfaEnrollmentResult = {
  factorId: string;
  totpSecret: string;
  qrCodeUri: string;
  recoveryCodes: string[];
};

export type MfaPolicyCheckResult = {
  isRequired: boolean;
  isEnrolled: boolean;
  currentAal: MfaAssuranceLevel;
  allowed: boolean;
  actionRequired?: "enroll" | "verify" | "none";
  reason: string;
};

export interface MfaVerificationResult {
  success: boolean;
  isRecoveryCodeUsed?: boolean;
  remainingRecoveryCodesCount?: number;
  error?: string;
}
