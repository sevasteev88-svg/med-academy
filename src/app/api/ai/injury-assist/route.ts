import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasConsent } from "@/lib/consents";
import { callAI, createAnonymizer, AI_DISCLAIMER } from "@/lib/ai";

/**
 * POST /api/ai/injury-assist
 *
 * Приймає дані гравця + травми → знеособлює дані → Claude аналізує →
 * повертає прогноз відновлення та протокол з регідрацією імені для лікаря.
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
    const targetPlayerId = data?.playerId || data?.player?.id;

    // Перевірка згоди батьків для неповнолітніх (п. 1.5.3)
    if (targetPlayerId) {
      const allowed = await hasConsent(targetPlayerId, "ai_processing");
      if (!allowed) {
        return NextResponse.json(
          { error: "Потрібна згода батьків (область: ШІ-аналіз даних)." },
          { status: 403 }
        );
      }
    }

    // Знеособлення даних перед викликом зовнішньої моделі (п. 1.5.2)
    const anonymizer = createAnonymizer();
    const playerPseudo = anonymizer.registerPlayer(data.playerName || "Гравець");

    const anonymizedData = {
      ...data,
      playerPseudonym: playerPseudo,
      teamName: "Академія",
    };

    const prompt = buildPrompt(anonymizedData);
    const system =
      "Ти — провідний лікар спортивної медицини юнацької футбольної академії. Відповідай українською мовою згідно з протоколами FIFA/Aspetar. Це рекомендація AI — фінальне рішення за лікарем.";

    // Єдиний модуль callAI на базі Claude API (п. 1.5.1)
    const aiResult = await callAI({
      prompt,
      system,
      maxTokens: 3000,
      temperature: 0.3,
    });

    // Регідрація (відновлення) реального імені для інтерфейсу лікаря
    const restoredText = anonymizer.restoreText(aiResult.text);

    await logAudit({
      action: "ai_call",
      entity: "ai",
      entityId: "injury-assist",
      playerId: targetPlayerId,
      meta: {
        model: aiResult.model,
        endpoint: "/api/ai/injury-assist",
      },
      userId: user.id,
    });

    return NextResponse.json({
      recommendation: restoredText,
      disclaimer: AI_DISCLAIMER,
    });
  } catch (err: any) {
    console.error("Injury assist error:", err);
    return NextResponse.json(
      { error: err.message || "Помилка формування рекомендацій ШІ" },
      { status: 500 }
    );
  }
}

function buildPrompt(data: any): string {
  return `Ти — AI-асистент спортивного лікаря юнацької футбольної академії.
Лікар щойно зафіксував травму. Проаналізуй профіль гравця і дай рекомендації.

## Профіль гравця:
- Код гравця: ${data.playerPseudonym}
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
        `- ${i.injuryType} ${i.location} ${i.side}, ${i.severity}, дата: ${i.dateOfInjury}, пропущено ${i.daysMissed ?? "?"} дн., статус: ${i.status}`
    )
    .join("\n");
}
