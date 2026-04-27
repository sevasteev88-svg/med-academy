"use server";

/**
 * Server Action: збереження антропометрії + мультиметодний розрахунок PHV.
 *
 * 1. Зберігає вимір в anthropometry_logs
 * 2. Знаходить попередній вимір → velocity
 * 3. Рахує PHV усіма доступними методами
 * 4. Зберігає консенсусну оцінку в maturation_assessments
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  calculatePhv,
  calcHeightVelocity,
  calcWeightVelocity,
  type Sex,
} from "@/lib/phv-calculator";

type SaveAnthropometryInput = {
  playerId: string;
  date: string;
  height: number;
  weight: number;
  sittingHeight: number | null; // null = рахуємо тільки Moore-2
};

export async function saveAnthropometryWithPhv(input: SaveAnthropometryInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Не авторизовано" };

  // 1. Дані гравця
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("date_of_birth, sex")
    .eq("id", input.playerId)
    .single();

  if (playerErr || !player) return { error: "Гравця не знайдено" };

  // 2. Валідація
  if (input.sittingHeight != null && input.sittingHeight >= input.height) {
    return { error: "Зріст сидячи має бути менший за загальний зріст" };
  }

  // 3. Зберігаємо вимір
  const insertData: Record<string, unknown> = {
    player_id: input.playerId,
    date: input.date,
    height: input.height,
    weight: input.weight,
  };
  if (input.sittingHeight != null) {
    insertData.sitting_height = input.sittingHeight;
  }

  const { data: anthro, error: anthroErr } = await supabase
    .from("anthropometry_logs")
    .insert(insertData)
    .select()
    .single();

  if (anthroErr || !anthro) {
    return { error: anthroErr?.message ?? "Помилка збереження виміру" };
  }

  // 4. Попередній вимір → velocity
  const { data: prevMeasurements } = await supabase
    .from("anthropometry_logs")
    .select("date, height, weight")
    .eq("player_id", input.playerId)
    .lt("date", input.date)
    .order("date", { ascending: false })
    .limit(1);

  let heightVelocity: number | null = null;
  let weightVelocity: number | null = null;

  if (prevMeasurements?.length) {
    const prev = prevMeasurements[0];
    heightVelocity = calcHeightVelocity(
      prev.height, prev.date, input.height, input.date
    );
    weightVelocity = calcWeightVelocity(
      prev.weight, prev.date, input.weight, input.date
    );
  }

  // 5. Мультиметодний розрахунок PHV
  const phv = calculatePhv(
    {
      dateOfBirth: player.date_of_birth,
      sex: player.sex as Sex,
      measurementDate: input.date,
      height: input.height,
      weight: input.weight,
      sittingHeight: input.sittingHeight,
    },
    heightVelocity ?? undefined
  );

  // Збираємо поля для кожного методу
  const methodFields: Record<string, number | null> = {
    mirwald_offset: null,
    mirwald_phv_age: null,
    moore1_offset: null,
    moore1_phv_age: null,
    moore2_offset: null,
    moore2_phv_age: null,
    fransen_phv_age: null,
  };

  for (const m of phv.methods) {
    if (m.method === "mirwald") {
      methodFields.mirwald_offset = m.offset;
      methodFields.mirwald_phv_age = m.estimatedPhvAge;
    } else if (m.method === "moore1") {
      methodFields.moore1_offset = m.offset;
      methodFields.moore1_phv_age = m.estimatedPhvAge;
    } else if (m.method === "moore2") {
      methodFields.moore2_offset = m.offset;
      methodFields.moore2_phv_age = m.estimatedPhvAge;
    } else if (m.method === "fransen") {
      methodFields.fransen_phv_age = m.estimatedPhvAge;
    }
  }

  // 6. Зберігаємо оцінку матурації
  const { data: maturation, error: matErr } = await supabase
    .from("maturation_assessments")
    .insert({
      player_id: input.playerId,
      anthropometry_log_id: anthro.id,
      age_at_measurement: phv.ageAtMeasurement,
      ...methodFields,
      consensus_offset: phv.consensusOffset,
      consensus_phv_age: phv.consensusPhvAge,
      methods_used: phv.methods.map((m) => m.method),
      growth_phase: phv.growthPhase,
      height_velocity: heightVelocity,
      weight_velocity: weightVelocity,
      risk_zone: phv.riskZone,
      risk_factors: phv.riskFactors,
    })
    .select()
    .single();

  if (matErr) return { error: matErr.message };

  revalidatePath("/[locale]/players", "page");
  revalidatePath("/[locale]/growth", "page");

  return {
    data: {
      anthropometry: anthro,
      maturation,
      phvResult: phv,
    },
  };
}
