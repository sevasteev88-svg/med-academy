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
