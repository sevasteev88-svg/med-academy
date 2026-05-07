"use server";

/**
 * Server Action: створення / оновлення травми з класифікацією м'язів.
 *
 * ─── Архітектурне правило ───────────────────────────────────
 * Всі мутації БД живуть ТІЛЬКИ в src/actions/*-action.ts.
 * Компоненти викликають екшени, але не звертаються до Supabase напряму.
 *
 * Що тут нового порівняно з базовою версією:
 *  1. Приймає Munich/BAMIC класифікацію
 *  2. Автоматично розраховує RTP і зберігає в rtp_prediction
 *  3. Помічає T-junction як "критичний" статус
 */

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  calculateCombinedRtp,
  isBamicTJunctionRisk,
} from "@/lib/rtp-calculator";
import type {
  BamicGrade,
  BamicLocation,
  ClassificationSystem,
  InjuryLocation,
  InjuryMechanism,
  InjurySeverity,
  InjurySide,
  InjuryType,
  MunichGrade,
} from "@/types/database";

type CreateInjuryInput = {
  // ── Базові поля ──────────────────────────────────────────
  playerId: string;
  injuryType: InjuryType;
  location: InjuryLocation;
  side: InjurySide;
  severity: InjurySeverity;
  mechanism: InjuryMechanism;
  dateOfInjury: string;         // ISO: "2024-03-15"
  expectedReturnDate?: string;
  description?: string;

  // ── Класифікація м'язових пошкоджень (опціонально) ──────
  classificationSystem?: ClassificationSystem;
  munichGrade?: MunichGrade | null;
  bamicGrade?: BamicGrade | null;
  bamicLocation?: BamicLocation | null;
};

export async function createInjury(input: CreateInjuryInput) {
  const supabase = await createClient();

  // Перевірка авторизації
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // ── Розрахунок RTP ──────────────────────────────────────
  const rtpPrediction = calculateCombinedRtp({
    munichGrade: input.munichGrade,
    bamicGrade: input.bamicGrade,
    bamicLocation: input.bamicLocation,
  });

  // Перевіряємо T-junction — критичний стан
  const isCriticalTJunction =
    input.bamicGrade != null &&
    input.bamicLocation != null &&
    isBamicTJunctionRisk(input.bamicGrade, input.bamicLocation);

  // ── Вставка в БД ────────────────────────────────────────
  const { data, error } = await supabase
    .from("injuries")
    .insert({
      player_id: input.playerId,
      injury_type: input.injuryType,
      location: input.location,
      side: input.side,
      // Якщо T-junction → автоматично підвищуємо severity до severe
      severity: isCriticalTJunction && input.severity !== "career_threatening"
        ? "severe"
        : input.severity,
      mechanism: input.mechanism,
      date_of_injury: input.dateOfInjury,
      expected_return_date: input.expectedReturnDate ?? null,
      description: input.description ?? null,
      status: "active",

      // ── Класифікація ──────────────────────────────────
      classification_system: input.classificationSystem ?? "none",
      munich_grade: input.munichGrade ?? null,
      bamic_grade: input.bamicGrade ?? null,
      bamic_location: input.bamicLocation ?? null,

      // Кешуємо прогноз RTP
      rtp_prediction: rtpPrediction ?? null,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Інвалідуємо кеш сторінок
  revalidatePath("/[locale]/injuries", "page");
  revalidatePath("/[locale]/players/[id]", "page");

  return {
    data,
    rtpPrediction,
    isCriticalTJunction,
  };
}
