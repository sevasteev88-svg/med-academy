import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasConsent } from "@/lib/consents";
import { callAI, createAnonymizer, AI_DISCLAIMER } from "@/lib/ai";

export async function POST(request: NextRequest) {
  // Авторизація
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mode, playerContext, squadContext, userQuery, conversationHistory } = body;

    const anonymizer = createAnonymizer();

    // 1. Перевірка згоди для одиночного профілю гравця (п. 1.5.3)
    if (playerContext?.id) {
      const allowed = await hasConsent(playerContext.id, "ai_processing");
      if (!allowed) {
        return NextResponse.json(
          { error: "Потрібна згода батьків (область: ШІ-аналіз даних)." },
          { status: 403 }
        );
      }
    }

    const systemInstruction = `Ти — провідний спортивний лікар та фахівець з фізпідготовки (Sports Scientist & Medical Director) юнацької футбольної академії.
Твоє завдання — надавати високопрофесійні, науково обґрунтовані та прикладні рекомендації для медичного штабу, головного тренера та тренерів з фізпідготовки.
Керуйся сучасними протоколами FIFA Medical, UEFA Medical Symposium, Aspetar Clinical Guidelines та даними моніторингу навантаження (Gabbett ACWR, Foster sRPE).
Відповідай виключно українською мовою. Стиль — чіткий, професійний, структурований, без зайвої "води". Використовуй емодзі для швидкого сприйняття статусів (🟢 🟡 🔴 ⚠️ 💡 📋).`;

    let prompt = "";

    if (mode === "player-assessment") {
      // Знеособлюємо гравця (п. 1.5.2)
      const pseudo = anonymizer.registerPlayer(playerContext.name || "Гравець");

      prompt = `Зроби комплексну 360° оцінку готовності гравця до тренувань та матчів на основі наступних об'єктивних даних:

ФУТБОЛІСТ:
- Код: ${pseudo}
- Вік: ${playerContext.age} років
- Позиція: ${playerContext.position}
- Категорія: Академія

ФАЗА РОСТУ ТА МАТУРАЦІЯ (PHV за Khamis-Roche / Mirwald):
${JSON.stringify(playerContext.maturation || "Дані відсутні")}

ОСТАННІ ДАНІ WEARABLES / БІОМЕТРІЇ (WHOOP / Apple Watch / Garmin):
${JSON.stringify(playerContext.wearables || "Дані відсутні")}

ФУНКЦІОНАЛЬНИЙ СКРИНІНГ ТА СТОМАТОЛОГІЯ:
${JSON.stringify(playerContext.screening || "Дані скринінгу відсутні")}
${JSON.stringify(playerContext.nutrition || "Дані нутриціології відсутні")}

АКТИВНІ ТА МИНУЛІ ТРАВМИ:
${JSON.stringify(playerContext.injuries || "Травм немає")}

Надай структурований аналіз:
1. 🚦 **Загальний вердикт готовності**: (🟢 Повна готовність / 🟡 Обмежене тренування / 🔴 Тільки індивідуальна реабілітація).
2. ⌚ **Аналіз відновлення та ВНС**: Оцінка HRV, пульсу спокою (RHR) та якості сну у контексті втоми.
3. ⚠️ **Зони підвищеного ризику**: Ризики рецидиву, вплив фази росту PHV, асиметрії або м'язового дисбалансу.
4. ⏱️ **Рекомендований обсяг навантаження**: Допустимі хвилини, інтенсивність (RPE 1-10), обмеження контактних єдиноборств або ударів.
5. 🛡️ **Індивідуальний протокол активації (Прехаб)**: 3-4 конкретні вправи перед виходом на поле.`;
    } else if (mode === "squad-briefing") {
      // Знеособлення складу для брифінгу
      const safeSquadContext = {
        totalPlayers: squadContext.totalPlayers,
        availableCount: squadContext.availableCount,
        restrictedCount: squadContext.restrictedCount,
        unavailableCount: squadContext.unavailableCount,
        restrictedPlayers: (squadContext.restrictedPlayers || []).map((p: any) => ({
          pseudonym: anonymizer.registerPlayer(p.name),
          position: p.position,
          limitMinutes: p.limitMinutes,
          notes: p.notes,
          injury: p.injury,
        })),
        unavailablePlayers: (squadContext.unavailablePlayers || []).map((p: any) => ({
          pseudonym: anonymizer.registerPlayer(p.name),
          position: p.position,
          diagnosis: p.diagnosis,
        })),
      };

      prompt = `Зроби оперативне тактико-медичне зведення для Головного тренера перед тренувальним днем / матчем на основі поточного стану команди:

ЗАГАЛЬНИЙ СТАН СКЛАДУ:
${JSON.stringify(safeSquadContext, null, 2)}

Сформулюй:
1. 📊 **Коротке резюме готовності обойми** (% доступності, хто вибув).
2. ⚠️ **Гравці з обмеженнями (Restricted)**: Чіткий ліміт хвилин для кожного та що конкретно їм заборонено (спринти, удари, контакт).
3. 🔄 **Рекомендації щодо ротації**: Хто потребує розвантаження для запобігання безконтактним травмам.
4. ⚡ **Порада тренеру з фізпідготовки**: Акценти на розминці для всієї команди з урахуванням погоди та поточної хвилі втоми.`;
    } else if (mode === "chat") {
      let safeContext = "";
      if (playerContext) {
        const pseudo = anonymizer.registerPlayer(playerContext.name || "Гравець");
        safeContext = JSON.stringify({
          ...playerContext,
          name: pseudo,
          club: undefined,
          team: undefined,
        });
      } else if (squadContext) {
        safeContext = anonymizer.anonymizeText(JSON.stringify(squadContext));
      }

      const safeQuery = anonymizer.anonymizeText(userQuery || "");
      const safeHistory = (conversationHistory || []).map((m: any) => ({
        role: m.role,
        text: anonymizer.anonymizeText(m.text || ""),
      }));

      prompt = `КОНТЕКСТ ГРАВЦЯ / КОМАНДИ:
${safeContext}

ІСТОРІЯ ПОПЕРЕДНЬОГО ДІАЛОГУ:
${safeHistory.map((m: any) => `${m.role === "user" ? "Питання штабу" : "Відповідь ШІ"}: ${m.text}`).join("\n")}

НОВЕ ПИТАННЯ ВІД ЛІКАРЯ АБО ТРЕНЕРА:
"${safeQuery}"

Дай чітку, практичну і тактично обґрунтовану спортивно-медичну відповідь.`;
    } else {
      prompt = anonymizer.anonymizeText(userQuery || "Зроби огляд стану гравця.");
    }

    // Виклик єдиного модуля callAI (Claude API)
    const aiResult = await callAI({
      prompt,
      system: systemInstruction,
      maxTokens: 4000,
      temperature: 0.3,
    });

    // Регідрація імен у відповіді
    const restoredText = anonymizer.restoreText(aiResult.text);

    await logAudit({
      action: "ai_call",
      entity: "ai",
      entityId: "sports-intelligence",
      playerId: playerContext?.id,
      meta: {
        mode,
        model: aiResult.model,
        endpoint: "/api/ai/sports-intelligence",
      },
      userId: user.id,
    });

    return NextResponse.json({
      answer: restoredText,
      model: aiResult.model,
      disclaimer: AI_DISCLAIMER,
    });
  } catch (err: any) {
    console.error("Sports intelligence error:", err);
    return NextResponse.json(
      { error: err.message || "Внутрішня помилка сервера" },
      { status: 500 }
    );
  }
}
