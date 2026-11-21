import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Wave 3.1: batch consent helpers exist and readiness/training/reminders avoid N+1 loops", () => {
  const consentsSrc = readWorkspaceFile("src/lib/consents.ts");
  assert.match(consentsSrc, /export type BatchConsentStatus/);
  assert.match(consentsSrc, /export async function getPlayersConsentStatusBatch/);
  assert.match(consentsSrc, /export async function hasConsentBatch/);
  assert.match(consentsSrc, /preloadedActiveDocs/);
  assert.ok(
    consentsSrc.includes('.in("player_id", uniqueIds)') || consentsSrc.includes(".in('player_id', uniqueIds)"),
    "Batch consent loaders must query by player_id IN (...)"
  );
  assert.ok(
    consentsSrc.includes("[CONSENT_RECORD]"),
    "Batch consent helpers must preserve legacy [CONSENT_RECORD] fallback"
  );

  const readinessSrc = readWorkspaceFile("src/actions/readiness-actions.ts");
  assert.match(readinessSrc, /function parseClubReadinessConfig/);
  assert.match(readinessSrc, /AbortSignal\.timeout\(15000\)/);
  assert.match(readinessSrc, /getPlayersConsentStatusBatch/);
  assert.ok(
    !readinessSrc.includes("await getPlayerConsentSummary("),
    "readiness-actions.ts must not await getPlayerConsentSummary inside per-player loops"
  );

  const trainingSrc = readWorkspaceFile("src/actions/training-session-actions.ts");
  assert.match(trainingSrc, /hasConsentBatch/);
  assert.ok(
    !trainingSrc.includes("await hasConsent("),
    "training-session-actions.ts must not call per-player hasConsent sequentially"
  );

  const passportSrc = readWorkspaceFile("src/actions/passport-reminder-actions.ts");
  assert.match(passportSrc, /AbortSignal\.timeout\(15000\)/);
  assert.match(passportSrc, /Promise\.all/);
  assert.match(passportSrc, /Promise\.allSettled/);

  const coachTgSrc = readWorkspaceFile("src/lib/coach-telegram-server.ts");
  assert.match(coachTgSrc, /Promise\.all/);
  assert.ok(
    coachTgSrc.includes('.from("workload_sessions").insert(') && coachTgSrc.includes('.from("exposures").insert('),
    "finalizeCoachTrainingSession must batch insert workload_sessions and exposures"
  );

  const tgRemindersSrc = readWorkspaceFile("src/lib/telegram-reminders-server.ts");
  assert.match(tgRemindersSrc, /Promise\.all/);
  assert.match(tgRemindersSrc, /Promise\.allSettled/);
});

test("Wave 3.2: heavy pages and loaders optimize queries, use React.cache, and enforce club_id isolation", () => {
  const availabilitySrc = readWorkspaceFile("src/lib/availability.ts");
  assert.match(availabilitySrc, /getPlayerAvailabilityCached/);
  assert.match(availabilitySrc, /getClubDate\("Europe\/Kyiv"/);
  assert.ok(
    availabilitySrc.includes('.eq("club_id", clubId)'),
    "availability.ts must filter injury_logs by club_id"
  );

  const riskAlertsSrc = readWorkspaceFile("src/lib/get-risk-alerts.ts");
  assert.match(riskAlertsSrc, /activeInjuredPlayerIds\.has\(/);
  assert.match(riskAlertsSrc, /getClubDate\("Europe\/Kyiv"\)/);
  assert.ok(
    riskAlertsSrc.includes('.eq("club_id", user.clubId)'),
    "get-risk-alerts.ts must filter maturation_assessments by club_id"
  );

  const billingSrc = readWorkspaceFile("src/actions/billing-actions.ts");
  assert.match(billingSrc, /Promise\.all/);
  assert.ok(
    billingSrc.includes('.eq("club_id", clubId)'),
    "billing-actions.ts must filter subscriptions by club_id"
  );

  const demoSrc = readWorkspaceFile("src/actions/demo-actions.ts");
  assert.match(demoSrc, /Promise\.all/);

  const playerPageSrc = readWorkspaceFile("src/app/players/[id]/page.tsx");
  assert.match(playerPageSrc, /notFound\(\)/);
  assert.match(playerPageSrc, /activeDocumentsPromise/);
  assert.ok(
    !playerPageSrc.includes("pinLogsRes"),
    "players/[id]/page.tsx must not perform unused pinLogsRes query"
  );

  const homePageSrc = readWorkspaceFile("src/app/page.tsx");
  assert.ok(
    homePageSrc.includes("Promise.all([createClient(), getCurrentUser()])"),
    "app/page.tsx must parallelize Supabase client and current user lookup"
  );
  assert.ok(
    !homePageSrc.includes("getClubTimezone("),
    "app/page.tsx must reuse single clubs query instead of duplicate getClubTimezone call"
  );
  assert.ok(
    homePageSrc.includes('.eq("club_id", clubId)'),
    "app/page.tsx queries must enforce club_id filtering"
  );
  assert.ok(
    homePageSrc.includes('.in("injury_id", rehabInjuryIds)') && homePageSrc.includes(".limit(50)"),
    "app/page.tsx must bound [RTP_CLEARANCE] logs by rehabInjuryIds and limit(50)"
  );
});

test("Wave 3.3: performance indexes migration is idempotent and covers core tables", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261119160000_wave3_performance_indexes.sql"
  );
  assert.ok(fs.existsSync(migrationPath), "Wave 3 index migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /DO \$\$/);
  assert.match(sql, /to_regclass/);
  assert.match(sql, /information_schema\.columns/);

  const indexStatements = sql.match(/CREATE INDEX IF NOT EXISTS/gi) ?? [];
  assert.ok(
    indexStatements.length >= 17,
    `Expected at least 17 idempotent CREATE INDEX IF NOT EXISTS statements, found ${indexStatements.length}`
  );

  const expectedTables = [
    "players",
    "injuries",
    "injury_logs",
    "wellness_entries",
    "wellness_surveys",
    "wearable_entries",
    "workload_sessions",
    "player_screenings",
    "consents",
    "player_subscriptions",
    "maturation_assessments",
    "exposures",
    "medical_treatments",
    "rehab_checkins",
  ];

  for (const tableName of expectedTables) {
    assert.ok(
      sql.includes(tableName),
      `Wave 3 index migration must cover table public.${tableName}`
    );
  }
});
