import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Wave 4.1: workload removes limit(300), reports/patterns/weekly/availability enforce scoping & exposureMetrics, sw.js avoids HTML cache, error boundaries exist", () => {
  const workloadSrc = readWorkspaceFile("src/app/workload/page.tsx");
  assert.ok(
    !workloadSrc.includes(".limit(300)"),
    "workload/page.tsx must not truncate history with .limit(300)"
  );
  assert.match(workloadSrc, /getClubDate\(/);
  assert.match(workloadSrc, /\.gte\("date", d60Ago\)/);
  assert.match(workloadSrc, /\.in\("player_id", visiblePlayerIds\)/);

  const patternsSrc = readWorkspaceFile("src/app/reports/patterns/page.tsx");
  assert.match(patternsSrc, /getCurrentUser/);
  assert.match(patternsSrc, /hasData:\s*exposureMetrics\.hasSufficientData/);
  assert.ok(
    !patternsSrc.includes("з'являться після задачі 4.2"),
    "reports/patterns/page.tsx must not contain placeholder exposureMetrics text"
  );

  const weeklySrc = readWorkspaceFile("src/app/reports/weekly/page.tsx");
  assert.match(weeklySrc, /getPlayerAvailability\(clubId\)/);
  assert.match(weeklySrc, /grid-cols-2 sm:grid-cols-4/);

  const availabilitySrc = readWorkspaceFile("src/app/availability/page.tsx");
  assert.match(availabilitySrc, /scopedSummary/);

  const swSrc = readWorkspaceFile("public/sw.js");
  assert.ok(
    !swSrc.includes('"/"'),
    "public/sw.js must not cache authenticated root HTML route"
  );
  assert.match(swSrc, /event\.request\.mode === "navigate"/);

  assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/error.tsx")), "src/app/error.tsx must exist");
  assert.ok(fs.existsSync(path.join(process.cwd(), "src/app/global-error.tsx")), "src/app/global-error.tsx must exist");
  const errorSrc = readWorkspaceFile("src/app/error.tsx");
  const globalErrorSrc = readWorkspaceFile("src/app/global-error.tsx");
  assert.match(errorSrc, /reset\(\)/);
  assert.match(globalErrorSrc, /reset\(\)/);
});

test("Wave 4.2: pharmacy alert links, error sanitization, Tailwind track class, Suspense in /demo, hydration, viewport zoom, router.push, polling visibility pause", () => {
  const alertsSrc = readWorkspaceFile("src/components/alerts/RiskAlertsCenter.tsx");
  const pharmacyMatches = alertsSrc.match(/alert\.type === "pharmacy" \? "\/pharmacy"/g) ?? [];
  assert.ok(
    pharmacyMatches.length >= 4,
    `Expected all 4 alert link slots in RiskAlertsCenter.tsx to route pharmacy alerts to /pharmacy, found ${pharmacyMatches.length}`
  );

  const injuriesSrc = readWorkspaceFile("src/app/injuries/page.tsx");
  assert.ok(
    !injuriesSrc.includes("JSON.stringify(error"),
    "injuries/page.tsx must not leak raw Postgres error JSON in UI"
  );

  const statsSrc = readWorkspaceFile("src/app/statistics/page.tsx");
  assert.ok(
    !statsSrc.includes("${colorClass}/30"),
    "statistics/page.tsx must not use dynamic Tailwind opacity interpolation ${colorClass}/30"
  );

  const demoSrc = readWorkspaceFile("src/app/demo/page.tsx");
  assert.match(demoSrc, /<Suspense/);

  const portalSrc = readWorkspaceFile("src/components/portal/RehabPortalClient.tsx");
  assert.match(portalSrc, /useState<"quiz" \| "compact">\("quiz"\)/);

  const layoutSrc = readWorkspaceFile("src/app/layout.tsx");
  assert.ok(
    !layoutSrc.includes("maximumScale"),
    "app/layout.tsx must not block pinch-to-zoom with maximumScale"
  );

  const readinessClientSrc = readWorkspaceFile("src/components/readiness/CoachReadinessClient.tsx");
  assert.match(readinessClientSrc, /router\.push\(/);
  assert.ok(
    !readinessClientSrc.includes("window.location.href ="),
    "CoachReadinessClient.tsx must use router.push instead of full window.location.href reloads"
  );
  assert.match(readinessClientSrc, /formatUtcDate\(/);

  const doctorModalSrc = readWorkspaceFile("src/components/readiness/DoctorPlayerReadinessModal.tsx");
  assert.match(doctorModalSrc, /document\.hidden/);
  assert.match(doctorModalSrc, /visibilitychange/);
});

test("Wave 4.3: verified dead files removed, next.config.ts drops ignoreBuildErrors, package.json wires typecheck & full test suite", () => {
  const removedFiles = [
    "temp_weekly.txt",
    "src/lib/rtp-calculator.ts",
    "src/actions/update-vas-action.ts",
    "src/components/injuries/ExaminationForm.tsx",
    "src/components/injuries/ExaminationHistory.tsx",
    "src/components/injuries/InjuryAISection.tsx",
    "src/components/injuries/InjuryJournal.tsx",
    "src/components/injuries/RehabTracker.tsx",
    "src/components/portal/PortalQrCodeModal.tsx",
    "src/components/ui/DeleteButton.tsx",
  ];

  for (const rel of removedFiles) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), rel)),
      false,
      `${rel} must be removed during Wave 4 cleanup`
    );
  }

  const nextConfigSrc = readWorkspaceFile("next.config.ts");
  assert.ok(
    !nextConfigSrc.includes("ignoreBuildErrors"),
    "next.config.ts must not suppress TypeScript errors with ignoreBuildErrors"
  );

  const pkg = JSON.parse(readWorkspaceFile("package.json"));
  assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  for (const expectedTest of [
    "tests/security-wave1-auth-webhooks.test.ts",
    "tests/security-wave1-pharmacy-atomicity.test.ts",
    "tests/security-wave1-rls-migration.test.ts",
    "tests/wave2-logic-and-data-integrity.test.ts",
    "tests/wave3-performance-and-indexes.test.ts",
    "tests/player-qr-session-recovery.test.ts",
    "tests/wave4-ux-and-cleanup.test.ts",
  ]) {
    assert.ok(
      String(pkg.scripts?.test || "").includes(expectedTest),
      `package.json test script must include ${expectedTest}`
    );
  }
});
