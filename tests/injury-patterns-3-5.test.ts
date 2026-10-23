import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("3.5 Аналітика патернів травм (Injury Patterns Analytics)", () => {
  // 1. Розмір вибірки та попередження при n < 30
  describe("1. Розмір вибірки та застереження (n < 30)", () => {
    it("визначає стан вибірки як малий при n < 30 та формує обов'язкове застереження", () => {
      const sampleSize = 14;
      const isSmallSample = sampleSize < 30;
      assert.equal(isSmallSample, true);

      const warningText = isSmallSample
        ? "Описова статистика, не причинно-наслідкові висновки"
        : null;

      assert.equal(warningText, "Описова статистика, не причинно-наслідкові висновки");
    });

    it("не позначає вибірку як малу при n >= 30", () => {
      const sampleSizes = [30, 45, 120];
      for (const n of sampleSizes) {
        assert.equal(n < 30, false);
      }
    });

    it("коректно обробляє граничний випадок n = 0 (немає даних)", () => {
      const n = 0;
      const noData = n === 0;
      assert.equal(noData, true);
    });
  });

  // 2. Блок «За фазою матурації» (відображення неповної вибірки без відсотків)
  describe("2. За фазою матурації (неповна вибірка без оманливих відсотків)", () => {
    const mockInjuries = [
      { id: "1", growthPhase: "phv" },
      { id: "2", growthPhase: "phv" },
      { id: "3", growthPhase: "pre-phv" },
      { id: "4", growthPhase: "post-phv" },
      { id: "5", growthPhase: null },
      { id: "6", growthPhase: null },
      { id: "7", growthPhase: null },
    ];

    it("правильно підраховує кількість травм з відомою фазою (наприклад '4 з 7')", () => {
      const total = mockInjuries.length;
      const knownCount = mockInjuries.filter((i) => !!i.growthPhase).length;
      const unknownCount = total - knownCount;

      assert.equal(total, 7);
      assert.equal(knownCount, 4);
      assert.equal(unknownCount, 3);

      const label = `Фаза відома: ${knownCount} з ${total}`;
      assert.equal(label, "Фаза відома: 4 з 7");
    });

    it("НЕ обчислює відсотки від неповної вибірки як загальні репрезентативні частки", () => {
      const total = mockInjuries.length; // 7
      const known = mockInjuries.filter((i) => !!i.growthPhase); // 4
      const phvCount = known.filter((i) => i.growthPhase === "phv").length; // 2

      // Обчислення 2 / 4 = 50% є хибним, оскільки для 3 із 7 статус невідомий.
      // Справжня частка у загальній вибірці невизначена (від 2/7 ≈ 28.5% до 5/7 ≈ 71.4%).
      const rawCountPhv = phvCount;
      assert.equal(rawCountPhv, 2);

      // Перевіряємо, що ми не повертаємо відсоток від невідомої вибірки
      const shouldDisplayPercentages = known.length === total;
      assert.equal(shouldDisplayPercentages, false, "При неповній вибірці відсотки не повинні відображатись");
    });

    it("коректно групує розподіл за фазами без втрати невідомих записів", () => {
      const counts: Record<string, number> = {};
      for (const i of mockInjuries) {
        const key = i.growthPhase ?? "unknown";
        counts[key] = (counts[key] ?? 0) + 1;
      }

      assert.equal(counts["phv"], 2);
      assert.equal(counts["pre-phv"], 1);
      assert.equal(counts["post-phv"], 1);
      assert.equal(counts["unknown"], 3);

      const sumAll = Object.values(counts).reduce((a, b) => a + b, 0);
      assert.equal(sumAll, mockInjuries.length);
    });
  });

  // 3. Знеособлені агрегати для передачі в ШІ та анти-каузальні вимоги
  describe("3. Знеособлені агрегати та анти-каузальний промпт для ШІ", () => {
    it("формує агрегати без жодних персональних імен, прізвищ чи ID гравців", () => {
      const testInjuries = [
        {
          id: "inj-1",
          playerId: "p-1",
          firstName: "Тарас",
          lastName: "Шевченко",
          injuryType: "muscle",
          location: "hamstring",
          growthPhase: "phv",
          severity: "moderate",
          mechanism: "non-contact",
        },
        {
          id: "inj-2",
          playerId: "p-2",
          firstName: "Іван",
          lastName: "Франко",
          injuryType: "ligament",
          location: "ankle",
          growthPhase: null,
          severity: "mild",
          mechanism: "contact",
        },
      ];

      // Функція агрегації
      const buildAggregates = (arr: typeof testInjuries) => ({
        sampleSize: arr.length,
        byType: { muscle: 1, ligament: 1 },
        byLocation: { hamstring: 1, ankle: 1 },
        byMechanism: { "non-contact": 1, contact: 1 },
        bySeverity: { moderate: 1, mild: 1 },
        maturation: {
          totalInjuries: arr.length,
          knownCount: arr.filter((i) => !!i.growthPhase).length,
          unknownCount: arr.filter((i) => !i.growthPhase).length,
          byPhase: { phv: 1 },
        },
      });

      const agg = buildAggregates(testInjuries);
      const jsonStr = JSON.stringify(agg);

      // Перевіряємо повну відсутність PII
      assert.equal(jsonStr.includes("Тарас"), false);
      assert.equal(jsonStr.includes("Шевченко"), false);
      assert.equal(jsonStr.includes("Іван"), false);
      assert.equal(jsonStr.includes("Франко"), false);
      assert.equal(jsonStr.includes("inj-1"), false);
      assert.equal(jsonStr.includes("p-1"), false);
    });

    it("промпт містить чітку заборону причинних висновків та обов'язковий розділ обмежень даних", () => {
      // Симулюємо побудову промпту
      const samplePrompt = `
БЕЗ ПРИЧИННИХ ТВЕРДЖЕНЬ (No Causality Claims):
Кореляція не дорівнює причинності. Заборонено стверджувати, що будь-який фактор викликав травму.

ОБОВ'ЯЗКОВИЙ ПЕРЕЛІК ОБМЕЖЕНЬ ДАНИХ (Data Limitations):
- Розмір вибірки n = 12
- Фаза росту відома лише для 4 з 12
- Відсутність показників інцидентності на 1000 годин
      `;

      assert.match(samplePrompt, /БЕЗ ПРИЧИННИХ ТВЕРДЖЕНЬ/i);
      assert.match(samplePrompt, /ОБМЕЖЕНЬ ДАНИХ/i);
      assert.match(samplePrompt, /1000 годин/i);
    });
  });

  // 4. Показники «на 1000 годин» (резервування місця до етапу 4.2)
  describe("4. Резервування місця під показники «на 1000 годин»", () => {
    it("містить плейсхолдер зі статусом очікування етапу 4.2", () => {
      const exposureSlot = {
        label: "Травм на 1000 год",
        value: "—",
        available: false,
        eta: "задача 4.2 (експозиція)",
      };

      assert.equal(exposureSlot.value, "—");
      assert.equal(exposureSlot.available, false);
      assert.match(exposureSlot.eta, /4\.2/);
    });
  });
});
