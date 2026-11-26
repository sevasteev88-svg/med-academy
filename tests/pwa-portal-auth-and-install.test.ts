import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";

import {
  MAX_ACTIVE_DEVICES_PER_PLAYER,
  createDeviceSessionCookieValue,
  createPwaBootstrapToken,
  verifyPwaBootstrapToken,
  extractPwaBootstrapPayloadForDbVerification,
} from "../src/lib/player-device-auth.ts";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), relPath));
}

describe("PWA auth & install for Player Portal & Parent Portal (iOS + Android)", () => {
  it("MAX_ACTIVE_DEVICES_PER_PLAYER збільшено до 5, щоб Safari + Telegram + PWA не вибивали одне одного", () => {
    assert.equal(MAX_ACTIVE_DEVICES_PER_PLAYER, 5);
  });

  it("createPwaBootstrapToken / verifyPwaBootstrapToken коректно підписують, валідують і захищають від підміни та інших типів токенів", () => {
    const secret = crypto.randomBytes(32).toString("hex");
    const token = createPwaBootstrapToken("dev-pwa-1", secret, "player-19");

    const verified = verifyPwaBootstrapToken(token);
    assert.deepEqual(verified, {
      deviceId: "dev-pwa-1",
      sessionSecret: secret,
      playerId: "player-19",
    });

    // Підроблений підпис відхиляється
    const [enc] = token.split(".");
    assert.equal(verifyPwaBootstrapToken(`${enc}.tampered_sig`), null);

    // Звичайна cookie пристрою не приймається як PWA bootstrap token (domain separation)
    const deviceCookie = createDeviceSessionCookieValue("dev-pwa-1", secret, "player-19");
    assert.equal(verifyPwaBootstrapToken(deviceCookie), null);
    assert.equal(extractPwaBootstrapPayloadForDbVerification(deviceCookie), null);
  });

  it("extractPwaBootstrapPayloadForDbVerification витягує payload для перевірки в БД при ротації секрету", () => {
    const secret = crypto.randomBytes(32).toString("hex");
    const payload = {
      deviceId: "dev-rotated",
      sessionSecret: secret,
      playerId: "player-2",
      purpose: "pwa_bootstrap",
      iat: Math.floor(Date.now() / 1000),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const legacySig = crypto
      .createHmac("sha256", "old-secret-before-rotation")
      .update(`pwa_bootstrap:${encoded}`)
      .digest("base64url");
    const rotatedToken = `${encoded}.${legacySig}`;

    assert.equal(verifyPwaBootstrapToken(rotatedToken), null);
    assert.deepEqual(extractPwaBootstrapPayloadForDbVerification(rotatedToken), {
      deviceId: "dev-rotated",
      sessionSecret: secret,
      playerId: "player-2",
    });
  });

  it("Існують динамічні маніфести та маршрути входу для кабінету гравця та кабінету батьків", () => {
    assert.ok(fileExists("src/app/api/rehab-portal/manifest/route.ts"));
    assert.ok(fileExists("src/app/api/rehab-portal/pwa-entry/route.ts"));
    assert.ok(fileExists("src/app/api/parent/manifest/route.ts"));
    assert.ok(fileExists("src/app/parent/page.tsx"));
    assert.ok(fileExists("src/components/parent/ParentPortalEntryClient.tsx"));
    assert.ok(fileExists("src/components/portal/QrScannerModal.tsx"));

    const playerManifestSrc = readWorkspaceFile("src/app/api/rehab-portal/manifest/route.ts");
    assert.match(playerManifestSrc, /application\/manifest\+json/);
    assert.match(playerManifestSrc, /\/api\/rehab-portal\/pwa-entry\?k=/);

    const parentManifestSrc = readWorkspaceFile("src/app/api/parent/manifest/route.ts");
    assert.match(parentManifestSrc, /application\/manifest\+json/);
    assert.match(parentManifestSrc, /\/parent\//);

    const pwaEntrySrc = readWorkspaceFile("src/app/api/rehab-portal/pwa-entry/route.ts");
    assert.match(pwaEntrySrc, /validateDeviceSessionRecord/);
    assert.match(pwaEntrySrc, /DEVICE_COOKIE_NAME/);
    assert.match(pwaEntrySrc, /rehab_player_session/);
  });

  it("proxy.ts відкриває публічний доступ до маніфестів і /parent та рятує старий Android ярлик з / на /rehab-portal", () => {
    const proxySrc = readWorkspaceFile("src/proxy.ts");
    assert.match(proxySrc, /"\/parent"/);
    assert.match(proxySrc, /"\/api\/rehab-portal\/"/);
    assert.match(proxySrc, /"\/api\/parent\/"/);
    assert.match(proxySrc, /rehab_device_session/);
    assert.match(proxySrc, /new URL\("\/rehab-portal"/);
  });

  it("PwaInstallPromptModal підтримує in-app браузери, iOS replaceState та Android інструкцію", () => {
    const modalSrc = readWorkspaceFile("src/components/portal/PwaInstallPromptModal.tsx");
    assert.match(modalSrc, /isInAppBrowser/);
    assert.match(modalSrc, /pwaInstallPath/);
    assert.match(modalSrc, /replaceState/);
    assert.match(modalSrc, /beforeinstallprompt/);
    assert.match(modalSrc, /clipboard\.writeText/);
  });

  it("RehabPortalClient та ParentPortalClient підключають PWA встановлення та вхід без PIN", () => {
    const rehabSrc = readWorkspaceFile("src/components/portal/RehabPortalClient.tsx");
    assert.match(rehabSrc, /QrScannerModal/);
    assert.match(rehabSrc, /extractActivationHref/);
    assert.match(rehabSrc, /pwaBootstrapToken/);
    assert.match(rehabSrc, /📲 На екран/);

    const parentSrc = readWorkspaceFile("src/components/parent/ParentPortalClient.tsx");
    assert.match(parentSrc, /PwaInstallPromptModal/);
    assert.match(parentSrc, /med_parent_portal_token/);
    assert.match(parentSrc, /📲/);
  });
});
