import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import { decryptServerSecret } from "@/lib/server-crypto";
import { getClubTelegramConfig } from "@/lib/club-telegram";
import { DEFAULT_DOCTOR_PHONE, DEFAULT_DOCTOR_TG_URL } from "@/types/telegram";

export interface DoctorContactInfo {
  name: string | null;
  telegramUrl: string | null;
  phone: string | null;
}

export interface ClubMedicalTelegramConfig {
  botToken: string;
  botUsername: string;
  medicalChatId: string;
  doctorTelegramRaw: string;
  doctorTelegramUrl: string | null;
  doctorPhone: string | null;
  doctorName: string | null;
}

/**
 * Нормалізує контакт Telegram лікаря (@username, username, t.me/..., або номер телефону)
 * у валідний https://t.me/... URL або повертає null.
 */
export function normalizeDoctorTelegramUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fullTmeMatch = trimmed.match(/^https?:\/\/t\.me\/(.+)$/i);
  if (fullTmeMatch) {
    const rest = fullTmeMatch[1].trim();
    return rest ? `https://t.me/${rest}` : null;
  }

  const shortTmeMatch = trimmed.match(/^t\.me\/(.+)$/i);
  if (shortTmeMatch) {
    const rest = shortTmeMatch[1].trim();
    return rest ? `https://t.me/${rest}` : null;
  }

  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).trim();
    return /^[a-zA-Z0-9_]{3,}$/.test(username) ? `https://t.me/${username}` : null;
  }

  const strippedPhone = trimmed.replace(/[\s()-]/g, "");
  if (/^\+?\d{10,15}$/.test(strippedPhone)) {
    let normalizedPhone = strippedPhone;
    if (!normalizedPhone.startsWith("+")) {
      normalizedPhone = /^0\d{9}$/.test(normalizedPhone)
        ? `+38${normalizedPhone}`
        : `+${normalizedPhone}`;
    }
    return `https://t.me/${normalizedPhone}`;
  }

  if (/^[a-zA-Z0-9_]{3,}$/.test(trimmed)) {
    return `https://t.me/${trimmed}`;
  }

  return null;
}

/**
 * Екранує спецсимволи для Telegram HTML parse_mode.
 */
export function escapeTelegramHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Повертає конфігурацію медичного Telegram-чату та прямих контактів лікаря для конкретного клубу.
 * Суворо ізольовано по клубах: для не-дефолтних клубів ніколи не підставляє дані іншого клубу.
 */
export async function getClubMedicalTelegramConfig(
  clubId?: string | null
): Promise<ClubMedicalTelegramConfig> {
  const targetClubId = clubId || DEFAULT_CLUB_ID;
  const isNonDefaultClub = Boolean(clubId && clubId !== DEFAULT_CLUB_ID);

  const { botToken, botUsername } = await getClubTelegramConfig(targetClubId);

  let medicalChatId = "";
  let doctorTelegramRaw = "";
  let doctorPhoneRaw = "";
  let doctorName: string | null = null;

  try {
    const supabase = createAdminClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", targetClubId)
      .maybeSingle();

    const settings = ((club as any)?.settings || {}) as Record<string, any>;
    const tg = (settings.telegram || {}) as Record<string, any>;

    if (typeof tg.encrypted_medical_chat_id === "string" && tg.encrypted_medical_chat_id) {
      medicalChatId = decryptServerSecret(tg.encrypted_medical_chat_id) || "";
    }

    doctorTelegramRaw =
      typeof tg.doctor_telegram === "string" ? tg.doctor_telegram.trim() : "";
    doctorPhoneRaw =
      typeof tg.doctor_phone === "string" ? tg.doctor_phone.trim() : "";

    const rawDocName = settings.matchday_protocol?.default_doctor_name;
    doctorName =
      typeof rawDocName === "string" && rawDocName.trim().length > 0
        ? rawDocName.trim()
        : null;
  } catch (err) {
    console.error("[medical-telegram] Failed to load club medical Telegram config:", err);
  }

  const effectiveDoctorTelegram =
    doctorTelegramRaw || (!isNonDefaultClub ? DEFAULT_DOCTOR_TG_URL : "");
  const doctorPhone =
    doctorPhoneRaw || (!isNonDefaultClub ? DEFAULT_DOCTOR_PHONE : null);
  const doctorTelegramUrl = normalizeDoctorTelegramUrl(effectiveDoctorTelegram);

  return {
    botToken,
    botUsername,
    medicalChatId,
    doctorTelegramRaw,
    doctorTelegramUrl,
    doctorPhone,
    doctorName,
  };
}

/**
 * Надсилає алерт у закритий мед-чат клубу через власного Telegram-бота клубу.
 * Безпечний (fail-safe): ніколи не кидає виключень і не блокує запис у БД.
 */
export async function sendClubMedicalChatAlert(params: {
  clubId?: string | null;
  htmlText: string;
  playerId?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const config = await getClubMedicalTelegramConfig(params.clubId);
    if (!config.botToken || !config.medicalChatId) {
      return { sent: false, reason: "not_configured" };
    }

    const rawAppUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      ""
    )
      .trim()
      .replace(/\/+$/, "");

    let replyMarkup:
      | { inline_keyboard: Array<Array<{ text: string; url: string }>> }
      | undefined;

    if (params.playerId && /^https?:\/\/.+/i.test(rawAppUrl)) {
      try {
        const parsed = new URL(rawAppUrl);
        if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
          replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: "👤 Відкрити картку гравця",
                  url: `${rawAppUrl}/players/${encodeURIComponent(params.playerId)}`,
                },
              ],
            ],
          };
        }
      } catch {
        // Невалідний URL — надсилаємо повідомлення без кнопки
      }
    }

    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.medicalChatId,
          text: params.htmlText,
          parse_mode: "HTML",
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return {
        sent: false,
        reason: data?.description || `http_${res.status}`,
      };
    }

    return { sent: true };
  } catch (err: any) {
    console.warn("[medical-telegram] Alert delivery failed:", err?.message || err);
    return { sent: false, reason: "fetch_error" };
  }
}
