import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasConsent } from "@/lib/consents";
import { callAI, createAnonymizer, AI_DISCLAIMER } from "@/lib/ai";

/**
 * POST /api/ai/injury-patterns
 *
 * Приймає базу травм + дані матурації → знеособлює (п. 1.5.2) →
 * перевіряє згоду ai_processing для неповнолітніх (п. 1.5.3) →
 * Claude аналізує патерни та кореляції → регідрує імена для лікаря.
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

    // 1. Збір унікальних ID гравців та перевірка згоди (п. 1.5.3)
    const allPlayerIds = new Set<string>();
    (data.injuries || []).forEach((i: any) => i.playerId && allPlayerIds.add(i.playerId));
    (data.maturation || []).forEach((m: any) => m.playerId && allPlayerIds.add(m.playerId));
    (data.recurrences || []).forEach((r: any) => r.playerId && allPlayerIds.add(r.playerId));

    // Мапа дозволу для кожного гравця
    const consentMap = new Map<string, boolean>();
    await Promise.all(
      Array.from(allPlayerIds).map(async (pId) => {
        const allowed = await hasConsent(pId, "ai_processing");
        consentMap.set(pId, allowed);
      })
    );

    // Фільтруємо записи: виключаємо детальні персональні записи неповнолітніх без діючої згоди
    const allowedInjuries = (data.injuries || []).filter(
      (i: any) => !i.playerId || consentMap.get(i.playerId) !== false
    );
    const allowedMaturation = (data.maturation || []).filter(
      (m: any) => !m.playerId || consentMap.get(m.playerId) !== false
    );
    const allowedRecurrences = (data.recurrences || []).filter(
      (r: any) => !r.playerId || consentMap.get(r.playerId) !== false
    );

    // 2. Знеособлення (п. 1.5.2)
    const anonymizer = createAnonymizer();

    const formattedInjuries = allowedInjuries.map((i: any) => ({
      ...i,
      pseudo: anonymizer.registerPlayer(i.lastName, i.firstName),
    }));

    const formattedMaturation = allowedMaturation.map((m: any) => ({
      ...m,
      pseudo: anonymizer.registerPlayer(m.lastName, m.firstName),
    }));

    const formattedRecurrences = allowedRecurrences.map((r: any) => ({
      ...r,
      pseudo: anonymizer.registerPlayer(r.lastName, r.firstName),
    }));

    const prompt = buildPrompt({
      injuries: formattedInjuries,
      maturation: formattedMaturation,
      recurrences: formattedRecurrences,
      teamStats: data.teamStats,
    });

    const system =
      "Ти — провідний аналітик спортивної медицини юнацької футбольної академії. Твоє завдання — виявляти закономірності травматизму, кореляції з фазами росту PHV та формувати прикладні превентивні протоколи.";

    // 3. Єдиний виклик Claude API (п. 1.5.1)
    const aiResult = await callAI({
      prompt,
      system,
      maxTokens: 5000,
      temperature: 0.2,
    });

    // 4. Регідрація імен для клінічного використання лікарем
    const restoredText = anonymizer.restoreText(aiResult.text);

    await logAudit({
      action: "ai_call",
      entity: "ai",
      entityId: "injury-patterns",
      meta: {
        model: aiResult.model,
        endpoint: "/api/ai/injury-patterns",
      },
      userId: user.id,
    });

    return NextResponse.json({
      analysis: restoredText,
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
  return `Ти — AI-аналітик спортивної медицини юнацької футбольної академії (вікові категорії U13–U19).
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

Пиши українською, стисло, аналізуючи дані за кодами гравців та цифрами.
Якщо даних недостатньо для висновку — чесно вкажи це і поясни що потрібно збирати.`;
}

function formatInjuryHistory(injuries: any[] | undefined): string {
  if (!injuries?.length) return "Немає даних";
  return injuries
    .map(
      (i) =>
        `- ${i.pseudo} (${i.teamName}, ${i.position}, ${i.age}р.): ${i.injuryType} ${i.location} ${i.side}, ${i.severity}, ${i.mechanism}, ВАШ ${i.vasScore}/10, дата: ${i.dateOfInjury}, статус: ${i.status}, пропущено: ${i.daysMissed ?? "?"}дн.${i.growthPhase ? `, фаза: ${i.growthPhase}` : ""}`
    )
    .join("\n");
}

function formatMaturation(maturation: any[] | undefined): string {
  if (!maturation?.length) return "Немає даних";
  return maturation
    .map(
      (m) =>
        `- ${m.pseudo} (${m.teamName}, ${m.age}р.): фаза ${m.growthPhase}, offset ${m.consensusOffset > 0 ? "+" : ""}${m.consensusOffset}, ризик: ${m.riskZone}${m.heightVelocity ? `, Δ ${m.heightVelocity} см/р` : ""}`
    )
    .join("\n");
}

function formatRecurrences(recurrences: any[] | undefined): string {
  if (!recurrences?.length) return "Немає повторних травм";
  return recurrences
    .map(
      (r) =>
        `- ${r.pseudo} (${r.teamName}): ${r.injuryCount} травм — ${r.locations}`
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
