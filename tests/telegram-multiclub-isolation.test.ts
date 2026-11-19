import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import {
  encryptServerSecret,
  decryptServerSecret,
} from "../src/lib/server-crypto.ts";

let mockClubsById: Record<string, any> = {};

(globalThis as any).__TEST_CLUB_TG_SUPABASE__ = () => ({
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
      return { shortCircuit: true, url: "test://club-tg-admin" };
    }
    if (specifier === "@/lib/auth") {
      return { shortCircuit: true, url: "test://club-tg-auth" };
    }
    if (specifier === "@/lib/telegram-auth") {
      return { shortCircuit: true, url: "test://club-tg-telegram-auth" };
    }
    if (specifier === "@/lib/server-crypto") {
      return nextResolve(
        new URL("../src/lib/server-crypto.ts", import.meta.url).href,
        context
      );
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test://club-tg-admin") {
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export function createAdminClient() { return globalThis.__TEST_CLUB_TG_SUPABASE__(); }",
      };
    }
    if (url === "test://club-tg-auth") {
      return {
        shortCircuit: true,
        format: "module",
        source:
          'export const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";',
      };
    }
    if (url === "test://club-tg-telegram-auth") {
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

const { getClubTelegramConfig } = await import("../src/lib/club-telegram.ts");

function encryptWithLegacyKey(plainText: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

test("server-crypto: encrypts with primary key and decrypts both primary and legacy anon-key secrets", () => {
  const env = process.env as Record<string, string | undefined>;
  const prevClubSecret = env.CLUB_SETTINGS_SECRET;
  const prevPlayerSecret = env.PLAYER_SESSION_SECRET;
  const prevAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    env.CLUB_SETTINGS_SECRET = "primary-club-secret-at-least-32-chars!!";
    env.PLAYER_SESSION_SECRET = "secondary-player-secret-32-chars!!";
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-key-used-on-nov-15";

    const modernEncrypted = encryptServerSecret("999:modern-bot-token");
    assert.equal(decryptServerSecret(modernEncrypted), "999:modern-bot-token");

    assert.throws(() => {
      const [ivHex, tagHex, encHex] = modernEncrypted.split(":");
      const anonKey = crypto
        .createHash("sha256")
        .update(env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
        .digest();
      const dec = crypto.createDecipheriv(
        "aes-256-gcm",
        anonKey,
        Buffer.from(ivHex, "hex")
      );
      dec.setAuthTag(Buffer.from(tagHex, "hex"));
      dec.update(encHex, "hex", "utf8");
      dec.final("utf8");
    });

    const legacyEncrypted = encryptWithLegacyKey(
      "123:dyussh11-bot-token",
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    assert.equal(decryptServerSecret(legacyEncrypted), "123:dyussh11-bot-token");
  } finally {
    if (prevClubSecret === undefined) delete env.CLUB_SETTINGS_SECRET;
    else env.CLUB_SETTINGS_SECRET = prevClubSecret;
    if (prevPlayerSecret === undefined) delete env.PLAYER_SESSION_SECRET;
    else env.PLAYER_SESSION_SECRET = prevPlayerSecret;
    if (prevAnon === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  }
});

test("club-telegram: non-default clubs never fall back to global Chornomorets bot", async () => {
  const env = process.env as Record<string, string | undefined>;
  const prevToken = env.TELEGRAM_BOT_TOKEN;
  const prevClubSecret = env.CLUB_SETTINGS_SECRET;
  const prevAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    env.TELEGRAM_BOT_TOKEN = "000:chornomorets-default-token";
    env.CLUB_SETTINGS_SECRET = "primary-club-secret-at-least-32-chars!!";
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-key-used-on-nov-15";

    const dyusshId = "13a6744b-6e76-4a6e-986e-5710ebe093c8";
    const defaultId = "00000000-0000-0000-0000-000000000001";

    // Case 1: legacy-encrypted custom bot for ДЮСШ-11 decrypts cleanly
    mockClubsById = {
      [dyusshId]: {
        settings: {
          telegram: {
            bot_username: "medacademy_sport_bot",
            encrypted_token: encryptWithLegacyKey(
              "777:medacademy-sport-bot-token",
              env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            ),
          },
        },
      },
      [defaultId]: { settings: {} },
    };

    const dyusshCfg = await getClubTelegramConfig(dyusshId);
    assert.equal(dyusshCfg.botToken, "777:medacademy-sport-bot-token");
    assert.equal(dyusshCfg.botUsername, "medacademy_sport_bot");

    // Case 2: corrupted/missing custom token for non-default club refuses fallback to Chornomorets
    mockClubsById[dyusshId] = {
      settings: {
        telegram: {
          bot_username: "medacademy_sport_bot",
          encrypted_token: "bad:iv:tag",
        },
      },
    };
    const brokenCfg = await getClubTelegramConfig(dyusshId);
    assert.equal(brokenCfg.botToken, "");
    assert.notEqual(brokenCfg.botToken, env.TELEGRAM_BOT_TOKEN);
    assert.equal(brokenCfg.botUsername, "medacademy_sport_bot");

    // Case 3: default club without custom bot still uses default bot
    const defaultCfg = await getClubTelegramConfig(defaultId);
    assert.equal(defaultCfg.botToken, "000:chornomorets-default-token");
    assert.equal(defaultCfg.botUsername, "chornomorets_doctor_bot");
  } finally {
    if (prevToken === undefined) delete env.TELEGRAM_BOT_TOKEN;
    else env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevClubSecret === undefined) delete env.CLUB_SETTINGS_SECRET;
    else env.CLUB_SETTINGS_SECRET = prevClubSecret;
    if (prevAnon === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  }
});

test("source checks: multi-club club_id scoping across webhook, coach bot, messaging adapter, cron, actions, and mini app", () => {
  const clubTelegramSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/club-telegram.ts"),
    "utf8"
  );
  assert.match(clubTelegramSrc, /isNonDefaultClub/);
  assert.match(clubTelegramSrc, /refusing cross-club fallback/);

  const coachBotSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/coach-telegram-bot.ts"),
    "utf8"
  );
  assert.match(coachBotSrc, /resolveCoachBotToken\(\s*chatId: string,\s*clubId\?: string \| null/);
  assert.match(coachBotSrc, /tg-coach\?clubId=/);
  assert.match(coachBotSrc, /sendMorningWellnessRemindersAction\(\{\s*clubId:/);

  const webhookSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/telegram-actions.ts"),
    "utf8"
  );
  assert.match(webhookSrc, /const scopedClubId = overrideClubId \|\| DEFAULT_CLUB_ID/);
  assert.match(webhookSrc, /Cross-club token mismatch/);
  assert.match(webhookSrc, /\.eq\("club_id", scopedClubId\)/);
  assert.match(webhookSrc, /sendCoachMainMenu\(chatId, undefined, coachName, clubId\)/);

  const coachActionsSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/coach-telegram-actions.ts"),
    "utf8"
  );
  assert.match(coachActionsSrc, /\.eq\("club_id", currentClubId\)/);
  assert.match(coachActionsSrc, /getClubTelegramConfig\(clubId\)/);
  assert.match(coachActionsSrc, /explicitClubId\?: string/);

  const messagingSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/messaging-adapter.ts"),
    "utf8"
  );
  assert.match(messagingSrc, /getClubTelegramConfig\(clubId\)/);
  assert.ok(
    !messagingSrc.includes("msgConfig.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN"),
    "messaging-adapter.ts must not fall back directly to global TELEGRAM_BOT_TOKEN"
  );

  const tgCoachApiSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/tg-coach/route.ts"),
    "utf8"
  );
  assert.match(tgCoachApiSrc, /getClubTelegramConfig/);
  assert.match(tgCoachApiSrc, /\.eq\("club_id", verifiedClubId\)/);

  const tgCoachUiSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/coach/TgCoachMiniApp.tsx"),
    "utf8"
  );
  assert.match(tgCoachUiSrc, /function getApiUrl\(\)/);
  assert.match(tgCoachUiSrc, /\/api\/tg-coach\?clubId=/);

  const cronSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/cron/coach-daily/route.ts"),
    "utf8"
  );
  assert.match(cronSrc, /getClubTelegramConfig\(b\.club_id\)/);
  assert.match(cronSrc, /clubId: b\.club_id \|\| undefined/);
});
