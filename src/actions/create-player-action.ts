"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertDoctor } from "@/lib/auth";
import { generateRandom6DigitPin, generatePortalToken, hashPin } from "@/lib/player-auth";
import { logAudit } from "@/lib/audit";
import { normalizePosition } from "@/lib/dictionaries";
import type { PlayerMedicalAnamnesis } from "@/types/player-anamnesis";

export type CreatePlayerState = {
  error?: string;
  success?: boolean;
  generatedPin?: string;
  portalToken?: string;
  playerName?: string;
  playerId?: string;
};

async function savePlayerInitialAnamnesisAndAnthro(
  supabase: any,
  clubId: string,
  playerId: string,
  formData: FormData
) {
  const jerseyNumber = formData.get("jerseyNumber") as string | null;
  const phone = formData.get("phone") as string | null;
  const bloodType = formData.get("bloodType") as string | null;
  const allergies = formData.get("allergies") as string | null;
  const pastInjuries = formData.get("pastInjuries") as string | null;
  const heightRaw = formData.get("height") as string | null;
  const weightRaw = formData.get("weight") as string | null;

  const height = heightRaw && !isNaN(parseFloat(heightRaw)) ? parseFloat(heightRaw) : null;
  const weight = weightRaw && !isNaN(parseFloat(weightRaw)) ? parseFloat(weightRaw) : null;

  if (height && weight) {
    try {
      await supabase.from("anthropometry_logs").insert({
        club_id: clubId,
        player_id: playerId,
        date: new Date().toISOString().split("T")[0],
        height,
        weight,
        body_fat_pct: null,
      });
    } catch (err) {
      console.warn("Помилка збереження первинної антропометрії:", err);
    }
  }

  const hasAnamnesis =
    Boolean(jerseyNumber?.trim()) ||
    Boolean(phone?.trim()) ||
    Boolean(bloodType?.trim()) ||
    Boolean(allergies?.trim()) ||
    Boolean(pastInjuries?.trim()) ||
    Boolean(height) ||
    Boolean(weight);

  if (hasAnamnesis) {
    const anamnesisPayload: PlayerMedicalAnamnesis = {
      player_id: playerId,
      jersey_number: jerseyNumber?.trim() || null,
      phone: phone?.trim() || null,
      blood_type: bloodType?.trim() || null,
      allergies: allergies?.trim() || null,
      past_injuries: pastInjuries?.trim() || null,
      initial_height: height,
      initial_weight: weight,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from("injury_logs").insert({
        club_id: clubId,
        category: "note",
        date: new Date().toISOString().split("T")[0],
        note: `[INITIAL_ANAMNESIS] ${JSON.stringify(anamnesisPayload)}`,
      });
    } catch (err) {
      console.warn("Помилка збереження первинного анамнезу:", err);
    }
  }
}

export async function createPlayerAction(
  _prev: CreatePlayerState,
  formData: FormData
): Promise<CreatePlayerState> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const teamId = formData.get("teamId") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const dateOfBirth = formData.get("dateOfBirth") as string;
  const sex = formData.get("sex") as string;
  const position = formData.get("position") as string;
  const dominantLeg = formData.get("dominantLeg") as string;
  const dominantArm = formData.get("dominantArm") as string;

  if (!teamId || !firstName || !lastName || !dateOfBirth || !position) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  // Генеруємо одноразовий випадковий 6-значний PIN і portal_token
  const initialPin = generateRandom6DigitPin();
  const pinHash = await hashPin(initialPin);
  const portalToken = generatePortalToken();

  const insertPayload: any = {
    club_id: auth.user.clubId,
    team_id: teamId,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    date_of_birth: dateOfBirth,
    sex: sex === "female" ? "female" : "male",
    position: normalizePosition(position),
    dominant_leg: dominantLeg || "right",
    dominant_arm: dominantArm || "right",
    portal_token: portalToken,
    pin_hash: pinHash,
    must_change_pin: true,
    failed_attempts: 0,
  };

  const { data: newPlayer, error } = await supabase
    .from("players")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    // Якщо колонок ще немає в схемі, пробуємо зберегти без pin_hash у таблиці players і пишемо в логи
    const fallbackPayload = {
      club_id: auth.user.clubId,
      team_id: teamId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dateOfBirth,
      sex: sex === "female" ? "female" : "male",
      position: normalizePosition(position),
      dominant_leg: dominantLeg || "right",
      dominant_arm: dominantArm || "right",
    };

    const { data: fallbackPlayer, error: fallbackErr } = await supabase
      .from("players")
      .insert(fallbackPayload)
      .select("id")
      .single();

    if (fallbackErr || !fallbackPlayer) {
      return { error: fallbackErr ? fallbackErr.message : error.message };
    }

    const playerId = fallbackPlayer.id;

    // Зберігаємо первинний анамнез та антропометрію, якщо заповнені
    await savePlayerInitialAnamnesisAndAnthro(supabase, auth.user.clubId, playerId, formData);

    // Зберігаємо portal_token та захешований pin_hash в logs
    await supabase.from("injury_logs").insert({
      club_id: auth.user.clubId,
      category: "note",
      date: new Date().toISOString().split("T")[0],
      note: `[PLAYER_PORTAL_TOKEN] ${JSON.stringify({ player_id: playerId, token: portalToken, created_at: new Date().toISOString() })}`,
    });

    await supabase.from("injury_logs").insert({
      club_id: auth.user.clubId,
      category: "note",
      date: new Date().toISOString().split("T")[0],
      note: `[PLAYER_PIN_HASH] ${JSON.stringify({ player_id: playerId, pin_hash: pinHash, must_change_pin: true, updated_at: new Date().toISOString() })}`,
    });

    revalidatePath("/players");
    revalidatePath("/");

    return {
      success: true,
      generatedPin: initialPin,
      portalToken,
      playerName: `${lastName.trim()} ${firstName.trim()}`,
      playerId,
    };
  }

  const playerId = newPlayer.id;

  // Зберігаємо первинний анамнез та антропометрію, якщо заповнені
  await savePlayerInitialAnamnesisAndAnthro(supabase, auth.user.clubId, playerId, formData);

  // Дублюємо portal_token та pin_hash у логи для надійності
  await supabase.from("injury_logs").insert({
    club_id: auth.user.clubId,
    category: "note",
    date: new Date().toISOString().split("T")[0],
    note: `[PLAYER_PORTAL_TOKEN] ${JSON.stringify({ player_id: playerId, token: portalToken, created_at: new Date().toISOString() })}`,
  });

  await supabase.from("injury_logs").insert({
    club_id: auth.user.clubId,
    category: "note",
    date: new Date().toISOString().split("T")[0],
    note: `[PLAYER_PIN_HASH] ${JSON.stringify({ player_id: playerId, pin_hash: pinHash, must_change_pin: true, updated_at: new Date().toISOString() })}`,
  });

  await logAudit({
    action: "reset_pin",
    entity: "auth",
    entityId: playerId,
    playerId,
    meta: {
      reason: "initial_creation",
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath("/players");
  revalidatePath("/");

  return {
    success: true,
    generatedPin: initialPin,
    portalToken,
    playerName: `${lastName.trim()} ${firstName.trim()}`,
    playerId,
  };
}
