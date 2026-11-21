import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";

import {
  extractDeviceSessionPayloadForDbVerification,
  verifyDeviceSessionCookieValue,
} from "../src/lib/player-device-auth.ts";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function buildLegacyCookie(payload: Record<string, unknown>, legacySecret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", legacySecret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

describe("Хотфікс відновлення QR-сесій гравців після зміни PLAYER_SESSION_SECRET", () => {
  it("extractDeviceSessionPayloadForDbVerification витягує payload зі старої куки з іншим HMAC-ключем, тоді як verifyDeviceSessionCookieValue її відхиляє", () => {
    const valid256BitSecret = crypto.randomBytes(32).toString("hex");
    const legacyCookie = buildLegacyCookie(
      {
        deviceId: "dev-legacy-1",
        sessionSecret: valid256BitSecret,
        playerId: "player-u19-1",
        iat: Math.floor(Date.now() / 1000) - 86400,
      },
      "old-anon-key-secret-before-rotation"
    );

    assert.equal(verifyDeviceSessionCookieValue(legacyCookie), null);

    const extracted = extractDeviceSessionPayloadForDbVerification(legacyCookie);
    assert.deepEqual(extracted, {
      deviceId: "dev-legacy-1",
      sessionSecret: valid256BitSecret,
      playerId: "player-u19-1",
    });
  });

  it("extractDeviceSessionPayloadForDbVerification відхиляє биті куки та короткі sessionSecret (< 32 символів)", () => {
    assert.equal(extractDeviceSessionPayloadForDbVerification(""), null);
    assert.equal(extractDeviceSessionPayloadForDbVerification("nodotcookie"), null);
    assert.equal(extractDeviceSessionPayloadForDbVerification("invalid!.sig"), null);

    const shortSecretCookie = buildLegacyCookie(
      {
        deviceId: "dev-1",
        sessionSecret: "too-short-secret",
        playerId: "player-1",
      },
      "legacy-key"
    );
    assert.equal(extractDeviceSessionPayloadForDbVerification(shortSecretCookie), null);

    const missingFieldsCookie = buildLegacyCookie(
      {
        deviceId: "dev-1",
        sessionSecret: crypto.randomBytes(32).toString("hex"),
      },
      "legacy-key"
    );
    assert.equal(extractDeviceSessionPayloadForDbVerification(missingFieldsCookie), null);
  });

  it("player-auth.ts підтримує безпечне відновлення через validateDeviceSessionRecord, перепідпис та ізольований catch при очищенні кук у RSC", () => {
    const src = readWorkspaceFile("src/lib/player-auth.ts");
    assert.match(src, /extractDeviceSessionPayloadForDbVerification/);
    assert.match(src, /validateDeviceSessionRecord/);
    assert.match(src, /validation\.playerId === parsed\.playerId/);
    assert.match(src, /setDeviceSessionCookie\(parsed\.deviceId, parsed\.sessionSecret, validation\.playerId\)/);
    assert.match(src, /try\s*\{\s*cookieStore\.set\("rehab_device_session"/);
    assert.match(src, /return null;/);
  });

  it("/a/[token]/route.ts перевіряє існуючі куки перед редіректом і перепідписує старі куки", () => {
    const src = readWorkspaceFile("src/app/a/[token]/route.ts");
    assert.ok(
      !src.includes('if (existingDeviceCookie || existingPlayerSession) {\n    return NextResponse.redirect'),
      "/a/[token] must not blindly redirect on raw cookies without validation"
    );
    assert.match(src, /verifyDeviceSessionCookieValue/);
    assert.match(src, /extractDeviceSessionPayloadForDbVerification/);
    assert.match(src, /validateDeviceSessionRecord/);
    assert.match(src, /verifySessionToken/);
    assert.match(src, /attachDeviceSessionCookies/);
  });

  it("RehabPortalClient.tsx показує QR-інструкцію як основний спосіб входу та згортає форму PIN у showPinForm", () => {
    const src = readWorkspaceFile("src/components/portal/RehabPortalClient.tsx");
    assert.match(src, /showPinForm/);
    assert.match(src, /Вхід за персональним QR-кодом/);
    assert.match(src, /Резервний вхід за токеном і 6-значним PIN/);
  });
});
