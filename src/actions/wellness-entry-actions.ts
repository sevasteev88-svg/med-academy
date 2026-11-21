"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  assertAuth,
  assertTeamStaff,
  assertPlayerOrStaffAccess,
  isCoach,
  DEFAULT_CLUB_ID,
} from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
import { getClubDate, getPlayerClubTimezone } from "@/lib/club-timezone";
import {
  PAIN_LOCATIONS_LIST,
  type WellnessEntry,
  type WellnessEntrySource,
  type WellnessScore,
  type CoachWellnessEntry,
} from "@/types/wellness";
import { logAudit } from "@/lib/audit";
import { submitPlayerSelfRpeAction } from "./training-session-actions";
import {
  escapeTelegramHtml,
  sendClubMedicalChatAlert,
} from "@/lib/medical-telegram";

export interface SubmitWellnessEntryInput {
  playerId: string;
  sleepQuality: WellnessScore;
  fatigue: WellnessScore;
  soreness: WellnessScore;
  stress: WellnessScore;
  sleepHours?: number | null;
  pain: boolean;
  painVas?: number | null;
  painLocations?: string[] | null;
  painSymptoms?: string[] | null;
  painComment?: string | null;
  illness: boolean;
  temperature?: number | string | null;
  illnessSymptoms?: string[] | null;
  illnessComment?: string | null;
  comment?: string | null;
  trainingRpe?: number | null;
  source: WellnessEntrySource;
  entryDate?: string;
}

/**
 * 4. Перевірка доступу до анкети:
 * Для гравців молодше 18 років без згоди data_processing форма недоступна («Потрібна згода батьків»).
 */
export async function checkPlayerWellnessAccessAction(playerId: string): Promise<{
  canFill: boolean;
  reason?: string;
  isMinor: boolean;
  age: number;
}> {
  if (!playerId) {
    return { canFill: false, reason: "Не вказано гравця", isMinor: false, age: 18 };
  }

  const authCheck = await assertPlayerOrStaffAccess(playerId, { allowCoach: true });
  if ("error" in authCheck) {
    return { canFill: false, reason: authCheck.error, isMinor: false, age: 18 };
  }

  const summary = await getPlayerConsentSummary(playerId);

  if (summary.isMinor) {
    const dataConsent = summary.scopes["data_processing"];
    if (!dataConsent || dataConsent.status !== "granted") {
      return {
        canFill: false,
        reason: "Потрібна згода батьків",
        isMinor: true,
        age: summary.age,
      };
    }
  }

  return {
    canFill: true,
    isMinor: summary.isMinor,
    age: summary.age,
  };
}

function mapWellnessSurveyRow(s: any, clubId: string): WellnessEntry {
  let extra: any = {};
  if (s.notes && typeof s.notes === "string" && s.notes.startsWith("{")) {
    try { extra = JSON.parse(s.notes); } catch {}
  }
  return {
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
}

/**
 * Отримує сьогоднішній запис анкети для гравця (якщо вже заповнено).
 */
export async function getTodayWellnessEntryForPlayerAction(playerId: string): Promise<{
  entry: WellnessEntry | null;
  today: string;
  timezone: string;
}> {
  const authCheck = await assertPlayerOrStaffAccess(playerId, { allowCoach: true });
  if ("error" in authCheck) {
    return { entry: null, today: "", timezone: "Europe/Kyiv" };
  }

  const { clubId, timezone } = await getPlayerClubTimezone(playerId);
  const today = getClubDate(timezone);
  const supabase = createAdminClient();

  // 1. Спершу перевіряємо таблицю wellness_entries
  try {
    const { data } = await supabase
      .from("wellness_entries")
      .select("*")
      .eq("player_id", playerId)
      .eq("date", today)
      .maybeSingle();

    if (data) {
      return { entry: data as WellnessEntry, today, timezone };
    }
  } catch {}

  // 1b. Перевіряємо таблицю wellness_surveys у Supabase
  try {
    const { data: s } = await supabase
      .from("wellness_surveys")
      .select("*")
      .eq("player_id", playerId)
      .eq("date", today)
      .maybeSingle();

    if (s) {
      return { entry: mapWellnessSurveyRow(s, clubId), today, timezone };
    }
  } catch {}

  // 1c. Перевіряємо клубно-збережені анкети в settings.wellness_entries_store
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();
    const stored = (club as any)?.settings?.wellness_entries_store?.[`${playerId}_${today}`];
    if (stored) {
      return { entry: stored as WellnessEntry, today, timezone };
    }
  } catch {}

  // 2. Резервна перевірка в injury_logs (з екрануванням спецсимволів LIKE та фільтром club_id)
  try {
    const safePlayerId = playerId.replace(/[%_\\]/g, "\\$&");
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("note")
      .eq("club_id", clubId)
      .like("note", `[WELLNESS_ENTRY] %"player_id":"${safePlayerId}"%"date":"${today}"%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (logs && logs.length > 0) {
      const raw = logs[0].note.replace("[WELLNESS_ENTRY] ", "");
      const entry = JSON.parse(raw) as WellnessEntry;
      return { entry, today, timezone };
    }
  } catch {}

  return { entry: null, today, timezone };
}

/**
 * 1, 4, 5. Збереження / Upsert щоденної анкети самопочуття:
 * - Перевірка згоди батьків для < 18 років.
 * - Розрахунок поточної дати за часовим поясом клубу.
 * - Один запис на гравця та день (upsert).
 * - Правка дозволена ТІЛЬКИ в той самий день.
 */
export async function submitWellnessEntryAction(input: SubmitWellnessEntryInput) {
  const authCheck = await assertPlayerOrStaffAccess(input.playerId, { allowCoach: true });
  if ("error" in authCheck) {
    return { error: authCheck.error };
  }

  // 1. Перевірка згоди батьків для неповнолітніх (< 18 років)
  const access = await checkPlayerWellnessAccessAction(input.playerId);
  if (!access.canFill) {
    return {
      error: "Потрібна згода батьків на обробку персональних даних.",
      requiresConsent: true,
    };
  }

  // 2. Часовий пояс клубу та визначення поточної клубної дати
  const { clubId, timezone } = await getPlayerClubTimezone(input.playerId);
  const clubToday = getClubDate(timezone);
  const targetDate = input.entryDate || clubToday;

  // 3. Правило редагування: ТІЛЬКИ в той самий день за часовим поясом клубу
  if (targetDate !== clubToday) {
    return {
      error: `Правка анкети самопочуття дозволена тільки в той самий день (дата анкети: ${targetDate}, сьогодні: ${clubToday}).`,
    };
  }

  const supabase = createAdminClient();

  const entryPayload: WellnessEntry = {
    id: `well_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    club_id: clubId,
    player_id: input.playerId,
    date: targetDate,
    sleep_quality: input.sleepQuality,
    fatigue: input.fatigue,
    soreness: input.soreness,
    stress: input.stress,
    sleep_hours: input.sleepHours ?? null,
    pain: Boolean(input.pain),
    pain_vas: input.pain && input.painVas !== undefined && input.painVas !== null ? Number(input.painVas) : null,
    pain_locations: input.pain && input.painLocations?.length ? input.painLocations : [],
    pain_symptoms: input.pain && input.painSymptoms?.length ? input.painSymptoms : [],
    pain_comment: input.pain && input.painComment ? input.painComment.trim() : null,
    illness: Boolean(input.illness),
    body_temperature: input.illness && input.temperature ? input.temperature : null,
    illness_symptoms: input.illness && input.illnessSymptoms?.length ? input.illnessSymptoms : [],
    illness_comment: input.illness && input.illnessComment ? input.illnessComment.trim() : null,
    comment: input.comment?.trim() || null,
    submitted_at: new Date().toISOString(),
    source: input.source || "player",
  };

  // 4. Upsert у таблицю wellness_entries
  let isSavedInDb = false;
  try {
    const { error: upsertErr } = await supabase
      .from("wellness_entries")
      .upsert(
        {
          ...entryPayload,
          pain_locations: entryPayload.pain_locations || [],
        } as any,
        { onConflict: "player_id, date" }
      );

    if (!upsertErr) {
      isSavedInDb = true;
    }
  } catch {}

  // 4b. Завжди зберігаємо в wellness_surveys (існуюча таблиця у БД Supabase)
  try {
    const totalScore =
      Number(input.sleepQuality) +
      Number(input.fatigue) +
      Number(input.soreness) +
      Number(input.stress);
    const readinessStatus =
      totalScore >= 16 ? "optimal" : totalScore >= 12 ? "warning" : "risk";
    const extraDetails = {
      sleep_hours: entryPayload.sleep_hours,
      pain: entryPayload.pain,
      pain_vas: entryPayload.pain_vas,
      pain_locations: entryPayload.pain_locations,
      pain_symptoms: entryPayload.pain_symptoms,
      pain_comment: entryPayload.pain_comment,
      illness: entryPayload.illness,
      body_temperature: entryPayload.body_temperature,
      illness_symptoms: entryPayload.illness_symptoms,
      illness_comment: entryPayload.illness_comment,
      comment: entryPayload.comment,
      source: entryPayload.source,
    };

    const { error: wsErr } = await supabase.from("wellness_surveys").upsert(
      {
        id: crypto.randomUUID(),
        club_id: clubId,
        player_id: input.playerId,
        date: targetDate,
        sleep_quality: input.sleepQuality,
        fatigue_level: input.fatigue,
        muscle_soreness: input.soreness,
        stress_level: input.stress,
        soreness_location: input.painLocations?.[0] || null,
        total_score: totalScore,
        readiness_status: readinessStatus,
        notes: JSON.stringify(extraDetails),
        created_at: entryPayload.submitted_at,
      } as any,
      { onConflict: "player_id, date" }
    );
    if (!wsErr) {
      isSavedInDb = true;
    }
  } catch {}

  // 4c. Зберігаємо в clubs.settings.wellness_entries_store для 100% гарантованої персистентності
  try {
    const { data: clubData } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const currSettings = (clubData as any)?.settings || {};
    const store = currSettings.wellness_entries_store || {};
    store[`${input.playerId}_${targetDate}`] = entryPayload;

    await supabase
      .from("clubs")
      .update({
        settings: {
          ...currSettings,
          wellness_entries_store: store,
        },
      } as any)
      .eq("id", clubId);
  } catch {}

  // 5. Завжди зберігаємо надійну резервну копію у injury_logs для повної сумісності (якщо є відкрита травма)
  try {
    let targetInjuryId: string | null = null;
    const { data: existingInj } = await supabase
      .from("injuries")
      .select("id")
      .eq("player_id", input.playerId)
      .order("date_of_injury", { ascending: false })
      .limit(1);

    if (existingInj && existingInj.length > 0) {
      targetInjuryId = existingInj[0].id;
      await supabase.from("injury_logs").insert({
        club_id: clubId,
        injury_id: targetInjuryId,
        category: "examination",
        date: targetDate,
        note: `[WELLNESS_ENTRY] ${JSON.stringify(entryPayload)}`,
      } as any);

      const totalScore = Number(input.sleepQuality) + Number(input.fatigue) + Number(input.soreness) + Number(input.stress);
      const legacySurvey = {
        id: entryPayload.id,
        player_id: input.playerId,
        date: targetDate,
        sleep_quality: input.sleepQuality,
        fatigue_level: input.fatigue,
        muscle_soreness: input.soreness,
        stress_level: input.stress,
        total_score: totalScore,
        readiness_status: totalScore >= 16 ? "optimal" : totalScore >= 12 ? "warning" : "risk",
        notes: input.comment || null,
        created_at: entryPayload.submitted_at,
      };
      await supabase.from("injury_logs").insert({
        club_id: clubId,
        injury_id: targetInjuryId,
        category: "note",
        date: targetDate,
        note: `[WELLNESS] ${JSON.stringify(legacySurvey)}`,
      } as any);
    }
  } catch {}

  // 8.6 Фіксація власної оцінки навантаження тренування гравцем (RPE)
  if (
    input.trainingRpe !== undefined &&
    input.trainingRpe !== null &&
    input.trainingRpe >= 0 &&
    input.trainingRpe <= 10
  ) {
    try {
      await submitPlayerSelfRpeAction({
        playerId: input.playerId,
        date: targetDate,
        playerRpe: Number(input.trainingRpe) as any,
      });
    } catch {}
  }

  // Дублюємо будь-який біль, ознаки хвороби або коментар гравця у закритий мед-чат клубу
  const hasPain =
    Boolean(entryPayload.pain) ||
    (entryPayload.pain_vas !== null &&
      entryPayload.pain_vas !== undefined &&
      Number(entryPayload.pain_vas) > 0);
  const hasIllness = Boolean(entryPayload.illness);
  const hasAnyComment = Boolean(
    entryPayload.comment || entryPayload.pain_comment || entryPayload.illness_comment
  );

  if ((hasPain || hasIllness || hasAnyComment) && entryPayload.source !== "staff") {
    try {
      const { data: playerInfo } = await supabase
        .from("players")
        .select("first_name, last_name, teams(name)")
        .eq("id", input.playerId)
        .maybeSingle();

      const fullName = playerInfo
        ? `${(playerInfo as any).last_name || ""} ${(playerInfo as any).first_name || ""}`.trim() || "Гравець"
        : "Гравець";
      const teamName = (playerInfo as any)?.teams?.name || "";
      const painVasVal =
        entryPayload.pain_vas !== null && entryPayload.pain_vas !== undefined
          ? Number(entryPayload.pain_vas)
          : null;
      const severityIcon = (painVasVal !== null && painVasVal >= 7) || hasIllness ? "🚨" : "🩺";

      const lines = [
        `${severityIcon} <b>Ранкове самопочуття гравця</b>`,
        `👤 <b>Гравець:</b> ${escapeTelegramHtml(fullName)}${teamName ? ` (${escapeTelegramHtml(teamName)})` : ""}`,
      ];

      if (hasPain) {
        const locLabels = (entryPayload.pain_locations || []).map(
          (id) => PAIN_LOCATIONS_LIST.find((l) => l.id === id)?.label || id
        );
        const painParts = [
          painVasVal !== null ? `ВАШ ${painVasVal}/10` : "Так",
          locLabels.length > 0 ? locLabels.join(", ") : "",
          entryPayload.pain_symptoms?.length
            ? `симптоми: ${entryPayload.pain_symptoms.join(", ")}`
            : "",
        ].filter(Boolean);
        lines.push(`🩹 <b>Біль:</b> ${escapeTelegramHtml(painParts.join(" · "))}`);
        if (entryPayload.pain_comment) {
          lines.push(`📝 <b>Деталі болю:</b> ${escapeTelegramHtml(entryPayload.pain_comment)}`);
        }
      }

      if (hasIllness) {
        const illParts = [
          entryPayload.body_temperature ? `t° ${entryPayload.body_temperature}°C` : "Так",
          entryPayload.illness_symptoms?.length
            ? `симптоми: ${entryPayload.illness_symptoms.join(", ")}`
            : "",
        ].filter(Boolean);
        lines.push(`🤒 <b>Нездужання:</b> ${escapeTelegramHtml(illParts.join(" · "))}`);
        if (entryPayload.illness_comment) {
          lines.push(`📝 <b>Деталі хвороби:</b> ${escapeTelegramHtml(entryPayload.illness_comment)}`);
        }
      }

      if (entryPayload.comment) {
        lines.push(`💬 <b>Коментар:</b> ${escapeTelegramHtml(entryPayload.comment)}`);
      }

      await sendClubMedicalChatAlert({
        clubId,
        playerId: input.playerId,
        htmlText: lines.join("\n"),
      });
    } catch {}
  }

  revalidatePath("/team/readiness");
  revalidatePath("/coach-briefing");
  revalidatePath("/rehab-portal");
  revalidatePath("/wellness");
  revalidatePath("/wellness/kiosk");
  revalidatePath("/availability");
  revalidatePath(`/players/${input.playerId}`);

  return {
    success: true,
    entry: entryPayload,
  };
}

/**
 * 3. Отримання записів анкет для дашборду/тренера:
 * Поле comment та відповідь про stress приховано (null) для ролі coach!
 * Лікар та admin бачать повні дані.
 */
export async function getWellnessEntriesForDashboardAction(
  date?: string,
  teamId?: string
): Promise<{
  entries: (WellnessEntry | CoachWellnessEntry)[];
  isCoachRole: boolean;
}> {
  const auth = teamId ? await assertTeamStaff(teamId) : await assertAuth();
  if ("error" in auth) {
    return { entries: [], isCoachRole: false };
  }

  const role = auth.user.role;
  const userIsCoach = isCoach(role);
  const clubId = auth.user.clubId;
  const targetDate = date || getClubDate();
  const supabase = createAdminClient();

  let allowedPlayerIds: Set<string> | null = null;
  if (userIsCoach || teamId) {
    const coachTeams = auth.user.teamIds && auth.user.teamIds.length > 0
      ? auth.user.teamIds
      : (auth.user.teamId ? [auth.user.teamId] : []);

    let playersQuery = supabase
      .from("players")
      .select("id")
      .eq("club_id", clubId)
      .is("archived_at", null);

    if (teamId) {
      playersQuery = playersQuery.eq("team_id", teamId);
    } else if (userIsCoach) {
      if (coachTeams.length === 0) {
        return { entries: [], isCoachRole: true };
      }
      playersQuery = playersQuery.in("team_id", coachTeams);
    }

    const { data: scopedPlayers } = await playersQuery;
    allowedPlayerIds = new Set((scopedPlayers || []).map((p) => p.id));
    if (allowedPlayerIds.size === 0) {
      return { entries: [], isCoachRole: userIsCoach };
    }
  }

  let rawEntries: WellnessEntry[] = [];

  // Спершу читаємо з таблиці wellness_entries
  try {
    let q = supabase
      .from("wellness_entries")
      .select("*")
      .eq("club_id", clubId)
      .eq("date", targetDate);

    if (allowedPlayerIds) {
      q = q.in("player_id", Array.from(allowedPlayerIds));
    }

    const { data, error } = await q;
    if (!error && data) {
      rawEntries = data as WellnessEntry[];
    }
  } catch {}

  // Якщо таблиця ще не заповнена, пробуємо wellness_surveys у Supabase
  if (rawEntries.length === 0) {
    try {
      let wsQ = supabase
        .from("wellness_surveys")
        .select("*")
        .eq("club_id", clubId)
        .eq("date", targetDate);

      if (allowedPlayerIds) {
        wsQ = wsQ.in("player_id", Array.from(allowedPlayerIds));
      }

      const { data: wsData } = await wsQ;

      if (wsData && wsData.length > 0) {
        for (const s of wsData) {
          rawEntries.push(mapWellnessSurveyRow(s, clubId));
        }
      }
    } catch {}
  }

  // Також перевіряємо clubs.settings.wellness_entries_store
  if (rawEntries.length === 0) {
    try {
      const { data: club } = await supabase
        .from("clubs")
        .select("settings")
        .eq("id", clubId)
        .maybeSingle();

      const store = (club as any)?.settings?.wellness_entries_store || {};
      for (const entry of Object.values(store)) {
        const e = entry as WellnessEntry;
        if (e.date === targetDate) {
          rawEntries.push(e);
        }
      }
    } catch {}
  }

  // Якщо даних немає, беремо з injury_logs
  if (rawEntries.length === 0) {
    try {
      const { data: logs } = await supabase
        .from("injury_logs")
        .select("note")
        .eq("club_id", clubId)
        .eq("date", targetDate)
        .like("note", "[WELLNESS_ENTRY]%");

      if (logs) {
        rawEntries = logs
          .map((l) => {
            try {
              const raw = l.note.replace("[WELLNESS_ENTRY] ", "");
              return JSON.parse(raw) as WellnessEntry;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as WellnessEntry[];
      }
    } catch {}
  }

  // 3. Фільтрація по доступних гравцях та МАСКУВАННЯ для ролі 'coach'
  const scopedEntries = allowedPlayerIds
    ? rawEntries.filter((entry) => allowedPlayerIds!.has(entry.player_id))
    : rawEntries;

  const sanitizedEntries = scopedEntries.map((entry) => {
    if (userIsCoach) {
      return {
        ...entry,
        stress: null,
        comment: null,
      } as CoachWellnessEntry;
    }
    return entry;
  });

  return {
    entries: sanitizedEntries,
    isCoachRole: userIsCoach,
  };
}

/**
 * 8.5 Отримання персональної тижневої динаміки для гравця:
 * - Власні відповіді за останні 7 днів для простого графіка
 * - Статус перегляду штабом («Ваш звіт переглянув(ла) тренер/лікар»)
 * - Розрахунок дисципліни та серій заповнення (Streaks)
 * - М'яка підказка при виявленні однакових відповідей N днів поспіль
 */
export async function getPlayerWeeklySummaryAction(playerId: string): Promise<{
  entries: WellnessEntry[];
  todayEntry: WellnessEntry | null;
  compliance7Days: number;
  compliance28Days: number;
  streakDays: number;
  isAcknowledged: boolean;
  reviewedByRole: "coach" | "doctor" | "admin" | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  statusMessage: string;
  monotonyNotice: {
    isMonotonous: boolean;
    consecutiveDays: number;
    prompt: string | null;
  };
}> {
  if (!playerId) {
    return {
      entries: [],
      todayEntry: null,
      compliance7Days: 0,
      compliance28Days: 0,
      streakDays: 0,
      isAcknowledged: false,
      reviewedByRole: null,
      reviewedByName: null,
      reviewedAt: null,
      statusMessage: "Не вказано гравця",
      monotonyNotice: { isMonotonous: false, consecutiveDays: 0, prompt: null },
    };
  }

  const authCheck = await assertPlayerOrStaffAccess(playerId, { allowCoach: true });
  if ("error" in authCheck) {
    return {
      entries: [],
      todayEntry: null,
      compliance7Days: 0,
      compliance28Days: 0,
      streakDays: 0,
      isAcknowledged: false,
      reviewedByRole: null,
      reviewedByName: null,
      reviewedAt: null,
      statusMessage: authCheck.error,
      monotonyNotice: { isMonotonous: false, consecutiveDays: 0, prompt: null },
    };
  }

  const { clubId, timezone } = await getPlayerClubTimezone(playerId);
  const today = getClubDate(timezone);
  const supabase = createAdminClient();

  // Вибірка за останні 28 днів для розрахунку комплаєнсу та стриків
  const todayDateObj = new Date(today);
  const past28DateObj = new Date(todayDateObj);
  past28DateObj.setDate(past28DateObj.getDate() - 28);
  const minDateStr = past28DateObj.toISOString().split("T")[0];

  let allEntries: WellnessEntry[] = [];
  try {
    const { data } = await supabase
      .from("wellness_entries")
      .select("*")
      .eq("player_id", playerId)
      .gte("date", minDateStr)
      .lte("date", today)
      .order("date", { ascending: true });

    if (data) {
      allEntries = data as WellnessEntry[];
    }
  } catch {}

  // Якщо таблиця wellness_entries не повернула даних, перевіряємо wellness_surveys у Supabase
  if (allEntries.length === 0) {
    try {
      const { data: wsData } = await supabase
        .from("wellness_surveys")
        .select("*")
        .eq("player_id", playerId)
        .gte("date", minDateStr)
        .lte("date", today)
        .order("date", { ascending: true });

      if (wsData && wsData.length > 0) {
        for (const s of wsData) {
          allEntries.push(mapWellnessSurveyRow(s, clubId));
        }
      }
    } catch {}
  }

  // Також перевіряємо clubs.settings.wellness_entries_store
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const store = (club as any)?.settings?.wellness_entries_store || {};
    const existingDates = new Set(allEntries.map((e) => e.date));
    for (const [key, storedEntry] of Object.entries(store)) {
      const entry = storedEntry as WellnessEntry;
      if (entry.player_id === playerId && entry.date >= minDateStr && entry.date <= today) {
        if (!existingDates.has(entry.date)) {
          allEntries.push(entry);
          existingDates.add(entry.date);
        }
      }
    }
  } catch {}

  // Отримуємо клубові acknowledgements для надійності
  let clubAck: any = null;
  try {
    const { data: club } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();
    const acks = (club as any)?.settings?.wellness_acknowledgements || {};
    clubAck = acks[`${playerId}_${today}`];
  } catch {}

  const dateMap = new Map<string, WellnessEntry>();
  for (const e of allEntries) {
    dateMap.set(e.date, e);
  }

  const todayEntry = dateMap.get(today) || null;
  if (todayEntry && clubAck) {
    todayEntry.acknowledged = true;
    todayEntry.reviewed_at = todayEntry.reviewed_at || clubAck.reviewed_at;
    todayEntry.reviewed_by_role = todayEntry.reviewed_by_role || clubAck.reviewed_by_role;
    todayEntry.reviewed_by_name = todayEntry.reviewed_by_name || clubAck.reviewed_by_name;
  }

  // Останні 7 днів для графіка
  const past7DateObj = new Date(todayDateObj);
  past7DateObj.setDate(past7DateObj.getDate() - 6);
  const min7DateStr = past7DateObj.toISOString().split("T")[0];

  const last7Entries = allEntries.filter((e) => e.date >= min7DateStr);

  // Compliance
  let count7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayDateObj);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split("T")[0];
    if (dateMap.has(dStr)) count7++;
  }
  const compliance7Days = Math.round((count7 / 7) * 100);

  let count28 = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(todayDateObj);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split("T")[0];
    if (dateMap.has(dStr)) count28++;
  }
  const compliance28Days = Math.round((count28 / 28) * 100);

  // Streak (серия заповнення поспіль)
  let streakDays = 0;
  const startOffset = dateMap.has(today) ? 0 : 1;
  for (let i = startOffset; i < 120; i++) {
    const d = new Date(todayDateObj);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split("T")[0];
    if (dateMap.has(dStr)) {
      streakDays++;
    } else {
      break;
    }
  }

  // Статус перегляду (Reviewed / Acknowledged)
  const isAcknowledged = Boolean(
    todayEntry?.acknowledged || todayEntry?.reviewed_at || clubAck
  );
  const reviewedByRole =
    todayEntry?.reviewed_by_role || clubAck?.reviewed_by_role || null;
  const reviewedByName =
    todayEntry?.reviewed_by_name || clubAck?.reviewed_by_name || null;
  const reviewedAt =
    todayEntry?.reviewed_at || clubAck?.reviewed_at || null;

  let statusMessage = "Сьогоднішня анкета ще не заповнена. Заповніть її перед ранковим тренуванням!";
  if (todayEntry) {
    if (isAcknowledged) {
      const staffRoleLabel =
        reviewedByRole === "doctor"
          ? "лікар"
          : reviewedByRole === "coach"
          ? "тренер"
          : "тренер / лікар";
      statusMessage = `Ваш звіт переглянув(ла) ${staffRoleLabel}`;
    } else {
      statusMessage = "Ваш звіт надіслано. Очікує перегляду штабом перед тренуванням";
    }
  }

  // Детекція однакових відповідей N днів поспіль (за замовчуванням 7)
  let monotonyNotice = {
    isMonotonous: false,
    consecutiveDays: 0,
    prompt: null as string | null,
  };

  if (allEntries.length >= 7) {
    const sorted = [...allEntries].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    let sameCount = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const cur = sorted[i];
      const isSame =
        cur.sleep_quality === latest.sleep_quality &&
        cur.fatigue === latest.fatigue &&
        cur.soreness === latest.soreness &&
        cur.stress === latest.stress &&
        cur.pain === latest.pain &&
        cur.illness === latest.illness;
      if (isSame) {
        sameCount++;
      } else {
        break;
      }
    }

    if (sameCount >= 7) {
      monotonyNotice = {
        isMonotonous: true,
        consecutiveDays: sameCount,
        prompt: "Все гаразд? Можна додати нотатку або обговорити з лікарем",
      };
    }
  }

  return {
    entries: last7Entries,
    todayEntry,
    compliance7Days,
    compliance28Days,
    streakDays,
    isAcknowledged,
    reviewedByRole,
    reviewedByName,
    reviewedAt,
    statusMessage,
    monotonyNotice,
  };
}
