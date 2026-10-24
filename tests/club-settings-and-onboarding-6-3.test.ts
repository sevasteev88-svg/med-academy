import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  encryptServerSecret,
  decryptServerSecret,
  maskSecretValue,
} from "../src/lib/server-crypto.ts";

test("Етап 6.3 — Налаштування клубу, White-Label та Онбординг", async (t) => {
  await t.test("1. Серверне шифрування Telegram токенів (AES-256-GCM)", () => {
    const rawBotToken = "7823491234:AAHkQ9_demoTokenSecret12345XYZ";
    const rawChatId = "-100192837465";

    const encryptedToken = encryptServerSecret(rawBotToken);
    const encryptedChatId = encryptServerSecret(rawChatId);

    // Перевірка формату iv:tag:ciphertext
    assert.match(encryptedToken, /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i);
    assert.doesNotMatch(encryptedToken, /AAHkQ9_demoTokenSecret/, "Відкритий токен не повинен бути у шифротексті");

    // Перевірка зворотного дешифрування
    const decryptedToken = decryptServerSecret(encryptedToken);
    const decryptedChatId = decryptServerSecret(encryptedChatId);

    assert.equal(decryptedToken, rawBotToken);
    assert.equal(decryptedChatId, rawChatId);

    // Маскування для UI
    const masked = maskSecretValue(rawBotToken);
    assert.match(masked, /^••••••••5XYZ$/);
    assert.doesNotMatch(masked, /782349/);
  });

  await t.test("2. CSV Парсинг та валідація рядків гравців", () => {
    // Симуляція CSV парсера з club-settings-actions
    const validPositions = new Set([
      "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
      "ВР", "ЦЗ", "ЛЗ", "ПЗ", "ОП", "ЦП", "АП", "ЛВ", "ПВ", "НП"
    ]);

    const posMapUaToEn: Record<string, string> = {
      ВР: "GK", ЦЗ: "CB", ЛЗ: "LB", ПЗ: "RB", ОП: "CDM",
      ЦП: "CM", АП: "CAM", ЛВ: "LW", ПВ: "RW", НП: "ST",
    };

    function validateCsvRow(cols: string[]) {
      if (cols.length < 3) return { valid: false, error: "Недостатньо колонок" };
      const [fullName, rawDob, rawPos] = cols;

      const nameParts = fullName.trim().split(/\s+/);
      if (nameParts.length < 2) return { valid: false, error: "ПІБ має містити прізвище та ім'я" };

      let normalizedDob = rawDob.trim();
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalizedDob)) {
        const [d, m, y] = normalizedDob.split(".");
        normalizedDob = `${y}-${m}-${d}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDob) || isNaN(new Date(normalizedDob).getTime())) {
        return { valid: false, error: "Невірний формат дати народження" };
      }

      const upperPos = rawPos.trim().toUpperCase();
      if (!validPositions.has(upperPos)) {
        return { valid: false, error: `Невідома позиція: ${upperPos}` };
      }

      return {
        valid: true,
        firstName: nameParts.slice(1).join(" "),
        lastName: nameParts[0],
        dob: normalizedDob,
        position: posMapUaToEn[upperPos] || upperPos,
      };
    }

    // 1. Валідний рядок
    const r1 = validateCsvRow(["Коваленко Максим", "2008-04-12", "ST", "U-19"]);
    assert.equal(r1.valid, true);
    assert.equal(r1.firstName, "Максим");
    assert.equal(r1.lastName, "Коваленко");
    assert.equal(r1.position, "ST");

    // 2. Валідний український формат дати та позиції
    const r2 = validateCsvRow(["Мельник Олександр", "15.08.2009", "ВР", "U-17"]);
    assert.equal(r2.valid, true);
    assert.equal(r2.dob, "2009-08-15");
    assert.equal(r2.position, "GK");

    // 3. Помилка: лише одне слово в імені
    const r3 = validateCsvRow(["Андрій", "2008-01-01", "CM"]);
    assert.equal(r3.valid, false);
    assert.match(r3.error!, /прізвище та ім'я/);

    // 4. Помилка: невірна дата
    const r4 = validateCsvRow(["Іванов Іван", "invalid-date", "CB"]);
    assert.equal(r4.valid, false);
    assert.match(r4.error!, /формат дати/);

    // 5. Помилка: невідома позиція
    const r5 = validateCsvRow(["Петренко Петро", "2007-06-20", "FORWARD_ATTACK"]);
    assert.equal(r5.valid, false);
    assert.match(r5.error!, /Невідома позиція/);
  });

  await t.test("3. White-Label перевірка: відсутність жорстко зашитого «Чорноморець» у UI файлах", () => {
    const filesToCheck = [
      "public/manifest.json",
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/app/injuries/page.tsx",
      "src/app/pharmacy/page.tsx",
      "src/app/players/page.tsx",
      "src/app/rehab-portal/page.tsx",
      "src/lib/coach-weekly-telegram-pdf.ts",
      "src/lib/qr-pdf-generator.ts",
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.join(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        // Не повинно бути користувацьких рядків «Чорноморець» (крім технічних коментарів типу //)
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;
          assert.equal(
            /ФК\s*[«"']?Чорноморець[»"']?/i.test(line),
            false,
            `Знайдено зашитий «Чорноморець» у ${relPath}:${i + 1} -> ${line.trim()}`
          );
        }
      }
    }
  });
});
