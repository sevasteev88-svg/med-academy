import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyAndActivateDeviceAction } from "@/actions/player-device-actions";
import {
  createDeviceSessionCookieValue,
  DEVICE_COOKIE_NAME,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  generateDeviceSessionSecret,
  hashTokenSha256,
  parseDeviceName,
} from "@/lib/player-device-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPlayerConsentSummary } from "@/lib/consents";

const BOT_USER_AGENTS = [
  "telegrambot",
  "twitterbot",
  "facebookexternalhit",
  "whatsapp",
  "viber",
  "skypeuripreview",
  "slackbot",
  "discordbot",
  "applebot",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "baiduspider",
  "bot",
  "crawler",
  "spider",
  "preview",
];

function isBotUserAgent(ua: string): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_USER_AGENTS.some((b) => lower.includes(b));
}

function getSigningSecret(): string {
  return (
    process.env.PLAYER_SESSION_SECRET ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "med-academy-portal-secure-salt"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const userAgent = request.headers.get("user-agent") || "";

  // 0. Захист від ботів передперегляду посилань (Telegram, Viber, WhatsApp тощо)
  // Боти месенджерів надсилають фоновий GET-запит для генерації прев'ю посилання.
  // Вони не повинні "спалювати" одноразовий токен до того, як реальний гравець натисне на лінк!
  if (isBotUserAgent(userAgent)) {
    const previewHtml = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Особистий кабінет гравця · MedAcademy</title>
  <meta property="og:title" content="Особистий кабінет футболіста" />
  <meta property="og:description" content="Персональний кабінет для щоденного моніторингу самопочуття та велнесу" />
  <meta name="description" content="Персональний кабінет для щоденного моніторингу самопочуття та велнесу" />
</head>
<body>
  <p>Особистий кабінет футболіста · MedAcademy</p>
</body>
</html>`;
    return new NextResponse(previewHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  // Якщо на цьому пристрої вже є діюча сесія кабінету гравця — одразу перенаправляємо
  const existingDeviceCookie = request.cookies.get(DEVICE_COOKIE_NAME)?.value;
  const existingPlayerSession = request.cookies.get("rehab_player_session")?.value;
  if (existingDeviceCookie || existingPlayerSession) {
    return NextResponse.redirect(new URL("/rehab-portal", request.url));
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  // Викликаємо серверну активацію пристрою з bypassCookie: true,
  // тому що ми явно виставляємо куки в заголовки HTTP-відповіді через response.cookies.set()
  const result = await verifyAndActivateDeviceAction(token, {
    ip,
    userAgent,
    bypassCookie: true,
  });

  // 1. Успіх: встановлюємо куки сесії пристрою та робимо 307 Redirect на кабінет гравця
  if (
    result.success &&
    result.deviceId &&
    result.deviceSessionSecret &&
    result.playerId
  ) {
    const redirectUrl = new URL("/rehab-portal?activated=1", request.url);
    const response = NextResponse.redirect(redirectUrl);

    // Основна довготривала кука пристрою (90 днів)
    const deviceCookieVal = createDeviceSessionCookieValue(
      result.deviceId,
      result.deviceSessionSecret,
      result.playerId
    );

    response.cookies.set(DEVICE_COOKIE_NAME, deviceCookieVal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
    });

    // Кука стандартної сесії для зворотної сумісності кабінету
    const standardPayload = {
      playerId: result.playerId,
      portalToken: "device_session",
      mustChangePin: false,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + DEVICE_SESSION_MAX_AGE_SECONDS,
    };
    const jsonStr = JSON.stringify(standardPayload);
    const encodedPayload = Buffer.from(jsonStr).toString("base64url");
    const signature = crypto
      .createHmac("sha256", getSigningSecret())
      .update(encodedPayload)
      .digest("base64url");

    response.cookies.set("rehab_player_session", `${encodedPayload}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
    });

    return response;
  }

  // 1.5. Повторний вхід гравця за тим самим персональним посиланням:
  // Якщо токен вже активовано раніше, але його 14-денний термін ще діє — не показуємо помилку і не вимагаємо PIN!
  // Ми просто оновлюємо сесію на цьому пристрої та впускаємо гравця в кабінет.
  if (!result.success && result.error?.includes("вже був використаний")) {
    try {
      const cleanToken = token.trim();
      const tokenHash = hashTokenSha256(cleanToken);
      const supabase = createAdminClient();

      const { data: tokenRecord } = await supabase
        .from("player_activation_tokens")
        .select("player_id, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (tokenRecord && new Date(tokenRecord.expires_at) > new Date()) {
        const consent = await getPlayerConsentSummary(tokenRecord.player_id);
        if (!consent.isMinor || consent.scopes["data_processing"]?.status === "granted") {
          const redirectUrl = new URL("/rehab-portal", request.url);
          const response = NextResponse.redirect(redirectUrl);

          const sessionSecret = generateDeviceSessionSecret();
          const deviceId = crypto.randomUUID();
          const devTokenHash = hashTokenSha256(sessionSecret);
          const expiresAtDev = new Date(Date.now() + DEVICE_SESSION_MAX_AGE_SECONDS * 1000).toISOString();

          await supabase.from("player_devices").insert({
            id: deviceId,
            player_id: tokenRecord.player_id,
            device_token_hash: devTokenHash,
            device_name: parseDeviceName(userAgent),
            last_seen_at: new Date().toISOString(),
            expires_at: expiresAtDev,
          });

          const deviceCookieVal = createDeviceSessionCookieValue(
            deviceId,
            sessionSecret,
            tokenRecord.player_id
          );

          response.cookies.set(DEVICE_COOKIE_NAME, deviceCookieVal, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
          });

          const standardPayload = {
            playerId: tokenRecord.player_id,
            portalToken: "device_session",
            mustChangePin: false,
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + DEVICE_SESSION_MAX_AGE_SECONDS,
          };
          const jsonStr = JSON.stringify(standardPayload);
          const encodedPayload = Buffer.from(jsonStr).toString("base64url");
          const signature = crypto
            .createHmac("sha256", getSigningSecret())
            .update(encodedPayload)
            .digest("base64url");

          response.cookies.set("rehab_player_session", `${encodedPayload}.${signature}`, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
          });

          return response;
        }
      }
    } catch {}
  }

  // 2. Помилка: повертаємо стилізовану зрозумілу сторінку з поясненням
  const isConsentError = result.requiresConsent;
  const isLockError = Boolean(result.lockedUntilMinutes);
  const title = isConsentError
    ? "Потрібна згода батьків"
    : isLockError
    ? "Спроби тимчасово заблоковано"
    : "Активація не вдалася";

  const errorText =
    result.error ||
    "Цей QR-код вже був використаний або його термін дії закінчився.";

  const adviceText = isConsentError
    ? "Для гравців віком до 18 років вхід у систему можливий лише після оформлення згоди законних представників (батьків). Зверніться до тренера або лікаря клубу."
    : isLockError
    ? `Зафіксовано 5 невдалих спроб активації поспіль. З міркувань безпеки доступ заблоковано на ${result.lockedUntilMinutes || 15} хвилин.`
    : "Персональний QR-код дійсний протягом 365 днів. Зверніться до тренера або лікаря в медичному кабінеті, якщо потрібне оновлення коду.";

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · Медичний кабінет</title>
  <style>
    body {
      margin: 0;
      background: #020617;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 24px;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 440px;
      margin: 0 auto;
      width: 100%;
    }
    .logo {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: #0f172a;
      border: 1px solid rgba(14, 165, 233, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .brand {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .card {
      max-width: 440px;
      margin: 40px auto;
      width: 100%;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid #1e293b;
      border-radius: 28px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      box-sizing: border-box;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 20px;
      background: #020617;
      border: 1px solid #334155;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin: 0 auto 20px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
    }
    p {
      margin: 0 0 20px;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .advice {
      background: rgba(2, 6, 23, 0.8);
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 16px;
      text-align: left;
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .advice strong {
      color: #38bdf8;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      background: #1e293b;
      color: #ffffff;
      text-decoration: none;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 600;
      box-sizing: border-box;
      border: 1px solid #334155;
    }
    .footer {
      font-size: 10px;
      color: #475569;
      text-align: center;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">⚽</div>
    <div class="brand">MedAcademy · Активація пристрою</div>
  </div>

  <div class="card">
    <div class="icon">${isConsentError ? "📋" : isLockError ? "⏳" : "⚠️"}</div>
    <h1>${title}</h1>
    <p>${errorText}</p>

    <div class="advice">
      <strong>💡 Що робити:</strong><br>
      ${adviceText}
    </div>

    <a href="/rehab-portal" class="btn">Перейти до кабінету за кодом</a>
  </div>

  <div class="footer">
    Штаб спортивної медицини · Безпечна активація пристроїв
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: isConsentError ? 403 : isLockError ? 429 : 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
