"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, assertAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeMfaCode,
  evaluateMfaPolicy,
} from "@/lib/mfa";
import type {
  MfaAssuranceLevel,
  MfaEnrollmentResult,
  MfaPolicyCheckResult,
  MfaVerificationResult,
} from "@/types/mfa";

/**
 * 1. Отримання статусу 2FA поточного користувача та перевірка відповідності політиці клубу
 */
export async function getMfaStatusAction(): Promise<{
  success: boolean;
  policy?: MfaPolicyCheckResult;
  factors?: Array<{ id: string; status: string; friendlyName?: string }>;
  remainingRecoveryCodesCount?: number;
  enforceDoctorMfa?: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Користувач не авторизований" };
  }

  const supabase = await createClient();

  // Отримуємо фактори через Supabase MFA API
  const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr) {
    return { success: false, error: factorsErr.message };
  }

  const totpFactors = (factorsData?.totp || []).map((f) => ({
    id: f.id,
    status: f.status,
    friendlyName: f.friendly_name,
  }));

  const hasEnrolled = totpFactors.some((f) => f.status === "verified");

  // Отримуємо поточний рівень запевнення AAL
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentAal = (aalData?.currentLevel || "aal1") as MfaAssuranceLevel;

  // Отримуємо налаштування клубу щодо обов'язковості 2FA для медичного штабу
  let enforceDoctorMfa = false;
  const { data: club } = await supabase
    .from("clubs")
    .select("enforce_doctor_mfa, settings")
    .eq("id", user.clubId)
    .maybeSingle();

  if (club) {
    enforceDoctorMfa =
      Boolean((club as any).enforce_doctor_mfa) ||
      Boolean((club.settings as any)?.enforce_doctor_mfa);
  }

  // Рахуємо залишок невикористаних резервних кодів
  const { count: remainingCodesCount } = await supabase
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("used_at", null);

  const policy = evaluateMfaPolicy({
    role: user.role,
    isClubEnforced: enforceDoctorMfa,
    hasMfaEnrolled: hasEnrolled,
    currentAal,
  });

  return {
    success: true,
    policy,
    factors: totpFactors,
    remainingRecoveryCodesCount: remainingCodesCount ?? 0,
    enforceDoctorMfa,
  };
}

/**
 * 2. Початок підключення TOTP (Enrollment):
 * Генерація секрету, QR-коду та 8 одноразових резервних кодів
 */
export async function enrollMfaTotpAction(): Promise<{
  success: boolean;
  enrollment?: MfaEnrollmentResult;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Користувач не авторизований" };
  }

  const supabase = await createClient();

  // Реєструємо новий TOTP-фактор у Supabase Auth
  const { data: factor, error: enrollErr } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "MedAcademy (FC Chornomorets)",
    friendlyName: `${user.email} (${user.role})`,
  });

  if (enrollErr || !factor) {
    return { success: false, error: enrollErr?.message || "Не вдалося згенерувати TOTP фактор" };
  }

  // Генеруємо 8 одноразових резервних кодів
  const plainRecoveryCodes = generateRecoveryCodes(8);

  // Видаляємо старі незавершені коди, якщо були
  await supabase
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", user.id);

  // Зберігаємо хешовані коди у БД
  const recoveryRecords = plainRecoveryCodes.map((code) => ({
    user_id: user.id,
    code_hash: hashRecoveryCode(code),
    used_at: null,
  }));

  const { error: insertCodesErr } = await supabase
    .from("mfa_recovery_codes")
    .insert(recoveryRecords);

  if (insertCodesErr) {
    // Якщо сталася помилка з БД — скасовуємо фактор
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
    return { success: false, error: "Помилка збереження резервних кодів" };
  }

  return {
    success: true,
    enrollment: {
      factorId: factor.id,
      totpSecret: factor.totp.secret,
      qrCodeUri: factor.totp.qr_code,
      recoveryCodes: plainRecoveryCodes,
    },
  };
}

/**
 * 3. Підтвердження первинної активації TOTP перевірочним 6-значним кодом
 */
export async function verifyMfaEnrollmentAction(input: {
  factorId: string;
  code: string;
}): Promise<MfaVerificationResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Користувач не авторизований" };
  }

  const cleanCode = normalizeMfaCode(input.code);
  if (cleanCode.length !== 6) {
    return { success: false, error: "Введіть коректний 6-значний код із застосунку" };
  }

  const supabase = await createClient();

  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: cleanCode,
  });

  if (verifyErr) {
    return { success: false, error: "Невірний перевірочний код. Спробуйте ще раз." };
  }

  await logAudit({
    action: "mfa_enrolled",
    entity: "user_mfa",
    entityId: input.factorId,
    userId: user.id,
    clubId: user.clubId,
    meta: { factorType: "totp" },
  });

  revalidatePath("/admin");
  return { success: true };
}

/**
 * 4. Перевірка коду 2FA під час входу або Step-up перевірки (TOTP або резервний код)
 */
export async function verifyMfaChallengeAction(input: {
  factorId?: string;
  code: string;
  isRecoveryCode?: boolean;
}): Promise<MfaVerificationResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Користувач не авторизований" };
  }

  const supabase = await createClient();

  // Варіант А: Одноразовий резервний код відновлення
  if (input.isRecoveryCode) {
    const codeHash = hashRecoveryCode(input.code);

    const { data: matchedCode, error: findErr } = await supabase
      .from("mfa_recovery_codes")
      .select("id")
      .eq("user_id", user.id)
      .eq("code_hash", codeHash)
      .is("used_at", null)
      .maybeSingle();

    if (findErr || !matchedCode) {
      return { success: false, error: "Невірний або вже використаний резервний код" };
    }

    // Позначаємо код як використаний
    await supabase
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", matchedCode.id);

    // Отримуємо залишок невикористаних кодів
    const { count: remaining } = await supabase
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("used_at", null);

    await logAudit({
      action: "mfa_recovery_code_used",
      entity: "user_mfa",
      entityId: matchedCode.id,
      userId: user.id,
      clubId: user.clubId,
      meta: { remainingCodes: remaining ?? 0 },
    });

    return {
      success: true,
      isRecoveryCodeUsed: true,
      remainingRecoveryCodesCount: remaining ?? 0,
    };
  }

  // Варіант Б: 6-значний TOTP код
  const cleanCode = normalizeMfaCode(input.code);
  if (cleanCode.length !== 6) {
    return { success: false, error: "Код TOTP повинен містити 6 цифр" };
  }

  let factorId = input.factorId;

  // Якщо factorId не передано, беремо активний верифікований фактор користувача
  if (!factorId) {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const active = factorsData?.totp?.find((f) => f.status === "verified");
    if (!active) {
      return { success: false, error: "Активний фактор 2FA не знайдено" };
    }
    factorId = active.id;
  }

  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode,
  });

  if (verifyErr) {
    return { success: false, error: "Невірний або прострочений 6-значний код" };
  }

  await logAudit({
    action: "mfa_verified",
    entity: "user_mfa",
    entityId: factorId,
    userId: user.id,
    clubId: user.clubId,
  });

  return { success: true };
}

/**
 * 5. Вимкнення 2FA користувача (Unenroll)
 */
export async function unenrollMfaAction(input: {
  factorId: string;
  verificationCode: string;
  isRecoveryCode?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Користувач не авторизований" };
  }

  // Адміністратору заборонено вимикати 2FA за політикою системи
  if (user.role === "admin") {
    return { success: false, error: "Для ролі адміністратора 2FA є обов'язковою та не може бути вимкнена." };
  }

  // Спершу перевіряємо валідність коду для безпеки
  const verifyRes = await verifyMfaChallengeAction({
    factorId: input.factorId,
    code: input.verificationCode,
    isRecoveryCode: input.isRecoveryCode,
  });

  if (!verifyRes.success) {
    return { success: false, error: verifyRes.error || "Невірний код підтвердження для вимкнення 2FA" };
  }

  const supabase = await createClient();

  const { error: unenrollErr } = await supabase.auth.mfa.unenroll({
    factorId: input.factorId,
  });

  if (unenrollErr) {
    return { success: false, error: unenrollErr.message };
  }

  // Видаляємо всі резервні коди
  await supabase
    .from("mfa_recovery_codes")
    .delete()
    .eq("user_id", user.id);

  await logAudit({
    action: "mfa_unenrolled",
    entity: "user_mfa",
    entityId: input.factorId,
    userId: user.id,
    clubId: user.clubId,
  });

  revalidatePath("/admin");
  return { success: true };
}

/**
 * 6. Оновлення політики клубу щодо обов'язковості 2FA для медичного штабу (лише admin)
 */
export async function updateClubMfaPolicyAction(
  enforceDoctorMfa: boolean
): Promise<{ success: boolean; error?: string }> {
  const adminCheck = await assertAdmin();
  if ("error" in adminCheck) {
    return { success: false, error: adminCheck.error };
  }

  const user = adminCheck.user;
  const supabase = await createClient();

  const { error: updateErr } = await supabase
    .from("clubs")
    .update({ enforce_doctor_mfa: enforceDoctorMfa })
    .eq("id", user.clubId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  await logAudit({
    action: "update_club_mfa_policy",
    entity: "club",
    entityId: user.clubId,
    userId: user.id,
    clubId: user.clubId,
    meta: { enforceDoctorMfa },
  });

  revalidatePath("/admin");
  return { success: true };
}
