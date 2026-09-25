import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  // Авторизація
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return NextResponse.json(
      { error: "API ключ GEMINI_API_KEY не знайдено у конфігурації сервера" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { mode, playerContext, squadContext, userQuery, conversationHistory } = body;

    let systemInstruction = `Ти — провідний спортивний лікар та фахівець з фізпідготовки (Sports Scientist & Medical Director) академії ФК "Чорноморець" (Одеса).
Твоє завдання — надавати високопрофесійні, науково обґрунтовані та прикладні рекомендації для медичного штабу, головного тренера та тренерів з фізпідготовки.
Керуйся сучасними протоколами FIFA Medical, UEFA Medical Symposium, Aspetar Clinical Guidelines та даними моніторингу навантаження (Gabbett ACWR, Foster sRPE).
Відповідай виключно українською мовою. Стиль — чіткий, професійний, структурований, без зайвої "води". Використовуй емодзі для швидкого сприйняття статусів (🟢 🟡 🔴 ⚠️ 💡 📋).`;

    let prompt = "";

    if (mode === "player-assessment") {
      prompt = `Зроби комплексну 360° оцінку готовності гравця до тренувань та матчів на основі наступних об'єктивних даних:

ФУТБОЛІСТ:
- Ім'я: ${playerContext.name}
- Вік: ${playerContext.age} років
- Позиція: ${playerContext.position}
- Команда: ${playerContext.team}

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
      prompt = `Зроби оперативне тактико-медичне зведення для Головного тренера перед тренувальним днем / матчем на основі поточного стану команди:

ЗАГАЛЬНИЙ СТАН СКЛАДУ:
${JSON.stringify(squadContext)}

Сформулюй:
1. 📊 **Коротке резюме готовності обойми** (% доступності, хто вибув).
2. ⚠️ **Гравці з обмеженнями (Restricted)**: Чіткий ліміт хвилин для кожного та що конкретно їм заборонено (спринти, удари, контакт).
3. 🔄 **Рекомендації щодо ротації**: Хто потребує розвантаження для запобігання безконтактним травмам.
4. ⚡ **Порада тренеру з фізпідготовки**: Акценти на розминці для всієї команди з урахуванням погоди та поточної хвилі втоми.`;
    } else if (mode === "chat") {
      prompt = `КОНТЕКСТ ГРАВЦЯ / КОМАНДИ:
${JSON.stringify(playerContext || squadContext || {})}

ІСТОРІЯ ПОПЕРЕДНЬОГО ДІАЛОГУ:
${(conversationHistory || []).map((m: any) => `${m.role === "user" ? "Питання штабу" : "Відповідь ШІ"}: ${m.text}`).join("\n")}

НОВЕ ПИТАННЯ ВІД ЛІКАРЯ АБО ТРЕНЕРА:
"${userQuery}"

Дай чітку, практичну і тактично обґрунтовану спортивно-медичну відповідь.`;
    } else {
      prompt = userQuery || "Зроби огляд стану гравця.";
    }

    const fullPrompt = `${systemInstruction}\n\n${prompt}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json(
        { error: "Помилка відповіді від Gemini API", details: errText },
        { status: 502 }
      );
    }

    const result = await response.json();
    const answer =
      result.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Не вдалося згенерувати відповідь. Будь ласка, спробуйте ще раз.";

    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error("Sports Intelligence route error:", err);
    return NextResponse.json(
      { error: "Внутрішня помилка сервера", message: err.message },
      { status: 500 }
    );
  }
}
