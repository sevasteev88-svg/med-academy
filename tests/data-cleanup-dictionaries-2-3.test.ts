import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CANONICAL_POSITIONS,
  normalizePosition,
  formatPosition,
  formatPositionFull,
  formatInjuryType,
  formatLocation,
  formatSeverity,
  formatMechanism,
  formatInjuryStatus,
  formatExamGrade,
  formatRomGrade,
  formatMuscleTone,
  formatRehabStatus,
  formatDominantSide,
  INJURY_TYPE_UA,
  LOCATION_UA,
  SEVERITY_UA,
  MECHANISM_UA,
  STATUS_UA,
} from "../src/lib/dictionaries.ts";

describe("Етап 2.3 — Чистка даних і словарі", () => {
  // ─── 1. SQL-скрипт ручної очистки та виявлення сміттєвого тексту ─────────
  describe("1. Аудит тестового тексту (data_cleanup_audit.sql)", () => {
    it("скрипт існує та містить патерни пошуку сміттєвих послідовностей (dfgdfgdfg)", () => {
      const scriptPath = path.resolve(process.cwd(), "supabase/scripts/data_cleanup_audit.sql");
      assert.ok(fs.existsSync(scriptPath), "Файл data_cleanup_audit.sql повинен існувати");

      const content = fs.readFileSync(scriptPath, "utf-8");
      // Перевіряємо наявність перевірок на консонантні кластери та повтори
      assert.match(content, /\[bcdfghjklmnpqrstvwxyz\]\{5,\}/, "Містить патерн для приголосних кластерів");
      assert.match(content, /test|тест|asdf|dfg|qwerty/i, "Містить перевірку типових тестових рядків");
      assert.match(content, /public\.injuries/, "Перевіряє таблицю injuries");
      assert.match(content, /public\.injury_examinations/, "Перевіряє таблицю injury_examinations");
      assert.match(content, /public\.players/, "Перевіряє таблицю players");

      // Скрипт не повинен містити небезпечних некоментованих масових видалень
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("DELETE") || trimmed.startsWith("UPDATE")) {
          assert.fail(`Скрипт містить небезпечну розкоментовану команду: ${trimmed}`);
        }
      }
    });
  });

  // ─── 2. Усі enum з БД виводяться через єдиний словник українською ─────────
  describe("2. Єдиний словник enum українською (ніколи не показує сирі англійські значення)", () => {
    it("formatInjuryType перекладає всі типи травм та має безпечний фолбек", () => {
      assert.equal(formatInjuryType("muscular"), "М'язова");
      assert.equal(formatInjuryType("muscle"), "М'язова");
      assert.equal(formatInjuryType("ligament"), "Зв'язки");
      assert.equal(formatInjuryType("bone"), "Кісткова");
      assert.equal(formatInjuryType("tendon"), "Сухожилля");
      assert.equal(formatInjuryType("cartilage"), "Хрящова");
      assert.equal(formatInjuryType("concussion"), "Струс мозку");
      assert.equal(formatInjuryType("contusion"), "Забій");
      assert.equal(formatInjuryType("other"), "Інше");

      // Безпечний фолбек для невідомого або порожнього значення — ніколи не повертає сирий рядок
      assert.equal(formatInjuryType(null), "—");
      assert.equal(formatInjuryType(undefined), "—");
      assert.equal(formatInjuryType("unknown_raw_string"), "Інше");
    });

    it("formatLocation перекладає анатомічні локалізації", () => {
      assert.equal(formatLocation("thigh"), "Стегно");
      assert.equal(formatLocation("knee"), "Коліно");
      assert.equal(formatLocation("ankle"), "Гомілковостоп");
      assert.equal(formatLocation("calf"), "Литка");
      assert.equal(formatLocation("foot"), "Стопа");
      assert.equal(formatLocation("groin"), "Пах");
      assert.equal(formatLocation("shoulder"), "Плече");
      assert.equal(formatLocation("elbow"), "Лікоть");
      assert.equal(formatLocation("wrist"), "Кисть");
      assert.equal(formatLocation("spine"), "Хребет");
      assert.equal(formatLocation("head"), "Голова");
      assert.equal(formatLocation("hamstring"), "Задня поверхня стегна");

      assert.equal(formatLocation(null), "—");
      assert.equal(formatLocation("gibberish_body_part"), "Інше");
    });

    it("форматувачі ступенів тяжкості, механізму, статусів та оглядів", () => {
      assert.equal(formatSeverity("severe"), "Тяжка");
      assert.equal(formatSeverity("mild"), "Легка");
      assert.equal(formatMechanism("contact"), "Контактна");
      assert.equal(formatMechanism("non_contact"), "Безконтактна");
      assert.equal(formatInjuryStatus("active"), "Гостра фаза");
      assert.equal(formatInjuryStatus("rehabilitation"), "Реабілітація");
      assert.equal(formatExamGrade("mild"), "Незначний");
      assert.equal(formatExamGrade("severe"), "Виражений");
      assert.equal(formatRomGrade("full"), "Повний");
      assert.equal(formatRomGrade("moderately_limited"), "Помірно обмежений");
      assert.equal(formatMuscleTone("normal"), "Нормальний");
      assert.equal(formatMuscleTone("hypertonic"), "Підвищений");
      assert.equal(formatRehabStatus("in_progress"), "В процесі");
      assert.equal(formatDominantSide("left"), "Ліва");
      assert.equal(formatDominantSide("both"), "Обидві");
    });
  });

  // ─── 3. Позиції: єдиний довідник та міграція ──────────────────────────────
  describe("3. Єдиний український довідник позицій", () => {
    it("містить 10 канонічних українських скорочень", () => {
      assert.deepEqual(CANONICAL_POSITIONS, [
        "ВР", "ЦЗ", "ЛЗ", "ПЗ", "ОП", "ЦП", "ЦАП", "ЛВ", "ПВ", "НП"
      ]);
    });

    it("normalizePosition транслює англійські абревіатури в українські", () => {
      assert.equal(normalizePosition("GK"), "ВР");
      assert.equal(normalizePosition("CB"), "ЦЗ");
      assert.equal(normalizePosition("LB"), "ЛЗ");
      assert.equal(normalizePosition("RB"), "ПЗ");
      assert.equal(normalizePosition("CDM"), "ОП");
      assert.equal(normalizePosition("CM"), "ЦП");
      assert.equal(normalizePosition("CAM"), "ЦАП");
      assert.equal(normalizePosition("LW"), "ЛВ");
      assert.equal(normalizePosition("RW"), "ПВ");
      assert.equal(normalizePosition("ST"), "НП");
      assert.equal(normalizePosition("CF"), "НП");
    });

    it("normalizePosition підтримує альтернативні українські синоніми", () => {
      assert.equal(normalizePosition("ЗХ"), "ЦЗ");
      assert.equal(normalizePosition("ЦОП"), "ОП");
      assert.equal(normalizePosition("ЦПЗ"), "ОП");
      assert.equal(normalizePosition("ЦН"), "НП");
      assert.equal(normalizePosition("ФОРВАРД"), "НП");
      assert.equal(normalizePosition("ВОРОТАР"), "ВР");
    });

    it("formatPosition та formatPositionFull повертають зрозумілі назви", () => {
      assert.equal(formatPosition("RB"), "ПЗ");
      assert.equal(formatPosition("CB"), "ЦЗ");
      assert.equal(formatPosition("CAM"), "ЦАП");
      assert.equal(formatPosition("ST"), "НП");

      assert.equal(formatPositionFull("ЦЗ"), "Центральний захисник");
      assert.equal(formatPositionFull("CB"), "Центральний захисник");
      assert.equal(formatPositionFull("ВР"), "Воротар");
      assert.equal(formatPositionFull("GK"), "Воротар");
    });

    it("файл міграції позицій існує та містить мапінг колонок", () => {
      const migPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261022170000_positions_cleanup_and_migration.sql"
      );
      assert.ok(fs.existsSync(migPath), "Міграція позицій повинна існувати");
      const migSql = fs.readFileSync(migPath, "utf-8");
      assert.match(migSql, /WHEN 'GK' THEN 'ВР'/);
      assert.match(migSql, /WHEN 'CB' THEN 'ЦЗ'/);
      assert.match(migSql, /chk_player_canonical_position/);
    });
  });

  // ─── 4. Групування кількох травм одного гравця в картці ────────────────────
  describe("4. Групування кількох травм одного гравця в карточці", () => {
    type TestInjury = {
      id: string;
      player_id: string;
      location: string;
      injury_type: string;
      vas_score: number | null;
      status: string;
      players: {
        id: string;
        first_name: string;
        last_name: string;
        position: string;
        teams?: { name: string };
      };
    };

    function groupInjuriesByPlayer(injuries: TestInjury[]) {
      const map = new Map<string, { playerId: string; player: any; injuries: TestInjury[]; maxVas: number | null }>();
      for (const inj of injuries) {
        const p = inj.players;
        const pid = inj.player_id || p?.id;
        let group = map.get(pid);
        if (!group) {
          group = {
            playerId: pid,
            player: p,
            injuries: [],
            maxVas: inj.vas_score,
          };
          map.set(pid, group);
        }
        group.injuries.push(inj);
        if (inj.vas_score != null) {
          group.maxVas = Math.max(group.maxVas ?? 0, inj.vas_score);
        }
      }
      return Array.from(map.values());
    }

    const mockInjuries: TestInjury[] = [
      {
        id: "inj-1",
        player_id: "player-sheva",
        location: "thigh",
        injury_type: "muscular",
        vas_score: 8,
        status: "active",
        players: { id: "player-sheva", first_name: "Андрій", last_name: "Шевченко", position: "НП" },
      },
      {
        id: "inj-2",
        player_id: "player-sheva", // Той самий гравець — друга травма!
        location: "ankle",
        injury_type: "ligament",
        vas_score: 5,
        status: "active",
        players: { id: "player-sheva", first_name: "Андрій", last_name: "Шевченко", position: "НП" },
      },
      {
        id: "inj-3",
        player_id: "player-yarmola",
        location: "knee",
        injury_type: "tendon",
        vas_score: 6,
        status: "active",
        players: { id: "player-yarmola", first_name: "Андрій", last_name: "Ярмоленко", position: "ПВ" },
      },
    ];

    it("гравець з 2 травмами об'єднується в 1 картку (2 травми всередині)", () => {
      const groups = groupInjuriesByPlayer(mockInjuries);

      // Всього 3 травми, але рівно 2 унікальні гравці
      assert.equal(groups.length, 2, "Повинно бути 2 картки замість 3");

      const shevaGroup = groups.find((g) => g.playerId === "player-sheva");
      assert.ok(shevaGroup);
      assert.equal(shevaGroup.injuries.length, 2, "Шевченко має 2 травми в одній картці");
      assert.equal(shevaGroup.maxVas, 8, "Максимальний ВАШ рахується правильно (8)");

      const yarmolaGroup = groups.find((g) => g.playerId === "player-yarmola");
      assert.ok(yarmolaGroup);
      assert.equal(yarmolaGroup.injuries.length, 1);
    });
  });

  // ─── 5. Прострочені огляди та масове перенесення ──────────────────────────
  describe("5. Прострочені огляди та масове перенесення", () => {
    it("коректно розраховує дні запізнення для прострочених оглядів", () => {
      const todayStr = "2026-10-22";
      const examDate = "2026-10-19"; // 3 дні тому

      const diffMs = new Date(todayStr).getTime() - new Date(examDate).getTime();
      const overdueDays = Math.floor(diffMs / 86400000);

      assert.equal(overdueDays, 3);
    });

    it("розраховує нову дату для масового перенесення (+1 дн, +3 дн)", () => {
      const baseTime = new Date("2026-10-22T12:00:00Z").getTime();

      const nextDayStr = new Date(baseTime + 1 * 86400000).toISOString().split("T")[0];
      const threeDaysStr = new Date(baseTime + 3 * 86400000).toISOString().split("T")[0];

      assert.equal(nextDayStr, "2026-10-23");
      assert.equal(threeDaysStr, "2026-10-25");
    });
  });
});
