"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertTeamStaff, DEFAULT_CLUB_ID } from "@/lib/auth";
import { canUserAccessTeam } from "@/lib/team-access";
import { logAudit } from "@/lib/audit";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
} from "@/lib/consent-constants";
import {
  getActiveConsentDocuments,
  getPlayerConsentSummary,
} from "@/lib/consents";
import {
  calculatePlayerAvailability,
  AVAILABILITY_STATUS_LABELS,
} from "@/lib/availability-rules";
import { CONCUSSION_GRTP_STAGES, type ConcussionStageNumber } from "@/types/concussion";
import type { PreSeasonScreening } from "@/types/screening";
import type { RtpPhaseLog } from "@/types/rtp";
import type { ConsentScope } from "@/types/database";
import {
  isParentWellnessAllowedForAge,
  maskParentMessageForCoach,
  type CoachParentAlertItem,
  type ParentMessageCategory,
  type ParentMessageRecord,
  type ParentPortalData,
  type ParentPortalTokenInfo,
  type ParentRehabExerciseItem,
} from "@/types/parent-portal";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw.trim()).digest("hex");
}

function calcAgeYears(dob: string | null | undefined): number {
  if (!dob) return 14;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 14;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
}

function getGrowthParentAdvice(phase: "pre_phv" | "phv" | "post_phv" | null): {
  title: string | null;
  advice: string | null;
} {
  if (phase === "phv") {
    return {
      title: "Період активного стрибка росту (PHV)",
      advice:
        "Зараз кістки ростуть швидше, ніж м'язи та сухожилля. Можливий дискомфорт у колінах або п'ятах — у клубі адаптують стрибкове навантаження. Вдома важливі повноцінний сон (9+ год) і достатнє споживання білка та кальцію.",
    };
  }
  if (phase === "pre_phv") {
    return {
      title: "Фаза до стрибка росту (Pre-PHV)",
      advice:
        "Організм розвивається рівномірно. Основний фокус зараз — координація, гнучкість, техніка рухів та ігрове задоволення без перевантаження.",
    };
  }
  if (phase === "post_phv") {
    return {
      title: "Фаза після піку росту (Post-PHV)",
      advice:
        "Стрибок росту позаду, скелет зміцнюється. Поступово додається силова та швидкісна робота під контролем штабу.",
    };
  }
  return { title: null, advice: null };
}

/**
 * Генерує персональне сімейне посилання для батьків гравця (/parent/[token]).
 * Повертає повний відносний URL один раз для копіювання / QR.
 */
export async function generateParentPortalLinkAction(input: {
  playerId: string;
  guardianId?: string | null;
  label?: string;
}): Promise<{ success?: boolean; url?: string; error?: string }> {
  const auth = await assertTeamStaff();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: player, error: playerErr } = await admin
    .from("players")
    .select("id, club_id, team_id")
    .eq("id", input.playerId)
    .maybeSingle();

  if (playerErr || !player) {
    return { error: "Гравця не знайдено." };
  }

  if (!canUserAccessTeam(auth.user, player.team_id)) {
    return { error: "Недостатньо прав доступу до цієї команди." };
  }

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashToken(rawToken);
  const label = (input.label || "Сімейний доступ").trim().slice(0, 80);

  const { error: insertErr } = await admin.from("parent_portal_tokens").insert({
    club_id: player.club_id || auth.user.clubId || DEFAULT_CLUB_ID,
    player_id: player.id,
    guardian_id: input.guardianId || null,
    token_hash: tokenHash,
    label,
    is_active: true,
    created_by: auth.user.id,
  });

  if (insertErr) {
    return { error: `Помилка створення сімейного доступу: ${insertErr.message}` };
  }

  await logAudit({
    action: "create_parent_portal_link",
    entity: "parent_portal",
    playerId: player.id,
    meta: { label },
    userId: auth.user.id,
    clubId: player.club_id || auth.user.clubId,
  });

  revalidatePath(`/players/${player.id}`);
  return {
    success: true,
    url: `/parent/${rawToken}`,
  };
}

/**
 * Повертає список активних сімейних доступів та останні повідомлення від батьків для картки гравця (для штабу).
 */
export async function getPlayerParentAccessStateAction(playerId: string): Promise<{
  tokens: ParentPortalTokenInfo[];
  messages: ParentMessageRecord[];
}> {
  const auth = await assertTeamStaff();
  if ("error" in auth) return { tokens: [], messages: [] };

  const admin = createAdminClient();
  const [tokensRes, messagesRes] = await Promise.all([
    admin
      .from("parent_portal_tokens")
      .select("id, label, is_active, first_opened_at, last_opened_at, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("parent_messages")
      .select("id, player_id, category, message, is_read_by_staff, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    tokens: (tokensRes.data || []) as ParentPortalTokenInfo[],
    messages: (messagesRes.data || []) as ParentMessageRecord[],
  };
}

/**
 * Відкликає сімейне посилання доступу.
 */
export async function revokeParentPortalTokenAction(
  tokenId: string,
  playerId: string
): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertTeamStaff();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("parent_portal_tokens")
    .update({ is_active: false })
    .eq("id", tokenId)
    .eq("player_id", playerId);

  if (error) return { error: error.message };

  await logAudit({
    action: "revoke_parent_portal_link",
    entity: "parent_portal",
    entityId: tokenId,
    playerId,
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath(`/players/${playerId}`);
  return { success: true };
}

/**
 * Позначає повідомлення від батьків як прочитані штабом.
 */
export async function markParentMessagesReadAction(
  playerId: string
): Promise<{ success?: boolean }> {
  const auth = await assertTeamStaff();
  if ("error" in auth) return {};

  const admin = createAdminClient();
  await admin
    .from("parent_messages")
    .update({ is_read_by_staff: true })
    .eq("player_id", playerId)
    .eq("is_read_by_staff", false);

  revalidatePath(`/players/${playerId}`);
  return { success: true };
}

/**
 * Публічне завантаження даних для Сімейного кабінету батьків за токеном (/parent/[token]).
 * Повертає лише безпечну для батьків інформацію (без внутрішніх нотаток тренера та сирих ACWR/Z-score).
 */
export async function getParentPortalDataAction(
  rawToken: string
): Promise<{ data?: ParentPortalData; error?: string }> {
  if (!rawToken || rawToken.trim().length < 16) {
    return { error: "Недійсне посилання сімейного доступу." };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(rawToken);

  const { data: tokenRow, error: tokenErr } = await admin
    .from("parent_portal_tokens")
    .select("id, club_id, player_id, guardian_id, label, is_active, first_opened_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return { error: "Посилання сімейного доступу не знайдено або воно застаріло." };
  }

  if (!tokenRow.is_active) {
    return {
      error:
        "Це посилання було відкликано медичним штабом клубу. Зверніться до лікаря за новим посиланням.",
    };
  }

  const isFirstVisit = !tokenRow.first_opened_at;
  const nowIso = new Date().toISOString();

  await admin
    .from("parent_portal_tokens")
    .update({
      first_opened_at: tokenRow.first_opened_at || nowIso,
      last_opened_at: nowIso,
    })
    .eq("id", tokenRow.id);

  // Паралельно завантажуємо профіль гравця, травми, скринінги, матурацію, згоди та повідомлення
  const [
    playerRes,
    clubRes,
    injuriesRes,
    screeningsRes,
    matRes,
    logsRes,
    rehabPlanRes,
    anamnesisRes,
    messagesRes,
    consentSummary,
    activeDocs,
  ] = await Promise.all([
    admin
      .from("players")
      .select("id, first_name, last_name, date_of_birth, position, team_id, club_id, teams ( name, category )")
      .eq("id", tokenRow.player_id)
      .maybeSingle(),
    admin
      .from("clubs")
      .select("name")
      .eq("id", tokenRow.club_id)
      .maybeSingle(),
    admin
      .from("injuries")
      .select("id, status, injury_type, location, date_of_injury, expected_return_date, description")
      .eq("player_id", tokenRow.player_id)
      .order("date_of_injury", { ascending: false }),
    admin
      .from("player_screenings")
      .select("id, player_id, date, season, examiner_doctor, overall_status, valid_until, cardio_clearance, restrictions_notes, data, created_at")
      .eq("player_id", tokenRow.player_id)
      .order("date", { ascending: false })
      .limit(1),
    admin
      .from("maturation_assessments")
      .select("growth_phase, created_at")
      .eq("player_id", tokenRow.player_id)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("injury_logs")
      .select("injury_id, note, created_at")
      .like("note", "[RTP_PHASE]%")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("rehab_plans")
      .select("data, status, created_at")
      .eq("player_id", tokenRow.player_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("player_anamnesis")
      .select("blood_type, allergies, data")
      .eq("player_id", tokenRow.player_id)
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("parent_messages")
      .select("id, player_id, category, message, is_read_by_staff, created_at")
      .eq("player_id", tokenRow.player_id)
      .order("created_at", { ascending: false })
      .limit(15),
    getPlayerConsentSummary(tokenRow.player_id, undefined, tokenRow.club_id),
    getActiveConsentDocuments(tokenRow.club_id),
  ]);

  const player = playerRes.data as any;
  if (!player) {
    return { error: "Профіль гравця не знайдено." };
  }

  const injuries = injuriesRes.data || [];
  const latestScreeningRaw = screeningsRes.data?.[0] as any;
  const latestScreening: PreSeasonScreening | null = latestScreeningRaw
    ? {
        ...(latestScreeningRaw.data || {}),
        id: latestScreeningRaw.id,
        player_id: latestScreeningRaw.player_id,
        date: latestScreeningRaw.date,
        season: latestScreeningRaw.season,
        examiner_doctor: latestScreeningRaw.examiner_doctor,
        overall_status: latestScreeningRaw.overall_status,
        valid_until: latestScreeningRaw.valid_until,
        cardio_clearance: latestScreeningRaw.cardio_clearance,
        restrictions_notes: latestScreeningRaw.restrictions_notes,
        created_at: latestScreeningRaw.created_at,
      }
    : null;

  // Парсимо останні RTP-фази, домашнє ЛФК та первинний анамнез
  const latestRtpByInjury: Record<string, Partial<RtpPhaseLog>> = {};
  const exercises: ParentRehabExerciseItem[] = [];
  let bloodType: string | null = null;
  let allergies: string[] = [];
  let chronicConditions: string[] = [];

  const playerInjuryIds = new Set(injuries.map((i: any) => i.id));

  for (const row of logsRes.data || []) {
    const note: string = row.note || "";
    if (note.startsWith("[RTP_PHASE] ") && row.injury_id && playerInjuryIds.has(row.injury_id)) {
      try {
        const parsed = JSON.parse(note.replace("[RTP_PHASE] ", ""));
        if (parsed.injury_id && !latestRtpByInjury[parsed.injury_id]) {
          latestRtpByInjury[parsed.injury_id] = parsed;
        }
      } catch {}
    }
  }

  const latestPlanData = (rehabPlanRes.data?.[0] as any)?.data;
  if (latestPlanData && Array.isArray(latestPlanData.exercises)) {
    for (const ex of latestPlanData.exercises.slice(0, 8)) {
      exercises.push({
        name: ex.name || ex.title || "Вправа ЛФК",
        setsReps: ex.sets_reps || ex.dosage || "3 × 10",
        frequency: ex.frequency || "Щодня",
        notes: ex.notes || ex.instructions,
      });
    }
  }

  const latestAnamnesisRow = anamnesisRes.data?.[0] as any;
  if (latestAnamnesisRow) {
    bloodType = latestAnamnesisRow.blood_type || latestAnamnesisRow.data?.blood_type || null;
    const rawAllergies = latestAnamnesisRow.allergies ?? latestAnamnesisRow.data?.allergies;
    allergies = Array.isArray(rawAllergies)
      ? rawAllergies
      : typeof rawAllergies === "string" && rawAllergies.trim()
      ? [rawAllergies.trim()]
      : [];
    const rawChronic = latestAnamnesisRow.data?.chronic_conditions;
    chronicConditions = Array.isArray(rawChronic) ? rawChronic : [];
  }

  // Розрахунок допуску
  const avail = calculatePlayerAvailability(
    {
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      position: player.position,
      date_of_birth: player.date_of_birth,
      team_id: player.team_id,
      team_name: player.teams?.name,
      team_category: player.teams?.category,
      injuries: injuries as any[],
      screening: latestScreening,
    },
    { rtpLogsByInjury: latestRtpByInjury }
  );

  const statusMeta = AVAILABILITY_STATUS_LABELS[avail.status];
  let clearanceDescription =
    "Медичних обмежень немає. Гравець може тренуватися та брати участь у матчах у повному обсязі.";
  if (avail.status === "restricted") {
    clearanceDescription =
      avail.restriction_notes ||
      "Гравець тренується з частковими обмеженнями за рішенням медичного штабу.";
  } else if (avail.status === "unavailable") {
    clearanceDescription =
      avail.restriction_notes ||
      "Гравець тимчасово відсторонений від командних тренувань та ігор на період відновлення.";
  }

  // Перевіряємо активний струс мозку
  const activeConcussionInjury = injuries.find(
    (i: any) =>
      i.injury_type === "concussion" &&
      (i.status === "active" || i.status === "rehabilitation")
  );
  let concussionStageNum: ConcussionStageNumber | null = null;
  if (activeConcussionInjury) {
    const { data: concData } = await admin
      .from("concussion_assessments")
      .select("current_rtp_stage")
      .eq("injury_id", activeConcussionInjury.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    concussionStageNum = ((concData?.current_rtp_stage as ConcussionStageNumber) || 1);
  }
  const stageMeta = concussionStageNum ? CONCUSSION_GRTP_STAGES[concussionStageNum] : null;

  const activeInjury = injuries.find(
    (i: any) => i.status === "active" || i.status === "rehabilitation"
  );
  const rtpLog = activeInjury ? latestRtpByInjury[activeInjury.id] : null;

  // Перевіряємо, яких згод бракує
  const latestByScope: Record<string, any> = {};
  const missingScopes = ALL_CONSENT_SCOPES.filter((scope) => {
    const state = consentSummary.scopes[scope];
    if (state?.status === "granted") {
      latestByScope[scope] = {
        id: state.consentId || scope,
        scope,
        granted_at: state.grantedAt || new Date().toISOString(),
        revoked_at: state.revokedAt,
        evidence: { signer_name: state.signerName || undefined },
      };
    }
    return state?.status !== "granted";
  });

  const age = calcAgeYears(player.date_of_birth);
  const growthPhase = (matRes.data?.[0]?.growth_phase as "pre_phv" | "phv" | "post_phv") || null;
  const growthInfo = getGrowthParentAdvice(growthPhase);

  const screeningValidUntil = latestScreening?.valid_until || null;
  const screeningExpired = screeningValidUntil
    ? new Date(screeningValidUntil).getTime() < Date.now()
    : false;

  // Для дітей < 14 років перевіряємо, чи заповнено сьогодні ранковий чекін (wellness_surveys)
  let wellnessToday: ParentPortalData["wellnessToday"] = undefined;
  if (isParentWellnessAllowedForAge(age)) {
    const timezone = await getClubTimezone(tokenRow.club_id);
    const today = getClubDate(timezone);
    const { data: todaySurvey } = await admin
      .from("wellness_surveys")
      .select("id, created_at")
      .eq("player_id", tokenRow.player_id)
      .eq("date", today)
      .maybeSingle();

    wellnessToday = {
      isUnder14: true,
      alreadySubmitted: Boolean(todaySurvey),
      date: today,
      submittedAt: (todaySurvey as any)?.created_at || null,
    };
  }

  return {
    data: {
      tokenId: tokenRow.id,
      tokenLabel: tokenRow.label || "Сімейний доступ",
      isFirstVisit,
      needsOnboardingConsents: isFirstVisit || missingScopes.length > 0,
      clubName: clubRes.data?.name || "Футбольна Академія",
      player: {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        age,
        isMinor: age < 18,
        isTeenAssentApplicable: age >= 14 && age < 18,
        teamName: player.teams?.name || "Команда",
      },
      clearance: {
        status: avail.status,
        title: statusMeta.label,
        description: clearanceDescription,
        restrictionsNotes: latestScreening?.restrictions_notes || null,
        screeningValidUntil,
        screeningExpired,
      },
      concussionCare: {
        isActive: Boolean(activeConcussionInjury),
        stageNumber: concussionStageNum,
        stageTitle: stageMeta?.title || null,
        activities: stageMeta?.activities || null,
      },
      rehab: {
        activeInjuryLabel: activeInjury ? "Активне відновлення під наглядом лікаря" : null,
        rtpPhaseLabel: rtpLog?.phase ? `Етап RTP: ${rtpLog.phase}` : null,
        exercises,
      },
      growth: {
        phase: growthPhase,
        title: growthInfo.title,
        advice: growthInfo.advice,
      },
      pediatricSummary: {
        bloodType,
        allergies,
        chronicConditions,
      },
      consents: {
        documents: activeDocs,
        latestByScope,
        missingScopes,
      },
      messages: (messagesRes.data || []) as ParentMessageRecord[],
      wellnessToday,
    },
  };
}

/**
 * Підписання згод/дозволів батьками прямо з Сімейного кабінету (без окремого OTP,
 * оскільки доступ автентифікований персональним 256-бітним токеном батьків).
 * Кожна область згоди передається явно увімкненою користувачем.
 */
export async function submitParentConsentsAction(input: {
  rawToken: string;
  selectedScopes: ConsentScope[];
  signerFullName: string;
  signerRelation: string;
  playerAssent?: boolean;
}): Promise<{ success?: boolean; grantedCount?: number; error?: string }> {
  if (!input.rawToken || !input.signerFullName.trim()) {
    return { error: "Вкажіть ПІБ законного представника." };
  }
  if (!input.selectedScopes || input.selectedScopes.length === 0) {
    return { error: "Увімкніть хоча б один дозвіл перемикачем." };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(input.rawToken);
  const { data: tokenRow } = await admin
    .from("parent_portal_tokens")
    .select("id, club_id, player_id, guardian_id, is_active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !tokenRow.is_active) {
    return { error: "Посилання сімейного доступу недійсне або відкликане." };
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hdrs.get("x-real-ip") ||
    "127.0.0.1";
  const userAgent = hdrs.get("user-agent") || "ParentPortalBrowser";

  const activeDocs = await getActiveConsentDocuments(tokenRow.club_id);
  const nowIso = new Date().toISOString();

  const rowsToInsert = input.selectedScopes.map((scope) => {
    const doc = activeDocs[scope];
    return {
      club_id: tokenRow.club_id,
      player_id: tokenRow.player_id,
      guardian_id: tokenRow.guardian_id || null,
      scope,
      document_id: doc.id,
      method: "e_signature",
      granted_at: nowIso,
      player_assent: Boolean(input.playerAssent),
      player_assent_at: input.playerAssent ? nowIso : null,
      evidence: {
        ip,
        user_agent: userAgent,
        signer_name: input.signerFullName.trim(),
        signer_relation: input.signerRelation || "mother",
        document_version: doc?.version || "1.0",
        source: "parent_portal",
        token_id: tokenRow.id,
        player_assent: Boolean(input.playerAssent),
      },
    };
  });

  const { error: insertErr } = await admin.from("consents").insert(rowsToInsert as any[]);
  if (insertErr) {
    return { error: `Не вдалося зберегти дозволи: ${insertErr.message}` };
  }

  await logAudit({
    action: "grant_consent",
    entity: "consent",
    entityId: tokenRow.id,
    playerId: tokenRow.player_id,
    clubId: tokenRow.club_id,
    allowPublic: true,
    meta: {
      source: "parent_portal",
      scopes: input.selectedScopes,
      count: input.selectedScopes.length,
      scopeLabels: input.selectedScopes.map((s) => CONSENT_SCOPE_META[s]?.shortLabel || s),
    },
  });

  revalidatePath(`/players/${tokenRow.player_id}`);
  revalidatePath("/team/readiness");
  revalidatePath("/availability");
  revalidatePath("/coach-briefing");
  return { success: true, grantedCount: rowsToInsert.length };
}

/**
 * Надсилання повідомлення від батьків лікарю клубу (хвороба вдома, травма, пропуск, ЛФК виконано).
 */
export async function submitParentMessageAction(input: {
  rawToken: string;
  category: ParentMessageCategory;
  message: string;
}): Promise<{ success?: boolean; record?: ParentMessageRecord; error?: string }> {
  const cleanMsg = input.message.trim();
  if (!cleanMsg || cleanMsg.length < 3) {
    return { error: "Напишіть короткий текст повідомлення (мінімум 3 символи)." };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(input.rawToken);
  const { data: tokenRow } = await admin
    .from("parent_portal_tokens")
    .select("id, club_id, player_id, is_active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !tokenRow.is_active) {
    return { error: "Посилання сімейного доступу недійсне або відкликане." };
  }

  const { data: inserted, error } = await admin
    .from("parent_messages")
    .insert({
      club_id: tokenRow.club_id,
      player_id: tokenRow.player_id,
      token_id: tokenRow.id,
      category: input.category,
      message: cleanMsg.slice(0, 600),
      is_read_by_staff: false,
      is_read_by_coach: false,
    })
    .select("id, player_id, category, message, is_read_by_staff, is_read_by_coach, created_at")
    .single();

  if (error || !inserted) {
    return { error: `Помилка відправки: ${error?.message || "невідома"}` };
  }

  await logAudit({
    action: "parent_message",
    entity: "parent_portal",
    entityId: inserted.id,
    playerId: tokenRow.player_id,
    clubId: tokenRow.club_id,
    allowPublic: true,
    meta: { category: input.category },
  });

  revalidatePath(`/players/${tokenRow.player_id}`);
  revalidatePath("/coach-briefing");
  revalidatePath("/team/readiness");
  return { success: true, record: inserted as ParentMessageRecord };
}

/**
 * Повертає повідомлення від батьків за останні 48 годин для тренера
 * із дотриманням лікарської таємниці (фільтрує по доступних командах та маскує меддеталі).
 */
export async function getCoachParentAlertsAction(): Promise<{
  alerts: CoachParentAlertItem[];
  error?: string;
}> {
  const auth = await assertTeamStaff();
  if ("error" in auth) {
    return { alerts: [], error: auth.error };
  }

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("parent_messages")
    .select(
      "id, player_id, category, message, is_read_by_coach, created_at, players ( id, first_name, last_name, team_id, teams ( name ) )"
    )
    .eq("club_id", clubId)
    .eq("is_read_by_coach", false)
    .neq("category", "question")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows) {
    return { alerts: [], error: error?.message };
  }

  const alerts: CoachParentAlertItem[] = [];
  for (const row of rows as any[]) {
    const player = row.players;
    const teamId: string | null = player?.team_id || null;
    if (!canUserAccessTeam(auth.user, teamId)) continue;

    const masked = maskParentMessageForCoach(
      row.category as ParentMessageCategory,
      row.message || ""
    );
    if (!masked.visible || !masked.category || masked.displayText === undefined) continue;

    const fullName = player
      ? `${player.last_name || ""} ${player.first_name || ""}`.trim() || "Гравець"
      : "Гравець";

    alerts.push({
      id: row.id,
      playerId: row.player_id,
      playerName: fullName,
      teamId,
      teamName: player?.teams?.name || "Команда",
      category: masked.category,
      displayText: masked.displayText,
      isMasked: Boolean(masked.isMasked),
      createdAt: row.created_at,
    });
  }

  return { alerts };
}

/**
 * Позначає повідомлення від батьків як прочитані тренером (окремо від прапорця лікаря is_read_by_staff).
 */
export async function markParentMessagesReadByCoachAction(
  messageIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertTeamStaff();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const cleanIds = Array.from(
    new Set((messageIds || []).filter((id) => typeof id === "string" && id.trim().length > 0))
  );
  if (cleanIds.length === 0) {
    return { success: true };
  }

  const admin = createAdminClient();
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;

  const { data: rows } = await admin
    .from("parent_messages")
    .select("id, players ( team_id )")
    .eq("club_id", clubId)
    .in("id", cleanIds);

  const allowedIds = (rows || [])
    .filter((r: any) => canUserAccessTeam(auth.user, r.players?.team_id || null))
    .map((r: any) => r.id as string);

  if (allowedIds.length === 0) {
    return { success: true };
  }

  const { error } = await admin
    .from("parent_messages")
    .update({ is_read_by_coach: true })
    .eq("club_id", clubId)
    .in("id", allowedIds);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/coach-briefing");
  revalidatePath("/team/readiness");
  return { success: true };
}

/**
 * Ранкове самопочуття (Wellness) від батьків для гравців молодше 14 років (< 14).
 * Записує у wellness_surveys з позначкою source='parent_portal' та filled_by='parent'.
 */
export async function submitParentWellnessAction(input: {
  rawToken: string;
  sleepQuality: number;
  sleepHours?: number | null;
  fatigue: number;
  soreness: number;
  pain: boolean;
  painLocations?: string[] | null;
  illness?: boolean;
  notes?: string | null;
}): Promise<{ success?: boolean; date?: string; error?: string }> {
  if (!input.rawToken || input.rawToken.trim().length < 16) {
    return { error: "Недійсне посилання сімейного доступу." };
  }

  const scores = [input.sleepQuality, input.fatigue, input.soreness];
  if (scores.some((s) => !Number.isInteger(s) || s < 1 || s > 5)) {
    return { error: "Оцінки самопочуття мають бути цілими числами від 1 до 5." };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(input.rawToken);

  const { data: tokenRow } = await admin
    .from("parent_portal_tokens")
    .select("id, club_id, player_id, is_active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !tokenRow.is_active) {
    return { error: "Посилання сімейного доступу недійсне або відкликане." };
  }

  const { data: player } = await admin
    .from("players")
    .select("id, club_id, date_of_birth")
    .eq("id", tokenRow.player_id)
    .maybeSingle();

  if (!player) {
    return { error: "Профіль гравця не знайдено." };
  }

  const age = calcAgeYears(player.date_of_birth);
  if (!isParentWellnessAllowedForAge(age)) {
    return {
      error: "Ранковий чекін через кабінет батьків доступний лише для гравців молодше 14 років.",
    };
  }

  const clubId = player.club_id || tokenRow.club_id || DEFAULT_CLUB_ID;
  const timezone = await getClubTimezone(clubId);
  const today = getClubDate(timezone);

  const { data: existingSurvey } = await admin
    .from("wellness_surveys")
    .select("id")
    .eq("player_id", tokenRow.player_id)
    .eq("date", today)
    .maybeSingle();

  if (existingSurvey) {
    return { error: "Сьогоднішній чекін вже заповнено." };
  }

  const stressLevel = 4;
  const totalScore =
    Number(input.sleepQuality) +
    Number(input.fatigue) +
    Number(input.soreness) +
    stressLevel;
  const readinessStatus =
    totalScore >= 16 ? "optimal" : totalScore >= 12 ? "warning" : "risk";

  const painLocations =
    input.pain && Array.isArray(input.painLocations)
      ? input.painLocations.filter((l) => typeof l === "string" && l.trim().length > 0)
      : [];

  const sleepHours =
    input.sleepHours !== undefined &&
    input.sleepHours !== null &&
    Number.isFinite(Number(input.sleepHours))
      ? Math.max(0, Math.min(24, Number(input.sleepHours)))
      : null;

  const extraDetails = {
    sleep_hours: sleepHours,
    pain: Boolean(input.pain),
    pain_locations: painLocations,
    illness: Boolean(input.illness),
    comment: input.notes?.trim() ? input.notes.trim().slice(0, 500) : null,
    source: "parent_portal",
    filled_by: "parent",
  };

  const surveyId = crypto.randomUUID();
  const { error: insertErr } = await admin.from("wellness_surveys").insert({
    id: surveyId,
    club_id: clubId,
    player_id: tokenRow.player_id,
    date: today,
    sleep_quality: input.sleepQuality,
    fatigue_level: input.fatigue,
    muscle_soreness: input.soreness,
    stress_level: stressLevel,
    soreness_location: painLocations[0] || null,
    total_score: totalScore,
    readiness_status: readinessStatus,
    filled_by: "parent",
    notes: JSON.stringify(extraDetails),
    created_at: new Date().toISOString(),
  } as any);

  if (insertErr) {
    if (insertErr.code === "23505") {
      return { error: "Сьогоднішній чекін вже заповнено." };
    }
    return { error: `Не вдалося зберегти ранковий чекін: ${insertErr.message}` };
  }

  // Без витоку медичних деталей у meta
  await logAudit({
    action: "parent_wellness_submit",
    entity: "wellness_surveys",
    entityId: surveyId,
    playerId: tokenRow.player_id,
    clubId,
    allowPublic: true,
    meta: {
      source: "parent_portal",
      filled_by: "parent",
      date: today,
    },
  });

  revalidatePath("/team/readiness");
  revalidatePath("/availability");
  revalidatePath("/coach-briefing");
  revalidatePath(`/players/${tokenRow.player_id}`);

  return { success: true, date: today };
}
