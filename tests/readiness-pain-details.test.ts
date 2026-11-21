import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluatePlayerReadiness,
  sanitizeReadinessForCoach,
} from "../src/lib/readiness.ts";
import type { WellnessEntry } from "../src/types/wellness.ts";

test("evaluatePlayerReadiness and sanitizeReadinessForCoach preserve pain_symptoms and pain_comment in doctorDetails and trendLast7Days", () => {
  const today = "2026-11-19";
  const entry: WellnessEntry = {
    id: "well_test_1",
    club_id: "13a6744b-6e76-4a6e-986e-5710ebe093c8",
    player_id: "ff48862b-c8a4-4143-9193-de99c862b423",
    date: today,
    sleep_quality: 2,
    fatigue: 3,
    soreness: 2,
    stress: 5,
    sleep_hours: 6.5,
    pain: true,
    pain_vas: 6,
    pain_locations: ["thigh_anterior"],
    pain_symptoms: ["pulsing"],
    pain_comment: "Відчуваю біль під час розгинання коліна",
    illness: false,
    body_temperature: null,
    illness_symptoms: [],
    illness_comment: null,
    comment: null,
    submitted_at: "2026-11-19T21:10:15.711Z",
    source: "player",
  };

  const doctorResult = evaluatePlayerReadiness({
    todayDate: today,
    hasConsent: true,
    hasActiveDevice: true,
    entriesLast28Days: [entry],
    forRole: "admin",
    playerInfo: {
      id: entry.player_id,
      name: "Бабілов Артур",
    },
  });

  assert.deepEqual(doctorResult.doctorDetails?.painSymptoms, ["pulsing"]);
  assert.equal(
    doctorResult.doctorDetails?.painComment,
    "Відчуваю біль під час розгинання коліна"
  );

  const doctorTodayTrend = doctorResult.trendLast7Days.find((p) => p.date === today);
  assert.ok(doctorTodayTrend?.details);
  assert.deepEqual(doctorTodayTrend.details.painSymptoms, ["pulsing"]);
  assert.equal(
    doctorTodayTrend.details.painComment,
    "Відчуваю біль під час розгинання коліна"
  );

  const coachResult = sanitizeReadinessForCoach(
    evaluatePlayerReadiness({
      todayDate: today,
      hasConsent: true,
      hasActiveDevice: true,
      entriesLast28Days: [entry],
      forRole: "coach",
      playerInfo: {
        id: entry.player_id,
        name: "Бабілов Артур",
      },
    })
  );

  assert.equal(coachResult.doctorDetails?.stress, null);
  assert.deepEqual(coachResult.doctorDetails?.painSymptoms, ["pulsing"]);
  assert.equal(
    coachResult.doctorDetails?.painComment,
    "Відчуваю біль під час розгинання коліна"
  );

  const coachTodayTrend = coachResult.trendLast7Days.find((p) => p.date === today);
  assert.ok(coachTodayTrend?.details);
  assert.equal(coachTodayTrend.details.stress, null);
  assert.deepEqual(coachTodayTrend.details.painSymptoms, ["pulsing"]);
  assert.equal(
    coachTodayTrend.details.painComment,
    "Відчуваю біль під час розгинання коліна"
  );
});

test("source checks: readiness-actions.ts and wellness-entry-actions.ts unpack and merge all rich wellness fields", () => {
  const readinessSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/readiness-actions.ts"),
    "utf8"
  );
  assert.match(readinessSrc, /function mergeRichWellnessFields/);
  assert.match(readinessSrc, /mergeRichWellnessFields\(existing, surveyEntry\)/);
  assert.match(readinessSrc, /mergeRichWellnessFields\(existing, entry\)/);

  for (const field of [
    "pain_symptoms",
    "pain_comment",
    "body_temperature",
    "illness_symptoms",
    "illness_comment",
    "doctor_recommendation",
  ]) {
    assert.ok(
      readinessSrc.includes(`${field}:`),
      `readiness-actions.ts must extract ${field} from wellness_surveys.notes`
    );
  }

  const wellnessActionsSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/wellness-entry-actions.ts"),
    "utf8"
  );
  assert.match(wellnessActionsSrc, /function mapWellnessSurveyRow/);
  const mapCalls = wellnessActionsSrc.match(/mapWellnessSurveyRow\(/g) || [];
  assert.ok(
    mapCalls.length >= 3,
    "Expected mapWellnessSurveyRow to be used in all 3 wellness_surveys loaders"
  );

  for (const field of [
    "pain_symptoms",
    "pain_comment",
    "body_temperature",
    "illness_symptoms",
    "illness_comment",
    "doctor_recommendation",
  ]) {
    assert.ok(
      wellnessActionsSrc.includes(`${field}:`),
      `wellness-entry-actions.ts must extract ${field} in mapWellnessSurveyRow`
    );
  }
});
