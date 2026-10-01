"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { RehabCheckinData, PlayerPinRecord } from "@/types/rehab-portal";

/**
 * Перевірка PIN-коду гравця для доступу в реабілітаційний кабінет.
 * За замовчуванням (якщо PIN ще не заданий лікарем) — це день та місяць народження (ДДММ),
 * наприклад, для народженого 14 липня (14.07) PIN: "1407", або "0000".
 */
export async function verifyPlayerPinAction(playerId: string, enteredPin: string) {
  const supabase = await createClient();

  // 1. Отримуємо дані гравця
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth, position, teams(name)")
    .eq("id", playerId)
    .single();

  if (playerErr || !player) {
    return { error: "Гравця не знайдено" };
  }

  // 2. Перевіряємо кастомний PIN у логах
  const { data: pinLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[PLAYER_PIN] %"player_id":"${playerId}"%`)
    .order("date", { ascending: false })
    .limit(1);

  let validPin = "";
  if (pinLogs && pinLogs.length > 0) {
    try {
      const raw = pinLogs[0].note.replace("[PLAYER_PIN] ", "");
      const parsed: PlayerPinRecord = JSON.parse(raw);
      validPin = parsed.pin;
    } catch {}
  }

  // Якщо кастомного немає, формуємо дефолтний з дати народження (DDMM)
  if (!validPin && player.date_of_birth) {
    const parts = player.date_of_birth.split("-"); // YYYY-MM-DD
    if (parts.length === 3) {
      validPin = `${parts[2]}${parts[1]}`; // DDMM
    }
  }

  // Запасний варіант
  if (!validPin) validPin = "0000";

  if (enteredPin.trim() !== validPin.trim()) {
    return { error: "Невірний PIN-код. Зверніться до медичного штабу або спробуйте ДДММ народження." };
  }

  // 3. Отримуємо активні травми футболіста
  const { data: injuries } = await supabase
    .from("injuries")
    .select("id, description, injury_type, location, vas_score, status, date_of_injury, expected_return_date")
    .eq("player_id", playerId)
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  // 4. Отримуємо останній етап RTP
  let currentRtpPhase = 1;
  if (injuries && injuries.length > 0) {
    const { data: rtpLogs } = await supabase
      .from("injury_logs")
      .select("note")
      .eq("injury_id", injuries[0].id)
      .like("note", "[RTP_PHASE]%")
      .order("date", { ascending: false })
      .limit(1);

    if (rtpLogs && rtpLogs.length > 0) {
      try {
        const raw = rtpLogs[0].note.replace("[RTP_PHASE] ", "");
        const parsed = JSON.parse(raw);
        currentRtpPhase = parsed.phase || 1;
      } catch {}
    }
  }

  // 5. Отримуємо щоденне напуття/призначення від лікаря
  const { data: instructionLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[DOCTOR_INSTRUCTION] %"player_id":"${playerId}"%`)
    .order("date", { ascending: false })
    .limit(1);

  let doctorInstruction: any = null;
  if (instructionLogs && instructionLogs.length > 0) {
    try {
      const raw = instructionLogs[0].note.replace("[DOCTOR_INSTRUCTION] ", "");
      doctorInstruction = JSON.parse(raw);
    } catch {}
  }

  // 6. Отримуємо збережений персональний план ЛФК від лікаря (якщо є)
  const { data: customPlanLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", "[CUSTOM_REHAB_PLAN]%")
    .order("created_at", { ascending: false })
    .limit(20);

  let customRehabPlan: any = null;
  if (customPlanLogs && customPlanLogs.length > 0) {
    for (const log of customPlanLogs) {
      try {
        const raw = log.note.replace("[CUSTOM_REHAB_PLAN] ", "");
        const parsed = JSON.parse(raw);
        if (parsed.player_id === playerId) {
          customRehabPlan = parsed;
          break;
        }
      } catch {}
    }
  }

  // 7. Отримуємо останні чек-іни для побудови графіка динаміки (VAS & Сон)
  const { data: pastCheckinLogs } = await supabase
    .from("injury_logs")
    .select("note, date")
    .like("note", `[REHAB_CHECKIN] %"player_id":"${playerId}"%`)
    .order("date", { ascending: true })
    .limit(14);

  const pastCheckins: any[] = (pastCheckinLogs || [])
    .map((l) => {
      try {
        const raw = l.note.replace("[REHAB_CHECKIN] ", "");
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    success: true,
    player: {
      id: player.id,
      name: `${player.last_name} ${player.first_name}`,
      team: (player as any).teams?.name || "Академія",
      position: player.position,
      injuries: injuries || [],
      currentRtpPhase,
      doctorInstruction,
      customRehabPlan,
      pastCheckins,
    },
  };
}

/**
 * Збереження звіту гравця про самопочуття та біль
 */
export async function submitRehabCheckinAction(data: RehabCheckinData) {
  const supabase = await createClient();

  // Знаходимо цільову травму або прив'язуємо до існуючої / null
  let targetInjuryId: string | null = (data.injury_id && data.injury_id.trim() !== "") ? data.injury_id.trim() : null;

  if (!targetInjuryId) {
    const { data: existingInj } = await supabase
      .from("injuries")
      .select("id")
      .eq("player_id", data.player_id)
      .order("date_of_injury", { ascending: false })
      .limit(1);

    if (existingInj && existingInj.length > 0 && existingInj[0].id) {
      targetInjuryId = existingInj[0].id;
    } else {
      // Створюємо системний базовий запис для здорового гравця, щоб зв'язати журнал
      const { data: newInj, error: newInjErr } = await supabase
        .from("injuries")
        .insert({
          player_id: data.player_id,
          date_of_injury: data.date || new Date().toISOString().split("T")[0],
          injury_type: "illness",
          location: "other",
          severity: "minor",
          status: "closed",
          description: "Самозвіти відновлення / Чек-ін",
          vas_score: data.vas_score ?? 0,
        } as any)
        .select("id")
        .maybeSingle();

      if (newInj && newInj.id) {
        targetInjuryId = newInj.id;
      } else {
        // Якщо таблиця injuries вимагає особливих прав або повертає null — targetInjuryId залишається null
        targetInjuryId = null;
      }
    }
  }

  const payload: RehabCheckinData = {
    ...data,
    injury_id: targetInjuryId || "",
    date: data.date || new Date().toISOString().split("T")[0],
    time: data.time || new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
  };

  // Зберігаємо у журнал injury_logs (якщо targetInjuryId валідний або null, не порожній рядок "")
  const logInsertData: any = {
    category: "note",
    date: payload.date,
    note: `[REHAB_CHECKIN] ${JSON.stringify(payload)}`,
  };
  if (targetInjuryId) {
    logInsertData.injury_id = targetInjuryId;
  }

  const { error: logErr } = await supabase.from("injury_logs").insert(logInsertData);

  if (logErr) {
    return { error: `Помилка збереження рапорту: ${logErr.message}` };
  }

  // Допоміжна функція безпечного додавання в injury_logs
  const safeInsertLog = async (category: string, date: string, note: string) => {
    const logItem: any = { category, date, note };
    if (targetInjuryId) logItem.injury_id = targetInjuryId;
    return supabase.from("injury_logs").insert(logItem);
  };

  // Якщо футболіст заповнив показники свого девайса (Oura / Apple Watch / WHOOP) — записуємо також у біометричний трекінг гравця
  if (data.wearable_data) {
    const wearEntry = {
      id: `wear_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      player_id: data.player_id,
      device_type: data.wearable_data.device_type,
      date: payload.date,
      recovery_score: data.wearable_data.recovery_score ?? Math.round((data.sleep_quality / 5) * 85),
      hrv_rmssd: data.wearable_data.hrv_rmssd ?? 65,
      resting_hr: data.wearable_data.resting_hr ?? 52,
      sleep_duration_hours: data.wearable_data.sleep_duration_hours ?? 8.0,
      sleep_efficiency_pct: data.wearable_data.sleep_efficiency_pct ?? 90,
      source: "manual",
      created_at: new Date().toISOString(),
    };

    await safeInsertLog("procedure", payload.date, `[WEARABLE] ${JSON.stringify(wearEntry)}`);
  }

  // Якщо футболіст відповів на пункти Хопкінса/Макліна (сон, втома, крепатура, стрес) — синхронізуємо в розділ /wellness
  if (data.muscle_soreness !== undefined || data.stress_level !== undefined) {
    const wellSurvey = {
      id: `well_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      player_id: data.player_id,
      date: payload.date,
      sleep_quality: data.sleep_quality,
      fatigue_level: data.fatigue_level,
      muscle_soreness: data.muscle_soreness ?? 4,
      stress_level: data.stress_level ?? 4,
      soreness_location: data.soreness_location || null,
      total_score: Number(data.sleep_quality) + Number(data.fatigue_level) + Number(data.muscle_soreness ?? 4) + Number(data.stress_level ?? 4),
      readiness_status: (Number(data.sleep_quality) + Number(data.fatigue_level) + Number(data.muscle_soreness ?? 4) + Number(data.stress_level ?? 4)) >= 16 ? "optimal" : (Number(data.sleep_quality) + Number(data.fatigue_level) + Number(data.muscle_soreness ?? 4) + Number(data.stress_level ?? 4)) >= 12 ? "warning" : "risk",
      notes: data.player_comment || null,
      created_at: new Date().toISOString(),
    };

    await safeInsertLog("examination", payload.date, `[WELLNESS] ${JSON.stringify(wellSurvey)}`);
  }

  // Якщо футболіст вказав навантаження тренування (тривалість + RPE за шкалою Борга) — записуємо сесію для розрахунку ACWR
  if (data.training_session && data.training_session.duration_minutes > 0) {
    const duration = Number(data.training_session.duration_minutes);
    const rpe = Number(data.training_session.rpe_score);
    const sessionPayload = {
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      player_id: data.player_id,
      date: payload.date,
      session_type: data.training_session.session_type || "training_team",
      duration_minutes: duration,
      rpe_score: rpe,
      workload_au: duration * rpe,
      notes: "Самостійний звіт гравця через мобільний кабінет",
      created_at: new Date().toISOString(),
    };

    await safeInsertLog("procedure", payload.date, `[WORKLOAD] ${JSON.stringify(sessionPayload)}`);
  }

  // Оновлюємо поточний бал болю ВАШ у травмі
  if (data.vas_score !== undefined && targetInjuryId) {
    await supabase
      .from("injuries")
      .update({ vas_score: data.vas_score })
      .eq("id", targetInjuryId);
  }

  revalidatePath("/rtp");
  if (targetInjuryId) {
    revalidatePath(`/injuries/${targetInjuryId}`);
  }
  revalidatePath(`/players/${data.player_id}`);
  revalidatePath("/");

  return { success: true };
}

/**
 * Встановлення або зміна PIN-коду гравця лікарем
 */
export async function setPlayerPinAction(playerId: string, newPin: string) {
  const supabase = await createClient();

  if (!/^\d{4}$/.test(newPin)) {
    return { error: "PIN-код повинен складатися рівно з 4 цифр" };
  }

  const payload: PlayerPinRecord = {
    player_id: playerId,
    pin: newPin,
    updated_at: new Date().toISOString(),
  };

  // Отримуємо або створюємо травму для зв'язку
  let targetInjuryId: string | null = null;
  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", playerId)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (existingInj && existingInj.length > 0) {
    targetInjuryId = existingInj[0].id;
  } else {
    const { data: newInj } = await supabase
      .from("injuries")
      .insert({
        player_id: playerId,
        date_of_injury: new Date().toISOString().split("T")[0],
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Налаштування профілю гравця / PIN",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (newInj) targetInjuryId = newInj.id;
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
    category: "note",
    date: new Date().toISOString().split("T")[0],
    note: `[PLAYER_PIN] ${JSON.stringify(payload)}`,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/players/${playerId}`);
  return { success: true };
}

/**
 * Встановлення або оновлення персональної вказівки лікаря на день
 */
export async function saveDoctorInstructionAction({
  playerId,
  instruction,
  appointmentTime,
}: {
  playerId: string;
  instruction: string;
  appointmentTime?: string;
}) {
  const supabase = await createClient();

  const payload: DoctorDailyInstruction = {
    player_id: playerId,
    instruction: instruction.trim(),
    appointment_time: appointmentTime?.trim() || undefined,
    updated_at: new Date().toISOString(),
  };

  // Отримуємо або створюємо травму для зв'язку
  let targetInjuryId: string | null = null;
  const { data: existingInj } = await supabase
    .from("injuries")
    .select("id")
    .eq("player_id", playerId)
    .order("date_of_injury", { ascending: false })
    .limit(1);

  if (existingInj && existingInj.length > 0) {
    targetInjuryId = existingInj[0].id;
  } else {
    const { data: newInj } = await supabase
      .from("injuries")
      .insert({
        player_id: playerId,
        date_of_injury: new Date().toISOString().split("T")[0],
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Вказівка лікаря гравцю",
        vas_score: 0,
      } as any)
      .select("id")
      .single();

    if (newInj) targetInjuryId = newInj.id;
  }

  const { error } = await supabase.from("injury_logs").insert({
    injury_id: targetInjuryId,
    category: "prescription",
    date: new Date().toISOString().split("T")[0],
    note: `[DOCTOR_INSTRUCTION] ${JSON.stringify(payload)}`,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/rehab-portal");
  return { success: true };
}
