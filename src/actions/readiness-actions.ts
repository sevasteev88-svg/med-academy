"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertAuth,
  assertDoctor,
  assertTeamStaff,
  isCoach,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
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
} from "@/lib/readiness";
import type { WellnessEntry, TeamComplianceStats } from "@/types/wellness";
import { calculateWearableBaseline } from "@/lib/wearables-baseline";
import type { WearableEntry, WearableBaselineReport } from "@/types/wearables";
import { logAudit } from "@/lib/audit";

/**
 * Отримує налаштування та порогові значення світлофора клубу
 */
export async function getClubReadinessConfigAction(): Promise<ClubReadinessConfig> {
  const supabase = createAdminClient();
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", DEFAULT_CLUB_ID)
      .maybeSingle();

    const stored = (club as any)?.settings?.readiness_config;
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
  const authRes = await assertAuth();
  if ("error" in authRes) {
    return { success: false, error: authRes.error };
  }

  const { user } = authRes;
  const role = (user.role as "coach" | "doctor" | "admin") || "coach";
  const clubId = user.clubId || DEFAULT_CLUB_ID;
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

  // 1. Отримуємо команди клубу
  const { data: rawTeams } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (rawTeams ?? []).map((t) => ({ id: t.id, name: t.name }));

  // Якщо тренер, він має доступ тільки до своєї команди
  let selectedTeamId = params?.teamId || "";
  if (isCoachUser) {
    selectedTeamId = user.teamId || teams[0]?.id || "";
  } else if (!selectedTeamId && teams.length > 0) {
    selectedTeamId = teams[0].id;
  }

  // Перевіряємо права доступу до команди
  const staffCheck = await assertTeamStaff(selectedTeamId);
  if ("error" in staffCheck) {
    return {
      success: false,
      players: [],
      teams,
      currentTeamId: selectedTeamId,
      currentDate: "",
      userRole: effectiveRole,
      config: DEFAULT_CLUB_READINESS_CONFIG,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
      error: staffCheck.error,
    };
  }

  // 2. Часовий пояс та дата клубу
  const timezone = await getClubTimezone(user.clubId || DEFAULT_CLUB_ID);
  const today = params?.date || getClubDate(timezone);

  // 3. Конфігурація клубу
  const config = await getClubReadinessConfigAction();

  // Отримуємо збережені acknowledgements із налаштувань клубу для максимальної надійності
  let clubAcknowledgements: Record<string, any> = {};
  try {
    const { data: clubData } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", user.clubId || DEFAULT_CLUB_ID)
      .maybeSingle();
    clubAcknowledgements = (clubData as any)?.settings?.wellness_acknowledgements || {};
  } catch {}

  // 4. Отримуємо гравців обраної команди
  let playersQuery = supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      position,
      team_id,
      teams ( id, name )
    `)
    .is("archived_at", null)
    .order("last_name", { ascending: true });

  if (selectedTeamId) {
    playersQuery = playersQuery.eq("team_id", selectedTeamId);
  }

  const { data: playersData, error: playersError } = await playersQuery;
  if (playersError) {
    return {
      success: false,
      players: [],
      teams,
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
      teams,
      currentTeamId: selectedTeamId,
      currentDate: today,
      userRole: effectiveRole,
      config,
      teamCompliance: { rate7Days: 0, rate28Days: 0, activePlayersCount: 0 },
    };
  }

  const playerIds = playerList.map((p) => p.id);

  // 5. Отримуємо активні пристрої гравців (чи активовано хоча б 1 пристрій)
  const { data: devicesData } = await supabase
    .from("player_devices")
    .select("player_id, status")
    .in("player_id", playerIds)
    .eq("status", "active");

  const activeDevicePlayerIds = new Set<string>(
    (devicesData ?? []).map((d) => d.player_id)
  );

  // 6. Розраховуємо діапазон 28 днів для вибірки анкет
  const todayDateObj = new Date(today);
  const past28DateObj = new Date(todayDateObj);
  past28DateObj.setDate(past28DateObj.getDate() - 28);
  const minDateStr = past28DateObj.toISOString().split("T")[0];

  // 7. Отримуємо всі анкети за останні 28 днів для цих гравців
  const { data: wellnessEntries } = await supabase
    .from("wellness_entries")
    .select("*")
    .in("player_id", playerIds)
    .gte("date", minDateStr)
    .lte("date", today)
    .order("date", { ascending: true });

  // Групуємо анкети по player_id та накладаємо acknowledgements
  const entriesByPlayer = new Map<string, WellnessEntry[]>();
  for (const rawEntry of wellnessEntries ?? []) {
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

  // 7b. Для лікаря та адміна: отримуємо wearable_entries за останні 28 днів (8.8)
  const wearablesByPlayer = new Map<string, WearableEntry[]>();
  if (!isCoachUser) {
    try {
      const { data: wEntries } = await supabase
        .from("wearable_entries")
        .select("*")
        .in("player_id", playerIds)
        .gte("date", minDateStr)
        .lte("date", today)
        .order("date", { ascending: true });

      for (const w of wEntries ?? []) {
        const list = wearablesByPlayer.get(w.player_id) || [];
        list.push(w as WearableEntry);
        wearablesByPlayer.set(w.player_id, list);
      }
    } catch {}
  }

  // 8. Перевірка згод та розрахунок світлофора для кожного гравця
  const results: PlayerReadinessResult[] = [];

  for (const p of playerList) {
    // Перевірка згоди (неповнолітні потребують data_processing)
    const consentSummary = await getPlayerConsentSummary(p.id);
    let hasConsent = true;
    if (consentSummary.isMinor) {
      const dp = consentSummary.scopes["data_processing"];
      if (!dp || dp.status !== "granted") {
        hasConsent = false;
      }
    }

    const hasActiveDevice = activeDevicePlayerIds.has(p.id);
    const pEntries = entriesByPlayer.get(p.id) || [];

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
    teams,
    currentTeamId: selectedTeamId,
    currentDate: today,
    userRole: effectiveRole,
    config,
    teamCompliance,
  };
}
