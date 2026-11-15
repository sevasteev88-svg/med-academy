import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RTP_PROFILES,
  resolveRtpProfileId,
  calculateRtpClearanceStats,
  type RtpProfileId,
} from "../src/lib/rtp-profiles.ts";

describe("RTP profiles resolution & clearance stats", () => {
  it("contains all 9 specialized and base profiles with valid criteria", () => {
    const expectedIds: RtpProfileId[] = [
      "hamstring",
      "adductor_groin",
      "quadriceps",
      "calf",
      "ankle",
      "knee_acl",
      "knee_collateral",
      "knee_meniscus",
      "base",
    ];
    for (const id of expectedIds) {
      const profile = RTP_PROFILES[id];
      assert.ok(profile, `Missing profile ${id}`);
      assert.ok(profile.criteria.length >= 6, `Profile ${id} should have >= 6 criteria`);
    }
  });

  it("auto-resolves profile IDs by injuryType and location", () => {
    assert.equal(resolveRtpProfileId("muscular", "thigh"), "hamstring");
    assert.equal(resolveRtpProfileId("muscular", "hamstring"), "hamstring");
    assert.equal(resolveRtpProfileId("muscular", "groin"), "adductor_groin");
    assert.equal(resolveRtpProfileId("muscular", "adductor"), "adductor_groin");
    assert.equal(resolveRtpProfileId("muscular", "quadriceps"), "quadriceps");
    assert.equal(resolveRtpProfileId("muscular", "calf"), "calf");
    assert.equal(resolveRtpProfileId("ligament", "ankle"), "ankle");
    assert.equal(resolveRtpProfileId("tendon", "ankle"), "ankle");
    assert.equal(resolveRtpProfileId("ligament", "knee"), "knee_acl");
    assert.equal(resolveRtpProfileId("cartilage", "knee"), "knee_meniscus");
    assert.equal(resolveRtpProfileId("contusion", "shoulder"), "base");
  });

  it("calculates clearance percentage and full clearance for new profiles", () => {
    const meniscusCriteria = Object.fromEntries(
      RTP_PROFILES.knee_meniscus.criteria.map((c) => [c.key, true])
    );
    const full = calculateRtpClearanceStats("knee_meniscus", meniscusCriteria);
    assert.equal(full.passedCriteria, RTP_PROFILES.knee_meniscus.criteria.length);
    assert.equal(full.clearancePercentage, 100);
    assert.equal(full.isFullyCleared, true);

    const partial = calculateRtpClearanceStats("adductor_groin", {
      noPalpationPain: true,
      adductorSqueezePassed: true,
    });
    assert.equal(partial.passedCriteria, 2);
    assert.equal(partial.totalCriteria, RTP_PROFILES.adductor_groin.criteria.length);
    assert.equal(partial.isFullyCleared, false);
  });
});
