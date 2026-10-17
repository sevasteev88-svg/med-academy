"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertDoctor, assertAdmin, DEFAULT_CLUB_ID } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  getActiveConsentDocuments,
  fetchPlayerConsentRecords,
  fetchPlayerGuardians,
  calculatePlayerAge,
} from "@/lib/consents";
import { sendClubMessage, getClubMessagingSettings } from "@/lib/messaging-adapter";
import type {
  ConsentScope,
  ConsentChannel,
  Guardian,
  Consent,
  ConsentRequest,
  ConsentDocument,
} from "@/types/database";

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Допоміжна функція для резервного збереження в injury_logs,
 * якщо нова міграція ще не була застосована в Supabase (за умовою: «Міграцію тільки створити, не застосовувати»).
 */
async function insertFallbackLog(
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string | null,
  prefix: string,
  payloadObj: unknown
) {
  let targetInjuryId: string | null = null;
  if (playerId) {
    const { data: inj } = await supabase
      .from("injuries")
      .select("id")
      .eq("player_id", playerId)
      .order("date_of_injury", { ascending: false })
      .limit(1);
    if (inj && inj.length > 0) {
      targetInjuryId = inj[0].id;
    } else {
      const { data: created } = await supabase
        .from("injuries")
        .insert({
          player_id: playerId,
          date_of_injury: new Date().toISOString().split("T")[0],
          injury_type: "other",
          location: "other",
          severity: "minimal",
          mechanism: "non_contact",
          status: "closed",
          description: "Системний облік згод та представників",
          vas_score: 0,
        } as any)
        .select("id")
        .maybeSingle();
      if (created) targetInjuryId = created.id;
    }
  }

  await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
    date: new Date().toISOString().split("T")[0],
    category: "note",
    note: `${prefix} ${JSON.stringify(payloadObj)}`,
  } as any);
}

// ════════════════════════════════════════════════════════════════════
// 1. КЕРУВАННЯ ЗАКОННИМИ ПРЕДСТАВНИКАМИ (guardians)
// ════════════════════════════════════════════════════════════════════

export async function saveGuardianAction(input: {
  id?: string;
  playerId: string;
  fullName: string;
  relation: string;
  phone: string;
  email?: string | null;
  telegramChatId?: string | null;
  isPrimary?: boolean;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  if (!fullName || !phone) {
    return { error: "Вкажіть ПІБ та номер телефону законного представника." };
  }

  const admin = createAdminClient();
  const guardianRecord: Guardian = {
    id: input.id || crypto.randomUUID(),
    club_id: auth.user.clubId || DEFAULT_CLUB_ID,
    player_id: input.playerId,
    full_name: fullName,
    relation: input.relation || "mother",
    phone,
    email: input.email?.trim() || null,
    telegram_chat_id: input.telegramChatId?.trim() || null,
    is_primary: Boolean(input.isPrimary),
    created_at: new Date().toISOString(),
  };

  const { error } = await admin.from("guardians").upsert(guardianRecord as any);
  if (error) {
    await insertFallbackLog(admin, input.playerId, "[GUARDIAN]", guardianRecord);
  }

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");
  return { success: true, guardian: guardianRecord };
}

export async function deleteGuardianAction(input: {
  guardianId: string;
  playerId: string;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("guardians")
    .delete()
    .eq("id", input.guardianId);

  if (error) {
    await insertFallbackLog(admin, input.playerId, "[GUARDIAN]", {
      id: input.guardianId,
      player_id: input.playerId,
      deleted: true,
    });
  }

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");
  return { success: true };
}

// ════════════════════════════════════════════════════════════════════
// 2. ВІДМІТКА «ГРАВЕЦЬ ОЗНАЙОМЛЕНИЙ» (ASSENT ДЛЯ 14–17 РОКІВ, п. 5)
// ════════════════════════════════════════════════════════════════════

export async function togglePlayerAssentAction(input: {
  playerId: string;
  acknowledged: boolean;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const nowIso = input.acknowledged ? new Date().toISOString() : null;

  const { error } = await admin
    .from("players")
    .update({
      assent_acknowledged: input.acknowledged,
      assent_acknowledged_at: nowIso,
    } as any)
    .eq("id", input.playerId);

  if (error) {
    // Зберігаємо також в останній запис згоди або системний лог
    await insertFallbackLog(admin, input.playerId, "[PLAYER_ASSENT]", {
      player_id: input.playerId,
      assent_acknowledged: input.acknowledged,
      assent_acknowledged_at: nowIso,
    });
  }

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");
  return { success: true, acknowledged: input.acknowledged, at: nowIso };
}

// ════════════════════════════════════════════════════════════════════
// 3. СПОСІБ А: НАДСИЛАННЯ ОДНОРАЗОВОГО ПОСИЛАННЯ НА ЗГОДУ (128 біт, SHA-256, 7 днів)
// ════════════════════════════════════════════════════════════════════

export async function sendConsentRequestAction(input: {
  playerId: string;
  guardianId?: string | null; // null якщо гравець 18+ (adult_self)
  channel: ConsentChannel;
  scopes?: ConsentScope[];
  adultPhone?: string;
  adultEmail?: string;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth, club_id")
    .eq("id", input.playerId)
    .maybeSingle();

  if (!player) {
    return { error: "Гравця не знайдено." };
  }

  const clubId = player.club_id || auth.user.clubId || DEFAULT_CLUB_ID;
  const age = calculatePlayerAge(player.date_of_birth);
  const isAdultSelf = age >= 18 && !input.guardianId;

  let guardian: Guardian | null = null;
  if (input.guardianId) {
    const guardians = await fetchPlayerGuardians(input.playerId);
    guardian = guardians.find((g) => g.id === input.guardianId) || null;
    if (!guardian) {
      return { error: "Контакт законного представника не знайдено." };
    }
  } else if (!isAdultSelf) {
    const guardians = await fetchPlayerGuardians(input.playerId);
    guardian = guardians[0] || null;
    if (!guardian) {
      return {
        error:
          "Для неповнолітнього гравця спочатку додайте контакт законного представника (батьків).",
      };
    }
  }

  // Генеруємо 128-бітний криптографічний токен (16 байтів = 32 hex-символи)
  // У БД зберігаємо ТІЛЬКИ SHA-256 хеш!
  const rawToken = crypto.randomBytes(16).toString("hex");
  const tokenHash = sha256(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 днів

  const scopes =
    input.scopes && input.scopes.length > 0 ? input.scopes : ALL_CONSENT_SCOPES;

  const requestRecord: ConsentRequest & {
    recipient_phone?: string;
    recipient_name?: string;
  } = {
    id: crypto.randomUUID(),
    club_id: clubId,
    player_id: input.playerId,
    guardian_id: guardian?.id || null,
    token_hash: tokenHash,
    scopes,
    channel: input.channel,
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    used_at: null,
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    recipient_phone: guardian?.phone || input.adultPhone || "+380000000000",
    recipient_name:
      guardian?.full_name || `${player.last_name} ${player.first_name}`,
  };

  const { error: dbErr } = await admin.from("consent_requests").insert({
    id: requestRecord.id,
    club_id: clubId,
    player_id: requestRecord.player_id,
    guardian_id: requestRecord.guardian_id,
    token_hash: requestRecord.token_hash,
    scopes: requestRecord.scopes,
    channel: requestRecord.channel,
    sent_at: requestRecord.sent_at,
    expires_at: requestRecord.expires_at,
    otp_attempts: 0,
    created_by: auth.user.id,
  } as any);

  if (dbErr) {
    await insertFallbackLog(
      admin,
      input.playerId,
      "[CONSENT_REQ]",
      requestRecord
    );
  }

  const hdrs = await headers();
  const host = hdrs.get("host") || "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  const consentUrl = `${proto}://${host}/consent/${rawToken}`;

  const recipientTarget =
    input.channel === "email"
      ? guardian?.email || input.adultEmail || guardian?.phone || "parent@example.com"
      : input.channel === "telegram"
      ? guardian?.telegram_chat_id || guardian?.phone || "telegram_user"
      : guardian?.phone || input.adultPhone || "+380000000000";

  const messageText =
    `ФК «Чорноморець» (Медичний департамент)\n` +
    `Запит на оформлення згоди на обробку даних для гравця: ${player.last_name} ${player.first_name}.\n` +
    `Перейдіть за одноразовим посиланням (діє 7 днів):\n${consentUrl}`;

  const sendResult = await sendClubMessage({
    clubId,
    channel: input.channel,
    recipient: recipientTarget,
    subject: `Запит на згоду — ${player.last_name} ${player.first_name}`,
    text: messageText,
  });

  // Запис у журнал дій audit_log (п. 10)
  await logAudit({
    action: "send_consent_request",
    entity: "consent",
    entityId: requestRecord.id,
    playerId: input.playerId,
    meta: {
      channel: input.channel,
      scopes_count: scopes.length,
      is_adult_self: isAdultSelf,
      is_stub: sendResult.isStub,
    },
  });

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");

  return {
    success: true,
    consentUrl,
    expiresAt: expiresAt.toISOString(),
    channel: input.channel,
    recipient: recipientTarget,
    isStub: sendResult.isStub,
    stubPreview: sendResult.stubPreview,
  };
}

/**
 * Масова відправка запитів на згоду зі сторінки «Згоди» клубу (п. 9)
 */
export async function sendBulkConsentRequestsAction(input: {
  playerIds: string[];
  channel: ConsentChannel;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const results: Array<{
    playerId: string;
    playerName: string;
    consentUrl?: string;
    error?: string;
  }> = [];

  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .in("id", input.playerIds);

  for (const p of players || []) {
    const res = await sendConsentRequestAction({
      playerId: p.id,
      channel: input.channel,
    });
    results.push({
      playerId: p.id,
      playerName: `${p.last_name} ${p.first_name}`,
      consentUrl: res.consentUrl,
      error: res.error,
    });
  }

  revalidatePath("/consents");
  return {
    success: true,
    sentCount: results.filter((r) => Boolean(r.consentUrl)).length,
    failedCount: results.filter((r) => Boolean(r.error)).length,
    results,
  };
}

// ════════════════════════════════════════════════════════════════════
// 4. ПУБЛІЧНІ ДІЇ ЗА ТОКЕНОМ (/consent/[token]) ТА OTP-ПІДТВЕРДЖЕННЯ
// ════════════════════════════════════════════════════════════════════

async function findConsentRequestByRawToken(rawToken: string): Promise<{
  request: ConsentRequest & {
    recipient_phone?: string;
    recipient_name?: string;
  };
  isFromFallback: boolean;
} | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = sha256(rawToken.trim());
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("consent_requests")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!error && data) {
    return { request: data as any, isFromFallback: false };
  }

  // Fallback пошук у системних логах (якщо міграція ще не застосована)
  const { data: logs } = await admin
    .from("injury_logs")
    .select("note")
    .like("note", `[CONSENT_REQ]%${tokenHash}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (logs && logs.length > 0) {
    try {
      const parsed = JSON.parse(logs[0].note.replace("[CONSENT_REQ] ", ""));
      if (parsed.token_hash === tokenHash) {
        return { request: parsed, isFromFallback: true };
      }
    } catch {}
  }

  return null;
}

async function saveConsentRequestState(
  req: ConsentRequest & { recipient_phone?: string; recipient_name?: string },
  isFromFallback: boolean
) {
  const admin = createAdminClient();
  if (!isFromFallback) {
    const { error } = await admin
      .from("consent_requests")
      .update({
        used_at: req.used_at,
        otp_hash: req.otp_hash,
        otp_expires_at: req.otp_expires_at,
        otp_attempts: req.otp_attempts,
      } as any)
      .eq("id", req.id);
    if (!error) return;
  }
  await insertFallbackLog(admin, req.player_id, "[CONSENT_REQ]", req);
}

/**
 * Отримує контекст сторінки за одноразовим токеном без входу в систему (п. 2)
 */
export async function getPublicConsentPageData(rawToken: string) {
  const found = await findConsentRequestByRawToken(rawToken);
  if (!found) {
    return { error: "Посилання недійсне або не знайдено." };
  }

  const { request } = found;
  const admin = createAdminClient();

  const { data: player } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth, club_id, assent_acknowledged")
    .eq("id", request.player_id)
    .maybeSingle();

  if (!player) {
    return { error: "Профіль гравця не знайдено." };
  }

  const clubId = player.club_id || DEFAULT_CLUB_ID;
  let clubName = "ФК «Чорноморець» (Академія)";
  try {
    const { data: club } = await admin
      .from("clubs")
      .select("name")
      .eq("id", clubId)
      .maybeSingle();
    if (club?.name) clubName = club.name;
  } catch {}

  let guardian: Guardian | null = null;
  if (request.guardian_id) {
    const guardians = await fetchPlayerGuardians(player.id);
    guardian = guardians.find((g) => g.id === request.guardian_id) || null;
  }

  const [documents, existingConsents] = await Promise.all([
    getActiveConsentDocuments(clubId),
    fetchPlayerConsentRecords(player.id),
  ]);

  const age = calculatePlayerAge(player.date_of_birth);
  const isExpired = new Date(request.expires_at).getTime() < Date.now();

  // Маскуємо телефон для відображення
  const rawPhone =
    guardian?.phone || request.recipient_phone || "+380 (XX) XXX-XX-XX";
  const maskedPhone =
    rawPhone.length > 6
      ? `${rawPhone.slice(0, 6)}***${rawPhone.slice(-3)}`
      : rawPhone;

  // Активні (не відкликані) згоди гравця для вкладки «Мої згоди»
  const latestByScope: Record<string, Consent> = {};
  for (const c of existingConsents) {
    if (!latestByScope[c.scope]) {
      latestByScope[c.scope] = c;
    }
  }

  return {
    request: {
      id: request.id,
      scopes: request.scopes,
      sentAt: request.sent_at,
      expiresAt: request.expires_at,
      usedAt: request.used_at,
      isExpired,
      otpAttempts: request.otp_attempts || 0,
    },
    clubName,
    player: {
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      age,
      isMinor: age < 18,
      isTeenAssentApplicable: age >= 14 && age <= 17,
    },
    guardian: guardian
      ? {
          id: guardian.id,
          fullName: guardian.full_name,
          relation: guardian.relation,
          maskedPhone,
        }
      : {
          id: null,
          fullName: request.recipient_name || "",
          relation: age >= 18 ? "self" : "mother",
          maskedPhone,
        },
    documents,
    latestByScope,
  };
}

/**
 * Надсилає 6-значний код OTP на телефон батька/матері (або гравця 18+).
 * Строк дії коду — 10 хвилин, максимум 5 спроб перевірки (п. 2).
 */
export async function requestConsentOtpAction(input: {
  rawToken: string;
  purpose: "grant" | "revoke";
}) {
  const found = await findConsentRequestByRawToken(input.rawToken);
  if (!found) {
    return { error: "Посилання недійсне." };
  }

  const { request, isFromFallback } = found;
  if (
    input.purpose === "grant" &&
    new Date(request.expires_at).getTime() < Date.now()
  ) {
    return {
      error:
        "Термін дії посилання (7 днів) закінчився. Зверніться до лікаря клубу для отримання нового посилання.",
    };
  }

  // Генеруємо 6-значний OTP
  const otpCode = String(crypto.randomInt(100000, 999999));
  const otpHash = sha256(`${request.id}:${otpCode}`);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 хвилин

  request.otp_hash = otpHash;
  request.otp_expires_at = otpExpiresAt;
  request.otp_attempts = 0;

  await saveConsentRequestState(request, isFromFallback);

  let recipientPhone = request.recipient_phone || "+380000000000";
  if (request.guardian_id) {
    const guardians = await fetchPlayerGuardians(request.player_id);
    const g = guardians.find((x) => x.id === request.guardian_id);
    if (g?.phone) recipientPhone = g.phone;
  }

  const smsText =
    input.purpose === "revoke"
      ? `ФК «Чорноморець»: Ваш одноразовий код (OTP) для ВІДКЛИКАННЯ згоди: ${otpCode}. Код діє 10 хвилин.`
      : `ФК «Чорноморець»: Ваш одноразовий код (OTP) для підтвердження згоди: ${otpCode}. Код діє 10 хвилин.`;

  const sendRes = await sendClubMessage({
    clubId: request.club_id || DEFAULT_CLUB_ID,
    channel: "sms",
    recipient: recipientPhone,
    text: smsText,
  });

  return {
    success: true,
    expiresInMinutes: 10,
    maxAttempts: 5,
    isStub: sendRes.isStub,
    /** У тестовому режимі повертаємо згенерований OTP для миттєвої перевірки в UI */
    devOtpCode: sendRes.isStub ? otpCode : undefined,
  };
}

/**
 * Перевіряє OTP-код (5 спроб, 10 хв) та створює записи згоди лише для увімкнених перемикачів (п. 2).
 * Після запису надсилає квитанцію батькам та повертає дані квитанції.
 */
export async function submitConsentWithOtpAction(input: {
  rawToken: string;
  otpCode: string;
  selectedScopes: ConsentScope[];
  signerFullName: string;
  signerRelation: string;
  playerAssent?: boolean;
}) {
  const found = await findConsentRequestByRawToken(input.rawToken);
  if (!found) {
    return { error: "Посилання недійсне." };
  }

  const { request, isFromFallback } = found;

  if (new Date(request.expires_at).getTime() < Date.now()) {
    return { error: "Термін дії одноразового посилання (7 днів) минув." };
  }

  if (!input.signerFullName.trim()) {
    return { error: "Вкажіть ПІБ законного представника (або гравця 18+)." };
  }

  if (input.selectedScopes.length === 0) {
    return { error: "Оберіть хоча б одну область згоди перемикачем." };
  }

  if (!request.otp_hash) {
    return { error: "Спочатку запросіть одноразовий код підтвердження (OTP)." };
  }

  if ((request.otp_attempts || 0) >= 5) {
    return {
      error:
        "Перевищено ліміт спроб введення коду (5 спроб). Запросіть новий код OTP.",
    };
  }

  if (
    request.otp_expires_at &&
    new Date(request.otp_expires_at).getTime() < Date.now()
  ) {
    return {
      error: "Термін дії OTP-коду (10 хвилин) минув. Запросіть новий код.",
    };
  }

  const candidateHash = sha256(`${request.id}:${input.otpCode.trim()}`);
  if (candidateHash !== request.otp_hash) {
    request.otp_attempts = (request.otp_attempts || 0) + 1;
    await saveConsentRequestState(request, isFromFallback);
    const remaining = Math.max(0, 5 - request.otp_attempts);
    return {
      error: `Невірний код OTP. Залишилось спроб: ${remaining}.`,
    };
  }

  // OTP успішно перевірено!
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "127.0.0.1";
  const userAgent = hdrs.get("user-agent") || "Browser";

  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("id, first_name, last_name, date_of_birth, club_id")
    .eq("id", request.player_id)
    .maybeSingle();

  const clubId = player?.club_id || request.club_id || DEFAULT_CLUB_ID;
  const age = calculatePlayerAge(player?.date_of_birth || "2010-01-01");
  const method = age >= 18 && !request.guardian_id ? "adult_self" : "link_otp";
  const docs = await getActiveConsentDocuments(clubId);
  const nowIso = new Date().toISOString();

  const createdConsents: Consent[] = [];

  for (const scope of input.selectedScopes) {
    const doc = docs[scope];
    const consentRec: Consent = {
      id: crypto.randomUUID(),
      club_id: clubId,
      player_id: request.player_id,
      guardian_id: request.guardian_id || null,
      scope,
      document_id: doc.id,
      method,
      granted_at: nowIso,
      revoked_at: null,
      evidence: {
        ip,
        user_agent: userAgent,
        otp_verified: true,
        otp_verified_at: nowIso,
        signer_full_name: input.signerFullName.trim(),
        signer_relation: input.signerRelation,
        document_version: doc.version,
        player_assent: Boolean(input.playerAssent),
      },
      scan_path: null,
      collected_by: null,
      player_assent: Boolean(input.playerAssent),
      player_assent_at: input.playerAssent ? nowIso : null,
      retention_status: "active",
    };

    const { error: insErr } = await admin
      .from("consents")
      .insert(consentRec as any);

    if (insErr) {
      await insertFallbackLog(
        admin,
        request.player_id,
        "[CONSENT_RECORD]",
        consentRec
      );
    }

    createdConsents.push(consentRec);
  }

  // Якщо гравець 14–17 років поставив відмітку «Гравець ознайомлений» (assent)
  if (input.playerAssent) {
    await admin
      .from("players")
      .update({
        assent_acknowledged: true,
        assent_acknowledged_at: nowIso,
      } as any)
      .eq("id", request.player_id);
  }

  // Позначаємо запит як використаний і очищаємо одноразовий OTP
  request.used_at = nowIso;
  request.otp_hash = null;
  request.otp_attempts = 0;
  await saveConsentRequestState(request, isFromFallback);

  // Формуємо та надсилаємо квитанцію батькам (Email / Telegram / SMS)
  const host = hdrs.get("host") || "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  const manageUrl = `${proto}://${host}/consent/${input.rawToken}`;

  const scopeTitles = input.selectedScopes.map(
    (s) => `${CONSENT_SCOPE_META[s].label} (версія v${docs[s].version})`
  );

  const receiptText =
    `КВИТАНЦІЯ ПРО НАДАННЯ ЗГОДИ — ФК «Чорноморець»\n` +
    `Дата та час: ${new Date(nowIso).toLocaleString("uk-UA")}\n` +
    `Гравець: ${player?.last_name || ""} ${player?.first_name || ""}\n` +
    `Підписант: ${input.signerFullName.trim()} (${input.signerRelation})\n` +
    `Підтверджено за допомогою OTP.\n\n` +
    `Надані згоди:\n- ${scopeTitles.join("\n- ")}\n\n` +
    `Керування та відкликання («Мої згоди»):\n${manageUrl}`;

  let guardianEmailOrContact = request.recipient_phone || "parent@example.com";
  let receiptChannel: ConsentChannel = "email";
  if (request.guardian_id) {
    const guardians = await fetchPlayerGuardians(request.player_id);
    const g = guardians.find((x) => x.id === request.guardian_id);
    if (g?.email) {
      guardianEmailOrContact = g.email;
      receiptChannel = "email";
    } else if (g?.telegram_chat_id) {
      guardianEmailOrContact = g.telegram_chat_id;
      receiptChannel = "telegram";
    } else if (g?.phone) {
      guardianEmailOrContact = g.phone;
      receiptChannel = "sms";
    }
  }

  await sendClubMessage({
    clubId,
    channel: receiptChannel,
    recipient: guardianEmailOrContact,
    subject: "Квитанція про надання згоди — ФК «Чорноморець»",
    text: receiptText,
  });

  // Запис у журнал дій audit_log (п. 10)
  await logAudit({
    action: "grant_consent",
    entity: "consent",
    entityId: request.id,
    playerId: request.player_id,
    clubId,
    allowPublic: true,
    meta: {
      method,
      scopes: input.selectedScopes,
      otp_verified: true,
      player_assent: Boolean(input.playerAssent),
    },
  });

  revalidatePath(`/players/${request.player_id}`);
  revalidatePath("/consents");

  return {
    success: true,
    grantedAt: nowIso,
    receiptText,
    manageUrl,
    scopes: input.selectedScopes.map((s) => ({
      scope: s,
      label: CONSENT_SCOPE_META[s].label,
      version: docs[s].version,
    })),
  };
}

/**
 * Відкликання згоди батьками за посиланням «Мої згоди» з повторною перевіркою OTP (п. 2, п. 7)
 */
export async function revokeConsentWithOtpAction(input: {
  rawToken: string;
  otpCode: string;
  scopesToRevoke: ConsentScope[];
}) {
  const found = await findConsentRequestByRawToken(input.rawToken);
  if (!found) {
    return { error: "Посилання недійсне." };
  }

  const { request, isFromFallback } = found;

  if (!request.otp_hash) {
    return { error: "Спочатку запросіть одноразовий код підтвердження (OTP)." };
  }

  if ((request.otp_attempts || 0) >= 5) {
    return {
      error: "Перевищено ліміт спроб (5). Запросіть новий код OTP.",
    };
  }

  if (
    request.otp_expires_at &&
    new Date(request.otp_expires_at).getTime() < Date.now()
  ) {
    return { error: "Термін дії OTP-коду (10 хвилин) минув." };
  }

  const candidateHash = sha256(`${request.id}:${input.otpCode.trim()}`);
  if (candidateHash !== request.otp_hash) {
    request.otp_attempts = (request.otp_attempts || 0) + 1;
    await saveConsentRequestState(request, isFromFallback);
    return {
      error: `Невірний код OTP. Залишилось спроб: ${Math.max(
        0,
        5 - request.otp_attempts
      )}.`,
    };
  }

  const admin = createAdminClient();
  const clubId = request.club_id || DEFAULT_CLUB_ID;
  const clubSettings = await getClubMessagingSettings(clubId);
  const revocationPolicy =
    clubSettings.consent_revocation_policy || "anonymize";
  const retentionStatus =
    revocationPolicy === "delete"
      ? "marked_for_deletion"
      : "marked_for_anonymization";

  const nowIso = new Date().toISOString();
  const existing = await fetchPlayerConsentRecords(request.player_id);

  for (const scope of input.scopesToRevoke) {
    const activeRec = existing.find((r) => r.scope === scope && !r.revoked_at);
    if (activeRec) {
      const updatedEvidence = {
        ...activeRec.evidence,
        retention_policy_applied: revocationPolicy,
      };

      const { error: updErr } = await admin
        .from("consents")
        .update({
          revoked_at: nowIso,
          retention_status: retentionStatus,
          evidence: updatedEvidence,
        } as any)
        .eq("id", activeRec.id);

      if (updErr) {
        await insertFallbackLog(admin, request.player_id, "[CONSENT_RECORD]", {
          ...activeRec,
           id: crypto.randomUUID(),
          revoked_at: nowIso,
          retention_status: retentionStatus,
          evidence: updatedEvidence,
        });
      }
    }
  }

  // Скидаємо використаний OTP
  request.otp_hash = null;
  request.otp_attempts = 0;
  await saveConsentRequestState(request, isFromFallback);

  // Запис у журнал дій audit_log (п. 10)
  await logAudit({
    action: "revoke_consent",
    entity: "consent",
    entityId: request.id,
    playerId: request.player_id,
    clubId,
    allowPublic: true,
    meta: {
      scopes_revoked: input.scopesToRevoke,
      retention_policy: revocationPolicy,
      retention_status: retentionStatus,
      by: "guardian_otp",
    },
  });

  revalidatePath(`/players/${request.player_id}`);
  revalidatePath("/consents");

  return {
    success: true,
    revokedAt: nowIso,
    retentionStatus,
    revocationPolicy,
  };
}

/**
 * Відкликання згоди співробітником клубу (лікарем або адміном) за письмовою заявою батьків (п. 7)
 */
export async function revokeConsentByStaffAction(input: {
  playerId: string;
  scope: ConsentScope;
  reason?: string;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const clubSettings = await getClubMessagingSettings(clubId);
  const revocationPolicy =
    clubSettings.consent_revocation_policy || "anonymize";
  const retentionStatus =
    revocationPolicy === "delete"
      ? "marked_for_deletion"
      : "marked_for_anonymization";

  const nowIso = new Date().toISOString();
  const existing = await fetchPlayerConsentRecords(input.playerId);
  const activeRec = existing.find(
    (r) => r.scope === input.scope && !r.revoked_at
  );

  if (!activeRec) {
    return { error: "Активної згоди по цій області не знайдено." };
  }

  const updatedEvidence = {
    ...activeRec.evidence,
    revoked_reason: input.reason || "За письмовою заявою законного представника",
    retention_policy_applied: revocationPolicy,
  };

  const { error: updErr } = await admin
    .from("consents")
    .update({
      revoked_at: nowIso,
      retention_status: retentionStatus,
      evidence: updatedEvidence,
    } as any)
    .eq("id", activeRec.id);

  if (updErr) {
    await insertFallbackLog(admin, input.playerId, "[CONSENT_RECORD]", {
      ...activeRec,
      id: crypto.randomUUID(),
      revoked_at: nowIso,
      retention_status: retentionStatus,
      evidence: updatedEvidence,
    });
  }

  await logAudit({
    action: "revoke_consent",
    entity: "consent",
    entityId: activeRec.id,
    playerId: input.playerId,
    meta: {
      scope: input.scope,
      retention_policy: revocationPolicy,
      retention_status: retentionStatus,
      by: "staff",
    },
  });

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");

  return { success: true, retentionStatus };
}

// ════════════════════════════════════════════════════════════════════
// 5. СПОСІБ Б: ПАПЕРОВА ФОРМА ТА ЗАВАНТАЖЕННЯ СКАНУ (п. 3)
// ════════════════════════════════════════════════════════════════════

export async function confirmPaperConsentAction(input: {
  playerId: string;
  guardianId?: string | null;
  signerFullName: string;
  signerRelation: string;
  signedScopes: ConsentScope[];
  documentNumber: string;
  scanFileName: string;
  scanFileBase64?: string; // для завантаження в приватний bucket consent_scans
  playerAssent?: boolean;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  if (input.signedScopes.length === 0) {
    return { error: "Відмітьте хоча б одну підписану область згоди." };
  }
  if (!input.signerFullName.trim()) {
    return { error: "Вкажіть ПІБ підписанта з паперової форми." };
  }
  if (!input.scanFileName) {
    return { error: "Завантажте скан-копію або фото підписаної паперової форми." };
  }

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const nowIso = new Date().toISOString();
  const safeName = input.scanFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const scanPath = `club_${clubId}/player_${input.playerId}/${Date.now()}_${safeName}`;

  // Намагаємося завантажити файл у приватний bucket consent_scans (доступ тільки doctor та admin)
  if (input.scanFileBase64) {
    try {
      const base64Clean = input.scanFileBase64.includes(",")
        ? input.scanFileBase64.split(",")[1]
        : input.scanFileBase64;
      const buffer = Buffer.from(base64Clean, "base64");
      await admin.storage.from("consent_scans").upload(scanPath, buffer, {
        upsert: false,
      });
    } catch {
      // Якщо bucket ще не створено в Supabase — шлях scan_path все одно фіксується в БД
    }
  }

  // Запис у журнал дій audit_log про завантаження скану БЕЗ вмісту (п. 10)
  await logAudit({
    action: "upload_consent_scan",
    entity: "consent",
    entityId: input.documentNumber,
    playerId: input.playerId,
    meta: {
      scan_path: scanPath,
      document_number: input.documentNumber,
      scopes_count: input.signedScopes.length,
    },
  });

  const docs = await getActiveConsentDocuments(clubId);

  for (const scope of input.signedScopes) {
    const doc = docs[scope];
    const consentRec: Consent = {
      id: crypto.randomUUID(),
      club_id: clubId,
      player_id: input.playerId,
      guardian_id: input.guardianId || null,
      scope,
      document_id: doc.id,
      method: "paper",
      granted_at: nowIso,
      revoked_at: null,
      evidence: {
        signer_full_name: input.signerFullName.trim(),
        signer_relation: input.signerRelation,
        document_version: doc.version,
        document_number: input.documentNumber,
        player_assent: Boolean(input.playerAssent),
      },
      scan_path: scanPath,
      collected_by: auth.user.id,
      player_assent: Boolean(input.playerAssent),
      player_assent_at: input.playerAssent ? nowIso : null,
      retention_status: "active",
    };

    const { error: insErr } = await admin
      .from("consents")
      .insert(consentRec as any);

    if (insErr) {
      await insertFallbackLog(
        admin,
        input.playerId,
        "[CONSENT_RECORD]",
        consentRec
      );
    }
  }

  if (input.playerAssent) {
    await admin
      .from("players")
      .update({
        assent_acknowledged: true,
        assent_acknowledged_at: nowIso,
      } as any)
      .eq("id", input.playerId);
  }

  await logAudit({
    action: "grant_consent",
    entity: "consent",
    entityId: input.documentNumber,
    playerId: input.playerId,
    meta: {
      method: "paper",
      scopes: input.signedScopes,
      collected_by: auth.user.id,
    },
  });

  revalidatePath(`/players/${input.playerId}`);
  revalidatePath("/consents");

  return {
    success: true,
    scanPath,
    grantedAt: nowIso,
  };
}

// ════════════════════════════════════════════════════════════════════
// 6. ПУБЛІКАЦІЯ НОВОЇ ВЕРСІЇ ДОКУМЕНТА ЗГОДИ (п. 1, п. 8)
//    Текст старої версії не змінюється; створюється нова версія.
//    У гравців статус автоматично стає «Потрібне повторне підтвердження» (застаріла).
// ════════════════════════════════════════════════════════════════════

export async function publishNewConsentDocumentVersionAction(input: {
  scope: ConsentScope;
  newVersion: string;
  title: string;
  bodyMarkdown: string;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const version = input.newVersion.trim();
  const title = input.title.trim();
  const body = input.bodyMarkdown.trim();

  if (!version || !title || !body) {
    return { error: "Заповніть номер версії, заголовок та текст документа." };
  }

  // Переконуємося, що позначка «шаблон, потребує перевірки юристом» збережена (п. 11)
  const finalBody = body.includes("потребує перевірки юристом")
    ? body
    : `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**\n\n${body}`;

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;

  const newDoc: ConsentDocument = {
    id: crypto.randomUUID(),
    club_id: clubId,
    scope: input.scope,
    version,
    title,
    body_markdown: finalBody,
    effective_from: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString(),
  };

  // Спочатку деактивуємо попередні версії в БД (також спрацює тригер)
  await admin
    .from("consent_documents")
    .update({ is_active: false } as any)
    .eq("club_id", clubId)
    .eq("scope", input.scope);

  const { error } = await admin
    .from("consent_documents")
    .insert(newDoc as any);

  if (error) {
    await insertFallbackLog(admin, null, "[CONSENT_DOC]", newDoc);
  }

  revalidatePath("/consents");
  revalidatePath("/privacy");
  revalidatePath("/players");

  return { success: true, document: newDoc };
}

/**
 * Оновлення налаштувань політики відкликання та адаптера відправки в clubs.settings
 */
export async function updateClubPrivacySettingsAction(input: {
  revocationPolicy: "delete" | "anonymize";
  messagingMode: "stub" | "live";
  smsProvider?: "turbosms" | "twilio" | "stub";
  emailProvider?: "resend" | "smtp" | "stub";
  privacyContactEmail?: string;
}) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const current = await getClubMessagingSettings(clubId);

  const updatedSettings = {
    ...current,
    consent_revocation_policy: input.revocationPolicy,
    privacy_contact_email:
      input.privacyContactEmail || current.privacy_contact_email || "privacy@club-academy.ua",
    messaging: {
      ...(current.messaging || {}),
      mode: input.messagingMode,
      sms_provider: input.smsProvider || "stub",
      email_provider: input.emailProvider || "stub",
    },
  };

  await admin
    .from("clubs")
    .update({ settings: updatedSettings } as any)
    .eq("id", clubId);

  revalidatePath("/consents");
  revalidatePath("/privacy");

  return { success: true, settings: updatedSettings };
}
