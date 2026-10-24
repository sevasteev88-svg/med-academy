"use server";

import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  DEMO_CLUB_ID,
  DEMO_CLUB_NAME,
  DEMO_TEAMS,
  DEMO_PLAYERS,
  DEMO_INJURIES,
  DEMO_PHARMACY_ITEMS,
} from "@/lib/demo-generator";

/**
 * Перевірка, чи поточний користувач працює в Демо-клубі
 */
export async function isCurrentUserInDemoClub(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return user.clubId === DEMO_CLUB_ID;
}

/**
 * Атомарне скидання та повторне наповнення демо-даних (Reset Demo)
 */
export async function resetDemoClubAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const admin = createAdminClient();

    // 1. Створюємо або оновлюємо демо-клуб
    const { error: clubErr } = await admin.from("clubs").upsert({
      id: DEMO_CLUB_ID,
      name: DEMO_CLUB_NAME,
      logo_url: "/logo-chr.png",
      settings: {
        is_demo: true,
        colors: {
          primary: "#0284c7",
          secondary: "#0f172a",
          accent: "#38bdf8",
        },
        season_start: "2026-07-01",
        matchday_protocol: {
          title: "Медичний протокол матчу",
          is_official: true,
          default_doctor_name: "Д-р Андрій Коваленко (лікар вищої категорії)",
          default_coach_name: "Олег Васильович Шевченко (Pro UEFA)",
        },
      },
      updated_at: new Date().toISOString(),
    });

    if (clubErr) {
      return { success: false, error: `Помилка ініціалізації клубу: ${clubErr.message}` };
    }

    // 2. Очищення старих демо-даних (каскадно)
    // Отримуємо існуючі id гравців та травм клубу для точкового видалення
    const { data: existingPlayers } = await admin
      .from("players")
      .select("id")
      .eq("club_id", DEMO_CLUB_ID);

    const existingPlayerIds = (existingPlayers || []).map((p) => p.id);

    if (existingPlayerIds.length > 0) {
      // Видаляємо логи травм
      const { data: existingInjuries } = await admin
        .from("injuries")
        .select("id")
        .eq("club_id", DEMO_CLUB_ID);

      const existingInjuryIds = (existingInjuries || []).map((i) => i.id);
      if (existingInjuryIds.length > 0) {
        await admin.from("injury_logs").delete().in("injury_id", existingInjuryIds);
      }

      // Також видаляємо скринінги, прив'язані через note '[SCREENING]'
      await admin.from("wellness_entries").delete().in("player_id", existingPlayerIds);
      await admin.from("anthropometry_logs").delete().in("player_id", existingPlayerIds);
      await admin.from("workload_sessions").delete().in("player_id", existingPlayerIds);
      await admin.from("injuries").delete().eq("club_id", DEMO_CLUB_ID);
      await admin.from("players").delete().eq("club_id", DEMO_CLUB_ID);
    }

    await admin.from("pharmacy_items").delete().eq("club_id", DEMO_CLUB_ID);
    await admin.from("exposures").delete().eq("club_id", DEMO_CLUB_ID);
    await admin.from("teams").delete().eq("club_id", DEMO_CLUB_ID);

    // 3. Вставка 3 команд
    const { error: teamsErr } = await admin.from("teams").insert(DEMO_TEAMS);
    if (teamsErr) {
      return { success: false, error: `Помилка створення команд: ${teamsErr.message}` };
    }

    // 4. Вставка 26 гравців
    const playersToInsert = DEMO_PLAYERS.map((p) => ({
      id: p.id,
      club_id: DEMO_CLUB_ID,
      team_id: p.team_id,
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth,
      position: p.position,
      dominant_side: p.dominant_side,
      archived_at: null,
    }));

    const { error: playersErr } = await admin.from("players").insert(playersToInsert);
    if (playersErr) {
      return { success: false, error: `Помилка створення гравців: ${playersErr.message}` };
    }

    // 5. Вставка антропометрії (3–6 замірів зросту за останні 12 місяців для кожного гравця)
    const anthroLogs: any[] = [];
    const now = new Date();

    for (const p of DEMO_PLAYERS) {
      // 5 замірів: 360 днів тому, 270 днів тому, 180 днів тому, 90 днів тому, сьогодні
      const intervals = [360, 270, 180, 90, 0];
      const isU15 = p.team_id === DEMO_TEAMS[2].id;
      // У юніорів U-15 більший річний приріст (PHV ~7-9 см), у U-19 менший (~1-2 см)
      const annualGrowth = isU15 ? 7.5 : p.team_id === DEMO_TEAMS[1].id ? 4.0 : 1.2;
      const annualWeightGain = isU15 ? 6.0 : 3.5;

      intervals.forEach((daysAgo, idx) => {
        const d = new Date(now.getTime() - daysAgo * 86400000);
        const progressFrac = (360 - daysAgo) / 360;
        const heightAtDate = +(p.current_height - annualGrowth * (1 - progressFrac)).toFixed(1);
        const weightAtDate = +(p.current_weight - annualWeightGain * (1 - progressFrac)).toFixed(1);
        const sittingHeightAtDate = +(p.sitting_height - (annualGrowth * 0.5) * (1 - progressFrac)).toFixed(1);

        anthroLogs.push({
          club_id: DEMO_CLUB_ID,
          player_id: p.id,
          date: d.toISOString().split("T")[0],
          height: heightAtDate,
          weight: weightAtDate,
          fat_percentage: isU15 ? 11.5 : 10.2,
          notes: idx === 4 ? "Плановий щоквартальний моніторинг PHV" : "Контрольний замір біометрії",
        });
      });
    }

    await admin.from("anthropometry_logs").insert(anthroLogs);

    // 6. Вставка травм
    const { error: injErr } = await admin.from("injuries").insert(
      DEMO_INJURIES.map((inj) => ({
        id: inj.id,
        club_id: inj.club_id,
        player_id: inj.player_id,
        injury_type: inj.injury_type,
        location: inj.location,
        side: inj.side,
        date_of_injury: inj.date_of_injury,
        actual_return_date: (inj as any).actual_return_date || null,
        expected_return_date: (inj as any).expected_return_date || null,
        status: inj.status,
        vas_score: inj.vas_score,
        description: inj.description,
        severity: inj.severity,
        mechanism: inj.mechanism,
        osiics_code: inj.osiics_code,
      }))
    );

    if (injErr) {
      return { success: false, error: `Помилка створення травм: ${injErr.message}` };
    }

    // 7. Вставка RTP-логів у injury_logs для відкритих травм
    const rtpLogsToInsert: any[] = [];
    for (const inj of DEMO_INJURIES) {
      const phaseNum = (inj as any).rtp_phase || 1;
      const rtpPayload = {
        injury_id: inj.id,
        player_id: inj.player_id,
        phase: phaseNum,
        target_date: (inj as any).expected_return_date || "2026-11-01",
        doctor_note: `RTP Етап ${phaseNum}: клінічний прогрес згідно з протоколом клубу.`,
        criteria_met: phaseNum >= 4 ? ["no_swelling", "full_rom", "functional_tests_ok"] : ["no_resting_pain"],
        updated_at: new Date().toISOString(),
      };

      rtpLogsToInsert.push({
        injury_id: inj.id,
        date: inj.date_of_injury,
        author: "Д-р Андрій Коваленко",
        note: `[RTP_PHASE] ${JSON.stringify(rtpPayload)}`,
      });
    }

    // Додаємо передсезонні скринінги (screening) для всіх 26 гравців
    for (const p of DEMO_PLAYERS) {
      // Гравці #5 (Кравченко) та #19 (Сидоренко) мають статус provisional (умовний допуск, 45 хв)
      const isRestricted = p.id === DEMO_PLAYERS[4].id || p.id === DEMO_PLAYERS[18].id;
      const screeningPayload = {
        player_id: p.id,
        screening_date: "2026-07-10",
        valid_until: "2027-07-10",
        clearance_status: isRestricted ? "provisional" : "approved",
        examiner: "Д-р Андрій Коваленко",
        cardiac_clearance: true,
        musculoskeletal_clearance: true,
        fms_score: isRestricted ? 13 : 17,
        y_balance_composite: isRestricted ? 88.5 : 98.2,
        notes: isRestricted
          ? "Умовний допуск: обмеження навантаження до 45 хв на етапі адаптації."
          : "Повний допуск до участі у тренуваннях та офіційних матчах сезону 2026/2027.",
      };

      // Перша знайдена травма гравця або null
      const playerInj = DEMO_INJURIES.find((i) => i.player_id === p.id);
      if (playerInj) {
        rtpLogsToInsert.push({
          injury_id: playerInj.id,
          date: "2026-07-10",
          author: "Д-р Андрій Коваленко",
          note: `[SCREENING] ${JSON.stringify(screeningPayload)}`,
        });
      }
    }

    if (rtpLogsToInsert.length > 0) {
      await admin.from("injury_logs").insert(rtpLogsToInsert);
    }

    // 8. Вставка навантаження за 6 тижнів (42 дні)
    const workloadRows: any[] = [];
    const baseDate = new Date(now.getTime() - 42 * 86400000);

    for (let day = 0; day < 42; day++) {
      const curDate = new Date(baseDate.getTime() + day * 86400000);
      const dateStr = curDate.toISOString().split("T")[0];
      const dayOfWeek = curDate.getDay(); // 0 - Sun, 6 - Sat

      // Неділя - вихідний
      if (dayOfWeek === 0) continue;

      const isMatch = dayOfWeek === 6; // Субота - матч
      const sessionType = isMatch ? "match" : dayOfWeek === 3 ? "tactical_high" : "training";
      const duration = isMatch ? 90 : dayOfWeek === 3 ? 85 : 70;
      const rpe = isMatch ? 8 : dayOfWeek === 3 ? 7 : 5;

      // Генеруємо сесії для перших 10 здорових гравців
      for (let i = 0; i < 10; i++) {
        const pl = DEMO_PLAYERS[i];
        workloadRows.push({
          id: `demo_wl_${pl.id.slice(-4)}_${day}`,
          player_id: pl.id,
          date: dateStr,
          session_type: sessionType,
          duration_minutes: duration,
          rpe_score: rpe,
          workload_au: duration * rpe,
          notes: isMatch ? "Офіційний матч туру ДЮФЛУ" : "Командне тренування",
        });
      }
    }

    if (workloadRows.length > 0) {
      await admin.from("workload_sessions").insert(workloadRows);
    }

    // 9. Вставка велнес-анкет за останні 14 днів
    const wellnessRows: any[] = [];
    for (let day = 0; day < 14; day++) {
      const curDate = new Date(now.getTime() - day * 86400000);
      const dateStr = curDate.toISOString().split("T")[0];

      DEMO_PLAYERS.forEach((pl, idx) => {
        // Травмовані гравці відмічають біль у відповідних зонах
        const isHamstringInjured = idx === 1;
        const isAnkleInjured = idx === 7;
        const isGroinInjured = idx === 13;

        const hasPain = isHamstringInjured || isAnkleInjured || isGroinInjured;
        const painVas = isHamstringInjured ? 6 : isAnkleInjured ? 4 : isGroinInjured ? 2 : null;
        const painArea = isHamstringInjured ? "Праве стегно (задня поверхня)" : isAnkleInjured ? "Лівий гомілкостоп" : isGroinInjured ? "Пах / аддуктор" : null;

        wellnessRows.push({
          player_id: pl.id,
          club_id: DEMO_CLUB_ID,
          date: dateStr,
          sleep_quality: hasPain ? 3 : 4,
          fatigue_level: hasPain ? 3 : 4,
          muscle_soreness: hasPain ? 2 : 4,
          stress_level: 4,
          illness: false,
          pain: hasPain,
          pain_vas: painVas,
          pain_area: painArea,
          comment: hasPain ? "Планова фізіотерапія та лід після вправ" : "Почуваюся добре",
        });
      });
    }

    if (wellnessRows.length > 0) {
      await admin.from("wellness_entries").insert(wellnessRows);
    }

    // 10. Вставка аптечного складу
    const pharmacyRows = DEMO_PHARMACY_ITEMS.map((item) => ({
      club_id: DEMO_CLUB_ID,
      ...item,
    }));

    await admin.from("pharmacy_items").insert(pharmacyRows);

    // 11. Вставка експозиції за останні 6 тижнів
    const exposuresRows: any[] = [];
    for (let w = 0; w < 6; w++) {
      const matchDate = new Date(now.getTime() - (w * 7 + 1) * 86400000).toISOString().split("T")[0];
      const trainDate = new Date(now.getTime() - (w * 7 + 3) * 86400000).toISOString().split("T")[0];

      // Для U-19
      exposuresRows.push({
        club_id: DEMO_CLUB_ID,
        team_id: DEMO_TEAMS[0].id,
        date: matchDate,
        match_minutes: 90,
        training_minutes: 0,
        notes: `Матч туру #${6 - w}`,
      });
      exposuresRows.push({
        club_id: DEMO_CLUB_ID,
        team_id: DEMO_TEAMS[0].id,
        date: trainDate,
        match_minutes: 0,
        training_minutes: 360,
        notes: `Тижневий тренувальний мікроцикл #${6 - w}`,
      });
    }

    await admin.from("exposures").insert(exposuresRows);

    // Оновлюємо кеш шляхів
    revalidatePath("/");
    revalidatePath("/players");
    revalidatePath("/availability");
    revalidatePath("/rtp");
    revalidatePath("/injuries");
    revalidatePath("/pharmacy");
    revalidatePath("/growth");
    revalidatePath("/team/readiness");

    return {
      success: true,
      message: "Демо-клуб «Демо Академія» успішно ініціалізовано: 26 гравців, травми, велнес, аптека та експозиція.",
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Помилка скидання демо-режиму." };
  }
}
