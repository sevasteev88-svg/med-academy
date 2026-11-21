import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { encryptServerSecret } from "../src/lib/server-crypto.ts";

let mockClubsById: Record<string, any> = {};

(globalThis as any).__TEST_MED_TG_SUPABASE__ = () => ({
  from(table: string) {
    assert.equal(table, "clubs");
    let targetId = "";
    const chain: any = {
      select() {
        return chain;
      },
      eq(col: string, val: string) {
        if (col === "id") targetId = val;
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({
          data: mockClubsById[targetId] || null,
          error: null,
        });
      },
    };
    return chain;
  },
});

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/utils/supabase/admin") {
      return { shortCircuit: true, url: "test://med-tg-admin" };
    }
    if (specifier === "@/lib/auth") {
      return { shortCircuit: true, url: "test://med-tg-auth" };
    }
    if (specifier === "@/lib/telegram-auth") {
      return { shortCircuit: true, url: "test://med-tg-telegram-auth" };
    }
    if (specifier === "@/lib/server-crypto") {
      return nextResolve(
        new URL("../src/lib/server-crypto.ts", import.meta.url).href,
        context
      );
    }
    if (specifier === "@/lib/club-telegram") {
      return nextResolve(
        new URL("../src/lib/club-telegram.ts", import.meta.url).href,
        context
      );
    }
    if (specifier === "@/types/telegram") {
      return nextResolve(
        new URL("../src/types/telegram.ts", import.meta.url).href,
        context
      );
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test://med-tg-admin") {
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export function createAdminClient() { return globalThis.__TEST_MED_TG_SUPABASE__(); }",
      };
    }
    if (url === "test://med-tg-auth") {
      return {
        shortCircuit: true,
        format: "module",
        source:
          'export const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";',
      };
    }
    if (url === "test://med-tg-telegram-auth") {
      return {
        shortCircuit: true,
        format: "module",
        source:
          'export function getTelegramBotUsername() { return "chornomorets_doctor_bot"; }',
      };
    }
    return nextLoad(url, context);
  },
});

const {
  normalizeDoctorTelegramUrl,
  escapeTelegramHtml,
  getClubMedicalTelegramConfig,
  sendClubMedicalChatAlert,
} = await import("../src/lib/medical-telegram.ts");

test("normalizeDoctorTelegramUrl handles @username, username, t.me URLs, phones, and invalid inputs", () => {
  assert.equal(normalizeDoctorTelegramUrl("@dr_kovalenko"), "https://t.me/dr_kovalenko");
  assert.equal(normalizeDoctorTelegramUrl("dr_kovalenko"), "https://t.me/dr_kovalenko");
  assert.equal(normalizeDoctorTelegramUrl("https://t.me/dr_kovalenko"), "https://t.me/dr_kovalenko");
  assert.equal(normalizeDoctorTelegramUrl("http://t.me/dr_kovalenko"), "https://t.me/dr_kovalenko");
  assert.equal(normalizeDoctorTelegramUrl("t.me/dr_kovalenko"), "https://t.me/dr_kovalenko");
  assert.equal(normalizeDoctorTelegramUrl("+380935623945"), "https://t.me/+380935623945");
  assert.equal(normalizeDoctorTelegramUrl("+38 (093) 562-39-45"), "https://t.me/+380935623945");
  assert.equal(normalizeDoctorTelegramUrl("0935623945"), "https://t.me/+380935623945");
  assert.equal(normalizeDoctorTelegramUrl("093 562 39 45"), "https://t.me/+380935623945");

  assert.equal(normalizeDoctorTelegramUrl(""), null);
  assert.equal(normalizeDoctorTelegramUrl("   "), null);
  assert.equal(normalizeDoctorTelegramUrl(null), null);
  assert.equal(normalizeDoctorTelegramUrl("@ab"), null);
  assert.equal(normalizeDoctorTelegramUrl("https://t.me/"), null);
  assert.equal(normalizeDoctorTelegramUrl("not a valid link!"), null);
});

test("escapeTelegramHtml escapes &, <, and >", () => {
  assert.equal(
    escapeTelegramHtml('Біль <коліна> & набряк "помірний"'),
    'Біль &lt;коліна&gt; &amp; набряк "помірний"'
  );
});

test("getClubMedicalTelegramConfig: decrypts per-club medicalChatId and isolates non-default clubs", async () => {
  const env = process.env as Record<string, string | undefined>;
  const prevClubSecret = env.CLUB_SETTINGS_SECRET;
  const prevToken = env.TELEGRAM_BOT_TOKEN;

  try {
    env.CLUB_SETTINGS_SECRET = "test-medical-telegram-secret-32chars!!";
    env.TELEGRAM_BOT_TOKEN = "000:default-bot-token";

    const defaultClubId = "00000000-0000-0000-0000-000000000001";
    const clubA = "11111111-1111-1111-1111-111111111111";
    const clubB = "22222222-2222-2222-2222-222222222222";

    mockClubsById = {
      [defaultClubId]: {
        settings: {
          matchday_protocol: { default_doctor_name: "Лікар За замовчуванням" },
          telegram: {
            encrypted_medical_chat_id: encryptServerSecret("-100999000111"),
          },
        },
      },
      [clubA]: {
        settings: {
          matchday_protocol: { default_doctor_name: "Др. Мельник" },
          telegram: {
            bot_username: "club_a_med_bot",
            encrypted_token: encryptServerSecret("111:club-a-bot-token"),
            encrypted_chat_id: encryptServerSecret("-100111111111"),
            encrypted_medical_chat_id: encryptServerSecret("-100222222222"),
            doctor_telegram: "@dr_melnyk",
            doctor_phone: "+380501234567",
          },
        },
      },
      [clubB]: {
        settings: {
          telegram: {
            bot_username: "club_b_bot",
            encrypted_token: encryptServerSecret("222:club-b-bot-token"),
          },
        },
      },
    };

    const cfgA = await getClubMedicalTelegramConfig(clubA);
    assert.equal(cfgA.botToken, "111:club-a-bot-token");
    assert.equal(cfgA.botUsername, "club_a_med_bot");
    assert.equal(cfgA.medicalChatId, "-100222222222");
    assert.equal(cfgA.doctorTelegramUrl, "https://t.me/dr_melnyk");
    assert.equal(cfgA.doctorPhone, "+380501234567");
    assert.equal(cfgA.doctorName, "Др. Мельник");

    // Non-default club without doctor contact or medicalChatId must NOT inherit default club contacts
    const cfgB = await getClubMedicalTelegramConfig(clubB);
    assert.equal(cfgB.botToken, "222:club-b-bot-token");
    assert.equal(cfgB.medicalChatId, "");
    assert.equal(cfgB.doctorTelegramUrl, null);
    assert.equal(cfgB.doctorPhone, null);

    // Default club still falls back to default doctor contact if custom doctor fields are unset
    const cfgDefault = await getClubMedicalTelegramConfig(defaultClubId);
    assert.equal(cfgDefault.medicalChatId, "-100999000111");
    assert.equal(cfgDefault.doctorTelegramUrl, "https://t.me/+380935623945");
    assert.equal(cfgDefault.doctorPhone, "+380935623945");
  } finally {
    if (prevClubSecret === undefined) delete env.CLUB_SETTINGS_SECRET;
    else env.CLUB_SETTINGS_SECRET = prevClubSecret;
    if (prevToken === undefined) delete env.TELEGRAM_BOT_TOKEN;
    else env.TELEGRAM_BOT_TOKEN = prevToken;
  }
});

test("sendClubMedicalChatAlert returns not_configured when unconfigured and posts HTML payload when configured", async () => {
  const env = process.env as Record<string, string | undefined>;
  const prevClubSecret = env.CLUB_SETTINGS_SECRET;
  const prevAppUrl = env.NEXT_PUBLIC_APP_URL;
  const prevFetch = globalThis.fetch;

  try {
    env.CLUB_SETTINGS_SECRET = "test-medical-telegram-secret-32chars!!";
    env.NEXT_PUBLIC_APP_URL = "https://med.example.com";

    const unconfiguredClub = "33333333-3333-3333-3333-333333333333";
    const configuredClub = "44444444-4444-4444-4444-444444444444";

    mockClubsById = {
      [unconfiguredClub]: {
        settings: {
          telegram: {
            encrypted_token: encryptServerSecret("333:bot-token"),
            // encrypted_medical_chat_id intentionally omitted (even if encrypted_chat_id exists)
            encrypted_chat_id: encryptServerSecret("-100general"),
          },
        },
      },
      [configuredClub]: {
        settings: {
          telegram: {
            encrypted_token: encryptServerSecret("444:club-bot-token"),
            encrypted_medical_chat_id: encryptServerSecret("-100555666777"),
          },
        },
      },
    };

    const notConf = await sendClubMedicalChatAlert({
      clubId: unconfiguredClub,
      htmlText: "<b>Test</b>",
      playerId: "p-1",
    });
    assert.deepEqual(notConf, { sent: false, reason: "not_configured" });

    let capturedUrl = "";
    let capturedBody: any = null;
    globalThis.fetch = (async (url: any, init?: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    const sentRes = await sendClubMedicalChatAlert({
      clubId: configuredClub,
      htmlText: "<b>Травма</b>\nДеталі &lt;тест&gt;",
      playerId: "player-uuid-123",
    });

    assert.deepEqual(sentRes, { sent: true });
    assert.equal(
      capturedUrl,
      "https://api.telegram.org/bot444:club-bot-token/sendMessage"
    );
    assert.equal(capturedBody.chat_id, "-100555666777");
    assert.equal(capturedBody.parse_mode, "HTML");
    assert.equal(capturedBody.text, "<b>Травма</b>\nДеталі &lt;тест&gt;");
    assert.equal(
      capturedBody.reply_markup.inline_keyboard[0][0].url,
      "https://med.example.com/players/player-uuid-123"
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevClubSecret === undefined) delete env.CLUB_SETTINGS_SECRET;
    else env.CLUB_SETTINGS_SECRET = prevClubSecret;
    if (prevAppUrl === undefined) delete env.NEXT_PUBLIC_APP_URL;
    else env.NEXT_PUBLIC_APP_URL = prevAppUrl;
  }
});

test("source wiring checks across portals, club settings, and server actions", () => {
  const parentClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/parent/ParentPortalClient.tsx"),
    "utf8"
  );
  assert.match(parentClient, /data\.doctorContact\?\.telegramUrl/);
  assert.match(parentClient, /Написати лікарю в Telegram/);

  const rehabClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/portal/RehabPortalClient.tsx"),
    "utf8"
  );
  assert.match(rehabClient, /doctorContact={doctorContact}/);
  assert.match(rehabClient, /Написати лікарю в Telegram/);

  const clubSettingsClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/admin/ClubSettingsClient.tsx"),
    "utf8"
  );
  assert.match(clubSettingsClient, /medicalChatId/);
  assert.match(clubSettingsClient, /doctorTelegram/);
  assert.match(clubSettingsClient, /doctorPhone/);

  const parentActions = fs.readFileSync(
    path.join(process.cwd(), "src/actions/parent-portal-actions.ts"),
    "utf8"
  );
  assert.match(parentActions, /getClubMedicalTelegramConfig/);
  assert.match(parentActions, /sendClubMedicalChatAlert/);

  const rehabActions = fs.readFileSync(
    path.join(process.cwd(), "src/actions/rehab-portal-action.ts"),
    "utf8"
  );
  assert.match(rehabActions, /getClubMedicalTelegramConfig/);
  assert.match(rehabActions, /sendClubMedicalChatAlert/);

  const wellnessActions = fs.readFileSync(
    path.join(process.cwd(), "src/actions/wellness-entry-actions.ts"),
    "utf8"
  );
  assert.match(wellnessActions, /sendClubMedicalChatAlert/);
});
