import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateMatchdayRoster, type RosterPlayerDetail } from "../src/lib/roster-guardrails.ts";
import { canUserAccessTeam } from "../src/lib/team-access.ts";
import type { RosterPlayerSlot } from "../src/types/roster.ts";

describe("Matchday Roster - Medical Guardrails (Захист від дурака)", () => {
  const samplePlayers: RosterPlayerDetail[] = [
    {
      id: "p-gk-1",
      first_name: "Олексій",
      last_name: "Шевченко",
      position: "ВР",
      availability_status: "available",
      hasValidScreening: true,
    },
    {
      id: "p-def-1",
      first_name: "Валерій",
      last_name: "Бондар",
      position: "ЦЗ",
      availability_status: "available",
      hasValidScreening: true,
    },
    {
      id: "p-inj-1",
      first_name: "Михайло",
      last_name: "Мудрик",
      position: "ЛВ",
      availability_status: "unavailable",
      restriction_notes: "Розрив задньої поверхні стегна (лазарет)",
      hasValidScreening: true,
    },
    {
      id: "p-rehab-1",
      first_name: "Тарас",
      last_name: "Степаненко",
      position: "ОП",
      availability_status: "restricted",
      max_minutes: 45,
      restriction_notes: "Етап 4 RTP: ліміт 45 хв",
      hasValidScreening: true,
    },
    {
      id: "p-unscreened-1",
      first_name: "Іван",
      last_name: "Петренко",
      position: "ЦП",
      availability_status: "available",
      hasValidScreening: false,
    },
  ];

  it("CRITICAL: Flags unavailable (injured) player when placed in Starting XI", () => {
    const starters: RosterPlayerSlot[] = [
      { playerId: "p-gk-1", number: 1 },
      { playerId: "p-inj-1", number: 10 },
    ];
    const subs: RosterPlayerSlot[] = [];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    assert.equal(result.hasCriticalIssues, true);
    assert.equal(result.criticalCount, 1);
    const injIssue = result.issues.find((i) => i.playerId === "p-inj-1");
    assert.ok(injIssue);
    assert.equal(injIssue?.severity, "critical");
    assert.equal(injIssue?.type, "unavailable_player");
    assert.match(injIssue?.message || "", /Розрив задньої поверхні стегна/);
  });

  it("CRITICAL: Flags unavailable player when placed on substitutes bench", () => {
    const starters: RosterPlayerSlot[] = [{ playerId: "p-gk-1", number: 1 }];
    const subs: RosterPlayerSlot[] = [{ playerId: "p-inj-1", number: 15 }];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    assert.equal(result.hasCriticalIssues, true);
    const subIssue = result.issues.find((i) => i.id === "sub-unavailable-p-inj-1");
    assert.ok(subIssue);
    assert.equal(subIssue?.severity, "critical");
  });

  it("CRITICAL: Flags unscreened player without ECG clearance in Starting XI", () => {
    const starters: RosterPlayerSlot[] = [
      { playerId: "p-gk-1", number: 1 },
      { playerId: "p-unscreened-1", number: 8 },
    ];
    const subs: RosterPlayerSlot[] = [];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    assert.equal(result.hasCriticalIssues, true);
    const unscrIssue = result.issues.find((i) => i.playerId === "p-unscreened-1");
    assert.ok(unscrIssue);
    assert.equal(unscrIssue?.type, "unscreened_player");
  });

  it("WARNING: Warns coach when player with minute restriction (max 45 min) starts the match", () => {
    const starters: RosterPlayerSlot[] = [
      { playerId: "p-gk-1", number: 1 },
      { playerId: "p-rehab-1", number: 6 },
    ];
    const subs: RosterPlayerSlot[] = [];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    const restrictedIssue = result.issues.find(
      (i) => i.playerId === "p-rehab-1" && i.severity === "warning"
    );
    assert.ok(restrictedIssue);
    assert.equal(restrictedIssue?.type, "minute_limit_starter");
    assert.match(restrictedIssue?.message || "", /45 хв/);
  });

  it("WARNING: Warns when starting lineup has no goalkeeper", () => {
    const starters: RosterPlayerSlot[] = [{ playerId: "p-def-1", number: 4 }];
    const subs: RosterPlayerSlot[] = [];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    assert.equal(result.gkStarterCount, 0);
    const noGkIssue = result.issues.find((i) => i.type === "no_goalkeeper");
    assert.ok(noGkIssue);
    assert.equal(noGkIssue?.severity, "warning");
  });

  it("CLEAN: Fully eligible players pass without critical issues", () => {
    const starters: RosterPlayerSlot[] = [
      { playerId: "p-gk-1", number: 1 },
      { playerId: "p-def-1", number: 4 },
    ];
    // Put restricted player on bench where it is safe (produces info, not critical/warning)
    const subs: RosterPlayerSlot[] = [{ playerId: "p-rehab-1", number: 14 }];

    const result = validateMatchdayRoster(starters, subs, samplePlayers);

    assert.equal(result.hasCriticalIssues, false);
    assert.equal(result.criticalCount, 0);
    assert.equal(result.gkStarterCount, 1);
  });

  it("AUTHORIZATION: Coach can only manage rosters of assigned teams", () => {
    const coachUser = {
      id: "coach-1",
      role: "coach",
      teamIds: ["team-u19-id", "team-u17-id"],
    };

    assert.equal(canUserAccessTeam(coachUser, "team-u19-id"), true);
    assert.equal(canUserAccessTeam(coachUser, "team-u17-id"), true);
    assert.equal(canUserAccessTeam(coachUser, "team-u14-id"), false);
  });

  it("POST-MATCH OVEREXPOSURE: Detects when a restricted player exceeds doctor's minute limit", () => {
    const limits = new Map([
      ["p-rehab-1", { status: "restricted", maxMinutes: 45 }],
      ["p-def-1", { status: "available", maxMinutes: 90 }],
    ]);

    const matchMinutes = [
      { playerId: "p-rehab-1", minutes: 70 }, // Exceeded! 70 > 45
      { playerId: "p-def-1", minutes: 90 }, // Normal
    ];

    const overexposures = matchMinutes.filter((m) => {
      const limit = limits.get(m.playerId);
      return limit && limit.status === "restricted" && m.minutes > limit.maxMinutes;
    });

    assert.equal(overexposures.length, 1);
    assert.equal(overexposures[0].playerId, "p-rehab-1");
    assert.equal(overexposures[0].minutes, 70);
  });

  it("COACH PLAYER CARD: Restricts coach from accessing players of unassigned teams", () => {
    const coachUser = {
      id: "coach-u19",
      role: "coach",
      teamIds: ["team-u19"],
    };

    const playerU19 = { id: "p1", team_id: "team-u19" };
    const playerU15 = { id: "p2", team_id: "team-u15" };

    assert.equal(canUserAccessTeam(coachUser, playerU19.team_id), true);
    assert.equal(canUserAccessTeam(coachUser, playerU15.team_id), false);

    // Doctor can access all
    const doctorUser = { id: "doc-1", role: "doctor" };
    assert.equal(canUserAccessTeam(doctorUser, playerU15.team_id), true);
  });
});
