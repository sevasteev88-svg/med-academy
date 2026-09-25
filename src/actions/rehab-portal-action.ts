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
    .eq("player_id", playerId)
    .like("note", "[PLAYER_PIN]%")
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
    .select("id, diagnosis, location, vas_score, status, date_of_injury, expected_return_date")
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
    .eq("player_id", playerId)
    .like("note", "[DOCTOR_INSTRUCTION]%")
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
    .eq("player_id", playerId)
    .like("note", "[CUSTOM_REHAB_PLAN]%")
    .order("created_at", { ascending: false })
    .limit(1);

  let customRehabPlan: any = null;
  if (customPlanLogs && customPlanLogs.length > 0) {
    try {
      const raw = customPlanLogs[0].note.replace("[CUSTOM_REHAB_PLAN] ", "");
      customRehabPlan = JSON.parse(raw);
    } catch {}
  }

  // 7. Отримуємо останні чек-іни для побудови графіка динаміки (VAS & Сон)
  const { data: pastCheckinLogs } = await supabase
    .from("injury_logs")
    .select("note, date")
    .eq("player_id", playerId)
    .like("note", "[REHAB_CHECKIN]%")
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

  const payload: RehabCheckinData = {
    ...data,
    date: data.date || new Date().toISOString().split("T")[0],
    time: data.time || new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
  };

  // Зберігаємо у журнал
  const { error: logErr } = await supabase.from("injury_logs").insert({
    injury_id: data.injury_id,
    player_id: data.player_id,
    category: "note",
    date: payload.date,
    note: `[REHAB_CHECKIN] ${JSON.stringify(payload)}`,
  });

  if (logErr) {
    return { error: `Помилка збереження рапорту: ${logErr.message}` };
  }

  // Оновлюємо поточний бал болю ВАШ у травмі
  if (data.vas_score !== undefined && data.injury_id) {
    await supabase
      .from("injuries")
      .update({ vas_score: data.vas_score })
      .eq("id", data.injury_id);
  }

  revalidatePath("/rtp");
  revalidatePath(`/injuries/${data.injury_id}`);
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

  const { error } = await supabase.from("injury_logs").insert({
    player_id: playerId,
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

  const { error } = await supabase.from("injury_logs").insert({
    player_id: playerId,
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
