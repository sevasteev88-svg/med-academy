import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/ai/injury-assist
 *
 * Приймає дані гравця + травми → Claude аналізує →
 * повертає прогноз відновлення, протокол реабілітації, ризики рецидиву.
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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    return NextResponse.json({
      error: "API ключ для AI не налаштований. Додайте GEMINI_API_KEY або ANTHROPIC_API_KEY у файл .env.local",
    }, { status: 500 });
  }

  try {
    const data = await request.json();
    const prompt = buildPrompt(data);

    // 1. Якщо є GEMINI_API_KEY — використовуємо Gemini 2.5 Flash
    if (geminiKey) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error("Gemini API error:", err);
        return NextResponse.json({ error: "Помилка Gemini API" }, { status: 502 });
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      return NextResponse.json({ recommendation: text });
    }

    // 2. Якщо є ANTHROPIC_API_KEY
    if (anthropicKey) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
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
    }

    return NextResponse.json({ error: "Немає доступного провайдера AI" }, { status: 500 });
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
