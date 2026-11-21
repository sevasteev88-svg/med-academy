import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  parseDataUrlImage,
  formatStoragePhotoRef,
  extractStoragePathFromPhotoRef,
  MAX_PLAYER_PHOTO_BYTES,
} from "../src/lib/player-photo-utils.ts";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("1. Фото игроков: валидация data URL, лимит 3 МБ, Storage helpers и SQL-миграция", () => {
  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const parsed = parseDataUrlImage(`data:image/png;base64,${tinyPngBase64}`);
  assert.ok(!("error" in parsed), "Valid PNG data URL must parse");
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.ext, "png");
  assert.ok(parsed.buffer.byteLength > 0);

  const jpegParsed = parseDataUrlImage(`data:image/jpg;base64,${tinyPngBase64}`);
  assert.ok(!("error" in jpegParsed));
  assert.equal(jpegParsed.mimeType, "image/jpeg");
  assert.equal(jpegParsed.ext, "jpg");

  const badMime = parseDataUrlImage("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
  assert.ok("error" in badMime, "SVG data URL must be rejected");

  const oversizedBuf = Buffer.alloc(MAX_PLAYER_PHOTO_BYTES + 100, 1);
  const oversized = parseDataUrlImage(
    `data:image/jpeg;base64,${oversizedBuf.toString("base64")}`
  );
  assert.ok("error" in oversized, "Payloads larger than 3 MB must be rejected");

  const storageRef = formatStoragePhotoRef("club-1/player-1/avatar.png");
  assert.equal(storageRef, "storage:player-photos:club-1/player-1/avatar.png");
  assert.equal(
    extractStoragePathFromPhotoRef(storageRef),
    "club-1/player-1/avatar.png"
  );
  assert.equal(extractStoragePathFromPhotoRef("https://example.com/a.png"), null);

  const migrationSql = readWorkspaceFile(
    "supabase/migrations/20261121160000_medium_priority_photos_and_rate_limit.sql"
  );
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS photo_url text/);
  assert.match(migrationSql, /'player-photos'/);
  assert.match(migrationSql, /player_photos_select_club_staff/);
  assert.match(migrationSql, /idx_player_auth_ip_attempts_unique_ip/);

  const savePhotoSrc = readWorkspaceFile("src/actions/save-player-photo-action.ts");
  assert.match(savePhotoSrc, /parseDataUrlImage/);
  assert.match(savePhotoSrc, /PLAYER_PHOTOS_BUCKET/);
  assert.match(savePhotoSrc, /formatStoragePhotoRef/);

  for (const readerPath of [
    "src/app/players/page.tsx",
    "src/app/players/[id]/page.tsx",
    "src/app/rtp/page.tsx",
  ]) {
    const src = readWorkspaceFile(readerPath);
    assert.match(src, /loadClubPlayerPhotos/, `${readerPath} must use loadClubPlayerPhotos`);
  }
});

test("2. Офлайн AES-GCM ключ персистится в IndexedDB и VoiceNoteTextarea не пересоздает SpeechRecognition", () => {
  const cryptoSrc = readWorkspaceFile("src/lib/offline-crypto.ts");
  assert.match(cryptoSrc, /medacademy_offline_keystore/);
  assert.match(cryptoSrc, /loadPersistedCryptoKey/);
  assert.match(cryptoSrc, /savePersistedCryptoKey/);
  assert.match(cryptoSrc, /export async function clearSessionCryptoKey/);

  const voiceSrc = readWorkspaceFile("src/components/voice/VoiceNoteTextarea.tsx");
  assert.match(voiceSrc, /valueRef/);
  assert.match(voiceSrc, /onChangeRef/);
  assert.match(voiceSrc, /\}, \[\]\);/);
});

test("3. Rate limiting переведен на PostgreSQL (player_auth_ip_attempts) с защитой IP-заголовков", () => {
  const persistentSrc = readWorkspaceFile("src/lib/player-rate-limit-server.ts");
  assert.match(persistentSrc, /from\("player_auth_ip_attempts"\)/);
  assert.match(persistentSrc, /checkRateLimitPersistent/);
  assert.match(persistentSrc, /recordFailedAttemptPersistent/);
  assert.match(persistentSrc, /resetAttemptsPersistent/);

  const portalActionSrc = readWorkspaceFile("src/actions/rehab-portal-action.ts");
  assert.match(portalActionSrc, /checkRateLimitPersistent/);
  assert.match(portalActionSrc, /recordFailedAttemptPersistent/);
  assert.match(portalActionSrc, /resetAttemptsPersistent/);

  const deviceServerSrc = readWorkspaceFile("src/lib/player-device-server.ts");
  assert.match(deviceServerSrc, /checkRateLimitPersistent/);
  assert.match(deviceServerSrc, /recordFailedAttemptPersistent/);
  assert.match(deviceServerSrc, /resetAttemptsPersistent/);

  for (const authFile of ["src/lib/player-auth.ts", "src/lib/player-device-auth.ts"]) {
    const src = readWorkspaceFile(authFile);
    assert.match(src, /x-vercel-forwarded-for/, `${authFile} must inspect x-vercel-forwarded-for`);
    assert.match(src, /cf-connecting-ip/, `${authFile} must inspect cf-connecting-ip`);
  }
});

test("4. MFA aal2 проверка подключена в assertAdmin и assertDoctor без блокировки неактивированных админов", () => {
  const authSrc = readWorkspaceFile("src/lib/auth.ts");
  assert.match(authSrc, /checkMfaEnforcementForUser/);
  assert.match(authSrc, /getAuthenticatorAssuranceLevel/);
  assert.match(authSrc, /evaluateMfaPolicy/);
  assert.match(authSrc, /nextLevel === "aal2"/);

  const checksCount = authSrc.match(/checkMfaEnforcementForUser\(user\)/g)?.length ?? 0;
  assert.equal(checksCount, 2, "Both assertAdmin and assertDoctor must enforce MFA policy");
});
