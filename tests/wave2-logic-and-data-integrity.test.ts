import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculatePlayerAvailability } from "../src/lib/availability-rules.ts";
import { validateStageTransition } from "../src/types/concussion.ts";
import { DEMO_SUBSCRIPTIONS } from "../src/lib/demo-generator.ts";
import { getClubDate } from "../src/lib/club-timezone.ts";

test("Wave 2.1: calculatePlayerAvailability accepts latestRtpByInjury alias and respects RTP Phase 4 (45m) and Phase 5 (full)", () => {
  const basePlayer = {
    id: "p-rtp-1",
    first_name: "Іван",
    last_name: "Коваленко",
    position: "CM",
    date_of_birth: "2009-05-10",
    injuries: [
      {
        id: "inj-rtp-1",
        status: "rehabilitation" as const,
        injury_type: "muscle_strain" as const,
        location: "hamstring" as const,
        vas_score: 2,
        date_of_injury: "2026-11-01",
      },
    ],
  };

  const phase4Res = calculatePlayerAvailability(basePlayer as any, {
    date: "2026-11-19",
    latestRtpByInjury: {
      "inj-rtp-1": { phase: 4 },
    },
  });
  assert.equal(phase4Res.status, "restricted");
  assert.equal(phase4Res.max_minutes, 45);

  const phase5Res = calculatePlayerAvailability(basePlayer as any, {
    date: "2026-11-19",
    latestRtpByInjury: {
      "inj-rtp-1": { phase: 5 },
    },
  });
  assert.equal(phase5Res.status, "available");
});

test("Wave 2.1: SCAT6 concussion rollback persists current_rtp_stage when symptoms return", () => {
  const transition = validateStageTransition({
    currentStage: 3,
    targetStage: 4,
    isSymptomFree24h: false,
    symptomsNoted: ["Головний біль"],
    doctorSignatureName: "Др. Іваненко",
  });
  assert.equal(transition.allowed, false);
  assert.equal(transition.nextStage, 2);

  const scat6Component = fs.readFileSync(
    path.join(process.cwd(), "src/components/injuries/Scat6ConcussionAssessment.tsx"),
    "utf8"
  );
  assert.ok(
    scat6Component.includes("symptomSeverity"),
    "SCAT6 form must include symptomSeverity field (0-132)"
  );
  assert.ok(
    scat6Component.includes("current_rtp_stage: result.nextStage"),
    "SCAT6 stage transition must persist rollback stage via saveConcussionAction"
  );
});

test("Wave 2.1: DEMO_SUBSCRIPTIONS active and comped records always have future current_period_end", () => {
  const now = Date.now();
  const activeOrComped = DEMO_SUBSCRIPTIONS.filter(
    (s) => s.status === "active" || s.status === "comped"
  );
  assert.equal(activeOrComped.length, 23);
  for (const sub of activeOrComped) {
    assert.ok(
      new Date(sub.current_period_end).getTime() > now,
      `Subscription ${sub.id} (${sub.status}) must have future current_period_end`
    );
  }
});

test("Wave 2.2: All player/injury mutations enforce club_id isolation and /injuries supports status filtering", () => {
  const filesToCheck = [
    "src/actions/update-player-action.ts",
    "src/actions/create-player-action.ts",
    "src/actions/delete-player-action.ts",
    "src/actions/create-injury-action.ts",
    "src/actions/update-injury-action.ts",
    "src/actions/delete-injury-action.ts",
    "src/actions/add-examination-action.ts",
    "src/actions/add-injury-log-action.ts",
    "src/actions/save-screening-action.ts",
    "src/actions/save-anthropometry-action.ts",
    "src/actions/save-lsi-assessment-action.ts",
    "src/actions/save-nutrition-action.ts",
    "src/actions/rehab-plan-actions.ts",
    "src/actions/rehab-phase-actions.ts",
    "src/actions/update-injury-status-action.ts",
  ];

  for (const relPath of filesToCheck) {
    const content = fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
    assert.ok(
      content.includes("club_id") || content.includes("assertPlayerAccess") || content.includes("assertTeamAccess"),
      `${relPath} must enforce multi-club ownership`
    );
  }

  const injuriesPage = fs.readFileSync(
    path.join(process.cwd(), "src/app/injuries/page.tsx"),
    "utf8"
  );
  assert.ok(
    injuriesPage.includes("statusFilter") && injuriesPage.includes("buildFilterHref"),
    "/injuries page must support interactive KPI status filtering"
  );
});

test("Wave 2.3: getClubDate uses Europe/Kyiv timezone instead of UTC midnight split", () => {
  // 2026-11-19T22:30:00Z is 2026-11-20 00:30 in Europe/Kyiv (UTC+2)
  const lateUtcEvening = new Date("2026-11-19T22:30:00.000Z");
  const kyivDate = getClubDate("Europe/Kyiv", lateUtcEvening);
  assert.equal(kyivDate, "2026-11-20");
});

test("Wave 2.4: AI routes enforce role/club guards, external fetches use AbortSignal.timeout, and wearable screenshots validate max size", () => {
  const aiRoutes = [
    "src/app/api/ai/injury-assist/route.ts",
    "src/app/api/ai/injury-patterns/route.ts",
    "src/app/api/ai/sports-intelligence/route.ts",
    "src/app/api/ai/weekly-report/route.ts",
  ];
  for (const route of aiRoutes) {
    const src = fs.readFileSync(path.join(process.cwd(), route), "utf8");
    assert.ok(
      src.includes("assertDoctor") || src.includes("assertTeamStaff"),
      `${route} must verify staff role and club membership`
    );
  }

  const wearableSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/wearable-actions.ts"),
    "utf8"
  );
  assert.ok(
    wearableSrc.includes("MAX_BASE64_LENGTH"),
    "parseWearableScreenshotAction must enforce max base64 payload size"
  );

  const timeoutFiles = [
    "src/lib/ai/index.ts",
    "src/lib/messaging-adapter.ts",
    "src/lib/coach-telegram-server.ts",
    "src/lib/coach-telegram-bot.ts",
    "src/lib/telegram-webhook-server.ts",
  ];
  for (const tf of timeoutFiles) {
    const src = fs.readFileSync(path.join(process.cwd(), tf), "utf8");
    assert.ok(
      src.includes("AbortSignal.timeout"),
      `${tf} must include AbortSignal.timeout on external fetch calls`
    );
  }
});
