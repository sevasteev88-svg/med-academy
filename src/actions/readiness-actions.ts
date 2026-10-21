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
  DRAFT_STATUS_LABEL,
  APPROVED_STATUS_LABEL,
  type ClubReadinessConfig,
  type ReadinessThresholds,
  type CoachCategoryVisibility,
} from "@/lib/readiness-constants";
import {
  evaluatePlayerReadiness,
  sanitizeReadinessForCoach,
  type PlayerReadinessResult,
} from "@/lib/readiness";
import type { WellnessEntry } from "@/types/wellness";
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
      error: staffCheck.error,
    };
  }

  // 2. Часовий пояс та дата клубу
  const timezone = await getClubTimezone(user.clubId || DEFAULT_CLUB_ID);
  const today = params?.date || getClubDate(timezone);

  // 3. Конфігурація клубу
  const config = await getClubReadinessConfigAction();

  // 4. Отримуємо гравців обраної команди
  let playersQuery = supabase
    .from("players")
    .select(`
      id,
      first_name,
      last_name,
      position,
      team_id,
      birth_date,
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

  // Групуємо анкети по player_id
  const entriesByPlayer = new Map<string, WellnessEntry[]>();
  for (const entry of wellnessEntries ?? []) {
    const list = entriesByPlayer.get(entry.player_id) || [];
    list.push(entry as WellnessEntry);
    entriesByPlayer.set(entry.player_id, list);
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
    });

    if (isCoachUser) {
      results.push(sanitizeReadinessForCoach(readiness));
    } else {
      results.push(readiness);
    }
  }

  return {
    success: true,
    players: results,
    teams,
    currentTeamId: selectedTeamId,
    currentDate: today,
    userRole: effectiveRole,
    config,
  };
}
