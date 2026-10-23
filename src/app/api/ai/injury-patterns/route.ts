import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit } from "@/lib/audit";
import { callAI, AI_DISCLAIMER } from "@/lib/ai";
import {
  INJURY_TYPE_UA,
  LOCATION_UA,
  MECHANISM_UA,
  SEVERITY_UA,
} from "@/lib/constants";
import { GROWTH_PHASE_LABELS } from "@/lib/phv-calculator";

/**
 * POST /api/ai/injury-patterns
 *
 * Приймає ВИКЛЮЧНО знеособлені агреговані дані травматизму та матурації (п. 3.5).
 * Жодні індивідуальні імена, ідентифікатори чи персональні записи не передаються в ШІ.
 * Запитує аналіз: суворо без причинних тверджень, з обов'язковим переліком обмежень даних.
 */
export async function POST(request: NextRequest) {
  // Перевірка авторизації
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  try {
    const data = await request.json();

    // Отримуємо або збираємо агрегати (гарантуємо повну відсутність PII)
    const aggregates = data.aggregates ?? buildAggregatesFromLegacyData(data);

    const prompt = buildPrompt(aggregates);

    const system =
      "Ти — провідний аналітик спортивної медицини юнацької футбольної академії. Працюєш суворо з агрегованими статистичними показниками. Твої правила: академічна обережність, жодних причинно-наслідкових тверджень (лише описова статистика), обов'язкова фіксація обмежень вибірки та неповноти даних.";

    // Виклик ШІ
    const aiResult = await callAI({
      prompt,
      system,
      maxTokens: 5000,
      temperature: 0.2,
    });

    await logAudit({
      action: "ai_call",
      entity: "ai",
      entityId: "injury-patterns",
      meta: {
        model: aiResult.model,
        endpoint: "/api/ai/injury-patterns",
        sampleSize: aggregates.sampleSize ?? 0,
      },
      userId: user.id,
    });

    return NextResponse.json({
      analysis: aiResult.text,
      disclaimer: AI_DISCLAIMER,
    });
  } catch (err: any) {
    console.error("Pattern analysis error:", err);
    return NextResponse.json(
      { error: err.message || "Внутрішня помилка сервера" },
      { status: 500 }
    );
  }
}

function buildPrompt(data: any): string {
  const n = data.sampleSize ?? 0;
  const isSmallSample = n < 30;
  const matKnown = data.maturation?.knownCount ?? 0;
  const matTotal = data.maturation?.totalInjuries ?? n;
  const matUnknown = data.maturation?.unknownCount ?? Math.max(0, matTotal - matKnown);

  return `Ти — AI-аналітик спортивної медицини юнацької футбольної академії (вікові категорії U13–U19).
Перед тобою ВИКЛЮЧНО ЗНЕОСОБЛЕНІ АГРЕГОВАНІ СТАТИСТИЧНІ ДАНІ щодо травматизму в академії.

${
  isSmallSample
    ? `⚠️ КРИТИЧНЕ ЗАСТЕРЕЖЕННЯ: РОЗМІР ВИБІРКИ МАЛИЙ (n = ${n} < 30).
Твій аналіз має бути виключно описовим (описова статистика, descriptive statistics).
Категорично заборонено формулювати причинно-наслідкові висновки.`
    : `РОЗМІР ВИБІРКИ: n = ${n}.`
}

## Суворі методологічні вимоги:
1. **БЕЗ ПРИЧИННИХ ТВЕРДЖЕНЬ (No Causality Claims)**:
   - Кореляція чи збіг НЕ дорівнює причинно-наслідковому зв'язку.
   - Заборонено стверджувати, що фаза росту, покриття, позиція чи вік «викликали» травму, «призвели» до неї або «є прямою причиною».
   - Використовуй виключно дескриптивні формулювання: «у вибірці зафіксовано супутній патерн», «спостерігається тенденція серед зареєстрованих випадків», «відзначено кількісний розподіл».
2. **ОБОВ'ЯЗКОВИЙ ПЕРЕЛІК ОБМЕЖЕНЬ ДАНИХ (Data Limitations)**:
   - Сформуй окремий розділ «Обмеження даних» і обов'язково зазнач:
     * Малий/обмежений розмір вибірки (n = ${n} випадків)${isSmallSample ? " — недостатньо для статистичної генералізації" : ""}.
     * Неповноту даних матурації: фаза росту на момент травми відома лише для ${matKnown} з ${matTotal} травм (${matUnknown} травм без оцінки PHV). Не екстраполювати неповну вибірку на всю академію.
     * Відсутність даних експозиції (показники інцидентності на 1000 годин тренувань та матчів наразі відсутні, очікуються після етапу 4.2).
     * Відсутність контрольної групи здорових не травмованих гравців для статистичного порівняння частот.
3. **ОБЕРЕЖНІ ПРАКТИЧНІ РЕКОМЕНДАЦІЇ**:
   - Рекомендації мають стосуватися перш за все стандартизації моніторингу (наприклад, регулярного вимірювання PHV для всіх гравців кожні 3–4 місяці) та базових превентивних протоколів (FIFA 11+, контроль втоми).

## Агреговані статистичні масиви:

### Загальний обсяг:
- Загальна кількість травм (вибірка n): ${n}
- Унікальних травмованих гравців: ${data.uniqueInjuredPlayers ?? "—"}
- Всього гравців в академічному пулі: ${data.totalPlayers ?? "—"}
- Вікова характеристика травмованих: ${
    data.ageStats
      ? `діапазон ${data.ageStats.min ?? "?"}–${data.ageStats.max ?? "?"} р., середній ${data.ageStats.avg ?? "?"} р.`
      : "немає даних"
  }

### Розподіл за локалізацією:
${formatRecord(data.byLocation, LOCATION_UA)}

### Розподіл за типами травм:
${formatRecord(data.byType, INJURY_TYPE_UA)}

### Розподіл за механізмом виникнення:
${formatRecord(data.byMechanism, MECHANISM_UA)}

### Розподіл за ступенем тяжкості:
${formatRecord(data.bySeverity, SEVERITY_UA)}

### Розподіл за фазою матурації (PHV):
- Фаза відома: ${matKnown} з ${matTotal} травм
- Фаза не визначена (немає виміру): ${matUnknown} травм
- Кількість за відомими фазами:
${formatRecord(data.maturation?.byPhase, GROWTH_PHASE_LABELS)}
(Увага: не обчислюй відсотки від неповної вибірки ${matKnown} як репрезентативні для всіх ${matTotal} травм!)

### Повторні травми (рецидиви):
- Кількість гравців з ≥ 2 травмами: ${data.recurrencesSummary?.playersWithRecurrences ?? 0}
- Розподіл кратності: ${formatDistribution(data.recurrencesSummary?.distribution)}
- Локалізації при повторних травмах: ${
    data.recurrencesSummary?.recurringLocations?.filter(Boolean).join("; ") || "немає або поодинокі"
  }

### Командна статистика:
${formatTeamStats(data.teamStats)}

### Показники на 1000 годин (експозиція):
- Показники інцидентності на 1000 годин тренувань/матчів: відсутні (з'являться після задачі 4.2).

## Формат звіту:

### 1. ⚠️ Обмеження даних та застереження щодо вибірки
Чіткий перелік методологічних обмежень: розмір вибірки (n = ${n}), неповні дані матурації (${matKnown}/${matTotal}), відсутність даних експозиції на 1000 годин.

### 2. 📊 Описова структура травматизму
Описовий огляд переважаючих локалізацій, типів та механізмів (без причинно-наслідкових висновків).

### 3. 🌱 Зв'язок з біологічною зрілістю (матурацією)
Аналіз наявних випадків у pre-PHV, PHV та post-PHV з акцентом на те, що це попередні описові дані через неповну вибірку.

### 4. 🔄 Рецидиви та зони підвищеної уваги
Описовий аналіз повторних травм та типових зон рецидивування.

### 5. 💡 Практичні превентивні заходи для медичного штабу
Конкретні кроки: регулярність скринінгу росту, стандартизовані превентивні розминки, оптимізація моніторингу.

Пиши українською, стисло, професійною мовою спортивного лікаря-епідеміолога.`;
}

function formatRecord(rec: Record<string, number> | undefined, dict: Record<string, string>): string {
  if (!rec || Object.keys(rec).length === 0) return "Немає зареєстрованих даних";
  return Object.entries(rec)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => `- ${dict[key] ?? key}: ${count} випадків`)
    .join("\n");
}

function formatDistribution(dist: Record<string, number> | undefined): string {
  if (!dist || Object.keys(dist).length === 0) return "немає";
  return Object.entries(dist)
    .map(([count, players]) => `${players} гравців мали по ${count} травм`)
    .join(", ");
}

function formatTeamStats(stats: any[] | undefined): string {
  if (!stats?.length) return "Немає даних";
  return stats
    .map(
      (s) =>
        `- ${s.teamName}: ${s.totalInjuries} травм, ${s.totalPlayers} гравців (коефіцієнт: ${s.injuryRate} травм/гравець)`
    )
    .join("\n");
}

function buildAggregatesFromLegacyData(data: any) {
  const injuries = data.injuries || [];
  const maturation = data.maturation || [];
  const recurrences = data.recurrences || [];
  const teamStats = data.teamStats || [];

  const countBy = (arr: any[], key: string) => {
    const res: Record<string, number> = {};
    for (const item of arr) {
      const val = item[key] ?? "unknown";
      res[val] = (res[val] ?? 0) + 1;
    }
    return res;
  };

  const matKnownCount = injuries.filter((i: any) => !!i.growthPhase).length;
  const validAges = injuries.map((i: any) => i.age).filter((a: any) => typeof a === "number" && a > 0);

  return {
    sampleSize: injuries.length,
    totalPlayers: data.totalPlayers ?? 0,
    uniqueInjuredPlayers: new Set(injuries.map((i: any) => i.playerId)).size,
    ageStats: {
      min: validAges.length > 0 ? Math.min(...validAges) : null,
      max: validAges.length > 0 ? Math.max(...validAges) : null,
      avg:
        validAges.length > 0
          ? Math.round((validAges.reduce((a: number, b: number) => a + b, 0) / validAges.length) * 10) / 10
          : null,
    },
    byType: countBy(injuries, "injuryType"),
    byLocation: countBy(injuries, "location"),
    byMechanism: countBy(injuries, "mechanism"),
    bySeverity: countBy(injuries, "severity"),
    maturation: {
      totalInjuries: injuries.length,
      knownCount: matKnownCount,
      unknownCount: injuries.length - matKnownCount,
      byPhase: countBy(injuries.filter((i: any) => i.growthPhase), "growthPhase"),
    },
    recurrencesSummary: {
      playersWithRecurrences: recurrences.length,
      distribution: countBy(recurrences, "injuryCount"),
      recurringLocations: recurrences.map((r: any) => r.locations),
    },
    teamStats,
    exposureMetrics: {
      hasData: false,
      hours1000Rate: null,
      placeholderNote: "Показники на 1000 годин з'являться після задачі 4.2",
    },
  };
}
