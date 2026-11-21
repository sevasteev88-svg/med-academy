import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyTimingSafeSecret,
  getPlayerSessionSecret,
  getClubSettingsMasterKey,
  getWayForPaySecretKey,
  getSafeRedirectPath,
} from "../src/lib/server-secrets.ts";
import {
  generateWayForPaySignature,
  verifyWayForPayWebhookSignature,
} from "../src/lib/billing.ts";

describe("Волна 1 (1.1–1.2) — Серверні секрети, редіректи та підпис WayForPay", () => {
  it("verifyTimingSafeSecret коректно порівнює секрети незалежно від довжини", () => {
    assert.equal(verifyTimingSafeSecret("super-secret-token", "super-secret-token"), true);
    assert.equal(verifyTimingSafeSecret("super-secret-token", "super-secret-tokeN"), false);
    assert.equal(verifyTimingSafeSecret("short", "much-longer-secret"), false);
    assert.equal(verifyTimingSafeSecret(null, "secret"), false);
    assert.equal(verifyTimingSafeSecret(undefined, "secret"), false);
    assert.equal(verifyTimingSafeSecret("", "secret"), false);
    assert.equal(verifyTimingSafeSecret("secret", ""), false);
  });

  it("getPlayerSessionSecret кидає помилку в production без PLAYER_SESSION_SECRET навіть за наявності ANON_KEY", () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    const prevSecret = env.PLAYER_SESSION_SECRET;
    const prevAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      env.NODE_ENV = "production";
      delete env.PLAYER_SESSION_SECRET;
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key-that-must-never-be-used";

      assert.throws(() => getPlayerSessionSecret(), /PLAYER_SESSION_SECRET must be set/);

      env.PLAYER_SESSION_SECRET = "too-short";
      assert.throws(() => getPlayerSessionSecret(), /PLAYER_SESSION_SECRET must be set/);

      const strongSecret = "a".repeat(32);
      env.PLAYER_SESSION_SECRET = strongSecret;
      assert.equal(getPlayerSessionSecret(), strongSecret);
    } finally {
      if (prevNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prevNodeEnv;
      if (prevSecret === undefined) delete env.PLAYER_SESSION_SECRET;
      else env.PLAYER_SESSION_SECRET = prevSecret;
      if (prevAnon === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    }
  });

  it("getClubSettingsMasterKey кидає помилку в production без секрету навіть за наявності ANON_KEY", () => {
    const env = process.env as Record<string, string | undefined>;
    const prevNodeEnv = env.NODE_ENV;
    const prevClubSecret = env.CLUB_SETTINGS_SECRET;
    const prevPlayerSecret = env.PLAYER_SESSION_SECRET;
    const prevAnon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      env.NODE_ENV = "production";
      delete env.CLUB_SETTINGS_SECRET;
      delete env.PLAYER_SESSION_SECRET;
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key-that-must-never-be-used";

      assert.throws(() => getClubSettingsMasterKey(), /CLUB_SETTINGS_SECRET/);

      env.CLUB_SETTINGS_SECRET = "b".repeat(32);
      const key = getClubSettingsMasterKey();
      assert.equal(Buffer.isBuffer(key), true);
      assert.equal(key.length, 32);
    } finally {
      if (prevNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = prevNodeEnv;
      if (prevClubSecret === undefined) delete env.CLUB_SETTINGS_SECRET;
      else env.CLUB_SETTINGS_SECRET = prevClubSecret;
      if (prevPlayerSecret === undefined) delete env.PLAYER_SESSION_SECRET;
      else env.PLAYER_SESSION_SECRET = prevPlayerSecret;
      if (prevAnon === undefined) delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    }
  });

  it("getWayForPaySecretKey завжди fail-closed без WAYFORPAY_SECRET_KEY", () => {
    const env = process.env as Record<string, string | undefined>;
    const prevSecret = env.WAYFORPAY_SECRET_KEY;

    try {
      delete env.WAYFORPAY_SECRET_KEY;
      assert.throws(() => getWayForPaySecretKey(), /WAYFORPAY_SECRET_KEY is not configured/);

      env.WAYFORPAY_SECRET_KEY = "wfp_live_secret_key";
      assert.equal(getWayForPaySecretKey(), "wfp_live_secret_key");
    } finally {
      if (prevSecret === undefined) delete env.WAYFORPAY_SECRET_KEY;
      else env.WAYFORPAY_SECRET_KEY = prevSecret;
    }
  });

  it("getSafeRedirectPath пропускає лише безпечні внутрішні шляхи та блокує Open Redirect", () => {
    const origin = "https://medacademy.app";
    assert.equal(getSafeRedirectPath("/coach-briefing", origin), "/coach-briefing");
    assert.equal(
      getSafeRedirectPath("/players/123?tab=injuries", origin),
      "/players/123?tab=injuries"
    );

    assert.equal(getSafeRedirectPath("//evil.com", origin), "/coach-briefing");
    assert.equal(getSafeRedirectPath("/\\evil.com", origin), "/coach-briefing");
    assert.equal(getSafeRedirectPath("https://evil.com", origin), "/coach-briefing");
    assert.equal(getSafeRedirectPath("/\r\n/evil", origin), "/coach-briefing");
    assert.equal(getSafeRedirectPath(null, origin, "/"), "/");
  });

  it("verifyWayForPayWebhookSignature перевіряє HMAC-MD5 та відхиляє підробки", () => {
    const secret = "merchant_super_secret_key";
    const basePayload = {
      merchantAccount: "club_merch_1",
      orderReference: "MED-MTH-879967E4-ABC1",
      amount: 200,
      currency: "UAH",
      authCode: "123456",
      cardPan: "4444****1111",
      transactionStatus: "Approved",
      reasonCode: 1100,
    };

    const signFields = [
      basePayload.merchantAccount,
      basePayload.orderReference,
      String(basePayload.amount),
      basePayload.currency,
      basePayload.authCode,
      basePayload.cardPan,
      basePayload.transactionStatus,
      String(basePayload.reasonCode),
    ];
    const validSig = generateWayForPaySignature(signFields, secret);

    assert.equal(
      verifyWayForPayWebhookSignature({ ...basePayload, merchantSignature: validSig }, secret),
      true
    );
    assert.equal(
      verifyWayForPayWebhookSignature(
        { ...basePayload, amount: 1, merchantSignature: validSig },
        secret
      ),
      false
    );
    assert.equal(
      verifyWayForPayWebhookSignature(
        { ...basePayload, transactionStatus: "Declined", merchantSignature: validSig },
        secret
      ),
      false
    );
    assert.equal(verifyWayForPayWebhookSignature(basePayload, secret), false);
    assert.equal(
      verifyWayForPayWebhookSignature(
        { ...basePayload, merchantSignature: validSig },
        "wrong_secret"
      ),
      false
    );
  });
});
