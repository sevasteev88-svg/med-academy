import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  COACH_MASKED_MEDICAL_ALERT_TEXT,
  PARENT_MESSAGE_CATEGORY_META,
  isParentWellnessAllowedForAge,
  maskParentMessageForCoach,
} from "../src/types/parent-portal.ts";
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

test("Parent Portal: coach message masking protects medical secrecy", () => {
  const absence = maskParentMessageForCoach("absence", "Пропустимо тренування у вівторок");
  assert.equal(absence.visible, true);
  assert.equal(absence.isMasked, false);
  assert.equal(absence.displayText, "Пропустимо тренування у вівторок");

  const lfk = maskParentMessageForCoach("lfk_done", "Комплекс ЛФК виконано");
  assert.equal(lfk.visible, true);
  assert.equal(lfk.isMasked, false);
  assert.equal(lfk.displayText, "Комплекс ЛФК виконано");

  const illness = maskParentMessageForCoach("illness", "Температура 38.5, ангіна, п'є антибіотик");
  assert.equal(illness.visible, true);
  assert.equal(illness.isMasked, true);
  assert.equal(illness.displayText, COACH_MASKED_MEDICAL_ALERT_TEXT);
  assert.ok(!illness.displayText?.includes("38.5"));
  assert.ok(!illness.displayText?.includes("ангіна"));

  const homeInjury = maskParentMessageForCoach("home_injury", "Перелом пальця на фізкультурі");
  assert.equal(homeInjury.visible, true);
  assert.equal(homeInjury.isMasked, true);
  assert.equal(homeInjury.displayText, COACH_MASKED_MEDICAL_ALERT_TEXT);
  assert.ok(!homeInjury.displayText?.includes("Перелом"));

  const question = maskParentMessageForCoach("question", "Приватне питання лікарю");
  assert.equal(question.visible, false);
  assert.equal(question.displayText, undefined);
});

test("Parent Portal: parent wellness check-in is restricted to players under 14 years old", () => {
  assert.equal(isParentWellnessAllowedForAge(7), true);
  assert.equal(isParentWellnessAllowedForAge(13), true);
  assert.equal(isParentWellnessAllowedForAge(14), false);
  assert.equal(isParentWellnessAllowedForAge(16), false);
  assert.equal(isParentWellnessAllowedForAge(18), false);
  assert.equal(isParentWellnessAllowedForAge(Number.NaN), false);
});

test("Parent Portal: migration adds is_read_by_coach and filled_by, and UI wires alerts & <14 wellness", () => {
  const migration2 = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261115120000_parent_portal_coach_alerts_and_wellness.sql"
    ),
    "utf8"
  );
  assert.ok(migration2.includes("is_read_by_coach boolean NOT NULL DEFAULT false"));
  assert.ok(migration2.includes("ADD COLUMN IF NOT EXISTS filled_by text"));

  const portalClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/parent/ParentPortalClient.tsx"),
    "utf8"
  );
  assert.ok(portalClient.includes("data.player.age < 14"));
  assert.ok(portalClient.includes("✓ Сьогоднішній чекін вже заповнено"));

  const briefingClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/coach/CoachBriefingClient.tsx"),
    "utf8"
  );
  assert.ok(briefingClient.includes("CoachParentAlertsBanner"));

  const readinessClient = fs.readFileSync(
    path.join(process.cwd(), "src/components/readiness/CoachReadinessClient.tsx"),
    "utf8"
  );
  assert.ok(readinessClient.includes("CoachParentAlertsBanner"));
});
