import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasConsent } from "@/lib/consents";
import { callAI, createAnonymizer, AI_DISCLAIMER } from "@/lib/ai";

/**
 * POST /api/ai/weekly-report
 *
 * Приймає агреговані тижневі дані медичного штабу →
 * перевіряє згоди неповнолітніх (п. 1.5.3) → знеособлює (п. 1.5.2) →
 * Claude аналізує → регідрує прізвища для лікаря → додає дисклеймер (п. 1.5.5).
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

    // 1. Збір ID гравців для перевірки згоди ai_processing (п. 1.5.3)
    const allPlayerIds = new Set<string>();
    const extractId = (item: any) => item?.players?.id || item?.playerId || item?.player_id;

    (data.activeInjuries || []).forEach((i: any) => {
      const id = extractId(i);
      if (id) allPlayerIds.add(id);
    });
    (data.rehabInjuries || []).forEach((i: any) => {
      const id = extractId(i);
      if (id) allPlayerIds.add(id);
    });
    (data.upcomingReturns || []).forEach((r: any) => {
      const id = extractId(r);
      if (id) allPlayerIds.add(id);
    });
    (data.maturationAlerts || []).forEach((m: any) => {
      const id = extractId(m);
      if (id) allPlayerIds.add(id);
    });

    const consentMap = new Map<string, boolean>();
    await Promise.all(
      Array.from(allPlayerIds).map(async (pId) => {
        const allowed = await hasConsent(pId, "ai_processing");
        consentMap.set(pId, allowed);
      })
    );

    const isAllowed = (item: any) => {
      const id = extractId(item);
      return !id || consentMap.get(id) !== false;
    };

    // Фільтруємо неповнолітніх без діючої згоди на ШІ
    const allowedActive = (data.activeInjuries || []).filter(isAllowed);
    const allowedRehab = (data.rehabInjuries || []).filter(isAllowed);
    const allowedReturns = (data.upcomingReturns || []).filter(isAllowed);
    const allowedMaturation = (data.maturationAlerts || []).filter(isAllowed);

    // 2. Знеособлення (п. 1.5.2)
    const anonymizer = createAnonymizer();

    const getLastName = (x: any) => x.players?.last_name || x.lastName || "";
    const getFirstName = (x: any) => x.players?.first_name || x.firstName || "";
    const getTeamName = (x: any) => x.players?.teams?.name || x.teamName || "Академія";

    const pseudoInjuries = (list: any[]) =>
      list.map((inj: any) => ({
        ...inj,
        pseudo: anonymizer.registerPlayer(getLastName(inj), getFirstName(inj)),
        teamClean: getTeamName(inj),
      }));

    const formattedActive = pseudoInjuries(allowedActive);
    const formattedRehab = pseudoInjuries(allowedRehab);
    const formattedReturns = pseudoInjuries(allowedReturns);
    const formattedMaturation = allowedMaturation.map((m: any) => ({
      ...m,
      pseudo: anonymizer.registerPlayer(getLastName(m), getFirstName(m)),
      teamClean: getTeamName(m),
    }));

    const prompt = buildPrompt({
      activeInjuries: formattedActive,
      rehabInjuries: formattedRehab,
      upcomingReturns: formattedReturns,
      maturationAlerts: formattedMaturation,
      totalPlayers: data.totalPlayers,
      availablePlayers: data.availablePlayers,
      unavailablePlayers: data.unavailablePlayers,
    });

    const system =
      "Ти — провідний лікар спортивної медицини юнацької футбольної академії. Склади тижневий звіт для тренерського штабу чітко, лаконічно, з акцентом на профілактику та допуски.";

    // 3. Єдиний виклик Claude API (п. 1.5.1)
    const aiResult = await callAI({
      prompt,
      system,
      maxTokens: 4000,
      temperature: 0.3,
    });

    // 4. Регідрація імен у тексті для лікаря
    const restoredText = anonymizer.restoreText(aiResult.text);

    await logAudit({
      action: "ai_call",
      entity: "ai",
      entityId: "weekly-report",
      meta: {
        model: aiResult.model,
        endpoint: "/api/ai/weekly-report",
      },
      userId: user.id,
    });

    return NextResponse.json({
      report: restoredText,
      disclaimer: AI_DISCLAIMER,
    });
  } catch (err: any) {
    console.error("Weekly report error:", err);
    return NextResponse.json(
      { error: err.message || "Внутрішня помилка сервера" },
      { status: 500 }
    );
  }
}

function buildPrompt(data: any): string {
  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Ти — AI-асистент медичного штабу юнацької футбольної академії.
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

Пиши стисло, конкретно, без води, використовуючи коди гравців.
Формат: Markdown з заголовками ##.
Мова: українська.`;
}

function formatInjuries(injuries: any[] | undefined): string {
  if (!injuries?.length) return "Немає";
  return injuries
    .map(
      (inj) =>
        `- ${inj.pseudo} (${inj.teamClean}, ${inj.position ?? ""}): ${inj.location}, ${inj.severity}, ВАШ ${inj.vas_score ?? inj.vasScore}/10, очікуване повернення: ${inj.expected_return_date ?? inj.expectedReturn ?? "не визначено"}`
    )
    .join("\n");
}

function formatReturns(returns: any[] | undefined): string {
  if (!returns?.length) return "Немає запланованих повернень";
  return returns
    .map(
      (r) =>
        `- ${r.pseudo} (${r.teamClean}): ${r.location}, очікуване повернення: ${r.expected_return_date ?? r.expectedReturn}`
    )
    .join("\n");
}

function formatMaturation(alerts: any[] | undefined): string {
  if (!alerts?.length) return "Немає даних або всі в зеленій зоні";
  return alerts
    .map(
      (a) =>
        `- ${a.pseudo} (${a.teamClean}): фаза ${a.growth_phase ?? a.growthPhase}, зона ризику: ${a.risk_zone ?? a.riskZone}`
    )
    .join("\n");
}
