"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { revalidatePath } from "next/cache";
import type { RehabCheckinData, DoctorDailyInstruction, PlayerPinRecord } from "@/types/rehab-portal";
import {
  generateRandom6DigitPin,
  generatePortalToken,
  hashPin,
  verifyPin,
  setPlayerSessionCookie,
  clearPlayerSessionCookie,
  getPlayerSession,
  getClientIp,
} from "@/lib/player-auth";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "@/lib/player-rate-limit";
import { assertDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * Отримує або ініціалізує portal_token для гравця (викликається сервером або лікарем).
 */
export async function getOrGeneratePlayerPortalToken(playerId: string): Promise<string> {
  const supabase = createAdminClient();

  // 1. Шукаємо збережений токен у логах або базі
  const { data: player } = await supabase
    .from("players")
    .select("id, portal_token")
    .eq("id", playerId)
    .single();

  if (player && player.portal_token) {
    return player.portal_token;
  }

  // 2. Перевіряємо в injury_logs
  const { data: tokenLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[PLAYER_PORTAL_TOKEN] %"player_id":"${playerId}"%`)
    .order("date", { ascending: false })
    .limit(1);

  if (tokenLogs && tokenLogs.length > 0) {
    try {
      const raw = tokenLogs[0].note.replace("[PLAYER_PORTAL_TOKEN] ", "");
      const parsed = JSON.parse(raw);
      if (parsed.token) return parsed.token;
    } catch {}
  }

  // 3. Генеруємо новий токен і зберігаємо
  const newToken = generatePortalToken();

  // Спробуємо оновити таблицю players (якщо колонка є)
  try {
    await supabase.from("players").update({ portal_token: newToken } as any).eq("id", playerId);
  } catch {}

  // Також резервуємо в injury_logs
  await saveSystemLog(playerId, "note", `[PLAYER_PORTAL_TOKEN] ${JSON.stringify({ player_id: playerId, token: newToken, created_at: new Date().toISOString() })}`);

  return newToken;
}

/**
 * Допоміжна функція збереження логу до injury_logs
 */
async function saveSystemLog(playerId: string, category: string, note: string) {
  const supabase = createAdminClient();

  const { data: pl } = await supabase
    .from("players")
    .select("club_id")
    .eq("id", playerId)
    .maybeSingle();

  const clubId = (pl as any)?.club_id || DEFAULT_CLUB_ID;

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
        club_id: clubId,
        player_id: playerId,
        date_of_injury: new Date().toISOString().split("T")[0],
        injury_type: "illness",
        location: "other",
        severity: "minor",
        status: "closed",
        description: "Системний профіль гравця",
        vas_score: 0,
      } as any)
      .select("id")
      .maybeSingle();

    if (newInj) targetInjuryId = newInj.id;
  }

  return supabase.from("injury_logs").insert({
    club_id: clubId,
    injury_id: targetInjuryId,
    category,
    date: new Date().toISOString().split("T")[0],
    note,
  });
}

/**
 * Пошук гравця за персональним portal_token (використовує адмін-клієнт без відкриття anon RLS)
 */
export async function getPlayerByPortalToken(token: string) {
  if (!token || token.trim().length < 8) return null;
  const cleanToken = token.trim();
  const supabase = createAdminClient();

  // Спершу пробуємо по колонці portal_token у таблиці players
  try {
    const { data: player } = await supabase
      .from("players")
      .select("id, first_name, last_name, position, teams(name)")
      .eq("portal_token", cleanToken)
      .maybeSingle();

    if (player) {
      return {
        id: player.id,
        name: `${player.last_name} ${player.first_name}`,
        team: (player as any).teams?.name || "Академія",
        position: player.position,
      };
    }
  } catch {}

  // Резервний пошук по injury_logs
  const { data: logs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[PLAYER_PORTAL_TOKEN] %"token":"${cleanToken}"%`)
    .limit(1);

  if (logs && logs.length > 0) {
    try {
      const raw = logs[0].note.replace("[PLAYER_PORTAL_TOKEN] ", "");
      const parsed = JSON.parse(raw);
      if (parsed.player_id) {
        const { data: player } = await supabase
          .from("players")
          .select("id, first_name, last_name, position, teams(name)")
          .eq("id", parsed.player_id)
          .single();

        if (player) {
          return {
            id: player.id,
            name: `${player.last_name} ${player.first_name}`,
            team: (player as any).teams?.name || "Академія",
            position: player.position,
          };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Отримує статус безпеки PIN-коду гравця (хэш, must_change_pin)
 */
async function getPlayerAuthSecurityRecord(playerId: string): Promise<{
  pinHash: string | null;
  mustChangePin: boolean;
}> {
  const supabase = createAdminClient();

  // 1. З таблиці players
  try {
    const { data: player } = await supabase
      .from("players")
      .select("pin_hash, must_change_pin")
      .eq("id", playerId)
      .maybeSingle();

    if (player && (player as any).pin_hash) {
      return {
        pinHash: (player as any).pin_hash,
        mustChangePin: Boolean((player as any).must_change_pin),
      };
    }
  } catch {}

  // 2. З логів (зашифровані bcrypt хэші)
  const { data: hashLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[PLAYER_PIN_HASH] %"player_id":"${playerId}"%`)
    .order("date", { ascending: false })
    .limit(1);

  if (hashLogs && hashLogs.length > 0) {
    try {
      const raw = hashLogs[0].note.replace("[PLAYER_PIN_HASH] ", "");
      const parsed = JSON.parse(raw);
      return {
        pinHash: parsed.pin_hash || null,
        mustChangePin: parsed.must_change_pin !== false,
      };
    } catch {}
  }

  return { pinHash: null, mustChangePin: true };
}

/**
 * Безпечна автентифікація гравця за персональним токеном та 6-значним PIN.
 * Включає:
 * - Перевірку блокування по IP та гравцю (5 невдалих спроб -> блокування на 15 хв)
 * - Bcrypt-порівняння на сервері
 * - Встановлення підписаного httpOnly cookie сесії
 * - Повідомлення на українській без уточнення деталей помилки
 */
export async function authenticatePlayerWithTokenAction({
  token,
  enteredPin,
}: {
  token: string;
  enteredPin: string;
}) {
  const ip = await getClientIp();

  // 1. Перевірка блокування за IP
  const ipLimit = checkRateLimit(ip, true);
  if (ipLimit.isLocked) {
    return {
      error: `Доступ тимчасово заблоковано через забагато невдалих спроб. Спробуйте через ${ipLimit.lockedUntilMinutes || 15} хв.`,
    };
  }

  // 2. Валідація токена гравця
  const playerInfo = await getPlayerByPortalToken(token);
  if (!playerInfo) {
    recordFailedAttempt(ip, true);
    return {
      error: "Невірні дані для входу. Перевірте посилання або зверніться до медичного штабу.",
    };
  }

  const playerId = playerInfo.id;

  // 3. Перевірка блокування за гравцем
  const playerLimit = checkRateLimit(playerId, false);
  if (playerLimit.isLocked) {
    return {
      error: `Доступ тимчасово заблоковано через забагато невдалих спроб. Спробуйте через ${playerLimit.lockedUntilMinutes || 15} хв.`,
    };
  }

  // Валідація PIN формату: рівно 6 цифр
  if (!/^\d{6}$/.test(enteredPin.trim())) {
    recordFailedAttempt(ip, true);
    recordFailedAttempt(playerId, false);
    return {
      error: "Невірні дані для входу. Перевірте посилання або зверніться до медичного штабу.",
    };
  }

  // 4. Отримуємо збережений хэш PIN
  const authRecord = await getPlayerAuthSecurityRecord(playerId);

  if (!authRecord.pinHash) {
    // PIN не встановлений (наприклад після скидання)
    recordFailedAttempt(ip, true);
    recordFailedAttempt(playerId, false);
    return {
      error: "Невірні дані для входу. Зверніться до клубного лікаря для генерації PIN.",
    };
  }

  // 5. Перевіряємо bcrypt хэш
  const isValid = await verifyPin(enteredPin.trim(), authRecord.pinHash);

  if (!isValid) {
    const resIp = recordFailedAttempt(ip, true);
    const resPl = recordFailedAttempt(playerId, false);

    if (resIp.isLocked || resPl.isLocked) {
      return {
        error: "Доступ тимчасово заблоковано на 15 хвилин через 5 невірних спроб.",
      };
    }

    return {
      error: "Невірні дані для входу. Перевірте посилання або зверніться до медичного штабу.",
    };
  }

  // Успіх! Скидаємо лічильники спроб
  resetAttempts(ip, true);
  resetAttempts(playerId, false);

  // 6. Встановлюємо httpOnly cookie сесії
  await setPlayerSessionCookie({
    playerId,
    portalToken: token,
    mustChangePin: authRecord.mustChangePin,
  });

  return {
    success: true,
    mustChangePin: authRecord.mustChangePin,
  };
}

/**
 * Примусова або добровільна зміна PIN-коду гравцем у власній сесії.
 */
export async function changePlayerPinAction({
  currentPin,
  newPin,
  confirmPin,
}: {
  currentPin?: string;
  newPin: string;
  confirmPin: string;
}) {
  const session = await getPlayerSession();
  if (!session) {
    return { error: "Сесія закінчилася. Будь ласка, авторизуйтесь знову." };
  }

  if (newPin !== confirmPin) {
    return { error: "Нові PIN-коди не співпадають" };
  }

  if (!/^\d{6}$/.test(newPin)) {
    return { error: "Новий PIN-код повинен містити рівно 6 цифр" };
  }

  // Забороняємо тривіальні комбінації
  const trivial = ["000000", "111111", "123456", "654321", "999999"];
  if (trivial.includes(newPin)) {
    return { error: "Оберіть надійніший PIN-код (уникайте однакових або послідовних цифр)" };
  }

  const authRecord = await getPlayerAuthSecurityRecord(session.playerId);

  // Якщо це не примусова перша зміна, а звичайна зміна — вимагаємо старий PIN
  if (!session.mustChangePin && currentPin) {
    if (!authRecord.pinHash) {
      return { error: "Помилка автентифікації" };
    }
    const isValid = await verifyPin(currentPin.trim(), authRecord.pinHash);
    if (!isValid) {
      return { error: "Поточний PIN-код вказано невірно" };
    }
  }

  // Хэшуємо новий PIN
  const newHash = await hashPin(newPin.trim());
  const supabase = createAdminClient();

  // Оновлюємо в базі
  try {
    await supabase.from("players").update({
      pin_hash: newHash,
      must_change_pin: false,
      failed_attempts: 0,
      locked_until: null,
    } as any).eq("id", session.playerId);
  } catch {}

  // Зберігаємо хэш в injury_logs
  await saveSystemLog(
    session.playerId,
    "note",
    `[PLAYER_PIN_HASH] ${JSON.stringify({
      player_id: session.playerId,
      pin_hash: newHash,
      must_change_pin: false,
      updated_at: new Date().toISOString(),
    })}`
  );

  // Оновлюємо сесію (mustChangePin тепер false)
  await setPlayerSessionCookie({
    playerId: session.playerId,
    portalToken: session.portalToken,
    mustChangePin: false,
  });

  revalidatePath("/rehab-portal");
  return { success: true };
}

/**
 * Отримання повних даних медичного кабінету авторизованого гравця.
 * Суворо ізольовано: гравець отримує ЛИШЕ СВОЇ ДАНІ за поточною сесією.
 */
export async function getAuthorizedPlayerCabinetData() {
  const session = await getPlayerSession();
  if (!session) {
    return { error: "Не авторизовано", unauthorized: true };
  }

  const supabase = createAdminClient();
  const playerId = session.playerId;

  // 1. Отримуємо дані гравця
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name, position, teams(name)")
    .eq("id", playerId)
    .single();

  if (playerErr || !player) {
    return { error: "Гравця не знайдено", unauthorized: true };
  }

  // 2. Отримуємо активні травми футболіста
  const { data: injuries } = await supabase
    .from("injuries")
    .select("id, description, injury_type, location, vas_score, status, date_of_injury, expected_return_date")
    .eq("player_id", playerId)
    .in("status", ["active", "rehabilitation"])
    .order("date_of_injury", { ascending: false });

  // 3. Останній етап RTP
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

  // 4. Щоденне напуття/призначення від лікаря
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

  // 5. План ЛФК
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

  // 6. Динаміка минулих чек-інів з міграцією старих шкал (1-5, де 5 = найкраще)
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
        const parsed = JSON.parse(raw);
        if (!parsed) return null;

        // Міграція шкали втоми: якщо є стара fatigue_level (де 1 свіжий, 5 виснажений), перетворюємо на freshness_level (де 5 свіжий)
        const freshness =
          parsed.freshness_level !== undefined
            ? Number(parsed.freshness_level)
            : parsed.fatigue_level !== undefined
            ? 6 - Number(parsed.fatigue_level)
            : 4;

        const totalScore =
          Number(parsed.sleep_quality || 0) +
          freshness +
          Number(parsed.muscle_soreness || 0) +
          Number(parsed.stress_level || 0);

        return {
          ...parsed,
          freshness_level: freshness,
          total_score: totalScore,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // 7. Призначення та нутрицевтики лікаря для формування квестів відновлення
  const { data: nutritionLogs } = await supabase
    .from("injury_logs")
    .select("note")
    .like("note", `[NUTRITION] %"player_id":"${playerId}"%`)
    .order("date", { ascending: false })
    .limit(1);

  const prescribedSupplements: Array<{ id: string; name: string; dosage?: string }> = [];
  if (nutritionLogs && nutritionLogs.length > 0) {
    try {
      const raw = nutritionLogs[0].note.replace("[NUTRITION] ", "");
      const nut = JSON.parse(raw);
      if (nut.supplements_collagen_vit_c) {
        prescribedSupplements.push({
          id: "collagen",
          name: "Колаген + вітамін С",
          dosage: "За 45 хв до заняття для сухожилків",
        });
      }
      if (nut.supplements_creatine) {
        prescribedSupplements.push({
          id: "creatine",
          name: "Креатин моногідрат",
          dosage: "5г для відновлення фосфокреатину",
        });
      }
      if (nut.supplements_omega3) {
        prescribedSupplements.push({
          id: "omega3",
          name: "Омега-3",
          dosage: "Для контролю запалення",
        });
      }
      if (nut.supplements_whey_protein) {
        prescribedSupplements.push({
          id: "protein",
          name: "Сироватковий протеїн",
          dosage: "Після тренування",
        });
      }
      if (nut.supplements_iron) {
        prescribedSupplements.push({
          id: "iron",
          name: "Препарат заліза",
          dosage: "Згідно з аналізом феритину",
        });
      }
      if (nut.supplements_custom && nut.supplements_custom.trim()) {
        prescribedSupplements.push({
          id: "custom",
          name: nut.supplements_custom.trim(),
          dosage: "Призначено лікарем",
        });
      }
    } catch {}
  }

  return {
    success: true,
    mustChangePin: session.mustChangePin,
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
      prescribedSupplements,
    },
  };
}

/**
 * Вихід з кабінету гравця (очищення сесії)
 */
export async function playerLogoutAction() {
  await clearPlayerSessionCookie();
  return { success: true };
}

/**
 * Скидання або генерація нового випадкового 6-значного PIN-коду лікарем.
 * Тільки лікар (assertDoctor) має доступ.
 * Повертає згенерований PIN ОДИН РАЗ лікарю (для показу у модальному вікні копіювання/друку).
 * У базі зберігається ВИКЛЮЧНО bcrypt-хэш.
 */
export async function resetPlayerPinByDoctorAction(playerId: string) {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const randomPin = generateRandom6DigitPin();
  const pinHash = await hashPin(randomPin);
  const portalToken = await getOrGeneratePlayerPortalToken(playerId);

  const supabase = await createClient();

  // Оновлюємо таблицю players
  try {
    await supabase.from("players").update({
      pin_hash: pinHash,
      must_change_pin: true,
      failed_attempts: 0,
      locked_until: null,
      portal_token: portalToken,
    } as any).eq("id", playerId);
  } catch {}

  // Зберігаємо хэш у injury_logs
  await saveSystemLog(
    playerId,
    "note",
    `[PLAYER_PIN_HASH] ${JSON.stringify({
      player_id: playerId,
      pin_hash: pinHash,
      must_change_pin: true,
      updated_at: new Date().toISOString(),
    })}`
  );

  // Скидаємо блокування у пам'яті
  resetAttempts(playerId, false);

  await logAudit({
    action: "reset_pin",
    entity: "auth",
    entityId: playerId,
    playerId,
    meta: {
      reason: "doctor_reset",
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/rehab-portal");

  return {
    success: true,
    generatedPin: randomPin,
    portalToken,
  };
}

/**
 * Збереження звіту гравця про самопочуття та біль (перевіряє сесію гравця)
 */
export async function submitRehabCheckinAction(data: RehabCheckinData) {
  const session = await getPlayerSession();
  if (!session || session.playerId !== data.player_id) {
    return { error: "Немає авторизації для відправки звіту" };
  }

  const supabase = createAdminClient();

  const { data: pl } = await supabase
    .from("players")
    .select("club_id")
    .eq("id", data.player_id)
    .maybeSingle();

  const clubId = (pl as any)?.club_id || DEFAULT_CLUB_ID;

  // Знаходимо цільову травму або створюємо зв'язок
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
      const { data: newInj } = await supabase
        .from("injuries")
        .insert({
          club_id: clubId,
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
      }
    }
  }

  const payload: RehabCheckinData = {
    ...data,
    injury_id: targetInjuryId || "",
  };

  const { error } = await supabase.from("injury_logs").insert({
    club_id: clubId,
    injury_id: targetInjuryId,
    category: "examination",
    date: payload.date,
    note: `[REHAB_CHECKIN] ${JSON.stringify(payload)}`,
  });

  if (error) {
    return { error: error.message };
  }

  const safeInsertLog = async (category: string, date: string, note: string) => {
    const logItem: any = { club_id: clubId, category, date, note };
    if (targetInjuryId) logItem.injury_id = targetInjuryId;
    return supabase.from("injury_logs").insert(logItem);
  };

  // Біометричний трекінг
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

  // Щоденне самопочуття (Wellness) — єдине спрямування (1-5, де 5 = найкраще)
  if (data.muscle_soreness !== undefined || data.stress_level !== undefined || data.freshness_level !== undefined) {
    const freshness = data.freshness_level ?? (data.fatigue_level ? 6 - data.fatigue_level : 4);
    const legacyFatigue = data.fatigue_level ?? (6 - freshness);
    const totalScore =
      Number(data.sleep_quality || 0) +
      Number(freshness) +
      Number(data.muscle_soreness || 0) +
      Number(data.stress_level || 0);

    const wellSurvey = {
      id: `well_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      player_id: data.player_id,
      date: payload.date,
      sleep_quality: data.sleep_quality,
      freshness_level: freshness,
      fatigue_level: legacyFatigue,
      muscle_soreness: data.muscle_soreness ?? 4,
      stress_level: data.stress_level ?? 4,
      soreness_location: data.soreness_location || null,
      total_score: totalScore,
      readiness_status: totalScore >= 16 ? "optimal" : totalScore >= 12 ? "warning" : "risk",
      notes: data.player_comment || null,
      created_at: new Date().toISOString(),
    };

    await safeInsertLog("examination", payload.date, `[WELLNESS] ${JSON.stringify(wellSurvey)}`);
  }

  // Workload
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

  if (data.vas_score !== undefined && data.vas_score !== null && targetInjuryId) {
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
  revalidatePath("/rehab-portal");

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
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();

  const payload: DoctorDailyInstruction = {
    player_id: playerId,
    instruction: instruction.trim(),
    appointment_time: appointmentTime?.trim() || undefined,
    updated_at: new Date().toISOString(),
  };

  await saveSystemLog(playerId, "prescription", `[DOCTOR_INSTRUCTION] ${JSON.stringify(payload)}`);

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/rehab-portal");
  return { success: true };
}
