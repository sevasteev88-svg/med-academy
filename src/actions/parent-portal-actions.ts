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
  isValidUuid,
} from "@/lib/consents";
import {
  calculatePlayerAvailability,
  AVAILABILITY_STATUS_LABELS,
} from "@/lib/availability-rules";
import { CONCUSSION_GRTP_STAGES, type ConcussionStageNumber } from "@/types/concussion";
import type { PreSeasonScreening } from "@/types/screening";
import type { RtpPhaseLog } from "@/types/rtp";
import type { ConsentScope } from "@/types/database";
import { isSubscriptionAccessGranted } from "@/lib/billing";
import type { SubscriptionStatus } from "@/types/billing";
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
    wellnessHistoryRes,
    nutritionRes,
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
      .select("blood_type, allergies, initial_weight, data")
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
    admin
      .from("wellness_surveys")
      .select("date, sleep_quality, fatigue_level, muscle_soreness, total_score, readiness_status")
      .eq("player_id", tokenRow.player_id)
      .order("date", { ascending: false })
      .limit(14),
    admin
      .from("player_nutrition_profiles")
      .select("data")
      .eq("player_id", tokenRow.player_id)
      .order("date", { ascending: false })
      .limit(1),
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

  const timezone = await getClubTimezone(tokenRow.club_id);
  const today = getClubDate(timezone);

  // Для дітей < 14 років перевіряємо, чи заповнено сьогодні ранковий чекін (wellness_surveys)
  let wellnessToday: ParentPortalData["wellnessToday"] = undefined;
  if (isParentWellnessAllowedForAge(age)) {
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

  const wellnessHistory = (wellnessHistoryRes.data || [])
    .map((w: any) => ({
      date: w.date,
      sleepQuality: Number(w.sleep_quality || 0),
      fatigue: Number(w.fatigue_level || 0),
      soreness: Number(w.muscle_soreness || 0),
      totalScore: Number(w.total_score || 0),
      readinessStatus: String(w.readiness_status || "optimal"),
    }))
    .reverse();

  // Найближчі тренування / матчі команди
  let upcomingSessions: ParentPortalData["schedule"]["upcomingSessions"] = [];
  if (player.team_id) {
    const { data: sessionsRows } = await admin
      .from("workload_sessions")
      .select("id, date, session_type, notes")
      .eq("team_id", player.team_id)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(10);

    const seenKeys = new Set<string>();
    for (const s of sessionsRows || []) {
      const key = `${s.date}_${s.session_type || "training"}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const sType = String(s.session_type || "training");
      upcomingSessions.push({
        id: s.id,
        date: s.date,
        sessionType: sType,
        title:
          sType === "match"
            ? "Матч команди"
            : sType === "recovery"
            ? "Відновлювальне заняття"
            : "Командне тренування",
      });
      if (upcomingSessions.length >= 5) break;
    }
  }

  // Сьогоднішня відмітка присутності з повідомлень батьків
  const todayMsgs = (messagesRes.data || []).filter((m: any) =>
    String(m.created_at || "").startsWith(today)
  );
  let todayAttendanceStatus: "attending" | "absent" | null = null;
  for (const m of todayMsgs) {
    const txt = String((m as any).message || "");
    if (txt.includes("[ВІДМІТКА: БУДЕ]")) {
      todayAttendanceStatus = "attending";
      break;
    }
    if ((m as any).category === "absence" || txt.includes("[ВІДМІТКА: НЕ БУДЕ]")) {
      todayAttendanceStatus = "absent";
      break;
    }
  }

  // Персональна норма гідратації та нутрієнти
  const rawWeight = latestAnamnesisRow?.initial_weight;
  const weightKg =
    rawWeight && Number(rawWeight) > 0
      ? Number(rawWeight)
      : null;
  const effectiveWeight = weightKg ?? 45;
  const dailyWaterMl = Math.round(effectiveWeight * 35);
  const trainingDayWaterMl = dailyWaterMl + 500;

  const nutData = ((nutritionRes.data?.[0] as any)?.data || {}) as Record<string, any>;
  const supplements: Array<{ name: string; dosage?: string }> = [];
  if (nutData.supplements_collagen_vit_c) {
    supplements.push({ name: "Колаген + вітамін С", dosage: "За 45 хв до заняття" });
  }
  if (nutData.supplements_creatine) {
    supplements.push({ name: "Креатин моногідрат", dosage: "За призначенням лікаря" });
  }
  if (nutData.supplements_omega3) {
    supplements.push({ name: "Омега-3", dosage: "Для контролю запалення" });
  }
  if (nutData.supplements_whey_protein) {
    supplements.push({ name: "Протеїн", dosage: "Протягом 30 хв після тренування" });
  }
  if (nutData.supplements_vitamin_d) {
    supplements.push({ name: "Вітамін D3", dosage: "Зранку під час сніданку" });
  }

  const recoveryTips = [
    `Вода у звичайний день: ${(dailyWaterMl / 1000).toFixed(1)} л, у день тренування: ${(trainingDayWaterMl / 1000).toFixed(1)} л.`,
    "За 1.5–2 години до тренування: складні вуглеводи (каша, паста, фрукти) + легкий білок.",
    "Протягом 30–45 хв після навантаження: вода + банан / йогурт або повноцінний прийом їжі з білком.",
  ];

  // Екстрені контакти сім'ї з анамнезу
  const ecRaw = (latestAnamnesisRow?.data?.emergency_contacts || {}) as Record<string, any>;
  const emergencyContacts = {
    primaryName: String(ecRaw.primaryName || ""),
    primaryPhone: String(ecRaw.primaryPhone || ""),
    secondaryName: String(ecRaw.secondaryName || ""),
    secondaryPhone: String(ecRaw.secondaryPhone || ""),
    pickupAuthorized: String(ecRaw.pickupAuthorized || ""),
    familyDoctorPhone: String(ecRaw.familyDoctorPhone || ""),
  };

  const { data: subRow } = await admin
    .from("player_subscriptions")
    .select("status, plan_code, amount_uah, billing_interval, current_period_end, grace_period_ends_at, card_last4, comped_reason")
    .eq("player_id", tokenRow.player_id)
    .maybeSingle();

  const isSubActive = subRow
    ? isSubscriptionAccessGranted({
        status: subRow.status as SubscriptionStatus,
        currentPeriodEnd: subRow.current_period_end,
        gracePeriodEndsAt: subRow.grace_period_ends_at,
      })
    : false;

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
      wellnessHistory,
      schedule: {
        upcomingSessions,
        todayAttendanceStatus,
      },
      nutritionAndHydration: {
        weightKg,
        dailyWaterMl,
        trainingDayWaterMl,
        supplements,
        recoveryTips,
      },
      emergencyContacts,
      subscription: {
        isActive: isSubActive,
        status: (subRow?.status as SubscriptionStatus) || "unpaid",
        planCode: subRow?.plan_code || null,
        amountUah: subRow ? Number(subRow.amount_uah) : 200,
        billingInterval: subRow?.billing_interval || null,
        currentPeriodEnd: subRow?.current_period_end || null,
        gracePeriodEndsAt: subRow?.grace_period_ends_at || null,
        cardLast4: subRow?.card_last4 || null,
        compedReason: subRow?.comped_reason || null,
      },
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
  const signerFullName = input.signerFullName.trim();

  for (const scope of input.selectedScopes) {
    const doc = activeDocs[scope];
    if (!isValidUuid(doc?.id)) {
      return {
        error:
          "Не вдалося ініціалізувати шаблони документів згоди для клубу. Спробуйте ще раз або зверніться до лікаря.",
      };
    }
  }

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
      retention_status: "active",
      evidence: {
        ip,
        user_agent: userAgent,
        signer_full_name: signerFullName,
        signer_name: signerFullName,
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
  revalidatePath("/consents");
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

  const { data: subRow } = await admin
    .from("player_subscriptions")
    .select("status, current_period_end, grace_period_ends_at")
    .eq("player_id", tokenRow.player_id)
    .maybeSingle();

  const isSubActive = subRow
    ? isSubscriptionAccessGranted({
        status: subRow.status as SubscriptionStatus,
        currentPeriodEnd: subRow.current_period_end,
        gracePeriodEndsAt: subRow.grace_period_ends_at,
      })
    : false;

  if (!isSubActive) {
    return {
      error: "Потрібна активна підписка на паспорт здоров'я для заповнення ранкового чекіну.",
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

/**
 * Заповнення / оновлення первинних медичних даних (група крові, алергії, хронічні захворювання)
 * батьками безпосередньо з Сімейного кабінету.
 */
export async function submitParentPediatricAnamnesisAction(input: {
  rawToken: string;
  bloodType: string | null;
  allergies: string[];
  chronicConditions: string[];
}): Promise<{
  success?: boolean;
  pediatricSummary?: {
    bloodType: string | null;
    allergies: string[];
    chronicConditions: string[];
  };
  error?: string;
}> {
  if (!input.rawToken || input.rawToken.trim().length < 16) {
    return { error: "Недійсне посилання сімейного доступу." };
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

  const { data: subRow } = await admin
    .from("player_subscriptions")
    .select("status, current_period_end, grace_period_ends_at")
    .eq("player_id", tokenRow.player_id)
    .maybeSingle();

  const isSubActive = subRow
    ? isSubscriptionAccessGranted({
        status: subRow.status as SubscriptionStatus,
        currentPeriodEnd: subRow.current_period_end,
        gracePeriodEndsAt: subRow.grace_period_ends_at,
      })
    : false;

  if (!isSubActive) {
    return { error: "Потрібна активна підписка для збереження медичної картки." };
  }

  const cleanBloodType = input.bloodType?.trim() ? input.bloodType.trim().slice(0, 32) : null;
  const cleanAllergies = Array.isArray(input.allergies)
    ? input.allergies.map((a) => a.trim()).filter(Boolean).slice(0, 20)
    : [];
  const cleanChronic = Array.isArray(input.chronicConditions)
    ? input.chronicConditions.map((c) => c.trim()).filter(Boolean).slice(0, 20)
    : [];

  // Зберігаємо попередні поля анамнезу, якщо запис вже існував
  const { data: latestRow } = await admin
    .from("player_anamnesis")
    .select("jersey_number, phone, past_injuries, initial_height, initial_weight, data")
    .eq("player_id", tokenRow.player_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevData = (latestRow?.data as Record<string, unknown>) || {};
  const clubId = tokenRow.club_id || DEFAULT_CLUB_ID;
  const timezone = await getClubTimezone(clubId);
  const today = getClubDate(timezone);

  const mergedData = {
    ...prevData,
    blood_type: cleanBloodType,
    allergies: cleanAllergies,
    chronic_conditions: cleanChronic,
    filled_by: "parent",
    updated_at: new Date().toISOString(),
  };

  const { error: insertErr } = await admin.from("player_anamnesis").insert({
    club_id: clubId,
    player_id: tokenRow.player_id,
    date: today,
    jersey_number: latestRow?.jersey_number ?? null,
    phone: latestRow?.phone ?? null,
    blood_type: cleanBloodType,
    allergies: cleanAllergies.length > 0 ? cleanAllergies.join(", ") : null,
    past_injuries: latestRow?.past_injuries ?? null,
    initial_height: latestRow?.initial_height ?? null,
    initial_weight: latestRow?.initial_weight ?? null,
    data: mergedData,
  } as any);

  if (insertErr) {
    return { error: `Не вдалося зберегти медичну картку: ${insertErr.message}` };
  }

  await logAudit({
    action: "parent_pediatric_anamnesis_update",
    entity: "player_anamnesis",
    entityId: tokenRow.player_id,
    playerId: tokenRow.player_id,
    clubId,
    allowPublic: true,
    meta: {
      source: "parent_portal",
      hasBloodType: Boolean(cleanBloodType),
      allergiesCount: cleanAllergies.length,
      chronicCount: cleanChronic.length,
    },
  });

  revalidatePath(`/players/${tokenRow.player_id}`);

  return {
    success: true,
    pediatricSummary: {
      bloodType: cleanBloodType,
      allergies: cleanAllergies,
      chronicConditions: cleanChronic,
    },
  };
}

/**
 * Збереження екстрених контактів сім'ї та довірених осіб у player_anamnesis.data.emergency_contacts.
 */
export async function submitParentEmergencyContactsAction(input: {
  rawToken: string;
  primaryName: string;
  primaryPhone: string;
  secondaryName: string;
  secondaryPhone: string;
  pickupAuthorized: string;
  familyDoctorPhone: string;
}): Promise<{
  success?: boolean;
  emergencyContacts?: ParentPortalData["emergencyContacts"];
  error?: string;
}> {
  if (!input.rawToken || input.rawToken.trim().length < 16) {
    return { error: "Недійсне посилання сімейного доступу." };
  }
  if (!input.primaryName.trim() || !input.primaryPhone.trim()) {
    return { error: "Вкажіть ім'я та телефон основного контакту (мама / тато)." };
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

  const cleanContacts = {
    primaryName: input.primaryName.trim().slice(0, 100),
    primaryPhone: input.primaryPhone.trim().slice(0, 40),
    secondaryName: input.secondaryName.trim().slice(0, 100),
    secondaryPhone: input.secondaryPhone.trim().slice(0, 40),
    pickupAuthorized: input.pickupAuthorized.trim().slice(0, 150),
    familyDoctorPhone: input.familyDoctorPhone.trim().slice(0, 40),
  };

  const { data: latestRow } = await admin
    .from("player_anamnesis")
    .select("jersey_number, phone, blood_type, allergies, past_injuries, initial_height, initial_weight, data")
    .eq("player_id", tokenRow.player_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevData = (latestRow?.data as Record<string, unknown>) || {};
  const clubId = tokenRow.club_id || DEFAULT_CLUB_ID;
  const timezone = await getClubTimezone(clubId);
  const today = getClubDate(timezone);

  const { error: insertErr } = await admin.from("player_anamnesis").insert({
    club_id: clubId,
    player_id: tokenRow.player_id,
    date: today,
    jersey_number: latestRow?.jersey_number ?? null,
    phone: cleanContacts.primaryPhone || latestRow?.phone || null,
    blood_type: latestRow?.blood_type ?? null,
    allergies: latestRow?.allergies ?? null,
    past_injuries: latestRow?.past_injuries ?? null,
    initial_height: latestRow?.initial_height ?? null,
    initial_weight: latestRow?.initial_weight ?? null,
    data: {
      ...prevData,
      emergency_contacts: cleanContacts,
      updated_at: new Date().toISOString(),
    },
  } as any);

  if (insertErr) {
    return { error: `Не вдалося зберегти контакти: ${insertErr.message}` };
  }

  revalidatePath(`/players/${tokenRow.player_id}`);
  return { success: true, emergencyContacts: cleanContacts };
}

/**
 * Швидка відмітка батьків «Буде / Не буде на тренуванні» в 1 клік.
 */
export async function submitParentAttendanceAction(input: {
  rawToken: string;
  status: "attending" | "absent";
  note?: string;
}): Promise<{
  success?: boolean;
  record?: ParentMessageRecord;
  error?: string;
}> {
  const category: ParentMessageCategory =
    input.status === "absent" ? "absence" : "question";
  const prefix =
    input.status === "absent"
      ? "[ВІДМІТКА: НЕ БУДЕ] Дитина пропустить сьогоднішнє тренування."
      : "[ВІДМІТКА: БУДЕ] Дитина буде на сьогоднішньому тренуванні.";
  const fullMessage = input.note?.trim()
    ? `${prefix} Причина/деталі: ${input.note.trim()}`
    : prefix;

  return submitParentMessageAction({
    rawToken: input.rawToken,
    category,
    message: fullMessage,
  });
}

/**
 * Завантаження довідки від педіатра / результатів аналізів (фото або PDF) у сховище
 * та передача повідомлення лікарю клубу.
 */
export async function uploadParentMedicalCertificateAction(
  formData: FormData
): Promise<{
  success?: boolean;
  record?: ParentMessageRecord;
  error?: string;
}> {
  const rawToken = String(formData.get("rawToken") || "");
  const title = String(formData.get("title") || "").trim();
  const file = formData.get("file") as File | null;

  if (!rawToken || rawToken.trim().length < 16) {
    return { error: "Недійсне посилання сімейного доступу." };
  }
  if (!file || file.size === 0) {
    return { error: "Оберіть файл довідки (PDF, JPG або PNG)." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "Файл завеликий (максимум 10 МБ)." };
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
  ];
  if (file.type && !allowedTypes.includes(file.type)) {
    return { error: "Підтримуються лише PDF або зображення (JPG, PNG, WEBP)." };
  }

  const admin = createAdminClient();
  const tokenHash = hashToken(rawToken);

  const { data: tokenRow } = await admin
    .from("parent_portal_tokens")
    .select("id, club_id, player_id, is_active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!tokenRow || !tokenRow.is_active) {
    return { error: "Посилання сімейного доступу недійсне або відкликане." };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const storagePath = `parent-certificates/${tokenRow.player_id}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("consent_scans")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    return { error: `Не вдалося завантажити файл: ${uploadErr.message}` };
  }

  const label = title || "Довідка від педіатра / аналізи";
  const msgRes = await submitParentMessageAction({
    rawToken,
    category: "question",
    message: `📎 [Довідка: ${label}] Файл: ${file.name} (${Math.round(file.size / 1024)} КБ). Збережено для лікаря клубу.`,
  });

  if (msgRes.error) {
    return { error: msgRes.error };
  }

  return { success: true, record: msgRes.record };
}
