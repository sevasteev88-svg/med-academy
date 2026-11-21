import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createAnonymizer } from "../src/lib/ai/anonymizer.ts";
import { sanitizeReadinessForCoach, type PlayerReadinessResult } from "../src/lib/readiness.ts";
import { calculateReinjuryRisk } from "../src/lib/reinjury-risk-calculator.ts";
import { calculatePlayerAvailability } from "../src/lib/availability-rules.ts";
import { validateMatchdayRoster } from "../src/lib/roster-guardrails.ts";

test("1. Anonymizer маскирует кириллицу, названия клубов и не портит Гравець AA при restoreText", () => {
  const anonymizer = createAnonymizer(["ФК Карпати", "Карпати"]);
  for (let i = 0; i < 26; i++) {
    anonymizer.registerPlayer(`Тест${i}`, `Імя${i}`);
  }
  const aaPseudo = anonymizer.registerPlayer("Коваленко", "Іван");
  assert.equal(aaPseudo, "Гравець AA");

  const masked = anonymizer.anonymizeText(
    "Коваленко Іван отримав мікротравму у ФК Карпати, а Іван також скаржився на втому."
  );
  assert.ok(!masked.includes("Коваленко"));
  assert.ok(!masked.includes("Іван"));
  assert.ok(!masked.includes("Карпати"));
  assert.ok(masked.includes("Футбольна Академія"));
  assert.ok(masked.includes("Гравець AA"));

  const restored = anonymizer.restoreText("Рекомендація для Гравець AA та Гравець A.");
  assert.ok(restored.includes("Коваленко Іван"));
  assert.ok(restored.includes("Тест0 Імя0"));
  assert.ok(!restored.includes("Тест0 Імя0A"));
});

test("2. sanitizeReadinessForCoach скрывает текстовые комментарии и рекомендации врача в doctorDetails и trendLast7Days", () => {
  const raw: PlayerReadinessResult = {
    playerId: "p-privacy",
    date: "2026-11-21",
    status: "yellow",
    statusLabel: "Потребує уваги",
    actionPrompt: "Консультація",
    disclaimer: "Disclaimer",
    baselineDaysCount: 15,
    isBaselineReady: true,
    personalMean: 12,
    personalStdDev: 1,
    todayComposite: 9,
    zScore: -1.6,
    flagCategories: ["біль"],
    hasMonotony: true,
    monotonyDays: 4,
    monotonyPrompt: "Монотонні відповіді",
    isAcknowledged: false,
    reviewedByRole: null,
    reviewedAt: null,
    compliance7Days: 100,
    compliance28Days: 80,
    currentStreakDays: 4,
    doctorDetails: {
      pain: true,
      painVas: 6,
      painLocations: ["knee"],
      painComment: "Особистий опис болю",
      illness: true,
      illnessComment: "Особистий опис симптомів",
      stress: 1,
      comment: "Особистий коментар лікареві",
      sleepHours: 6,
      sleepQuality: 3,
      fatigue: 3,
      soreness: 3,
      doctorRecommendation: {
        text: "Призначено обстеження",
        sentAt: "2026-11-21T08:00:00.000Z",
      },
      wearables: {
        deviceType: "whoop",
        hrvMetric: "rMSSD",
        restingHrBpm: 58,
        hrvMs: 65,
        sleepDurationMin: 400,
        deviceScore: 70,
        deviceScoreName: "Recovery",
        restingHrZScore: 0,
        hrvZScore: 0,
        baselineStatus: "ready",
        disclaimer: "",
      },
    },
    trendLast7Days: [
      {
        date: "2026-11-21",
        compositeScore: 9,
        status: "yellow",
        label: "Увага",
        details: {
          pain: true,
          painVas: 6,
          painLocations: ["knee"],
          painComment: "Приватний біль у тренді",
          illness: false,
          illnessComment: "Приватне нездужання",
          stress: 2,
          comment: "Приватний коментар у тренді",
          sleepHours: 6,
          sleepQuality: 3,
          fatigue: 3,
          soreness: 3,
          doctorRecommendation: {
            text: "Секретна рекомендація",
            sentAt: "2026-11-21T08:00:00.000Z",
          },
        },
      },
    ],
  };

  const sanitized = sanitizeReadinessForCoach(raw);
  assert.equal(sanitized.doctorDetails?.stress, null);
  assert.equal(sanitized.doctorDetails?.wearables, null);
  assert.equal(sanitized.doctorDetails?.comment, null);
  assert.equal(sanitized.doctorDetails?.painComment, null);
  assert.equal(sanitized.doctorDetails?.illnessComment, null);
  assert.equal(sanitized.doctorDetails?.doctorRecommendation, null);
  assert.equal(sanitized.doctorDetails?.painVas, 6);

  const pt = sanitized.trendLast7Days[0];
  assert.equal(pt.details?.stress, null);
  assert.equal(pt.details?.comment, null);
  assert.equal(pt.details?.painComment, null);
  assert.equal(pt.details?.illnessComment, null);
  assert.equal(pt.details?.doctorRecommendation, null);
});

test("3. calculateReinjuryRisk не штрафует post_phv/pre_phv за hasPhvRecorded, но учитывает growthPhase === 'phv'", () => {
  const postPhv = calculateReinjuryRisk({
    growthPhase: "post_phv",
    hasPhvRecorded: true,
    workloadDaysMonitored: 30,
    acwr: 1.0,
    wellnessDaysRecorded: 10,
    wellnessScore: 18,
  });
  assert.equal(postPhv.isInsufficientData, false);
  assert.ok(
    !postPhv.factors.some((f) => f.title.includes("Фаза максимального піку росту")),
    "post_phv player must not get PHV peak penalty"
  );

  const peakPhv = calculateReinjuryRisk({
    growthPhase: "phv",
    hasPhvRecorded: true,
    workloadDaysMonitored: 30,
    acwr: 1.0,
    wellnessDaysRecorded: 10,
    wellnessScore: 18,
  });
  assert.ok(
    peakPhv.factors.some((f) => f.title.includes("Фаза максимального піку росту")),
    "active phv player must receive PHV peak factor"
  );
});

test("4. availability учитывает concussion_cases и блокирует доступ при активном сотрясении", () => {
  const availabilitySrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/availability.ts"),
    "utf8"
  );
  assert.match(availabilitySrc, /\.from\("concussion_cases"\)/);
  assert.match(availabilitySrc, /concussionCase/);

  const res = calculatePlayerAvailability({
    id: "p-conc-1",
    first_name: "Олег",
    last_name: "Бондар",
    position: "CB",
    injuries: [],
    concussionCase: {
      status: "recovering",
      current_stage: 3,
    },
  });
  assert.equal(res.status, "unavailable");
  assert.equal(res.max_minutes, 0);
});

test("5. validateMatchdayRoster сохраняет max_minutes === 0 и выявляет дубликаты игроков в заявке", () => {
  const result = validateMatchdayRoster(
    [
      { playerId: "p-zero" },
      { playerId: "p-zero" },
      { playerId: "p-gk" },
    ],
    [{ playerId: "p-zero-sub" }, { playerId: "p-gk" }],
    [
      {
        id: "p-zero",
        first_name: "Максим",
        last_name: "Тимчук",
        position: "CM",
        availability_status: "restricted",
        max_minutes: 0,
        hasValidScreening: true,
      },
      {
        id: "p-zero-sub",
        first_name: "Артем",
        last_name: "Сидоренко",
        position: "FW",
        availability_status: "restricted",
        max_minutes: 0,
        hasValidScreening: true,
      },
      {
        id: "p-gk",
        first_name: "Денис",
        last_name: "Шевченко",
        position: "ВР",
        availability_status: "available",
        max_minutes: 90,
        hasValidScreening: true,
      },
    ]
  );

  const starterMinIssue = result.issues.find((i) => i.id === "starter-restricted-p-zero");
  assert.ok(starterMinIssue?.title.includes("0 хв"), "Starter max_minutes=0 must not fallback to 45");

  const subMinIssue = result.issues.find((i) => i.id === "sub-restricted-p-zero-sub");
  assert.ok(subMinIssue?.title.includes("0 хв"), "Sub max_minutes=0 must not fallback to 45");

  const duplicates = result.issues.filter((i) => i.type === "duplicate_player");
  assert.equal(duplicates.length, 2, "Should report both duplicated players across starters and subs");
  assert.ok(duplicates.every((d) => d.severity === "critical"));
});
