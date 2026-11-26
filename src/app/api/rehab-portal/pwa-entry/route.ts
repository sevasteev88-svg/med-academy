import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  DEVICE_COOKIE_NAME,
  DEVICE_SESSION_MAX_AGE_SECONDS,
  createDeviceSessionCookieValue,
  extractPwaBootstrapPayloadForDbVerification,
  verifyPwaBootstrapToken,
} from "@/lib/player-device-auth";
import { validateDeviceSessionRecord } from "@/lib/player-device-server";
import { getPlayerSessionSecret } from "@/lib/server-secrets";

function attachDeviceSessionCookies(
  response: NextResponse,
  deviceId: string,
  sessionSecret: string,
  playerId: string
) {
  const deviceCookieVal = createDeviceSessionCookieValue(deviceId, sessionSecret, playerId);

  response.cookies.set(DEVICE_COOKIE_NAME, deviceCookieVal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
  });

  const standardPayload = {
    playerId,
    portalToken: "device_session",
    mustChangePin: false,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + DEVICE_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(standardPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getPlayerSessionSecret())
    .update(encodedPayload)
    .digest("base64url");

  response.cookies.set("rehab_player_session", `${encodedPayload}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_SESSION_MAX_AGE_SECONDS,
  });
}

export async function GET(request: NextRequest) {
  const k = request.nextUrl.searchParams.get("k")?.trim();
  const targetUrl = new URL("/rehab-portal", request.url);

  if (!k) {
    return NextResponse.redirect(targetUrl);
  }

  let parsed = verifyPwaBootstrapToken(k);
  if (!parsed) {
    parsed = extractPwaBootstrapPayloadForDbVerification(k);
  }

  if (parsed) {
    try {
      const validation = await validateDeviceSessionRecord(parsed.deviceId, parsed.sessionSecret);
      if (validation.valid && validation.playerId && validation.playerId === parsed.playerId) {
        const response = NextResponse.redirect(targetUrl);
        attachDeviceSessionCookies(
          response,
          parsed.deviceId,
          parsed.sessionSecret,
          validation.playerId
        );
        return response;
      }
    } catch {}
  }

  return NextResponse.redirect(targetUrl);
}
