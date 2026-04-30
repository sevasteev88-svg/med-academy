import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai/injury-assist
 *
 * Приймає дані гравця + травми → Claude аналізує →
 * повертає прогноз відновлення, протокол реабілітації, ризики рецидиву.
 */

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY не налаштований" }, { status: 500 });
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
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ error: "Помилка Claude API" }, { status: 502 });
    }

    const result = await response.json();
    const text = result.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    return NextResponse.json({ recommendation: text });
  } catch (err) {
    console.error("Injury assist error:", err);
    return NextResponse.json({ error: "Внутрішня помилка" }, { status: 500 });
  }
}

function buildPrompt(data: any): string {
  return `Ти — AI-асистент спортивного лікаря ФК «Чорноморець» (юнацька академія).
Лікар щойно зафіксував травму. Проаналізуй профіль гравця і дай рекомендації.

## Профіль гравця:
- Ім'я: ${data.playerName}
- Вік: ${data.age} років
- Стать: ${data.sex === "male" ? "хлопець" : "дівчина"}
- Позиція: ${data.position}
- Команда: ${data.teamName}

## Матурація (PHV):
${data.maturation ? `- Фаза: ${data.maturation.growthPhase}
- Maturity offset: ${data.maturation.consensusOffset}
- Орієнтовний вік PHV: ${data.maturation.estimatedPhvAge}
- Зона ризику: ${data.maturation.riskZone}
${data.maturation.heightVelocity ? `- Швидкість росту: ${data.maturation.heightVelocity} см/рік` : ""}` : "Дані матурації відсутні"}

## Поточна травма:
- Тип: ${data.injury.injuryType}
- Локалізація: ${data.injury.location}
- Сторона: ${data.injury.side}
- Тяжкість: ${data.injury.severity}
- Механізм: ${data.injury.mechanism}
- ВАШ: ${data.injury.vasScore}/10
- Опис: ${data.injury.description || "не вказано"}

## Попередні травми цього гравця (${data.previousInjuries?.length ?? 0}):
${formatPreviousInjuries(data.previousInjuries)}

## Що потрібно:

### 1. Прогноз відновлення
Орієнтовний термін повернення в днях (діапазон мін–макс).
Врахуй: вік, фазу матурації, тяжкість, попередні травми цієї ж локалізації.

### 2. Протокол реабілітації
Фази реабілітації з орієнтовними термінами:
- Гостра фаза (RICE/POLICE)
- Відновлення ROM та сили
- Функціональна фаза
- Return to play критерії

### 3. Фактори ризику рецидиву
Що збільшує ризик повторної травми у цього конкретного гравця.

### 4. Рекомендації для тренера
Конкретні обмеження: що можна, що не можна, на що звернути увагу.

### 5. Зв'язок з матурацією
Якщо гравець у фазі PHV або поблизу — як це впливає на цю травму і відновлення.
Чи типова ця травма для поточної фази росту?

Пиши українською, стисло і конкретно. Формат: Markdown з ##.
Це рекомендація AI — фінальне рішення за лікарем.`;
}

function formatPreviousInjuries(injuries: any[] | undefined): string {
  if (!injuries?.length) return "Попередніх травм не зафіксовано";
  return injuries
    .map(
      (i) =>
        `- ${i.injuryType} ${i.location} ${i.side}, ${i.severity}, ${i.dateOfInjury}, пропущено ${i.daysMissed ?? "?"} дн., статус: ${i.status}`
    )
    .join("\n");
}
