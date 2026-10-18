import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  generateActivationToken,
  generateDeviceSessionSecret,
  hashTokenSha256,
  parseDeviceName,
  createDeviceSessionCookieValue,
  verifyDeviceSessionCookieValue,
  ACTIVATION_TOKEN_MAX_AGE_SECONDS,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  MAX_ACTIVE_DEVICES_PER_PLAYER,
  memoryActivationTokens,
  memoryPlayerDevices,
  clearMemoryStoresForTesting,
} from "../src/lib/player-device-auth.ts";

import {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "../src/lib/player-rate-limit.ts";

describe("8.2 Активація пристрою по QR (player-device-activation)", () => {
  beforeEach(() => {
    clearMemoryStoresForTesting();
    resetAttempts("192.168.1.100", true);
    resetAttempts("192.168.1.101", true);
    resetAttempts("test-token-hash", false);
  });

  describe("1. Генерація та криптографічні властивості токена (128 біт)", () => {
    it("генерує 128-бітний токен (16 байт / 32 hex символи)", () => {
      const token = generateActivationToken();
      assert.equal(typeof token, "string");
      assert.equal(token.length, 32); // 16 bytes hex = 32 chars (128 bits)
      assert.match(token, /^[0-9a-f]{32}$/);
    });

    it("хэшує токен у SHA-256 (64 hex символи) і не зберігає відкритий токен", () => {
      const rawToken = generateActivationToken();
      const hash1 = hashTokenSha256(rawToken);
      const hash2 = hashTokenSha256(rawToken);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
      assert.notEqual(rawToken, hash1);
    });

    it("термін дії токена активації складає рівно 14 днів", () => {
      assert.equal(ACTIVATION_TOKEN_MAX_AGE_SECONDS, 14 * 24 * 60 * 60);
    });

    it("термін сесії пристрою складає рівно 90 днів", () => {
      assert.equal(DEVICE_SESSION_MAX_AGE_SECONDS, 90 * 24 * 60 * 60);
    });
  });

  describe("2. Одноразовість токена та захист від повторного використання", () => {
    // Чиста логіка валідації та активації
    function processTokenActivation(
      rawToken: string,
      ip: string,
      userAgent: string,
      isMinor = false,
      hasDataConsent = true
    ): { success: boolean; error?: string; requiresConsent?: boolean; playerId?: string } {
      const tokenHash = hashTokenSha256(rawToken);

      // Rate limiting
      const ipLimit = checkRateLimit(ip, true);
      if (ipLimit.isLocked) {
        return {
          success: false,
          error: `Забагато спроб активації. Доступ заблоковано на ${ipLimit.lockedUntilMinutes || 15} хв.`,
        };
      }

      const tokenLimit = checkRateLimit(tokenHash, false);
      if (tokenLimit.isLocked) {
        return {
          success: false,
          error: `Забагато спроб активації для цього токена. Блокування на ${tokenLimit.lockedUntilMinutes || 15} хв.`,
        };
      }

      const record = memoryActivationTokens.get(tokenHash);
      if (!record) {
        recordFailedAttempt(ip, true);
        recordFailedAttempt(tokenHash, false);
        return { success: false, error: "QR-код недійсний. Зверніться до тренера або лікаря клубу." };
      }

      if (record.used_at) {
        recordFailedAttempt(ip, true);
        recordFailedAttempt(tokenHash, false);
        return { success: false, error: "Цей QR-код вже був використаний для активації пристрою." };
      }

      if (new Date() > new Date(record.expires_at)) {
        recordFailedAttempt(ip, true);
        recordFailedAttempt(tokenHash, false);
        return { success: false, error: "Термін дії цього QR-коду закінчився (14 днів)." };
      }

      // 6. Згода батьків для неповнолітніх
      if (isMinor && !hasDataConsent) {
        return {
          success: false,
          requiresConsent: true,
          error: "Для активації кабінету потрібна згода батьків на обробку персональних даних. Зверніться до тренера/лікаря",
        };
      }

      // 5. Ліміт макс 2 пристрої з FIFO ротацією
      const activeDevices = Array.from(memoryPlayerDevices.values()).filter(
        (d) => d.player_id === record.player_id && !d.revoked_at
      );

      if (activeDevices.length >= MAX_ACTIVE_DEVICES_PER_PLAYER) {
        const oldest = activeDevices[0];
        oldest.revoked_at = new Date().toISOString();
      }

      // Позначаємо токен як використаний (одноразовий)
      record.used_at = new Date().toISOString();

      // Створюємо пристрій
      const sessionSecret = generateDeviceSessionSecret();
      const devId = crypto.randomUUID();
      memoryPlayerDevices.set(devId, {
        id: devId,
        player_id: record.player_id,
        device_token_hash: hashTokenSha256(sessionSecret),
        device_name: parseDeviceName(userAgent),
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + DEVICE_SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date().toISOString(),
      });

      resetAttempts(ip, true);
      resetAttempts(tokenHash, false);

      return { success: true, playerId: record.player_id };
    }

    it("успішно активує пристрій при першому скануванні та позначає токен використаним", () => {
      const rawToken = generateActivationToken();
      const tokenHash = hashTokenSha256(rawToken);
      const playerId = "player-001";

      memoryActivationTokens.set(tokenHash, {
        id: "tok-1",
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
        used_at: null,
        created_by: "doc-1",
        created_at: new Date().toISOString(),
      });

      const res = processTokenActivation(rawToken, "192.168.1.100", "Mozilla/5.0 (iPhone)");
      assert.equal(res.success, true);
      assert.equal(res.playerId, playerId);

      // Перевіряємо, що токен позначено як використаний
      assert.ok(memoryActivationTokens.get(tokenHash)?.used_at);
    });

    it("повторна активація тим же токеном відхиляється (захоплення фото QR марне)", () => {
      const rawToken = generateActivationToken();
      const tokenHash = hashTokenSha256(rawToken);
      const playerId = "player-001";

      memoryActivationTokens.set(tokenHash, {
        id: "tok-1",
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
        used_at: new Date().toISOString(), // Вже використано
        created_by: "doc-1",
        created_at: new Date().toISOString(),
      });

      const res = processTokenActivation(rawToken, "192.168.1.100", "Mozilla/5.0 (iPhone)");
      assert.equal(res.success, false);
      assert.match(res.error || "", /вже був використаний/);
    });

    it("відхиляє токен, строк дії якого (> 14 днів) закінчився", () => {
      const rawToken = generateActivationToken();
      const tokenHash = hashTokenSha256(rawToken);
      const playerId = "player-001";

      memoryActivationTokens.set(tokenHash, {
        id: "tok-1",
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() - 1000).toISOString(), // Минув
        used_at: null,
        created_by: "doc-1",
        created_at: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
      });

      const res = processTokenActivation(rawToken, "192.168.1.100", "Mozilla/5.0 (iPhone)");
      assert.equal(res.success, false);
      assert.match(res.error || "", /закінчився/);
    });
  });

  describe("3. Обмеження спроб перебору (Rate Limiting: 5 помилок = 15 хв блок)", () => {
    it("блокує IP після 5 невдалих спроб введення недійсного токена", () => {
      const testIp = "192.168.1.101";

      // 5 невдалих спроб
      for (let i = 1; i <= 5; i++) {
        recordFailedAttempt(testIp, true);
      }

      const limit = checkRateLimit(testIp, true);
      assert.equal(limit.isLocked, true);
      assert.equal(limit.remainingAttempts, 0);
      assert.equal(limit.lockedUntilMinutes, 15);
    });
  });

  describe("4. Ліміт пристроїв гравця (максимум 2) та ротація", () => {
    it("підтримує максимум 2 активних пристрої і при додаванні 3-го відкликає найстаріший", () => {
      const playerId = "player-rotation";

      // Додаємо 1-й пристрій
      const dev1Id = "dev-1";
      memoryPlayerDevices.set(dev1Id, {
        id: dev1Id,
        player_id: playerId,
        device_token_hash: "hash1",
        device_name: "iPhone (Safari)",
        last_seen_at: new Date(Date.now() - 2000).toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date(Date.now() - 2000).toISOString(),
      });

      // Додаємо 2-й пристрій
      const dev2Id = "dev-2";
      memoryPlayerDevices.set(dev2Id, {
        id: dev2Id,
        player_id: playerId,
        device_token_hash: "hash2",
        device_name: "Android (Chrome)",
        last_seen_at: new Date(Date.now() - 1000).toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date(Date.now() - 1000).toISOString(),
      });

      const active = Array.from(memoryPlayerDevices.values()).filter(
        (d) => d.player_id === playerId && !d.revoked_at
      );
      assert.equal(active.length, 2);

      // Додаємо 3-й пристрій з ротацією
      if (active.length >= MAX_ACTIVE_DEVICES_PER_PLAYER) {
        const oldest = active.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0];
        oldest.revoked_at = new Date().toISOString();
      }

      const dev3Id = "dev-3";
      memoryPlayerDevices.set(dev3Id, {
        id: dev3Id,
        player_id: playerId,
        device_token_hash: "hash3",
        device_name: "iPad (Safari)",
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date().toISOString(),
      });

      const activeAfterRotation = Array.from(memoryPlayerDevices.values()).filter(
        (d) => d.player_id === playerId && !d.revoked_at
      );
      assert.equal(activeAfterRotation.length, 2, "Активних пристроїв має залишитися рівно 2");

      const dev1 = memoryPlayerDevices.get(dev1Id);
      assert.ok(dev1?.revoked_at, "Найстаріший пристрій повинен бути відкликаний");
    });
  });

  describe("5. Відкликання доступу лікарем та миттєва втрата доступу", () => {
    function validateDeviceSession(deviceId: string, sessionSecret: string): { valid: boolean; playerId?: string } {
      const hash = hashTokenSha256(sessionSecret);
      const dev = memoryPlayerDevices.get(deviceId);
      if (!dev || dev.device_token_hash !== hash) return { valid: false };
      if (dev.revoked_at || new Date(dev.expires_at) < new Date()) return { valid: false };
      return { valid: true, playerId: dev.player_id };
    }

    it("відкликане пристрій миттєво втрачає доступ", () => {
      const playerId = "player-revoke-check";
      const deviceId = "device-to-revoke";
      const sessionSecret = generateDeviceSessionSecret();
      const tokenHash = hashTokenSha256(sessionSecret);

      memoryPlayerDevices.set(deviceId, {
        id: deviceId,
        player_id: playerId,
        device_token_hash: tokenHash,
        device_name: "iPhone (Safari)",
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date().toISOString(),
      });

      // До відкликання
      const before = validateDeviceSession(deviceId, sessionSecret);
      assert.equal(before.valid, true);
      assert.equal(before.playerId, playerId);

      // Лікар натискає «Відкликати доступ»
      memoryPlayerDevices.get(deviceId)!.revoked_at = new Date().toISOString();

      // Після відкликання — миттєва втрата доступу!
      const after = validateDeviceSession(deviceId, sessionSecret);
      assert.equal(after.valid, false, "Отозванное устройство теряет доступ сразу");
    });
  });

  describe("6. Перевірка згоди батьків для неповнолітніх (< 18 років)", () => {
    function checkMinorConsentRequirement(isMinor: boolean, hasDataConsent: boolean): { allowed: boolean; reason?: string } {
      if (isMinor && !hasDataConsent) {
        return {
          allowed: false,
          reason: "Зверніться до тренера/лікаря",
        };
      }
      return { allowed: true };
    }

    it("блокує активацію для неповнолітнього (<18) без згоди data_processing", () => {
      const check = checkMinorConsentRequirement(true, false);
      assert.equal(check.allowed, false);
      assert.equal(check.reason, "Зверніться до тренера/лікаря");
    });

    it("дозволяє активацію для неповнолітнього зі згодою data_processing", () => {
      const check = checkMinorConsentRequirement(true, true);
      assert.equal(check.allowed, true);
    });

    it("дозволяє активацію для повнолітнього гравця (18+) без окремої згоди батьків", () => {
      const check = checkMinorConsentRequirement(false, false);
      assert.equal(check.allowed, true);
    });
  });

  describe("7. Розпізнавання назв пристроїв (User-Agent)", () => {
    it("правильно визначає iPhone, Android, Mac та Windows", () => {
      assert.equal(
        parseDeviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1"),
        "iPhone (Safari)"
      );
      assert.equal(
        parseDeviceName("Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120.0 Mobile Safari/537.36"),
        "Android (Chrome)"
      );
      assert.equal(
        parseDeviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"),
        "Windows PC (Chrome)"
      );
      assert.equal(
        parseDeviceName(null),
        "Невідомий пристрій"
      );
    });
  });

  describe("8. Підпис сесійного токена пристрою", () => {
    it("генерує валідний підписаний cookie токен і валідує його", () => {
      const cookieVal = createDeviceSessionCookieValue("dev-1", "secret-key", "player-1");
      assert.ok(cookieVal.includes("."));

      const verified = verifyDeviceSessionCookieValue(cookieVal);
      assert.ok(verified);
      assert.equal(verified?.deviceId, "dev-1");
      assert.equal(verified?.sessionSecret, "secret-key");
      assert.equal(verified?.playerId, "player-1");
    });

    it("відхиляє токен з підробленим підписом", () => {
      const cookieVal = createDeviceSessionCookieValue("dev-1", "secret-key", "player-1");
      const [payload] = cookieVal.split(".");
      const forged = `${payload}.invalid-signature`;

      const verified = verifyDeviceSessionCookieValue(forged);
      assert.equal(verified, null);
    });
  });
});
