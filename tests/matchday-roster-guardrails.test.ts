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
});
