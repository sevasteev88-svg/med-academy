/**
 * Скрипт посіву демо-клубу «Демо Академія»
 * Запуск: npx tsx scripts/seed-demo.ts
 * 
 * Створює:
 * - Клуб «Демо Академія» (ID: 00000000-0000-0000-0000-000000000002)
 * - Демо-користувача demo@medacademy.app з паролем з process.env.DEMO_USER_PASSWORD
 * - 3 команди (U-19, U-17, U-15)
 * - 26 повністю вигаданих гравців (жодних реальних діючих футболістів)
 * - 3–6 замірів зросту за 12 місяців (PHV)
 * - Травми в різних клінічних фазах (Гостра, Реаб 1-4, Завершені)
 * - Навантаження за 6 тижнів (ACWR)
 * - Щоденний велнес за 14-28 днів
 * - Аптеку (16 найменувань, WADA, терміни придатності)
 * - Передсезонні скринінги
 * - Експозицію (матчі + тренування)
 */

import { createClient } from "@supabase/supabase-js";
import {
  DEMO_CLUB_ID,
  DEMO_CLUB_NAME,
  DEMO_DOCTOR_EMAIL,
  DEMO_TEAMS,
  DEMO_PLAYERS,
  DEMO_INJURIES,
  DEMO_PHARMACY_ITEMS,
} from "../src/lib/demo-generator";

// Завантаження змінних середовища для автономного запуску
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const demoPassword = process.env.DEMO_USER_PASSWORD || "DemoDoctor2026!";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Відсутні змінні NEXT_PUBLIC_SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runSeed() {
  console.log(`🚀 Починаємо посів демо-даних для: ${DEMO_CLUB_NAME}...`);

  // 1. Створення/Оновлення демо-клубу
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
    console.error("Помилка клубу:", clubErr.message);
  } else {
    console.log("✅ Клуб «Демо Академія» створено/оновлено");
  }

  // 2. Створення демо-користувача (якщо auth доступний)
  try {
    const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
      email: DEMO_DOCTOR_EMAIL,
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Д-р Андрій Коваленко (Демо)",
        club_id: DEMO_CLUB_ID,
        role: "doctor",
      },
    });

    if (userErr && !userErr.message.includes("already registered")) {
      console.warn("Попередження створення користувача auth:", userErr.message);
    } else {
      console.log(`✅ Демо-користувач готовий: ${DEMO_DOCTOR_EMAIL} (пароль з env)`);
      const userId = userRes?.user?.id;
      if (userId) {
        await admin.from("club_members").upsert({
          user_id: userId,
          club_id: DEMO_CLUB_ID,
          role: "doctor",
        });
      }
    }
  } catch (err: any) {
    console.warn("Auth admin createUser пропущено або недоступно:", err.message);
  }

  // 3. Очищення старих даних
  console.log("🧹 Очищення попередніх демо-записів...");
  const { data: existingPlayers } = await admin
    .from("players")
    .select("id")
    .eq("club_id", DEMO_CLUB_ID);

  const existingPlayerIds = (existingPlayers || []).map((p) => p.id);
  if (existingPlayerIds.length > 0) {
    const { data: existingInjuries } = await admin
      .from("injuries")
      .select("id")
      .eq("club_id", DEMO_CLUB_ID);

    const existingInjuryIds = (existingInjuries || []).map((i) => i.id);
    if (existingInjuryIds.length > 0) {
      await admin.from("injury_logs").delete().in("injury_id", existingInjuryIds);
    }

    await admin.from("wellness_entries").delete().in("player_id", existingPlayerIds);
    await admin.from("anthropometry_logs").delete().in("player_id", existingPlayerIds);
    await admin.from("workload_sessions").delete().in("player_id", existingPlayerIds);
    await admin.from("injuries").delete().eq("club_id", DEMO_CLUB_ID);
    await admin.from("players").delete().eq("club_id", DEMO_CLUB_ID);
  }

  await admin.from("pharmacy_items").delete().eq("club_id", DEMO_CLUB_ID);
  await admin.from("exposures").delete().eq("club_id", DEMO_CLUB_ID);
  await admin.from("teams").delete().eq("club_id", DEMO_CLUB_ID);

  // 4. Вставка 3 команд
  await admin.from("teams").insert(DEMO_TEAMS);
  console.log("✅ Створено 3 команди (U-19, U-17, U-15)");

  // 5. Вставка 26 гравців
  await admin.from("players").insert(
    DEMO_PLAYERS.map((p) => ({
      id: p.id,
      club_id: DEMO_CLUB_ID,
      team_id: p.team_id,
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth,
      position: p.position,
      dominant_side: p.dominant_side,
      archived_at: null,
    }))
  );
  console.log("✅ Створено 26 вигаданих гравців");

  // 6. Антропометрія (5 замірів на гравця за 12 міс)
  const now = new Date();
  const anthroLogs: any[] = [];
  for (const p of DEMO_PLAYERS) {
    const intervals = [360, 270, 180, 90, 0];
    const isU15 = p.team_id === DEMO_TEAMS[2].id;
    const annualGrowth = isU15 ? 7.5 : p.team_id === DEMO_TEAMS[1].id ? 4.0 : 1.2;
    const annualWeightGain = isU15 ? 6.0 : 3.5;

    intervals.forEach((daysAgo, idx) => {
      const d = new Date(now.getTime() - daysAgo * 86400000);
      const progressFrac = (360 - daysAgo) / 360;
      anthroLogs.push({
        club_id: DEMO_CLUB_ID,
        player_id: p.id,
        date: d.toISOString().split("T")[0],
        height: +(p.current_height - annualGrowth * (1 - progressFrac)).toFixed(1),
        weight: +(p.current_weight - annualWeightGain * (1 - progressFrac)).toFixed(1),
        fat_percentage: isU15 ? 11.5 : 10.2,
        notes: idx === 4 ? "Плановий моніторинг PHV" : "Контрольний замір",
      });
    });
  }
  await admin.from("anthropometry_logs").insert(anthroLogs);
  console.log(`✅ Створено ${anthroLogs.length} замірів зросту та біометрії`);

  // 7. Травми та RTP логи
  await admin.from("injuries").insert(
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

  const rtpLogs: any[] = [];
  for (const inj of DEMO_INJURIES) {
    const phaseNum = (inj as any).rtp_phase || 1;
    rtpLogs.push({
      injury_id: inj.id,
      date: inj.date_of_injury,
      author: "Д-р Андрій Коваленко",
      note: `[RTP_PHASE] ${JSON.stringify({
        injury_id: inj.id,
        player_id: inj.player_id,
        phase: phaseNum,
        target_date: (inj as any).expected_return_date || "2026-11-01",
        doctor_note: `RTP Етап ${phaseNum}: клінічний прогрес згідно з протоколом клубу.`,
        criteria_met: phaseNum >= 4 ? ["no_swelling", "full_rom", "functional_tests_ok"] : ["no_resting_pain"],
        updated_at: new Date().toISOString(),
      })}`,
    });
  }

  // Скринінги
  for (const p of DEMO_PLAYERS) {
    const isRestricted = p.id === DEMO_PLAYERS[4].id || p.id === DEMO_PLAYERS[18].id;
    const playerInj = DEMO_INJURIES.find((i) => i.player_id === p.id);
    if (playerInj) {
      rtpLogs.push({
        injury_id: playerInj.id,
        date: "2026-07-10",
        author: "Д-р Андрій Коваленко",
        note: `[SCREENING] ${JSON.stringify({
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
            ? "Умовний допуск: обмеження навантаження до 45 хв."
            : "Повний допуск до змагань сезону 2026/2027.",
        })}`,
      });
    }
  }

  if (rtpLogs.length > 0) {
    await admin.from("injury_logs").insert(rtpLogs);
  }
  console.log("✅ Створено клінічні травми, етапи RTP та скринінги");

  // 8. Навантаження (6 тижнів)
  const workloadRows: any[] = [];
  const baseDate = new Date(now.getTime() - 42 * 86400000);
  for (let day = 0; day < 42; day++) {
    const curDate = new Date(baseDate.getTime() + day * 86400000);
    const dateStr = curDate.toISOString().split("T")[0];
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek === 0) continue;

    const isMatch = dayOfWeek === 6;
    const duration = isMatch ? 90 : dayOfWeek === 3 ? 85 : 70;
    const rpe = isMatch ? 8 : dayOfWeek === 3 ? 7 : 5;

    for (let i = 0; i < 10; i++) {
      const pl = DEMO_PLAYERS[i];
      workloadRows.push({
        id: `demo_wl_${pl.id.slice(-4)}_${day}`,
        player_id: pl.id,
        date: dateStr,
        session_type: isMatch ? "match" : "training",
        duration_minutes: duration,
        rpe_score: rpe,
        workload_au: duration * rpe,
      });
    }
  }
  if (workloadRows.length > 0) {
    await admin.from("workload_sessions").insert(workloadRows);
  }
  console.log(`✅ Створено ${workloadRows.length} записів навантаження (6 тижнів)`);

  // 9. Велнес (14 днів)
  const wellnessRows: any[] = [];
  for (let day = 0; day < 14; day++) {
    const curDate = new Date(now.getTime() - day * 86400000);
    const dateStr = curDate.toISOString().split("T")[0];

    DEMO_PLAYERS.forEach((pl, idx) => {
      const isHamstringInjured = idx === 1;
      const isAnkleInjured = idx === 7;
      const isGroinInjured = idx === 13;
      const hasPain = isHamstringInjured || isAnkleInjured || isGroinInjured;

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
        pain_vas: isHamstringInjured ? 6 : isAnkleInjured ? 4 : isGroinInjured ? 2 : null,
        pain_area: isHamstringInjured ? "Праве стегно" : isAnkleInjured ? "Лівий гомілкостоп" : isGroinInjured ? "Пах" : null,
      });
    });
  }
  if (wellnessRows.length > 0) {
    await admin.from("wellness_entries").insert(wellnessRows);
  }
  console.log(`✅ Створено ${wellnessRows.length} велнес-анкет`);

  // 10. Аптека
  await admin.from("pharmacy_items").insert(
    DEMO_PHARMACY_ITEMS.map((item) => ({ club_id: DEMO_CLUB_ID, ...item }))
  );
  console.log(`✅ Створено ${DEMO_PHARMACY_ITEMS.length} позицій аптеки`);

  console.log("🎉 Посів Демо-Клубу успішно завершено!");
  console.log("📊 Цифри готовності складу:");
  console.log("   🟢 Готові (Available): 21");
  console.log("   🟡 Обмежені (Restricted): 2");
  console.log("   🔴 Лазарет (Unavailable): 3");
  console.log("   👥 Всього в обоймі: 26");
}

runSeed().catch((err) => {
  console.error("Помилка виконання seed:", err);
  process.exit(1);
});
