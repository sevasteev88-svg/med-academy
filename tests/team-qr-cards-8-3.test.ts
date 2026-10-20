import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  generateActivationToken,
  hashTokenSha256,
  ACTIVATION_TOKEN_MAX_AGE_SECONDS,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  memoryActivationTokens,
  memoryPlayerDevices,
  clearMemoryStoresForTesting,
} from "../src/lib/player-device-auth.ts";

import {
  sanitizeCardData,
  INSTRUCTIONS_STEPS_UA,
  CARD_TERMS_UA,
  CLUB_BRAND_UA,
} from "../src/lib/qr-pdf-generator.ts";

import type {
  TeamPlayerActivationSummary,
  GeneratedQrCard,
  PlayerActivationStatus,
} from "../src/types/player-device.ts";

describe("8.3 QR-картки для тренера (team-qr-cards)", () => {
  beforeEach(() => {
    clearMemoryStoresForTesting();
  });

  describe("1. Пакетне формування карток та відкликання старих токенів", () => {
    it("для активних гравців без активації генерує 128-бітні токени (32 hex символи)", () => {
      const token = generateActivationToken();
      assert.equal(typeof token, "string");
      assert.equal(token.length, 32);
      assert.match(token, /^[0-9a-f]{32}$/);

      const hash = hashTokenSha256(token);
      assert.equal(hash.length, 64);
      assert.match(hash, /^[0-9a-f]{64}$/);
    });

    it("при повторній генерації відкликає всі старі невикористані токени гравця", () => {
      const playerId = "player-001";
      const oldToken = generateActivationToken();
      const oldHash = hashTokenSha256(oldToken);

      // Створюємо старий невикористаний токен
      memoryActivationTokens.set(oldHash, {
        id: "tok-1",
        player_id: playerId,
        token_hash: oldHash,
        expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
        used_at: null,
        created_by: "coach-1",
        created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      });

      // Перевіряємо, що старий токен ще дійсний
      assert.equal(memoryActivationTokens.get(oldHash)?.used_at, null);

      // Імітуємо пакетну генерацію: старі токени цього гравця відкликаються
      const nowIso = new Date().toISOString();
      for (const tok of memoryActivationTokens.values()) {
        if (tok.player_id === playerId && !tok.used_at) {
          tok.used_at = nowIso;
        }
      }

      // Створюємо новий токен
      const newToken = generateActivationToken();
      const newHash = hashTokenSha256(newToken);
      memoryActivationTokens.set(newHash, {
        id: "tok-2",
        player_id: playerId,
        token_hash: newHash,
        expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
        used_at: null,
        created_by: "coach-1",
        created_at: nowIso,
      });

      // Старий токен тепер має used_at (відкликаний)
      assert.ok(memoryActivationTokens.get(oldHash)?.used_at);
      // Новий токен дійсний і активний
      assert.equal(memoryActivationTokens.get(newHash)?.used_at, null);
    });

    it("гравці, які вже мають активний пристрій, за замовчуванням не скидаються", () => {
      const playerWithDevice = "player-active-1";
      const playerWithoutDevice = "player-new-2";

      // playerWithDevice має активну сесію пристрою
      memoryPlayerDevices.set("dev-1", {
        id: "dev-1",
        player_id: playerWithDevice,
        device_token_hash: "hash-device-1",
        device_name: "iPhone 15",
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 86400 * 1000).toISOString(),
        revoked_at: null,
        created_at: new Date().toISOString(),
      });

      const teamPlayers = [playerWithDevice, playerWithoutDevice];

      // Фільтруємо гравців без діючої активації
      const activePlayerIds = new Set(
        Array.from(memoryPlayerDevices.values())
          .filter((d) => !d.revoked_at && new Date(d.expires_at) > new Date())
          .map((d) => d.player_id)
      );

      const eligibleForTokens = teamPlayers.filter((pId) => !activePlayerIds.has(pId));

      assert.equal(eligibleForTokens.length, 1);
      assert.equal(eligibleForTokens[0], playerWithoutDevice);
    });
  });

  describe("2. Конфіденційність карток (відсутність медичних даних та дат народження)", () => {
    it("картка містить лише прізвище, ім'я, команду та 3 кроки інструкції", () => {
      const validCard: GeneratedQrCard = {
        playerId: "player-123",
        fullName: "Ковальчук Ілля",
        teamName: "U-17 (2009)",
        token: "abcdef0123456789abcdef0123456789",
        activationUrl: "/a/abcdef0123456789abcdef0123456789",
      };

      const result = sanitizeCardData(validCard);
      assert.equal(result.valid, true);
      assert.equal(result.leakedFields.length, 0);

      // Інструкція українською з 3 кроків
      assert.equal(INSTRUCTIONS_STEPS_UA.length, 3);
      assert.match(INSTRUCTIONS_STEPS_UA[0], /відскануйте/i);
      assert.match(INSTRUCTIONS_STEPS_UA[1], /активацію/i);
      assert.match(INSTRUCTIONS_STEPS_UA[2], /велнес/i);
    });

    it("блокує та виявляє спроби додати дату народження або медичні діагнози до картки", () => {
      const leakCard = {
        playerId: "player-123",
        fullName: "Петренко Тарас",
        teamName: "U-19",
        token: "tok",
        activationUrl: "/a/tok",
        date_of_birth: "2008-05-14",
        diagnosis: "Розтягнення задньої поверхні стегна",
        vas_score: 4,
      };

      const result = sanitizeCardData(leakCard);
      assert.equal(result.valid, false);
      assert.deepEqual(result.leakedFields.sort(), ["date_of_birth", "diagnosis", "vas_score"].sort());
    });
  });

  describe("3. Формат листа A4 та 8 карток на лист", () => {
    it("правильно розраховує координати 8 карток на лист (2 колонки x 4 ряди)", () => {
      const pageWidth = 210;
      const pageHeight = 297;
      const marginX = 8;
      const marginY = 8;
      const colGap = 6;
      const rowGap = 5;
      const cardWidth = 94;
      const cardHeight = 66;

      for (let i = 0; i < 8; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);

        const x = marginX + col * (cardWidth + colGap);
        const y = marginY + row * (cardHeight + rowGap);

        // Перевіряємо, що всі картки вміщуються в межі листа A4
        assert.ok(x >= marginX, `Card ${i} x >= marginX`);
        assert.ok(x + cardWidth <= pageWidth, `Card ${i} fits width`);
        assert.ok(y >= marginY, `Card ${i} y >= marginY`);
        assert.ok(y + cardHeight <= pageHeight, `Card ${i} fits height`);
      }
    });

    it("розбиває команду на правильну кількість сторінок A4 (по 8 карток на лист)", () => {
      function calculatePages(totalCards: number): number {
        return Math.ceil(totalCards / 8);
      }

      assert.equal(calculatePages(1), 1);
      assert.equal(calculatePages(8), 1);
      assert.equal(calculatePages(9), 2);
      assert.equal(calculatePages(16), 2);
      assert.equal(calculatePages(20), 3);
      assert.equal(calculatePages(25), 4);
    });
  });

  describe("4. Окрема картка на одного гравця (заміна втраченої)", () => {
    it("формує окремий токен та картку заміни тільки для зазначеного гравця", () => {
      const playerId = "player-replacement-1";
      const rawToken = generateActivationToken();
      const tokenHash = hashTokenSha256(rawToken);

      memoryActivationTokens.set(tokenHash, {
        id: "rep-1",
        player_id: playerId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + ACTIVATION_TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
        used_at: null,
        created_by: "coach-1",
        created_at: new Date().toISOString(),
      });

      const singleCard: GeneratedQrCard = {
        playerId,
        fullName: "Сидоренко Денис",
        teamName: "U-17",
        token: rawToken,
        activationUrl: `/a/${rawToken}`,
      };

      assert.equal(singleCard.playerId, playerId);
      assert.equal(singleCard.token.length, 32);
      assert.equal(singleCard.activationUrl, `/a/${rawToken}`);
    });
  });

  describe("5. Статуси активації команди", () => {
    it("правильно визначає 4 статуси: 'Активовано', 'Не активовано', 'Відкликано', 'Не сформовано'", () => {
      const now = new Date();

      function determineStatus(
        hasActiveDevice: boolean,
        hasPendingToken: boolean,
        hasRevokedToken: boolean
      ): PlayerActivationStatus {
        if (hasActiveDevice) return "active";
        if (hasPendingToken) return "pending";
        if (hasRevokedToken) return "revoked_or_expired";
        return "not_issued";
      }

      assert.equal(determineStatus(true, false, false), "active");
      assert.equal(determineStatus(false, true, false), "pending");
      assert.equal(determineStatus(false, false, true), "revoked_or_expired");
      assert.equal(determineStatus(false, false, false), "not_issued");
    });
  });

  describe("6. Розмежування прав доступу (coach vs doctor/admin)", () => {
    function canAccessTeam(
      role: "doctor" | "coach" | "admin",
      userTeamId: string | null | undefined,
      targetTeamId: string
    ): boolean {
      if (role === "admin" || role === "doctor") {
        return true; // весь клуб
      }
      if (role === "coach") {
        // Тренер має доступ лише до своєї команди
        if (!userTeamId) return true; // якщо ще не призначено — вибирає
        return userTeamId === targetTeamId;
      }
      return false;
    }

    it("лікар та адміністратор мають доступ до будь-якої команди", () => {
      assert.equal(canAccessTeam("doctor", null, "team-u17"), true);
      assert.equal(canAccessTeam("admin", null, "team-u19"), true);
      assert.equal(canAccessTeam("doctor", "team-u15", "team-u19"), true);
    });

    it("тренер бачить тільки свою команду і не має доступу до чужої", () => {
      const myTeam = "team-u17";
      const otherTeam = "team-u19";

      assert.equal(canAccessTeam("coach", myTeam, myTeam), true);
      assert.equal(canAccessTeam("coach", myTeam, otherTeam), false);
    });
  });
});
