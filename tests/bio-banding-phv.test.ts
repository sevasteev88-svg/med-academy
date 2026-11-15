import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBioBand,
  assessMaturationTempo,
  groupPlayersByBioBand,
} from "../src/lib/phv-calculator.ts";

describe("Біо-бандинг (Bio-banding) на базі PHV", () => {
  it("classifyBioBand коректно відносить offset до 4 біо-груп", () => {
    assert.equal(classifyBioBand(-1.5), "pre_phv");
    assert.equal(classifyBioBand(-0.75), "early_phv");
    assert.equal(classifyBioBand(-0.5), "circa_phv");
    assert.equal(classifyBioBand(0.0), "circa_phv");
    assert.equal(classifyBioBand(0.5), "circa_phv");
    assert.equal(classifyBioBand(0.8), "post_phv");
  });

  it("assessMaturationTempo виявляє раннє, нормальне та пізнє дозрівання", () => {
    // Хлопець 13.0 р., offset +0.5 -> біо-вік 14.3 р. (різниця +1.3 р. -> early)
    const early = assessMaturationTempo("male", 0.5, 13.0);
    assert.equal(early.maturationTempo, "early");
    assert.ok(early.ageDiscrepancyYears >= 1.0);

    // Хлопець 14.5 р., offset -0.8 -> біо-вік 13.0 р. (різниця -1.5 р. -> late)
    const late = assessMaturationTempo("male", -0.8, 14.5);
    assert.equal(late.maturationTempo, "late");
    assert.ok(late.ageDiscrepancyYears <= -1.0);

    // Хлопець 13.8 р., offset 0.0 -> біо-вік 13.8 р. (різниця 0.0 р. -> on_time)
    const onTime = assessMaturationTempo("male", 0.0, 13.8);
    assert.equal(onTime.maturationTempo, "on_time");
  });

  it("groupPlayersByBioBand групує гравців, додає рекомендації тренеру та підсвічує темп дозрівання", () => {
    const groups = groupPlayersByBioBand([
      {
        id: "p1",
        firstName: "Іван",
        lastName: "Петренко",
        sex: "male",
        chronologicalAge: 11.5,
        consensusOffset: -1.8,
        consensusPhvAge: 13.3,
        teamName: "U-12",
      },
      {
        id: "p2",
        firstName: "Максим",
        lastName: "Коваль",
        sex: "male",
        chronologicalAge: 13.0,
        consensusOffset: 0.2,
        consensusPhvAge: 12.8,
        teamName: "U-13",
      },
      {
        id: "p3",
        firstName: "Артем",
        lastName: "Сидоренко",
        sex: "male",
        chronologicalAge: 15.2,
        consensusOffset: 1.4,
        consensusPhvAge: 13.8,
        teamName: "U-15",
      },
    ]);

    assert.equal(groups.length, 4);
    assert.equal(groups[0].definition.key, "pre_phv");
    assert.equal(groups[0].players.length, 1);
    assert.equal(groups[2].definition.key, "circa_phv");
    assert.equal(groups[2].players.length, 1);
    assert.equal(groups[2].players[0].maturationTempo, "early");
    assert.ok(groups[2].definition.coachRecommendations.length >= 2);
    assert.equal(groups[3].definition.key, "post_phv");
    assert.equal(groups[3].players.length, 1);
  });
});
