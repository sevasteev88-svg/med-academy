import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeMfaCode,
  evaluateMfaPolicy,
  isStepUpVerificationRequired,
} from "../src/lib/mfa.ts";

describe("5.5 Двофакторна автентифікація (Supabase MFA / TOTP)", () => {
  describe("1. Генерація та криптографічне хешування одноразових резервних кодів", () => {
    it("генерує рівно 8 унікальних читабельних кодів відновлення", () => {
      const codes = generateRecoveryCodes(8);
      assert.equal(codes.length, 8);
      const unique = new Set(codes);
      assert.equal(unique.size, 8);
    });

    it("формат кожного коду відповідає xxxx-xxxx-xx (10 hex символів)", () => {
      const codes = generateRecoveryCodes(8);
      const pattern = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{2}$/;
      for (const code of codes) {
        assert.ok(pattern.test(code), `Код ${code} не відповідає формату`);
      }
    });

    it("normalizeMfaCode очищає дефіси та пробіли", () => {
      assert.equal(normalizeMfaCode(" a1b2 - c3d4 - e5 "), "a1b2c3d4e5");
      assert.equal(normalizeMfaCode("123 456"), "123456");
      assert.equal(normalizeMfaCode(""), "");
    });

    it("hashRecoveryCode детермінований і повертає 64-символьний SHA-256 hex", () => {
      const code1 = "A1B2-C3D4-E5";
      const code2 = "a1b2c3d4e5";
      const hash1 = hashRecoveryCode(code1);
      const hash2 = hashRecoveryCode(code2);

      assert.equal(hash1.length, 64);
      assert.equal(hash1, hash2); // Однаковий хеш незалежно від регістру та дефісів
    });

    it("різні коди генерують різні криптографічні хеші", () => {
      const hashA = hashRecoveryCode("1111-2222-33");
      const hashB = hashRecoveryCode("4444-5555-66");
      assert.notEqual(hashA, hashB);
    });
  });

  describe("2. Політика 2FA для адміністратора (Admin Policy — Обов'язкова)", () => {
    it("блокує адміністратора без налаштованого 2FA з вимогою підключитись (enroll)", () => {
      const policy = evaluateMfaPolicy({
        role: "admin",
        isClubEnforced: false, // Навіть якщо в клубі вимкнено — для admin завжди обов'язково
        hasMfaEnrolled: false,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, true);
      assert.equal(policy.allowed, false);
      assert.equal(policy.actionRequired, "enroll");
      assert.ok(policy.reason.includes("обов'язковою"));
    });

    it("вимагає введення коду (verify), якщо адміністратор підключив 2FA, але сесія на рівні AAL1", () => {
      const policy = evaluateMfaPolicy({
        role: "admin",
        isClubEnforced: false,
        hasMfaEnrolled: true,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, true);
      assert.equal(policy.allowed, false);
      assert.equal(policy.actionRequired, "verify");
      assert.ok(policy.reason.includes("додатка-автентифікатора"));
    });

    it("дозволяє повний доступ адміністратору з підтвердженим рівнем AAL2", () => {
      const policy = evaluateMfaPolicy({
        role: "admin",
        isClubEnforced: false,
        hasMfaEnrolled: true,
        currentAal: "aal2",
      });

      assert.equal(policy.isRequired, true);
      assert.equal(policy.allowed, true);
      assert.equal(policy.actionRequired, "none");
    });
  });

  describe("3. Політика 2FA для медичного штабу (Doctor Policy — Налаштування клубу)", () => {
    it("якщо клуб увімкнув enforce_doctor_mfa, вимагає 2FA від лікаря", () => {
      const policy = evaluateMfaPolicy({
        role: "doctor",
        isClubEnforced: true,
        hasMfaEnrolled: false,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, true);
      assert.equal(policy.allowed, false);
      assert.equal(policy.actionRequired, "enroll");
    });

    it("якщо клуб НЕ увімкнув enforce_doctor_mfa, лікар без 2FA має звичайний доступ", () => {
      const policy = evaluateMfaPolicy({
        role: "doctor",
        isClubEnforced: false,
        hasMfaEnrolled: false,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, false);
      assert.equal(policy.allowed, true);
      assert.equal(policy.actionRequired, "none");
    });

    it("якщо лікар добровільно увімкнув 2FA, вхід вимагає підтвердження AAL2", () => {
      const policy = evaluateMfaPolicy({
        role: "doctor",
        isClubEnforced: false,
        hasMfaEnrolled: true,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, false);
      assert.equal(policy.allowed, false);
      assert.equal(policy.actionRequired, "verify");
    });
  });

  describe("4. Політика для порталу гравця та тренерів (Player/Coach — без 2FA)", () => {
    it("для тренера 2FA ніколи не вимагається примусово", () => {
      const policy = evaluateMfaPolicy({
        role: "coach",
        isClubEnforced: true,
        hasMfaEnrolled: false,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, false);
      assert.equal(policy.allowed, true);
    });

    it("для порталу гравця 2FA не блокує вхід", () => {
      const policy = evaluateMfaPolicy({
        role: "player" as any,
        isClubEnforced: true,
        hasMfaEnrolled: false,
        currentAal: "aal1",
      });

      assert.equal(policy.isRequired, false);
      assert.equal(policy.allowed, true);
    });
  });

  describe("5. Step-up перевірка перед експортом медичної карти (isStepUpVerificationRequired)", () => {
    it("не вимагає step-up, якщо у користувача взагалі не підключено 2FA", () => {
      const req = isStepUpVerificationRequired({
        hasMfaEnrolled: false,
      });
      assert.equal(req, false);
    });

    it("вимагає step-up, якщо 2FA увімкнено, але підтвердження в поточній сесії ще не було", () => {
      const req = isStepUpVerificationRequired({
        hasMfaEnrolled: true,
        lastMfaVerifiedAt: null,
      });
      assert.equal(req, true);
    });

    it("не вимагає step-up, якщо підтвердження відбулося щойно (< 15 хвилин тому)", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const req = isStepUpVerificationRequired({
        hasMfaEnrolled: true,
        lastMfaVerifiedAt: fiveMinutesAgo,
        maxAgeMinutes: 15,
      });
      assert.equal(req, false);
    });

    it("вимагає повторного підтвердження (step-up), якщо минуло понад 15 хвилин", () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      const req = isStepUpVerificationRequired({
        hasMfaEnrolled: true,
        lastMfaVerifiedAt: twentyMinutesAgo,
        maxAgeMinutes: 15,
      });
      assert.equal(req, true);
    });
  });

  describe("6. Перевірка міграції бази даних (SQL DDL та RLS)", () => {
    it("файл міграції 20261023170000_mfa_settings.sql існує", () => {
      const migrationPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261023170000_mfa_settings.sql"
      );
      assert.ok(fs.existsSync(migrationPath));
      const sql = fs.readFileSync(migrationPath, "utf-8");
      assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes"));
      assert.ok(sql.includes("enforce_doctor_mfa"));
      assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
      assert.ok(sql.includes("auth.uid() = user_id"));
    });
  });
});
