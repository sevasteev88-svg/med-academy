import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SORENESS_LOCATIONS,
  BORG_CR10_SCALE,
  type RpeScore,
  type PlayerSessionFeedbackInput,
} from "../src/types/workload.ts";
import { formatPostSessionReminder } from "../src/lib/telegram-auth.ts";

describe("Пост-тренувальна та післяматчева реакція на навантаження (sRPE & Soreness)", () => {
  it("1. Довідник зон м'язової забитості містить усі ключові футбольні групи", () => {
    const ids = SORENESS_LOCATIONS.map((l) => l.id);
    assert.ok(ids.includes("hamstrings"), "Повинна бути задня поверхня стегна");
    assert.ok(ids.includes("groin"), "Повинен бути пах / привідні м'язи");
    assert.ok(ids.includes("quadriceps"), "Повинна бути передня поверхня стегна");
    assert.ok(ids.includes("calves"), "Повинні бути литки / ахілл");
    assert.ok(ids.includes("knee"), "Повинно бути коліно");
    assert.ok(ids.includes("ankle"), "Повинен бути гомілкостоп");
  });

  it("2. Шкала Borg CR10 охоплює від 0 (спокій) до 10 (максимум)", () => {
    assert.equal(BORG_CR10_SCALE[0].label, "Спокій / Відпочинок");
    assert.equal(BORG_CR10_SCALE[5].label, "Важко");
    assert.equal(BORG_CR10_SCALE[10].label, "Максимум (All-out)");
  });

  it("3. Розрахунок навантаження (Workload AU = Хвилини * RPE гравця)", () => {
    const testCases: Array<{ minutes: number; rpe: RpeScore; expectedAu: number }> = [
      { minutes: 90, rpe: 8, expectedAu: 720 }, // повний матч високої інтенсивності
      { minutes: 75, rpe: 6, expectedAu: 450 }, // звичайне тренування
      { minutes: 30, rpe: 3, expectedAu: 90 },  // легка розминка / заміна
      { minutes: 90, rpe: 0, expectedAu: 0 },   // відпочинок
    ];

    for (const tc of testCases) {
      const calculated = tc.minutes * tc.rpe;
      assert.equal(calculated, tc.expectedAu);
    }
  });

  it("4. Детекція розбіжності відчуття навантаження тренера та футболіста (Δ >= 2)", () => {
    function checkDiscrepancy(coachRpe: number, playerRpe: number): { diff: number; hasDiscrepancy: boolean } {
      const diff = Math.abs(playerRpe - coachRpe);
      return { diff, hasDiscrepancy: diff >= 2 };
    }

    // Тренер очікував легке відновлення (3), гравець відчув як важке (7)
    const alert1 = checkDiscrepancy(3, 7);
    assert.equal(alert1.diff, 4);
    assert.equal(alert1.hasDiscrepancy, true);

    // Тренер дав важке (7), гравець оцінив на 6 (різниця 1 - норма)
    const alert2 = checkDiscrepancy(7, 6);
    assert.equal(alert2.diff, 1);
    assert.equal(alert2.hasDiscrepancy, false);

    // Гравець поставив 10, тренер 8 (різниця 2 - алерт)
    const alert3 = checkDiscrepancy(8, 10);
    assert.equal(alert3.diff, 2);
    assert.equal(alert3.hasDiscrepancy, true);
  });

  it("5. Формування симптомного тексту для медкарти лікаря при скаргах", () => {
    const feedback: PlayerSessionFeedbackInput = {
      playerId: "player_123",
      sessionType: "match",
      durationMinutes: 90,
      playerRpe: 9,
      muscleSorenessLocations: ["hamstrings", "calves"],
      hasContusion: true,
      notes: "Судоми на 85 хв",
    };

    const sorenessLabels = (feedback.muscleSorenessLocations || []).map((id) => {
      const item = SORENESS_LOCATIONS.find((loc) => loc.id === id);
      return item ? item.label : id;
    });

    const parts: string[] = [];
    if (sorenessLabels.length > 0) {
      parts.push(`Забитість/дискомфорт: ${sorenessLabels.join(", ")}`);
    }
    if (feedback.hasContusion) {
      parts.push("⚠️ Був контактний забій або сильний удар");
    }
    if (feedback.notes) {
      parts.push(`Коментар: ${feedback.notes}`);
    }

    const noteText = `[POST_SESSION_REACTION] Реакція після ${feedback.sessionType === "match" ? "матчу" : "тренування"} (${feedback.durationMinutes} хв, RPE ${feedback.playerRpe}/10): ${parts.join(" · ")}`;

    assert.ok(noteText.includes("Реакція після матчу"));
    assert.ok(noteText.includes("RPE 9/10"));
    assert.ok(noteText.includes("Задня поверхня стегна"));
    assert.ok(noteText.includes("Литки / Ахілл"));
    assert.ok(noteText.includes("Був контактний забій"));
    assert.ok(noteText.includes("Судоми на 85 хв"));
  });

  it("6. Форматування Telegram-сповіщення футболісту про внесене тренування", () => {
    const text = formatPostSessionReminder({
      playerName: "Тарас",
      clubName: "Чорноморець",
      sessionType: "Командне тренування",
      durationMinutes: 75,
      date: "2026-11-06",
      portalUrl: "https://med.fc-chornomorets.com/rehab-portal",
    });

    assert.ok(text.includes("Привіт, Тарас!"));
    assert.ok(text.includes("[Чорноморець]"));
    assert.ok(text.includes("Командне тренування"));
    assert.ok(text.includes("75 хв"));
    assert.ok(text.includes("2026-11-06"));
    assert.ok(text.includes("https://med.fc-chornomorets.com/rehab-portal"));
    assert.ok(text.includes("Оцінити"));
  });
});
