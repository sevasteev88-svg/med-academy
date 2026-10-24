import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_CLUB_ID,
  DEMO_CLUB_NAME,
  DEMO_DOCTOR_EMAIL,
  DEMO_TEAMS,
  DEMO_PLAYERS,
  DEMO_INJURIES,
  DEMO_PHARMACY_ITEMS,
} from "../src/lib/demo-generator.ts";
import { calculatePlayerAvailability } from "../src/lib/availability-rules.ts";

test("Етап 6.2 — Демо-режим та посів клубу «Демо Академія»", async (t) => {
  await t.test("1. Конфігурація клубу та відсутність реальних прізвищ футболістів", () => {
    assert.equal(DEMO_CLUB_NAME, "ФК «Демо Академія»");
    assert.equal(DEMO_CLUB_ID, "00000000-0000-0000-0000-000000000002");
    assert.equal(DEMO_DOCTOR_EMAIL, "demo@medacademy.app");

    // Перевірка кількості вигаданих гравців: рівно 26
    assert.equal(DEMO_PLAYERS.length, 26, "Повинно бути рівно 26 вигаданих гравців");

    // Перевірка унікальності id
    const ids = new Set(DEMO_PLAYERS.map((p) => p.id));
    assert.equal(ids.size, 26, "Усі ID гравців повинні бути унікальними");

    // Перевірка формату імен (випадкові традиційні українські імена без реальних діючих зірок)
    for (const p of DEMO_PLAYERS) {
      assert.ok(p.first_name.length >= 2);
      assert.ok(p.last_name.length >= 2);
      assert.match(p.date_of_birth, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(p.current_height >= 150 && p.current_height <= 205, "Реалістичний зріст");
      assert.ok(p.current_weight >= 45 && p.current_weight <= 100, "Реалістична вага");
      assert.ok(p.sitting_height >= 75 && p.sitting_height <= 105, "Реалістична довжина тулуба");
    }
  });

  await t.test("2. Структура вікових категорій (U-19, U-17, U-15)", () => {
    assert.equal(DEMO_TEAMS.length, 3);
    const u19Players = DEMO_PLAYERS.filter((p) => p.team_id === DEMO_TEAMS[0].id);
    const u17Players = DEMO_PLAYERS.filter((p) => p.team_id === DEMO_TEAMS[1].id);
    const u15Players = DEMO_PLAYERS.filter((p) => p.team_id === DEMO_TEAMS[2].id);

    assert.equal(u19Players.length, 10, "10 гравців у U-19");
    assert.equal(u17Players.length, 9, "9 гравців у U-17");
    assert.equal(u15Players.length, 7, "7 гравців у U-15");
    assert.equal(u19Players.length + u17Players.length + u15Players.length, 26);
  });

  await t.test("3. Травми в різних клінічних фазах (Гостра, Реаб 1–4, Завершені)", () => {
    assert.ok(DEMO_INJURIES.length >= 5, "Має бути мінімум 5 кейсів травм");

    const acute = DEMO_INJURIES.filter((i) => i.status === "active");
    const rehab = DEMO_INJURIES.filter((i) => i.status === "rehabilitation");
    const closed = DEMO_INJURIES.filter((i) => i.status === "closed");

    assert.equal(acute.length, 1, "1 гостра травма (Коваленко - Hamstring Grade 2, ВАШ 7)");
    assert.equal(rehab.length, 4, "4 травми на етапі реабілітації (Поліщук, Савченко, Кравченко, Сидоренко)");
    assert.ok(closed.length >= 2, "Історичні закриті травми для перевірки патернів");

    // Перевірка валідності кодів OSIICS
    for (const inj of DEMO_INJURIES) {
      assert.ok(inj.osiics_code && inj.osiics_code.length >= 3, "Код OSIICS обов'язковий");
    }
  });

  await t.test("4. 100% консистентність цифр доступності (21 + 2 + 3 = 26)", () => {
    const rawInjuriesMap: Record<string, any[]> = {};
    const rtpLogsByInjury: Record<string, any> = {};

    for (const inj of DEMO_INJURIES) {
      if (!rawInjuriesMap[inj.player_id]) rawInjuriesMap[inj.player_id] = [];
      rawInjuriesMap[inj.player_id].push({
        id: inj.id,
        status: inj.status,
        injury_type: inj.injury_type,
        location: inj.location,
        vas_score: inj.vas_score,
        date_of_injury: inj.date_of_injury,
        expected_return_date: (inj as any).expected_return_date,
      });

      if ((inj as any).rtp_phase) {
        rtpLogsByInjury[inj.id] = { phase: (inj as any).rtp_phase };
      }
    }

    let availableCount = 0;
    let restrictedCount = 0;
    let unavailableCount = 0;

    for (const p of DEMO_PLAYERS) {
      const isRestricted = p.id === DEMO_PLAYERS[4].id || p.id === DEMO_PLAYERS[18].id;
      const screening = {
        id: `scr_${p.id}`,
        player_id: p.id,
        screening_date: "2026-07-10",
        valid_until: "2027-07-10",
        clearance_status: isRestricted ? ("provisional" as const) : ("approved" as const),
        examiner: "Д-р Андрій Коваленко",
        created_at: "2026-07-10",
      };

      const res = calculatePlayerAvailability(
        {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          position: p.position,
          team_id: p.team_id,
          injuries: rawInjuriesMap[p.id] || [],
          screening,
        },
        {
          date: new Date("2026-10-23T12:00:00Z"),
          rtpLogsByInjury,
        }
      );

      if (res.status === "available") availableCount++;
      else if (res.status === "restricted") restrictedCount++;
      else if (res.status === "unavailable") unavailableCount++;
    }

    assert.equal(availableCount, 21, "Рівно 21 гравець повинен бути повністю готовий (Available)");
    assert.equal(restrictedCount, 2, "Рівно 2 гравці повинні мати обмеження (Restricted, RTP 4 / до 45 хв)");
    assert.equal(unavailableCount, 3, "Рівно 3 гравці у лазареті (Unavailable, гостра + RTP 2-3)");
    assert.equal(availableCount + restrictedCount + unavailableCount, 26, "Сума повинна дорівнювати 26");
  });

  await t.test("5. Аптечний склад: наявність WADA-препаратів, знеболювальних та контролю термінів", () => {
    assert.equal(DEMO_PHARMACY_ITEMS.length, 16);

    const sClassItem = DEMO_PHARMACY_ITEMS.find((i) => i.wada_status === "prohibited_in_competition");
    assert.ok(sClassItem, "Має бути S-препарат (Дексаметазон ампули)");
    assert.equal(sClassItem?.name.includes("Дексаметазон"), true);

    const expiredItem = DEMO_PHARMACY_ITEMS.find((i) => i.expiry_date && i.expiry_date < "2026-10-01");
    assert.ok(expiredItem, "Має бути прострочена позиція для демонстрації фільтра в аптеці");

    const expiringSoon = DEMO_PHARMACY_ITEMS.find(
      (i) => i.expiry_date && i.expiry_date > "2026-10-01" && i.expiry_date < "2026-12-01"
    );
    assert.ok(expiringSoon, "Має бути позиція з терміном придатності < 30-60 діб");
  });
});
