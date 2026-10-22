import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  generateTelegramBindingToken,
  hashTokenSha256,
  buildTelegramDeepLink,
  checkTelegramEligibility,
  processTokenBindingInMemory,
  unlinkPlayerTelegramInMemory,
  unlinkTelegramByChatIdInMemory,
  formatMorningWellnessReminder,
  formatCoachWeeklyReport,
  assertNoMedicalDataOrOtherPlayers,
  memoryTelegramTokens,
  memoryTelegramBindings,
  clearTelegramMemoryStoresForTesting,
  TELEGRAM_TOKEN_EXPIRATION_SECONDS,
} from "../src/lib/telegram-auth.ts";

import { generateCoachWeeklyReportPdf } from "../src/lib/coach-weekly-telegram-pdf.ts";
import type { CoachWeeklyTelegramSummary } from "../src/types/telegram.ts";

describe("8.7 Telegram-сповіщення, ранкові нагадування та тижневий звіт", () => {
  beforeEach(() => {
    clearTelegramMemoryStoresForTesting();
  });

  describe("1. Прив'язка гравця через deep-link та токен (Вимога 1)", () => {
    it("генерує криптографічно стійкий 128-бітний токен (32 hex-символи)", () => {
      const token = generateTelegramBindingToken();
      assert.equal(typeof token, "string");
      assert.equal(token.length, 32);
      assert.match(token, /^[0-9a-f]{32}$/);
    });

    it("хэшує токен у SHA-256 (64 hex-символи) для безпечного зберігання в БД", () => {
      const rawToken = generateTelegramBindingToken();
      const hash1 = hashTokenSha256(rawToken);
      const hash2 = hashTokenSha256(rawToken);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
      assert.notEqual(rawToken, hash1);
    });

    it("формує валідний deep-link формату t.me/<bot>?start=<токен>", () => {
      const token = "test_token_abc_123";
      const link = buildTelegramDeepLink(token, "ChornomoretsMedBot");
      assert.equal(link, "https://t.me/ChornomoretsMedBot?start=test_token_abc_123");
    });

    it("токен є одноразовим: після успішної активації повторне використання відхиляється", () => {
      const rawToken = generateTelegramBindingToken();
      const tokenHash = hashTokenSha256(rawToken);
      const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

      memoryTelegramTokens.set(tokenHash, {
        id: "tok-1",
        player_id: "player-1",
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_at: new Date().toISOString(),
      });

      // Перша спроба прив'язки -> успіх
      const res1 = processTokenBindingInMemory(rawToken, "chat_999", "ivan_football");
      assert.equal(res1.success, true);
      assert.equal(res1.playerId, "player-1");
      assert.equal(res1.binding?.status, "active");

      // Друга спроба тим самим токеном -> помилка "вже був використаний"
      const res2 = processTokenBindingInMemory(rawToken, "chat_888", "other_user");
      assert.equal(res2.success, false);
      assert.match(res2.error || "", /вже був використаний/);
    });

    it("відхиляє прострочені токени прив'язки", () => {
      const rawToken = generateTelegramBindingToken();
      const tokenHash = hashTokenSha256(rawToken);
      // Термін минув 1 годину тому
      const expiredAt = new Date(Date.now() - 3600 * 1000).toISOString();

      memoryTelegramTokens.set(tokenHash, {
        id: "tok-exp",
        player_id: "player-2",
        token_hash: tokenHash,
        expires_at: expiredAt,
        used_at: null,
        created_at: new Date().toISOString(),
      });

      const res = processTokenBindingInMemory(rawToken, "chat_777");
      assert.equal(res.success, false);
      assert.match(res.error || "", /минув/);
    });
  });

  describe("2. Ранкове нагадування та медична таємниця (Вимога 2)", () => {
    it("містить заклик заповнити анкету та пряме посилання на PWA", () => {
      const reminder = formatMorningWellnessReminder({
        playerName: "Михайло",
        clubName: "ФК Чорноморець U-19",
        wellnessUrl: "https://med.fc-chornomorets.com/wellness",
      });

      assert.match(reminder, /Доброго ранку|Привіт, Михайло/);
      assert.match(reminder, /анкету самопочуття/);
      assert.match(reminder, /https:\/\/med\.fc-chornomorets\.com\/wellness/);
    });

    it("суворо НЕ містить медичних діагнозів, болю, ВАШ чи прізвищ партнерів", () => {
      const reminder = formatMorningWellnessReminder({
        playerName: "Олександр",
        wellnessUrl: "https://med.fc-chornomorets.com/wellness",
      });

      const check = assertNoMedicalDataOrOtherPlayers(reminder, ["Шевченко", "Ярмоленко", "Судаков"]);
      assert.equal(check.safe, true);
      assert.equal(check.detectedLeakedTerms.length, 0);

      // Додаткова перевірка специфічних медичних слів
      assert.equal(reminder.toLowerCase().includes("вас"), false);
      assert.equal(reminder.toLowerCase().includes("травма"), false);
      assert.equal(reminder.toLowerCase().includes("діагноз"), false);
    });
  });

  describe("3. Тижневий звіт тренеру в Telegram та PDF (Вимога 3)", () => {
    const mockSummary: CoachWeeklyTelegramSummary = {
      teamId: "team-u19",
      teamName: "ФК Чорноморець U-19",
      weekStart: "2026-10-14",
      weekEnd: "2026-10-21",
      compliancePct: 92,
      completedSurveysCount: 116,
      totalSurveysExpected: 126,
      yellowFlagsCount: 4,
      redFlagsCount: 1,
      averageFatigueScore: 3.4,
      averageSorenessScore: 3.2,
      overallWorkloadDescription: "Оптимальне тренувальне навантаження",
      requiresAttentionCount: 2,
      appReadinessUrl: "https://med.fc-chornomorets.com/team/readiness?teamId=team-u19",
    };

    it("формує текст звіту з відсотком заповнення, лічильниками прапорців та загальним навантаженням", () => {
      const report = formatCoachWeeklyReport(mockSummary);

      assert.match(report, /Тижневий звіт готовності команди: ФК Чорноморець U-19/);
      assert.match(report, /Дисципліна заповнення:\* 92%/);
      assert.match(report, /Жовті прапорці \(потребують уваги\): \*4\*/);
      assert.match(report, /Червоні прапорці \(високий ризик \/ обмеження\): \*1\*/);
      assert.match(report, /Оптимальне тренувальне навантаження/);
      assert.match(report, /3\.4\/5/);
    });

    it("не містить прізвищ окремих гравців у тексті Telegram-повідомлення", () => {
      const report = formatCoachWeeklyReport(mockSummary);
      const check = assertNoMedicalDataOrOtherPlayers(report, [
        "Петренко",
        "Коваленко",
        "Сидоренко",
        "Іванов",
      ]);
      assert.equal(check.safe, true);
    });

    it("містить захищене посилання на додаток для перегляду списку 'Потребують уваги'", () => {
      const report = formatCoachWeeklyReport(mockSummary);
      assert.match(report, /https:\/\/med\.fc-chornomorets\.com\/team\/readiness\?teamId=team-u19/);
      assert.match(report, /Потребують уваги тренерського штабу сьогодні:\* 2 гравців/);
    });

    it("успішно генерує PDF документ для друку / збереження", () => {
      const pdfDoc = generateCoachWeeklyReportPdf(mockSummary);
      assert.ok(pdfDoc);
      const output = pdfDoc.output("arraybuffer");
      assert.ok(output.byteLength > 1000); // Валідний непустий PDF
    });
  });

  describe("4. Відписка або відкликання прив'язки в 1 клік (Вимога 4)", () => {
    it("дозволяє відв'язати Telegram гравця за playerId в один клік (UI)", () => {
      // Створюємо активну прив'язку
      memoryTelegramBindings.set("player-1:chat_111", {
        id: "bind-1",
        player_id: "player-1",
        telegram_chat_id: "chat_111",
        status: "active",
        created_at: new Date().toISOString(),
      });

      const res = unlinkPlayerTelegramInMemory("player-1");
      assert.equal(res.success, true);
      assert.equal(res.unlinkedCount, 1);

      const binding = memoryTelegramBindings.get("player-1:chat_111");
      assert.equal(binding?.status, "unlinked");
      assert.ok(binding?.unlinked_at);
    });

    it("дозволяє відписатися через команду /stop або /unbind в боті за chat_id", () => {
      memoryTelegramBindings.set("player-2:chat_222", {
        id: "bind-2",
        player_id: "player-2",
        telegram_chat_id: "chat_222",
        status: "active",
        created_at: new Date().toISOString(),
      });

      const res = unlinkTelegramByChatIdInMemory("chat_222");
      assert.equal(res.success, true);
      assert.equal(res.unlinkedCount, 1);

      const binding = memoryTelegramBindings.get("player-2:chat_222");
      assert.equal(binding?.status, "unlinked");
    });
  });

  describe("5. Захист неповнолітніх (<18 років) та згода батьків (Вимога 5)", () => {
    it("блокує прив'язку для гравця віком < 18 років без згоди батьків", () => {
      // Гравець 16 років (2010 рік народження відносно 2026)
      const minorPlayer = {
        id: "minor-1",
        date_of_birth: "2010-05-15",
        hasParentConsent: false,
      };

      const eligibility = checkTelegramEligibility(minorPlayer);
      assert.equal(eligibility.isMinor, true);
      assert.equal(eligibility.eligible, false);
      assert.equal(eligibility.hasParentConsent, false);
      assert.match(eligibility.reason || "", /згоди батьків/);
    });

    it("дозволяє прив'язку для неповнолітнього, якщо згода батьків отримана", () => {
      const minorWithConsent = {
        id: "minor-2",
        date_of_birth: "2010-05-15",
        hasParentConsent: true,
      };

      const eligibility = checkTelegramEligibility(minorWithConsent);
      assert.equal(eligibility.isMinor, true);
      assert.equal(eligibility.eligible, true);
      assert.equal(eligibility.hasParentConsent, true);
    });

    it("дозволяє прив'язку для повнолітнього гравця (>= 18 років) без батьківської згоди", () => {
      const adultPlayer = {
        id: "adult-1",
        date_of_birth: "2004-03-20", // 22 роки у 2026
        hasParentConsent: false,
      };

      const eligibility = checkTelegramEligibility(adultPlayer);
      assert.equal(eligibility.isMinor, false);
      assert.equal(eligibility.eligible, true);
    });

    it("відхиляє обробку токена в боті, якщо у неповнолітнього відсутня згода батьків", () => {
      const rawToken = generateTelegramBindingToken();
      const tokenHash = hashTokenSha256(rawToken);

      memoryTelegramTokens.set(tokenHash, {
        id: "tok-minor",
        player_id: "minor-blocked",
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        used_at: null,
        created_at: new Date().toISOString(),
      });

      const res = processTokenBindingInMemory(rawToken, "chat_minor", "young_star", {
        isMinor: true,
        hasParentConsent: false,
      });

      assert.equal(res.success, false);
      assert.match(res.error || "", /згода батьків/);
    });
  });
});
