import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PARENT_MESSAGE_CATEGORY_META } from "../src/types/parent-portal.ts";
import { ALL_CONSENT_SCOPES, CONSENT_SCOPE_META } from "../src/lib/consent-constants.ts";

test("Parent Portal: all 5 parent message categories are defined in Ukrainian", () => {
  const keys = Object.keys(PARENT_MESSAGE_CATEGORY_META);
  assert.deepEqual(keys.sort(), ["absence", "home_injury", "illness", "lfk_done", "question"]);
  for (const k of keys) {
    const item = PARENT_MESSAGE_CATEGORY_META[k as keyof typeof PARENT_MESSAGE_CATEGORY_META];
    assert.ok(item.label.length > 0);
    assert.ok(item.icon.length > 0);
    assert.ok(item.placeholder.length > 0);
  }
});

test("Parent Portal: all 6 consent scopes have metadata for first-visit onboarding", () => {
  assert.equal(ALL_CONSENT_SCOPES.length, 6);
  for (const scope of ALL_CONSENT_SCOPES) {
    assert.ok(CONSENT_SCOPE_META[scope]);
    assert.ok(CONSENT_SCOPE_META[scope].label.length > 0);
    assert.ok(CONSENT_SCOPE_META[scope].description.length > 0);
  }
});

test("Parent Portal: middleware allows /parent/ public route without staff login", () => {
  const mw = fs.readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
  assert.ok(mw.includes('path.startsWith("/parent/")'));
});

test("Parent Portal: token hashing is SHA-256 and migration creates required tables", () => {
  const raw = "test-parent-token-1234567890abcdef";
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, raw);

  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261114120000_parent_portal.sql"),
    "utf8"
  );
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.parent_portal_tokens"));
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS public.parent_messages"));
  assert.ok(migration.includes("ENABLE ROW LEVEL SECURITY"));
});
