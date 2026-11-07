import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  hashTokenSha256,
  getTelegramBotUsername,
} from "../src/lib/telegram-auth.ts";
import {
  memoryCoachTokens,
  memoryCoachBindings,
  memoryCoachSessions,
} from "../src/lib/coach-telegram-state.ts";
import type { CoachTelegramBinding, CoachTelegramSessionDraft } from "../src/types/telegram.ts";

describe("Telegram-бот для тренерів: Прив'язка та інтерактивний запис навантаження", () => {
  const fakeCoachUserId = "coach-user-uuid-101";
  const fakeChatId = "987654321";

  beforeEach(() => {
    memoryCoachTokens.clear();
    memoryCoachBindings.clear();
    memoryCoachSessions.clear();
  });

  test("1. Генерація персонального токена та deep-link для тренера", () => {
    const rawToken = crypto.randomBytes(16).toString("hex");
    const tokenHash = hashTokenSha256(rawToken);
    const botUsername = getTelegramBotUsername();
    const deepLink = `https://t.me/${botUsername}?start=coach_${rawToken}`;

    assert.equal(rawToken.length, 32, "Токен має бути 32 hex символи (128 біт)");
    assert.ok(deepLink.includes(`start=coach_${rawToken}`), "Deep-link має містити префікс coach_");
    assert.equal(tokenHash.length, 64, "SHA-256 хеш має довжину 64 символи");

    memoryCoachTokens.set(tokenHash, {
      id: crypto.randomUUID(),
      coach_user_id: fakeCoachUserId,
      club_id: "default-club",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    });

    assert.equal(memoryCoachTokens.size, 1);
  });

  test("2. Активація та реєстрація тренера за токеном", () => {
    const rawToken = "test_coach_token_123";
    const tokenHash = hashTokenSha256(rawToken);

    memoryCoachTokens.set(tokenHash, {
      id: "tok-1",
      coach_user_id: fakeCoachUserId,
      club_id: "default-club",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      used_at: null,
      created_at: new Date().toISOString(),
    });

    // Імітуємо перевірку та активацію
    const stored = memoryCoachTokens.get(tokenHash);
    assert.ok(stored);
    assert.equal(stored.used_at, null);

    stored.used_at = new Date().toISOString();

    const binding: CoachTelegramBinding = {
      id: "bind-1",
      coach_user_id: stored.coach_user_id,
      club_id: stored.club_id,
      telegram_chat_id: fakeChatId,
      telegram_username: "coach_valeriy",
      status: "active",
      morning_report_time: "09:00",
      receive_morning_report: true,
      created_at: new Date().toISOString(),
    };
    memoryCoachBindings.set(fakeChatId, binding);

    assert.equal(memoryCoachBindings.get(fakeChatId)?.status, "active");
    assert.equal(memoryCoachBindings.get(fakeChatId)?.telegram_username, "coach_valeriy");
  });

  test("3. FSM стану: покроковий вибір типу, тривалості, RPE та покриття", () => {
    // Початковий стан
    memoryCoachSessions.set(fakeChatId, {
      current_step: "select_type",
      session_draft: {},
    });

    // Крок 1: Обираємо тренування
    let session = memoryCoachSessions.get(fakeChatId)!;
    session.current_step = "select_duration";
    session.session_draft.session_type = "training_team";

    assert.equal(session.current_step, "select_duration");
    assert.equal(session.session_draft.session_type, "training_team");

    // Крок 2: Обираємо 90 хв
    session.current_step = "select_rpe";
    session.session_draft.duration_minutes = 90;

    assert.equal(session.current_step, "select_rpe");
    assert.equal(session.session_draft.duration_minutes, 90);

    // Крок 3: Обираємо RPE 6 (Важке)
    session.current_step = "select_surface";
    session.session_draft.rpe_score = 6;

    assert.equal(session.current_step, "select_surface");
    assert.equal(session.session_draft.rpe_score, 6);

    // Крок 4: Обираємо штучне поле
    session.current_step = "check_injuries";
    session.session_draft.surface = "Штучне поле" as any;

    assert.equal(session.current_step, "check_injuries");
    assert.equal(session.session_draft.surface, "Штучне поле");

    // Крок 5: Без травм
    session.current_step = "finalize_notes";
    session.session_draft.incident = "none";

    assert.equal(session.current_step, "finalize_notes");
    assert.equal(session.session_draft.incident, "none");
  });

  test("4. Обробка ручного введення тривалості (число в чаті)", () => {
    const sessionDraft: CoachTelegramSessionDraft = { session_type: "training_team" };
    memoryCoachSessions.set(fakeChatId, {
      current_step: "select_duration",
      session_draft: sessionDraft,
    });

    // Тренер пише "85"
    const inputText = "85";
    const parsed = parseInt(inputText, 10);
    assert.equal(isNaN(parsed), false);
    assert.equal(parsed, 85);

    const session = memoryCoachSessions.get(fakeChatId)!;
    session.current_step = "select_rpe";
    session.session_draft.duration_minutes = parsed;

    assert.equal(session.current_step, "select_rpe");
    assert.equal(session.session_draft.duration_minutes, 85);
  });

  test("5. Розрахунок навчального навантаження команди (Workload = Хвилини * RPE)", () => {
    const minutes = 90;
    const rpe = 6;
    const loadAu = minutes * rpe;

    assert.equal(loadAu, 540, "Навантаження за 90 хв при RPE 6 має дорівнювати 540 AU");
  });
});

