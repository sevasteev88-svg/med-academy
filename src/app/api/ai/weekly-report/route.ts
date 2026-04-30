import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ai/weekly-report
 *
 * Приймає медичні дані команди → відправляє в Claude API →
 * повертає згенерований тижневий звіт українською.
 *
 * Потребує ANTHROPIC_API_KEY в env-змінних Vercel.
 */

export async function POST(request: NextRequest) {
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
        max_tokens: 4000,
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

    return NextResponse.json({ report: text });
  } catch (err) {
    console.error("Weekly report error:", err);
    return NextResponse.json(
      { error: "Внутрішня помилка сервера" },
      { status: 500 }
    );
  }
}

// ─── Побудова промпту ───────────────────────────────────────

function buildPrompt(data: any): string {
  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Ти — AI-асистент медичного штабу ФК «Чорноморець» (юнацька академія).
Склади тижневий медичний звіт для тренерського штабу українською мовою.

Дата звіту: ${today}

## Дані для звіту:

### Активні травми (${data.activeInjuries?.length ?? 0}):
${formatInjuries(data.activeInjuries)}

### Реабілітація (${data.rehabInjuries?.length ?? 0}):
${formatInjuries(data.rehabInjuries)}

### Найближчі повернення:
${formatReturns(data.upcomingReturns)}

### Моніторинг росту (PHV):
${formatMaturation(data.maturationAlerts)}

### Загальна статистика:
- Всього гравців: ${data.totalPlayers ?? 0}
- Доступних: ${data.availablePlayers ?? 0}
- Недоступних: ${data.unavailablePlayers ?? 0}

## Вимоги до звіту:

1. **Резюме** — 2-3 речення про загальну ситуацію
2. **Доступність** — хто НЕ може тренуватись/грати, чому, скільки ще
3. **Повернення** — хто повертається цього тижня, з рекомендаціями
4. **Червона зона** — гравці з ВАШ ≥ 7, потребують уваги
5. **Матурація** — гравці у фазі PHV або червоній зоні ризику, рекомендації щодо навантажень
6. **Рекомендації тренерам** — конкретні поради: кого берегти, кому знизити навантаження, на що звернути увагу

Пиши стисло, конкретно, без води. Використовуй прізвища гравців.
Формат: Markdown з заголовками ##.
Мова: українська.`;
}

function formatInjuries(injuries: any[] | undefined): string {
  if (!injuries?.length) return "Немає";
  return injuries
    .map(
      (inj) =>
        `- ${inj.lastName} ${inj.firstName} (${inj.teamName}, ${inj.position ?? ""}): ${inj.location}, ${inj.severity}, ВАШ ${inj.vasScore}/10, ${inj.daysSinceInjury} дн. з травми${inj.expectedReturn ? `, очікуване повернення: ${inj.expectedReturn}` : ""}`
    )
    .join("\n");
}

function formatReturns(returns: any[] | undefined): string {
  if (!returns?.length) return "Немає запланованих повернень";
  return returns
    .map(
      (r) =>
        `- ${r.lastName} ${r.firstName} (${r.teamName}): ${r.location}, повернення ${r.expectedReturn} (${r.daysUntilReturn > 0 ? `через ${r.daysUntilReturn} дн.` : "прострочено"})`
    )
    .join("\n");
}

function formatMaturation(alerts: any[] | undefined): string {
  if (!alerts?.length) return "Немає даних або всі в зеленій зоні";
  return alerts
    .map(
      (a) =>
        `- ${a.lastName} ${a.firstName} (${a.teamName}, ${a.age}р.): фаза ${a.growthPhase}, offset ${a.consensusOffset > 0 ? "+" : ""}${a.consensusOffset}, зона ризику: ${a.riskZone}${a.heightVelocity ? `, Δ зріст ${a.heightVelocity} см/рік` : ""}`
    )
    .join("\n");
}
