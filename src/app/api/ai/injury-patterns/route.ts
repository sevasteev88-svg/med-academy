import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/ai/injury-patterns
 *
 * Приймає повну історію травм + дані матурації →
 * Claude аналізує патерни та кореляції →
 * повертає структурований аналіз.
 *
 * Доступ лише для авторизованих користувачів.
 */

export async function POST(request: NextRequest) {
  // Перевірка авторизації — не пускаємо анонімні запити до платного API
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY не налаштований" },
      { status: 500 }
    );
  }

  try {
    const data = await request.json();
    const prompt = buildPrompt(data);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json(
        { error: "Помилка Claude API" },
        { status: 502 }
      );
    }

    const result = await response.json();
    const text = result.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return NextResponse.json({ analysis: text });
  } catch (err) {
    console.error("Pattern analysis error:", err);
    return NextResponse.json(
      { error: "Внутрішня помилка сервера" },
      { status: 500 }
    );
  }
}

function buildPrompt(data: any): string {
  return `Ти — AI-аналітик спортивної медицини ФК «Чорноморець» (юнацька академія, вікові категорії U13–U19).
Проаналізуй базу травм і знайди закономірності, кореляції та фактори ризику.

## Дані для аналізу:

### Усі травми (${data.injuries?.length ?? 0}):
${formatInjuryHistory(data.injuries)}

### Дані матурації гравців (${data.maturation?.length ?? 0}):
${formatMaturation(data.maturation)}

### Рецидиви (гравці з >1 травмою) (${data.recurrences?.length ?? 0}):
${formatRecurrences(data.recurrences)}

### Статистика по командах:
${formatTeamStats(data.teamStats)}

## Що шукати:

1. **Травми × матурація**: чи є кореляція між фазою росту (pre-PHV/PHV/post-PHV) та типом/локалізацією травми? Апофізити в PHV? ACL в post-PHV?

2. **Позиційні патерни**: чи певні позиції (воротарі, захисники, нападники) мають характерні травми?

3. **Механізм**: співвідношення contact / non-contact / overuse. Що переважає? Чи є зв'язок з віковою групою?

4. **Рецидиви**: хто травмується повторно? Яка локалізація найчастіше рецидивує? Чи достатній був час відновлення?

5. **Темпоральні патерни**: чи є скупчення травм у певні місяці (початок сезону, після перерви)?

6. **Severity × recovery**: чи відповідає фактичний час відновлення очікуваному? Хто повертається раніше/пізніше?

7. **Тренди**: кількість травм зростає/знижується? Зміна типу травм з часом?

## Формат відповіді:

### 🔍 Ключові знахідки
3-5 найважливіших патернів з конкретними цифрами

### 📊 Кореляція травми–матурація
Аналіз зв'язку фаз росту з типами травм

### ⚠️ Фактори ризику
Хто з поточного складу в зоні підвищеного ризику і чому

### 🔄 Рецидиви
Аналіз повторних травм, причини

### 💡 Рекомендації
Конкретні дії для профілактики: програми, протоколи, зміни навантажень

Пиши українською, стисло, з конкретними прізвищами та цифрами.
Якщо даних недостатньо для висновку — чесно вкажи це і поясни що потрібно збирати.`;
}

function formatInjuryHistory(injuries: any[] | undefined): string {
  if (!injuries?.length) return "Немає даних";
  return injuries
    .map(
      (i) =>
        `- ${i.lastName} ${i.firstName} (${i.teamName}, ${i.position}, ${i.age}р.): ${i.injuryType} ${i.location} ${i.side}, ${i.severity}, ${i.mechanism}, ВАШ ${i.vasScore}/10, дата: ${i.dateOfInjury}, статус: ${i.status}, пропущено: ${i.daysMissed ?? "?"}дн.${i.growthPhase ? `, фаза: ${i.growthPhase}` : ""}`
    )
    .join("\n");
}

function formatMaturation(maturation: any[] | undefined): string {
  if (!maturation?.length) return "Немає даних";
  return maturation
    .map(
      (m) =>
        `- ${m.lastName} ${m.firstName} (${m.teamName}, ${m.age}р.): фаза ${m.growthPhase}, offset ${m.consensusOffset > 0 ? "+" : ""}${m.consensusOffset}, ризик: ${m.riskZone}${m.heightVelocity ? `, Δ ${m.heightVelocity} см/р` : ""}`
    )
    .join("\n");
}

function formatRecurrences(recurrences: any[] | undefined): string {
  if (!recurrences?.length) return "Немає повторних травм";
  return recurrences
    .map(
      (r) =>
        `- ${r.lastName} ${r.firstName} (${r.teamName}): ${r.injuryCount} травм — ${r.locations}`
    )
    .join("\n");
}

function formatTeamStats(stats: any[] | undefined): string {
  if (!stats?.length) return "Немає даних";
  return stats
    .map(
      (s) =>
        `- ${s.teamName}: ${s.totalInjuries} травм, ${s.totalPlayers} гравців, ${s.injuryRate} травм/гравець`
    )
    .join("\n");
}
