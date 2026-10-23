"use server";

import { createClient } from "@/utils/supabase/server";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  validateEhrExportConsent,
  buildEhrExportPayload,
  validateEhrImportPayload,
  generateEhrTransferPdfBase64,
} from "@/lib/ehr-transfer";
import {
  EHR_SECTIONS,
  type EhrExportOptions,
  type EhrTransferPayload,
  type EhrImportValidationReport,
} from "@/types/ehr-transfer";

export type EhrExportActionResult =
  | {
      success: true;
      payload: EhrTransferPayload;
      pdfBase64: string;
      filename: string;
    }
  | { success: false; error: string };

export type EhrImportValidationResult =
  | { success: true; report: EhrImportValidationReport }
  | { success: false; error: string };

export type EhrImportCommitResult =
  | { success: true; playerId: string; message: string }
  | { success: false; error: string };

/**
 * Експорт медичної картки гравця у стандартизований транспортний JSON та PDF
 */
export async function exportPlayerEhrAction(
  options: EhrExportOptions
): Promise<EhrExportActionResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;

  // 1. Перевірка згоди (Consent Gate)
  const consentValidation = validateEhrExportConsent(options.consent);
  if (!consentValidation.valid) {
    return { success: false, error: consentValidation.error || "Невалідна згода" };
  }

  const supabase = await createClient();

  // 2. Отримання даних гравця та клубу
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, club_id, first_name, last_name, date_of_birth, position, dominant_side")
    .eq("id", options.player_id)
    .eq("club_id", user.clubId)
    .maybeSingle();

  if (playerError || !player) {
    return { success: false, error: "Гравця не знайдено або відсутній доступ" };
  }

  const { data: club } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("id", user.clubId)
    .maybeSingle();

  const clubName = club?.name || "FC MedAcademy";

  // 3. Формування фільтра дат
  let dateFilterStart: string | null = null;
  const now = new Date();
  if (options.period === "current_season") {
    // Початок сезону: 1 липня поточного або попереднього року
    const currentYear = now.getFullYear();
    const seasonStartYear = now.getMonth() >= 6 ? currentYear : currentYear - 1;
    dateFilterStart = `${seasonStartYear}-07-01`;
  } else if (options.period === "last_12_months") {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    dateFilterStart = d.toISOString().split("T")[0];
  } else if (options.period === "custom" && options.start_date) {
    dateFilterStart = options.start_date;
  }

  const sectionsToFetch = new Set(options.sections || EHR_SECTIONS);
  const transferData: EhrTransferPayload["data"] = {};

  // АНТРОПОМЕТРІЯ
  if (sectionsToFetch.has("anthropometry")) {
    let q = supabase
      .from("anthropometry_logs")
      .select("date, height, weight, fat_percentage, notes")
      .eq("player_id", player.id)
      .eq("club_id", user.clubId)
      .order("date", { ascending: false });

    if (dateFilterStart) q = q.gte("date", dateFilterStart);
    if (options.period === "custom" && options.end_date) q = q.lte("date", options.end_date);

    const { data: anthro } = await q;
    transferData.anthropometry = (anthro || []).map((a) => ({
      date: a.date,
      height: a.height ? Number(a.height) : null,
      weight: a.weight ? Number(a.weight) : null,
      fat_percentage: a.fat_percentage ? Number(a.fat_percentage) : null,
      notes: a.notes,
    }));
  }

  // ТРАВМИ ТА ОГЛЯДИ
  if (sectionsToFetch.has("injuries") || sectionsToFetch.has("examinations")) {
    let qInj = supabase
      .from("injuries")
      .select("id, injury_type, location, side, date_of_injury, actual_return_date, expected_return_date, severity, mechanism, osiics_code, description, status")
      .eq("player_id", player.id)
      .eq("club_id", user.clubId)
      .order("date_of_injury", { ascending: false });

    if (dateFilterStart) qInj = qInj.gte("date_of_injury", dateFilterStart);
    if (options.period === "custom" && options.end_date) qInj = qInj.lte("date_of_injury", options.end_date);

    const { data: rawInjuries } = await qInj;
    const injuriesList = rawInjuries || [];

    if (sectionsToFetch.has("injuries")) {
      transferData.injuries = injuriesList.map((i) => ({
        injury_type: i.injury_type,
        location: i.location,
        side: i.side,
        date_of_injury: i.date_of_injury,
        actual_return_date: i.actual_return_date,
        expected_return_date: i.expected_return_date,
        severity: i.severity,
        mechanism: i.mechanism,
        osiics_code: i.osiics_code,
        description: i.description,
        status: i.status,
      }));
    }

    if (sectionsToFetch.has("examinations") && injuriesList.length > 0) {
      const injuryIds = injuriesList.map((i) => i.id);
      const { data: exams } = await supabase
        .from("injury_examinations")
        .select("date, pain_vas, swelling_grade, rom_grade, muscle_tone, palpation_pain, notes")
        .in("injury_id", injuryIds)
        .order("date", { ascending: false });

      transferData.examinations = (exams || []).map((e) => ({
        date: e.date,
        pain_vas: e.pain_vas,
        swelling_grade: e.swelling_grade,
        rom_grade: e.rom_grade,
        muscle_tone: e.muscle_tone,
        palpation_pain: Boolean(e.palpation_pain),
        notes: e.notes,
      }));
    }
  }

  // СКРИНІНГИ
  if (sectionsToFetch.has("screenings")) {
    let qSc = supabase
      .from("injury_logs")
      .select("date, note")
      .eq("category", "examination")
      .like("note", "[SCREENING]%")
      .order("date", { ascending: false });

    const { data: scLogs } = await qSc;
    transferData.screenings = (scLogs || [])
      .map((l) => {
        try {
          const raw = l.note.replace("[SCREENING] ", "");
          const parsed = JSON.parse(raw);
          if (parsed.player_id === player.id) {
            return {
              season: parsed.season || "2026/2027",
              date: parsed.date || l.date,
              examiner_doctor: parsed.examiner_doctor || "Лікар клубу",
              overall_status: parsed.overall_status || "cleared",
              valid_until: parsed.valid_until || "2027-06-30",
              cardio_clearance: Boolean(parsed.cardio_clearance),
              restrictions_notes: parsed.restrictions_notes || null,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
  }

  // ПРИЗНАЧЕННЯ ТА ЛІКИ
  if (sectionsToFetch.has("prescriptions")) {
    const { data: pLogs } = await supabase
      .from("injury_logs")
      .select("date, note")
      .like("note", "[TREATMENT]%")
      .order("date", { ascending: false });

    transferData.prescriptions = (pLogs || [])
      .map((l) => {
        try {
          const raw = l.note.replace("[TREATMENT] ", "");
          const parsed = JSON.parse(raw);
          if (parsed.player_id === player.id) {
            return {
              date: parsed.date || l.date,
              medication_name: parsed.medication_name || parsed.title || "Медикамент",
              dosage: parsed.dosage || "За протоколом",
              route: parsed.route || "oral",
              is_wada_prohibited: Boolean(parsed.is_wada_prohibited),
              prescribed_by: parsed.prescribed_by || user.fullName,
              notes: parsed.notes,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
  }

  // LSI ТЕСТИ
  if (sectionsToFetch.has("lsi")) {
    const { data: lsiLogs } = await supabase
      .from("injury_logs")
      .select("date, note")
      .like("note", "[LSI_ASSESSMENT]%")
      .order("date", { ascending: false });

    transferData.lsi = (lsiLogs || [])
      .map((l) => {
        try {
          const raw = l.note.replace("[LSI_ASSESSMENT] ", "");
          const parsed = JSON.parse(raw);
          if (parsed.player_id === player.id) {
            return {
              date: parsed.assessment_date || l.date,
              metric_name: parsed.metric_name || "Динамометрія",
              involved_value: parsed.involved_limb_value || 0,
              uninvolved_value: parsed.uninvolved_limb_value || 0,
              lsi_percentage: parsed.lsi_percentage || 100,
              status: parsed.symmetry_status || "optimal",
              notes: parsed.clinical_decision,
            };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
  }

  // 4. Побудова стандартизованого пакету
  const payload = buildEhrExportPayload({
    clubOrigin: { id: user.clubId, name: clubName },
    doctor: { id: user.id, name: user.fullName || "Лікар клубу" },
    player: {
      first_name: player.first_name,
      last_name: player.last_name,
      date_of_birth: player.date_of_birth,
      position: player.position,
      dominant_side: player.dominant_side || undefined,
    },
    consent: options.consent,
    sectionsIncluded: Array.from(sectionsToFetch),
    data: transferData,
  });

  // 5. Генерація PDF
  const pdfBase64 = generateEhrTransferPdfBase64(payload);

  // 6. Фіксація в Audit Log (без медичних діагнозів у meta)
  await logAudit({
    action: "export_player_ehr",
    entity: "player",
    entityId: player.id,
    playerId: player.id,
    clubId: user.clubId,
    userId: user.id,
    meta: {
      recipient_club: options.consent.recipient_club,
      transfer_purpose: options.consent.purpose,
      sections_count: payload.sections_included.length,
      period: options.period,
      export_id: payload.export_id,
      sha256: payload.content_sha256.slice(0, 16),
    },
  });

  const cleanName = `${player.last_name}_${player.first_name}`.replace(/\s+/g, "_");
  const filename = `EHR_Transfer_${cleanName}_${new Date().toISOString().split("T")[0]}`;

  return {
    success: true,
    payload,
    pdfBase64,
    filename,
  };
}

/**
 * Валідація JSON-файлу перенесення медкарти (Dry-Run перед імпортом)
 */
export async function validateEhrImportAction(
  jsonString: string
): Promise<EhrImportValidationResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { success: false, error: "Файл пошкоджений або не є валідним JSON-документом" };
  }

  const supabase = await createClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("club_id", user.clubId);

  const report = validateEhrImportPayload(parsed, players || []);
  return { success: true, report };
}

/**
 * Фіксація імпорту медкарти у базу приймаючого клубу (Commit Import)
 */
export async function commitEhrImportAction(params: {
  payload: EhrTransferPayload;
  targetPlayerId?: string;
  createNewPlayer?: boolean;
  targetTeamId?: string;
}): Promise<EhrImportCommitResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const { payload } = params;

  const supabase = await createClient();

  let playerId = params.targetPlayerId;

  // 1. Створення нового гравця, якщо обрано відповідний режим
  if (params.createNewPlayer || !playerId) {
    let teamId = params.targetTeamId;
    if (!teamId) {
      const { data: defaultTeam } = await supabase
        .from("teams")
        .select("id")
        .eq("club_id", user.clubId)
        .limit(1)
        .maybeSingle();

      teamId = defaultTeam?.id;
      if (!teamId) {
        return { success: false, error: "У клубі відсутня жодна команда для прив'язки новачка" };
      }
    }

    const { data: newPlayer, error: createPlayerErr } = await supabase
      .from("players")
      .insert({
        club_id: user.clubId,
        team_id: teamId,
        first_name: payload.player.first_name,
        last_name: payload.player.last_name,
        date_of_birth: payload.player.date_of_birth,
        position: payload.player.position,
        dominant_side: payload.player.dominant_side || "right",
      } as any)
      .select("id")
      .single();

    if (createPlayerErr || !newPlayer) {
      return { success: false, error: `Помилка створення картки гравця: ${createPlayerErr?.message}` };
    }

    playerId = newPlayer.id;
  }

  // 2. Імпорт антропометрії
  if (payload.data.anthropometry && payload.data.anthropometry.length > 0) {
    const anthroRows = payload.data.anthropometry.map((a) => ({
      club_id: user.clubId,
      player_id: playerId,
      date: a.date,
      height: a.height,
      weight: a.weight,
      fat_percentage: a.fat_percentage,
      notes: a.notes ? `[Імпорт з ${payload.club_origin.name}] ${a.notes}` : `Імпортовано з ${payload.club_origin.name}`,
    }));

    await supabase.from("anthropometry_logs").insert(anthroRows as any);
  }

  // 3. Імпорт травм
  if (payload.data.injuries && payload.data.injuries.length > 0) {
    const injuryRows = payload.data.injuries.map((i) => ({
      club_id: user.clubId,
      player_id: playerId,
      injury_type: i.injury_type,
      location: i.location,
      side: i.side,
      date_of_injury: i.date_of_injury,
      actual_return_date: i.actual_return_date,
      expected_return_date: i.expected_return_date,
      severity: i.severity,
      mechanism: i.mechanism,
      osiics_code: i.osiics_code,
      description: `[Імпортовано з ${payload.club_origin.name}] ${i.description || ""}`.trim(),
      status: "closed", // Імпортована історична травма переходить у closed
    }));

    await supabase.from("injuries").insert(injuryRows as any);
  }

  // 4. Фіксація в Audit Log
  await logAudit({
    action: "import_player_ehr",
    entity: "player",
    entityId: playerId,
    playerId: playerId,
    clubId: user.clubId,
    userId: user.id,
    meta: {
      origin_club: payload.club_origin.name,
      export_id: payload.export_id,
      records_imported:
        (payload.data.anthropometry?.length || 0) +
        (payload.data.injuries?.length || 0) +
        (payload.data.examinations?.length || 0),
    },
  });

  return {
    success: true,
    playerId,
    message: `Медичну карту успішно імпортовано з ${payload.club_origin.name} для гравця ${payload.player.last_name} ${payload.player.first_name}`,
  };
}
