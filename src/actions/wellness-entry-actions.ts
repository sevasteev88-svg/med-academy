"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import { assertAuth, isCoach, DEFAULT_CLUB_ID } from "@/lib/auth";
import { getPlayerConsentSummary } from "@/lib/consents";
import { getClubDate, getPlayerClubTimezone } from "@/lib/club-timezone";
import type {
  WellnessEntry,
  WellnessEntrySource,
  WellnessScore,
  CoachWellnessEntry,
} from "@/types/wellness";
import { logAudit } from "@/lib/audit";
import { submitPlayerSelfRpeAction } from "./training-session-actions";

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
  illness: boolean;
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

/**
 * Отримує сьогоднішній запис анкети для гравця (якщо вже заповнено).
 */
export async function getTodayWellnessEntryForPlayerAction(playerId: string): Promise<{
  entry: WellnessEntry | null;
  today: string;
  timezone: string;
}> {
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

  // 2. Резервна перевірка в injury_logs
  try {
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("note")
      .like("note", `[WELLNESS_ENTRY] %"player_id":"${playerId}"%"date":"${today}"%`)
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
    illness: Boolean(input.illness),
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

  // 5. Завжди зберігаємо надійну резервну копію у injury_logs для повної сумісності
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
    }

    await supabase.from("injury_logs").insert({
      club_id: clubId,
      injury_id: targetInjuryId,
      category: "examination",
      date: targetDate,
      note: `[WELLNESS_ENTRY] ${JSON.stringify(entryPayload)}`,
    } as any);

    // Також підтримуємо старий маркер [WELLNESS] для зворотної сумісності зі старими графіками
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
  const auth = await assertAuth();
  if ("error" in auth) {
    return { entries: [], isCoachRole: false };
  }

  const role = auth.user.role;
  const userIsCoach = isCoach(role);
  const clubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const targetDate = date || getClubDate();
  const supabase = createAdminClient();

  let rawEntries: WellnessEntry[] = [];

  // Спершу читаємо з таблиці wellness_entries
  try {
    let q = supabase
      .from("wellness_entries")
      .select("*")
      .eq("club_id", clubId)
      .eq("date", targetDate);

    const { data, error } = await q;
    if (!error && data) {
      rawEntries = data as WellnessEntry[];
    }
  } catch {}

  // Якщо таблиця ще не заповнена, беремо з injury_logs
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

  // 3. МАСКУВАННЯ: якщо роль 'coach', прибираємо stress і comment
  const sanitizedEntries = rawEntries.map((entry) => {
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

/**
 * 8.5, 8.7 Одноразове ранкове нагадування про незаповнену анкету
 * Правило: Тільки один раз вранці (наприклад о 08:30). Жодних повторних нагадувань протягом дня!
 */
export async function sendMorningWellnessRemindersAction(): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  sentCount?: number;
  missingPlayersCount?: number;
  date?: string;
}> {
  const supabase = createAdminClient();
  const timezone = "Europe/Kyiv";
  const today = getClubDate(timezone);

  // 1. Отримуємо налаштування клубу та перевіряємо, чи вже надсилалося нагадування сьогодні
  const { data: club } = await supabase
    .from("clubs")
    .select("settings")
    .eq("id", DEFAULT_CLUB_ID)
    .maybeSingle();

  const currentSettings = (club as any)?.settings || {};
  const reminderConfig = currentSettings?.readiness_config?.morningReminder || {
    enabled: true,
    time: "08:30",
    channel: "push",
    lastSentDate: null,
  };

  if (!reminderConfig.enabled) {
    return { success: true, skipped: true, reason: "Нагадування вимкнені в налаштуваннях" };
  }

  // СУВОРЕ ПРАВИЛО: Жодних повторних нагадувань протягом дня!
  if (reminderConfig.lastSentDate === today) {
    return {
      success: true,
      skipped: true,
      reason: `Сьогодні (${today}) ранкове нагадування вже надсилалося. Повторні нагадування заблоковано.`,
    };
  }

  // 2. Отримуємо всіх активних гравців
  const { data: activePlayers } = await supabase
    .from("players")
    .select("id, first_name, last_name, team_id")
    .is("archived_at", null);

  const players = activePlayers || [];
  if (players.length === 0) {
    return { success: true, sentCount: 0, missingPlayersCount: 0, date: today };
  }

  // 3. Знаходимо, хто вже заповнив анкету сьогодні
  const { data: todayEntries } = await supabase
    .from("wellness_entries")
    .select("player_id")
    .eq("date", today);

  const filledPlayerIds = new Set((todayEntries || []).map((e: any) => e.player_id));
  const missingPlayers = players.filter((p) => !filledPlayerIds.has(p.id));

  // 4. Фіксуємо факт відправки сьогоднішнього ранкового нагадування
  const updatedReminderConfig = {
    ...reminderConfig,
    lastSentDate: today,
  };

  const updatedSettings = {
    ...currentSettings,
    readiness_config: {
      ...(currentSettings.readiness_config || {}),
      morningReminder: updatedReminderConfig,
    },
  };

  await supabase
    .from("clubs")
    .update({ settings: updatedSettings } as any)
    .eq("id", DEFAULT_CLUB_ID);

  // 5. Логуємо аудит
  await logAudit({
    action: "morning_wellness_reminder_sent",
    entity: "wellness_entries",
    entityId: DEFAULT_CLUB_ID,
    userId: "system",
    clubId: DEFAULT_CLUB_ID,
    meta: {
      date: today,
      channel: reminderConfig.channel,
      missingCount: missingPlayers.length,
      totalCount: players.length,
    },
  });

  return {
    success: true,
    sentCount: missingPlayers.length,
    missingPlayersCount: missingPlayers.length,
    date: today,
  };
}
