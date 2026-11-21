"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertAuth,
  assertDoctor,
  assertTeamStaff,
  assertPlayerAccess,
  isCoach,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { getPlayersConsentStatusBatch } from "@/lib/consents";
import { getClubDate, getClubTimezone } from "@/lib/club-timezone";
import {
  DEFAULT_CLUB_READINESS_CONFIG,
  DEFAULT_READINESS_THRESHOLDS,
  DEFAULT_COACH_CATEGORY_VISIBILITY,
  DEFAULT_MORNING_REMINDER_CONFIG,
  DRAFT_STATUS_LABEL,
  APPROVED_STATUS_LABEL,
  type ClubReadinessConfig,
  type ReadinessThresholds,
  type CoachCategoryVisibility,
  type MorningReminderConfig,
} from "@/lib/readiness-constants";
import {
  evaluatePlayerReadiness,
  sanitizeReadinessForCoach,
  type PlayerReadinessResult,
  type ManualReadinessColor,
  type ReadinessOverride,
} from "@/lib/readiness";
import { isSubscriptionAccessGranted } from "@/lib/billing";
import type { WellnessEntry, TeamComplianceStats } from "@/types/wellness";
import { calculateWearableBaseline } from "@/lib/wearables-baseline";
import type { WearableEntry, WearableBaselineReport } from "@/types/wearables";
import { logAudit } from "@/lib/audit";

function parseClubReadinessConfig(settings: any): ClubReadinessConfig {
  const stored = settings?.readiness_config;
  if (stored && typeof stored === "object") {
    return {
      status: stored.status || "draft",
      statusLabel:
        stored.status === "approved"
          ? stored.statusLabel || APPROVED_STATUS_LABEL
          : DRAFT_STATUS_LABEL,
      approvedByDoctorName: stored.approvedByDoctorName || null,
      approvedByDoctorId: stored.approvedByDoctorId || null,
      approvedAt: stored.approvedAt || null,
      thresholds: {
        ...DEFAULT_READINESS_THRESHOLDS,
        ...(stored.thresholds || {}),
      },
      visibility: {
        ...DEFAULT_COACH_CATEGORY_VISIBILITY,
        ...(stored.visibility || {}),
      },
      morningReminder: {
        ...DEFAULT_MORNING_REMINDER_CONFIG,
        ...(stored.morningReminder || {}),
      },
      wearablesAiScreenshotEnabled: Boolean(stored.wearablesAiScreenshotEnabled),
    };
  }
  return { ...DEFAULT_CLUB_READINESS_CONFIG };
}

/**
 * Отримує налаштування та порогові значення світлофора клубу
 */
export async function getClubReadinessConfigAction(): Promise<ClubReadinessConfig> {
  const authRes = await assertAuth();
  if ("error" in authRes || !authRes.user.clubId) {
    return { ...DEFAULT_CLUB_READINESS_CONFIG };
  }
  const clubId = authRes.user.clubId;
  const supabase = createAdminClient();
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    return parseClubReadinessConfig((club as any)?.settings);
  } catch {}

  return { ...DEFAULT_CLUB_READINESS_CONFIG };
}

/**
 * Зберігає та затверджує порогові значення лікарем клубу
 */
export async function saveClubReadinessConfigAction(input: {
  thresholds: ReadinessThresholds;
  visibility: CoachCategoryVisibility;
  morningReminder?: MorningReminderConfig;
  wearablesAiScreenshotEnabled?: boolean;
  approve: boolean; // true - затвердити лікарем, false - зберегти як чернетку
}): Promise<{ success: boolean; config?: ClubReadinessConfig; error?: string }> {
  const authRes = await assertDoctor();
  if ("error" in authRes) {
    return { success: false, error: authRes.error };
  }

  const { user } = authRes;
  const supabase = createAdminClient();

  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", user.clubId || DEFAULT_CLUB_ID)
      .maybeSingle();

    const currentSettings = (club as any)?.settings || {};

    const nowIso = new Date().toISOString();
    const formattedDate = new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Kyiv",
    }).format(new Date());

    const newConfig: ClubReadinessConfig = {
      status: input.approve ? "approved" : "draft",
      statusLabel: input.approve
        ? `${APPROVED_STATUS_LABEL}: ${user.fullName || "Лікар клубу"}, ${formattedDate}`
        : DRAFT_STATUS_LABEL,
      approvedByDoctorName: input.approve ? user.fullName || "Лікар клубу" : null,
      approvedByDoctorId: input.approve ? user.id : null,
      approvedAt: input.approve ? nowIso : null,
      thresholds: input.thresholds,
      visibility: input.visibility,
      morningReminder: input.morningReminder || { ...DEFAULT_MORNING_REMINDER_CONFIG },
      wearablesAiScreenshotEnabled: Boolean(input.wearablesAiScreenshotEnabled),
    };

    const updatedSettings = {
      ...currentSettings,
      readiness_config: newConfig,
    };

    const { error: updateError } = await supabase
      .from("clubs")
      .update({ settings: updatedSettings } as any)
      .eq("id", user.clubId || DEFAULT_CLUB_ID);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    await logAudit({
      action: input.approve ? "approve_readiness_thresholds" : "save_readiness_draft",
      entity: "clubs",
      entityId: user.clubId || DEFAULT_CLUB_ID,
      userId: user.id,
      clubId: user.clubId || DEFAULT_CLUB_ID,
      meta: {
        doctorName: user.fullName,
        approved: input.approve,
      },
    });

    revalidatePath("/team/readiness");
    revalidatePath("/admin/readiness-settings");
    revalidatePath("/coach-briefing");

    return { success: true, config: newConfig };
  } catch (err: any) {
    return { success: false, error: err.message || "Помилка збереження" };
  }
}

/**
 * Ручна корекція «світлофора» готовності гравця на конкретну дату лікарем або адміном.
 * Вимагає обов'язкову причину (мін. 5 символів) і фіксує дію в audit_log.
 */
export async function overridePlayerReadinessAction(input: {
  playerId: string;
  date?: string;
  status: ManualReadinessColor;
  reason: string;
}): Promise<{
  success: boolean;
  override?: ReadinessOverride;
  error?: string;
}> {
  const authRes = await assertDoctor();
  if ("error" in authRes) {
    return { success: false, error: authRes.error };
  }

  const { user } = authRes;
  const access = await assertPlayerAccess(user, input.playerId, {
    allowCoach: false,
  });
  if ("error" in access) {
    return { success: false, error: access.error };
  }

  if (input.status !== "green" && input.status !== "yellow" && input.status !== "red") {
    return { success: false, error: "Некоректний статус світлофора" };
  }

  const trimmedReason = (input.reason || "").trim();
  if (trimmedReason.length < 5) {
    return {
      success: false,
      error: "Причина корекції має містити щонайменше 5 символів",
    };
  }

  const clubId = access.player.club_id || user.clubId;
  const timezone = await getClubTimezone(clubId);
  const targetDate = input.date || getClubDate(timezone);
  const nowIso = new Date().toISOString();
  const doctorName = user.fullName || "Лікар клубу";
  const supabase = createAdminClient();

  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const curr = (club as any)?.settings || {};
    const overrides = curr.readiness_overrides || {};
    const overrideKey = `${input.playerId}_${targetDate}`;
    const newOverride: ReadinessOverride = {
      status: input.status,
      reason: trimmedReason,
      overriddenByName: doctorName,
      overriddenById: user.id,
      overriddenAt: nowIso,
    };
    overrides[overrideKey] = newOverride;

    const { error: updateErr } = await supabase
      .from("clubs")
      .update({
        settings: {
          ...curr,
          readiness_overrides: overrides,
        },
      } as any)
      .eq("id", clubId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await logAudit({
      action: "override_readiness_status",
      entity: "readiness_overrides",
      entityId: input.playerId,
      userId: user.id,
      clubId,
      meta: {
        date: targetDate,
        status: input.status,
        reason: trimmedReason,
        doctorName,
      },
    });

    revalidatePath("/team/readiness");
    revalidatePath("/coach-briefing");
    revalidatePath("/");

    return { success: true, override: newOverride };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка збереження корекції" };
  }
}

/**
 * Скасування ручної корекції «світлофора» лікарем (повернення до розрахунку за анкетою).
 */
export async function clearPlayerReadinessOverrideAction(input: {
  playerId: string;
  date?: string;
}): Promise<{ success: boolean; error?: string }> {
  const authRes = await assertDoctor();
  if ("error" in authRes) {
    return { success: false, error: authRes.error };
  }

  const { user } = authRes;
  const access = await assertPlayerAccess(user, input.playerId, {
    allowCoach: false,
  });
  if ("error" in access) {
    return { success: false, error: access.error };
  }

  const clubId = access.player.club_id || user.clubId;
  const timezone = await getClubTimezone(clubId);
  const targetDate = input.date || getClubDate(timezone);
  const supabase = createAdminClient();

  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const curr = (club as any)?.settings || {};
    const overrides = { ...(curr.readiness_overrides || {}) };
    const overrideKey = `${input.playerId}_${targetDate}`;
    delete overrides[overrideKey];

    const { error: updateErr } = await supabase
      .from("clubs")
      .update({
        settings: {
          ...curr,
          readiness_overrides: overrides,
        },
      } as any)
      .eq("id", clubId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await logAudit({
      action: "clear_readiness_override",
      entity: "readiness_overrides",
      entityId: input.playerId,
      userId: user.id,
      clubId,
      meta: { date: targetDate },
    });

    revalidatePath("/team/readiness");
    revalidatePath("/coach-briefing");
    revalidatePath("/");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Помилка скасування корекції" };
  }
}

/**
 * 8.5 Фіксація перегляду та підтвердження звіту «Взято до уваги»
 * Кнопка в інтерфейсі тренера і лікаря (без розкриття вмісту для тренера).
 */
export async function acknowledgeReadinessAction(input: {
  playerId: string;
  date?: string;
}): Promise<{
  success: boolean;
  reviewedAt?: string;
  reviewedByRole?: "coach" | "doctor" | "admin";
  reviewedByName?: string;
  error?: string;
}> {
  const authRes = await assertTeamStaff();
  if ("error" in authRes) {
    return { success: false, error: authRes.error };
  }

  const { user } = authRes;
  const access = await assertPlayerAccess(user, input.playerId, {
    allowCoach: true,
  });
  if ("error" in access) {
    return { success: false, error: access.error };
  }

  const role = (user.role as "coach" | "doctor" | "admin") || "coach";
  const clubId = access.player.club_id || user.clubId;
  const timezone = await getClubTimezone(clubId);
  const targetDate = input.date || getClubDate(timezone);
  const nowIso = new Date().toISOString();
  const staffName =
    user.fullName ||
    (role === "doctor" ? "Лікар" : role === "coach" ? "Тренер" : "Адміністратор");

  const supabase = createAdminClient();

  // 1. Оновлюємо wellness_entries якщо запис існує
  try {
    await supabase
      .from("wellness_entries")
      .update({
        reviewed_at: nowIso,
        reviewed_by_role: role,
        reviewed_by_name: staffName,
        acknowledged: true,
      } as any)
      .eq("club_id", clubId)
      .eq("player_id", input.playerId)
      .eq("date", targetDate);
  } catch {}

  // 2. Резервна копія в injury_logs
  try {
    await supabase.from("injury_logs").insert({
      club_id: clubId,
      category: "examination",
      date: targetDate,
      note: `[WELLNESS_ACK] ${JSON.stringify({
        player_id: input.playerId,
        date: targetDate,
        reviewed_at: nowIso,
        reviewed_by_role: role,
        reviewed_by_name: staffName,
      })}`,
    } as any);
  } catch {}

  // 3. Зберігаємо в clubs.settings.wellness_acknowledgements для гарантованої персистентності
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const curr = (club as any)?.settings || {};
    const acks = curr.wellness_acknowledgements || {};
    acks[`${input.playerId}_${targetDate}`] = {
      reviewed_at: nowIso,
      reviewed_by_role: role,
      reviewed_by_name: staffName,
    };

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...curr,
          wellness_acknowledgements: acks,
        },
      } as any)
      .eq("id", clubId);
  } catch {}

  await logAudit({
    action: "acknowledge_wellness",
    entity: "wellness_entries",
    entityId: input.playerId,
    userId: user.id,
    clubId,
    meta: {
      date: targetDate,
      staffName,
      role,
    },
  });

  // 4. Надсилаємо сповіщення гравцю в Telegram (якщо прив'язаний бот)
  try {
    const { data: binding } = await supabase
      .from("player_telegram_bindings")
      .select("telegram_chat_id, status")
      .eq("player_id", input.playerId)
      .eq("status", "active")
      .maybeSingle();

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (binding?.telegram_chat_id && botToken) {
      const parts = targetDate.split("-");
      const formattedDate = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : targetDate;
      const msg =
        `✅ *Вашу анкету переглянуто*\n\n` +
        `Медичний штаб (${staffName}) переглянув(ла) ваш звіт за *${formattedDate}* та взяв(ла) його до уваги.\n\n` +
        `Дякуємо за регулярність! Гарного та продуктивного тренування! ⚽`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: binding.telegram_chat_id,
          text: msg,
          parse_mode: "Markdown",
        }),
        signal: AbortSignal.timeout(15000),
      });
    }
  } catch (tgErr) {
    console.warn("Could not send Telegram notification on acknowledge:", tgErr);
  }

  revalidatePath("/team/readiness");
  revalidatePath("/rehab-portal");
  revalidatePath("/coach-briefing");
  revalidatePath("/availability");
  revalidatePath(`/players/${input.playerId}`);

  return {
    success: true,
    reviewedAt: nowIso,
    reviewedByRole: role,
    reviewedByName: staffName,
  };
}

function pickNonEmptyStringArray(
  primary?: string[] | null,
  fallback?: string[] | null
): string[] {
  if (Array.isArray(primary) && primary.length > 0) return primary;
  if (Array.isArray(fallback) && fallback.length > 0) return fallback;
  return [];
}

function mergeRichWellnessFields(
  base: WellnessEntry,
  incoming: Partial<WellnessEntry>
): WellnessEntry {
  return {
    ...base,
    pain_locations: pickNonEmptyStringArray(base.pain_locations, incoming.pain_locations),
    pain_symptoms: pickNonEmptyStringArray(base.pain_symptoms, incoming.pain_symptoms),
    pain_comment: base.pain_comment || incoming.pain_comment || null,
    body_temperature: base.body_temperature ?? incoming.body_temperature ?? null,
    illness_symptoms: pickNonEmptyStringArray(base.illness_symptoms, incoming.illness_symptoms),
    illness_comment: base.illness_comment || incoming.illness_comment || null,
    comment: base.comment || incoming.comment || null,
    doctor_recommendation:
      base.doctor_recommendation || incoming.doctor_recommendation || null,
  };
}

/**
 * Отримує статус готовності команди для екрана тренера (8.4)
 */
export async function getTeamReadinessAction(params?: {
  teamId?: string;
  date?: string;
}): Promise<{
  success: boolean;
  players: PlayerReadinessResult[];
  teams: { id: string; name: string }[];
  currentTeamId: string;
  currentDate: string;
  userRole: "coach" | "doctor" | "admin";
  config: ClubReadinessConfig;
  teamCompliance: TeamComplianceStats;
  error?: string;
}> {
  const authRes = await assertAuth();
  if ("error" in authRes) {
    return {
      success: false,
      players: [],
      teams: [],
      currentTeamId: "",
      currentDate: "",
      userRole: "coach",
      config: DEFAULT_CLUB_READINESS_CONFIG,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
      error: authRes.error,
    };
  }

  const { user } = authRes;
  const isCoachUser = isCoach(user.role);
  const effectiveRole = user.role as "coach" | "doctor" | "admin";
  const supabase = createAdminClient();

  const clubId = user.clubId || DEFAULT_CLUB_ID;

  // 1. Отримуємо команди та налаштування клубу (часовий пояс, пороги, корекції, актуалізація) за 1 раз
  const [{ data: rawTeams }, { data: clubRow }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, sort_order")
      .eq("club_id", clubId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle(),
  ]);

  const clubSettings = ((clubRow as any)?.settings || {}) as Record<string, any>;
  const timezone =
    typeof clubSettings.timezone === "string" && clubSettings.timezone.trim().length > 0
      ? clubSettings.timezone.trim()
      : "Europe/Kyiv";
  const today = params?.date || getClubDate(timezone);
  const config = parseClubReadinessConfig(clubSettings);
  const clubAcknowledgements: Record<string, any> = clubSettings.wellness_acknowledgements || {};
  const clubOverrides: Record<string, ReadinessOverride> = clubSettings.readiness_overrides || {};
  const storedWellnessMap: Record<string, any> = clubSettings.wellness_entries_store || {};

  const coachTeams = user.teamIds && user.teamIds.length > 0
    ? user.teamIds
    : (user.teamId ? [user.teamId] : []);

  const visibleTeams = isCoachUser
    ? (rawTeams ?? []).filter((t) => coachTeams.includes(t.id)).map((t) => ({ id: t.id, name: t.name }))
    : (rawTeams ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Якщо тренер, він має доступ тільки до своїх призначених команд
  let selectedTeamId = params?.teamId || "";
  if (isCoachUser) {
    if (coachTeams.length === 0) {
      return {
        success: false,
        players: [],
        teams: [],
        currentTeamId: "",
        currentDate: "",
        userRole: effectiveRole,
        config: DEFAULT_CLUB_READINESS_CONFIG,
        teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
        error: "Ваш обліковий запис очікує призначення команди адміністратором або лікарем клубу.",
      };
    }
    if (!selectedTeamId || !coachTeams.includes(selectedTeamId)) {
      selectedTeamId = coachTeams[0];
    }
  } else if (!selectedTeamId && visibleTeams.length > 0) {
    selectedTeamId = visibleTeams[0].id;
  }

  // Перевіряємо права доступу до команди
  const staffCheck = await assertTeamStaff(selectedTeamId);
  if ("error" in staffCheck) {
    return {
      success: false,
      players: [],
      teams: visibleTeams,
      currentTeamId: selectedTeamId,
      currentDate: "",
      userRole: effectiveRole,
      config: DEFAULT_CLUB_READINESS_CONFIG,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
      error: staffCheck.error,
    };
  }

  // 2. Отримуємо гравців обраної команди (включаючи date_of_birth для пакетної перевірки згод)
  if (visibleTeams.length === 0) {
    return {
      success: true,
      players: [],
      teams: visibleTeams,
      currentTeamId: selectedTeamId,
      currentDate: today,
      userRole: effectiveRole,
      config,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
    };
  }

  let playersQuery = supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      date_of_birth,
      position,
      team_id,
      teams ( id, name )
    `)
    .eq("club_id", clubId)
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  if (selectedTeamId) {
    playersQuery = playersQuery.eq("team_id", selectedTeamId);
  } else {
    playersQuery = playersQuery.in(
      "team_id",
      visibleTeams.map((t: any) => t.id)
    );
  }

  const { data: playersData, error: playersError } = await playersQuery;
  if (playersError) {
    return {
      success: false,
      players: [],
      teams: visibleTeams,
      currentTeamId: selectedTeamId,
      currentDate: today,
      userRole: effectiveRole,
      config,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
      error: playersError.message,
    };
  }

  const playerList = playersData ?? [];
  if (playerList.length === 0) {
    return {
      success: true,
      players: [],
      teams: visibleTeams,
      currentTeamId: selectedTeamId,
      currentDate: today,
      userRole: effectiveRole,
      config,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
    };
  }

  const playerIds = playerList.map((p) => p.id);
  const playerIdSet = new Set(playerIds);
  const dobMap = new Map<string, string>(
    playerList.map((p: any) => [p.id, p.date_of_birth || ""])
  );

  // 3. Діапазон 28 днів для вибірки анкет і біометрії
  const todayDateObj = new Date(today);
  const past28DateObj = new Date(todayDateObj);
  past28DateObj.setDate(past28DateObj.getDate() - 28);
  const minDateStr = past28DateObj.toISOString().split("T")[0];
  const nowIso = new Date().toISOString();

  // 4. Паралельно завантажуємо пристрої, анкети, носимі, підписки та статуси згод (без N+1)
  const [devicesData, weData, wsData, wEntries, subsData, consentStatusMap] = await Promise.all([
    (async () => {
      try {
        const { data } = await supabase
          .from("player_devices")
          .select("player_id")
          .in("player_id", playerIds)
          .is("revoked_at", null)
          .gt("expires_at", nowIso);
        return data ?? [];
      } catch {
        return [] as any[];
      }
    })(),
    (async () => {
      try {
        const { data, error } = await supabase
          .from("wellness_entries")
          .select("*")
          .in("player_id", playerIds)
          .gte("date", minDateStr)
          .lte("date", today)
          .order("date", { ascending: true });
        return !error && data ? (data as WellnessEntry[]) : ([] as WellnessEntry[]);
      } catch {
        return [] as WellnessEntry[];
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase
          .from("wellness_surveys")
          .select("*")
          .in("player_id", playerIds)
          .gte("date", minDateStr)
          .lte("date", today)
          .order("date", { ascending: true });
        return data ?? [];
      } catch {
        return [] as any[];
      }
    })(),
    !isCoachUser
      ? (async () => {
          try {
            const { data } = await supabase
              .from("wearable_entries")
              .select("*")
              .in("player_id", playerIds)
              .gte("date", minDateStr)
              .lte("date", today)
              .order("date", { ascending: true });
            return data ?? [];
          } catch {
            return [] as any[];
          }
        })()
      : Promise.resolve([] as any[]),
    (async () => {
      try {
        const { data } = await supabase
          .from("player_subscriptions")
          .select("player_id, status, current_period_end, grace_period_ends_at")
          .in("player_id", playerIds);
        return data ?? [];
      } catch {
        return [] as any[];
      }
    })(),
    getPlayersConsentStatusBatch({
      playerIds,
      clubId,
      scope: "data_processing",
      playerDobMap: dobMap,
    }),
  ]);

  const activeDevicePlayerIds = new Set<string>(
    devicesData.map((d: any) => d.player_id)
  );

  // Зведення анкет з wellness_entries, wellness_surveys та settings.wellness_entries_store
  const entriesByKey = new Map<string, WellnessEntry>();
  for (const entry of weData) {
    entriesByKey.set(`${entry.player_id}_${entry.date}`, entry);
  }

  for (const s of wsData) {
    const key = `${s.player_id}_${s.date}`;
    let extra: any = {};
    if (s.notes && typeof s.notes === "string" && s.notes.startsWith("{")) {
      try { extra = JSON.parse(s.notes); } catch {}
    }
    const surveyEntry: WellnessEntry = {
      id: s.id,
      club_id: s.club_id || clubId,
      player_id: s.player_id,
      date: s.date,
      sleep_quality: s.sleep_quality,
      fatigue: s.fatigue_level,
      soreness: s.muscle_soreness,
      stress: s.stress_level,
      sleep_hours: extra.sleep_hours ?? null,
      pain: Boolean(extra.pain),
      pain_vas: extra.pain_vas ?? null,
      pain_locations: extra.pain_locations || (s.soreness_location ? [s.soreness_location] : []),
      pain_symptoms: extra.pain_symptoms || extra.painSymptoms || [],
      pain_comment: extra.pain_comment || extra.painComment || null,
      illness: Boolean(extra.illness),
      body_temperature: extra.body_temperature ?? extra.temperature ?? null,
      illness_symptoms: extra.illness_symptoms || extra.illnessSymptoms || [],
      illness_comment: extra.illness_comment || extra.illnessComment || null,
      comment: extra.comment || (s.notes?.startsWith("{") ? null : s.notes),
      submitted_at: s.created_at,
      source: extra.source || "player",
      doctor_recommendation: extra.doctor_recommendation || extra.doctorRecommendation || null,
    };

    const existing = entriesByKey.get(key);
    entriesByKey.set(
      key,
      existing ? mergeRichWellnessFields(existing, surveyEntry) : surveyEntry
    );
  }

  for (const [, storedEntry] of Object.entries(storedWellnessMap)) {
    const entry = storedEntry as WellnessEntry;
    if (playerIdSet.has(entry.player_id) && entry.date >= minDateStr && entry.date <= today) {
      const key = `${entry.player_id}_${entry.date}`;
      const existing = entriesByKey.get(key);
      entriesByKey.set(
        key,
        existing ? mergeRichWellnessFields(existing, entry) : entry
      );
    }
  }

  const wellnessEntriesList: WellnessEntry[] = Array.from(entriesByKey.values());

  // Групуємо анкети по player_id та накладаємо acknowledgements
  const entriesByPlayer = new Map<string, WellnessEntry[]>();
  for (const rawEntry of wellnessEntriesList) {
    const entry = { ...(rawEntry as WellnessEntry) };
    const ackKey = `${entry.player_id}_${entry.date}`;
    const clubAck = clubAcknowledgements[ackKey];
    if (clubAck) {
      entry.acknowledged = true;
      entry.reviewed_at = entry.reviewed_at || clubAck.reviewed_at;
      entry.reviewed_by_role = entry.reviewed_by_role || clubAck.reviewed_by_role;
      entry.reviewed_by_name = entry.reviewed_by_name || clubAck.reviewed_by_name;
    }

    const list = entriesByPlayer.get(entry.player_id) || [];
    list.push(entry);
    entriesByPlayer.set(entry.player_id, list);
  }

  // Групуємо wearable_entries по player_id (8.8)
  const wearablesByPlayer = new Map<string, WearableEntry[]>();
  if (!isCoachUser) {
    for (const w of wEntries) {
      const list = wearablesByPlayer.get(w.player_id) || [];
      list.push(w as WearableEntry);
      wearablesByPlayer.set(w.player_id, list);
    }
  }

  // Мапа B2B2C підписок гравців
  const subByPlayer = new Map<string, any>();
  for (const s of subsData) {
    subByPlayer.set(s.player_id, s);
  }

  // 5. Розрахунок світлофора для кожного гравця (без жодного await у циклі)
  const results: PlayerReadinessResult[] = [];

  for (const p of playerList) {
    const consentInfo = consentStatusMap.get(p.id);
    const hasConsent = consentInfo?.isMinor
      ? consentInfo.status === "granted"
      : true;

    const pEntries = entriesByPlayer.get(p.id) || [];
    const hasActiveDevice = activeDevicePlayerIds.has(p.id) || pEntries.length > 0;

    // Перевірка активності підписки гравця
    const pSub = subByPlayer.get(p.id);
    const isSubscriptionLocked = pSub
      ? !isSubscriptionAccessGranted({
          status: pSub.status,
          currentPeriodEnd: pSub.current_period_end,
          gracePeriodEndsAt: pSub.grace_period_ends_at,
        })
      : false;

    // Розрахунок особистої норми з носимих пристроїв для лікаря/адміна
    let pWearablesReport: WearableBaselineReport | null = null;
    if (!isCoachUser) {
      const pWearables = wearablesByPlayer.get(p.id) || [];
      if (pWearables.length > 0) {
        const lastEntry = pWearables[pWearables.length - 1];
        pWearablesReport = calculateWearableBaseline({
          entries: pWearables,
          targetDeviceType: lastEntry.device_type,
          targetHrvMetric: lastEntry.hrv_metric,
          todayDate: today,
          playerId: p.id,
        });
      }
    }

    const readiness = evaluatePlayerReadiness({
      todayDate: today,
      hasConsent,
      hasActiveDevice,
      isSubscriptionLocked,
      entriesLast28Days: pEntries,
      thresholds: config.thresholds,
      visibility: config.visibility,
      forRole: effectiveRole,
      playerInfo: {
        id: p.id,
        name: `${p.last_name} ${p.first_name}`.trim(),
        position: p.position || undefined,
        teamId: p.team_id || undefined,
        teamName: (p.teams as any)?.name || undefined,
      },
      wearablesReport: pWearablesReport,
      manualOverride: clubOverrides[`${p.id}_${today}`] || null,
    });

    if (isCoachUser) {
      results.push(sanitizeReadinessForCoach(readiness));
    } else {
      results.push(readiness);
    }
  }

  // 8.5 Розрахунок командної статистики заповнення (7 та 28 днів)
  const activeCount = results.length;
  const avgCompliance7 =
    activeCount > 0
      ? Math.round(
          results.reduce((acc, r) => acc + (r.compliance7Days || 0), 0) / activeCount
        )
      : 0;
  const avgCompliance28 =
    activeCount > 0
      ? Math.round(
          results.reduce((acc, r) => acc + (r.compliance28Days || 0), 0) / activeCount
        )
      : 0;

  const teamCompliance: TeamComplianceStats = {
    teamId: selectedTeamId,
    rate7Days: avgCompliance7,
    rate28Days: avgCompliance28,
    activePlayersCount: activeCount,
  };

  return {
    success: true,
    players: results,
    teams: visibleTeams,
    currentTeamId: selectedTeamId,
    currentDate: today,
    userRole: effectiveRole,
    config,
    teamCompliance,
  };
}
