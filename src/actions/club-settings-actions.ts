"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { assertDoctor, DEFAULT_CLUB_ID } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  type MatchdayProtocolClubSettings,
  DEFAULT_PROTOCOL_SETTINGS,
} from "@/types/protocol";
import {
  encryptServerSecret,
  decryptServerSecret,
  maskSecretValue,
} from "@/lib/server-crypto";

export interface ClubFullSettings {
  clubId: string;
  name: string;
  logoUrl: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  seasonStart: string;
  protocol: MatchdayProtocolClubSettings;
  telegram: {
    isConfigured: boolean;
    maskedBotToken: string;
    maskedChatId: string;
    botUsername: string;
  };
  teams: Array<{
    id: string;
    name: string;
    category: "youth" | "academy";
    sort_order: number;
    playerCount: number;
  }>;
}

/**
 * Отримує налаштування передматчевого протоколу клубу
 */
export async function getMatchdayProtocolSettingsAction(
  clubId?: string
): Promise<MatchdayProtocolClubSettings> {
  const targetClubId = clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", targetClubId)
      .maybeSingle();

    const stored = (club as any)?.settings?.matchday_protocol;
    if (stored && typeof stored === "object") {
      return {
        title: typeof stored.title === "string" && stored.title.trim().length > 0
          ? stored.title.trim()
          : DEFAULT_PROTOCOL_SETTINGS.title,
        is_official: Boolean(stored.is_official),
        default_doctor_name: typeof stored.default_doctor_name === "string" && stored.default_doctor_name.trim().length > 0
          ? stored.default_doctor_name.trim()
          : DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
        default_coach_name: typeof stored.default_coach_name === "string" && stored.default_coach_name.trim().length > 0
          ? stored.default_coach_name.trim()
          : DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
      };
    }
  } catch {}

  return DEFAULT_PROTOCOL_SETTINGS;
}

/**
 * Зберігає налаштування передматчевого протоколу
 */
export async function saveMatchdayProtocolSettingsAction(
  newSettings: Partial<MatchdayProtocolClubSettings>
): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const { data: club, error: fetchErr } = await admin
      .from("clubs")
      .select("settings")
      .eq("id", targetClubId)
      .maybeSingle();

    if (fetchErr) return { error: fetchErr.message };

    const currentSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const currentProtocol = (currentSettings.matchday_protocol || {}) as Record<string, any>;

    const updatedProtocol: MatchdayProtocolClubSettings = {
      title: newSettings.title?.trim() || currentProtocol.title || DEFAULT_PROTOCOL_SETTINGS.title,
      is_official: newSettings.is_official !== undefined ? Boolean(newSettings.is_official) : Boolean(currentProtocol.is_official),
      default_doctor_name: newSettings.default_doctor_name?.trim() || currentProtocol.default_doctor_name || DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
      default_coach_name: newSettings.default_coach_name?.trim() || currentProtocol.default_coach_name || DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
    };

    const updatedSettings = {
      ...currentSettings,
      matchday_protocol: updatedProtocol,
    };

    const { error: updateErr } = await admin
      .from("clubs")
      .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
      .eq("id", targetClubId);

    if (updateErr) return { error: updateErr.message };

    revalidatePath("/reports/matchday");
    revalidatePath("/admin/club-settings");
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Помилка збереження налаштувань протоколу клубу." };
  }
}

/**
 * Отримує повні налаштування клубу для екрану «Налаштування клубу»
 */
export async function getComprehensiveClubSettingsAction(): Promise<{
  settings?: ClubFullSettings;
  error?: string;
}> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const [{ data: club, error: clubErr }, { data: teamsData, error: teamsErr }] =
      await Promise.all([
        admin.from("clubs").select("*").eq("id", targetClubId).maybeSingle(),
        admin
          .from("teams")
          .select("id, name, category, sort_order, players(id)")
          .eq("club_id", targetClubId)
          .order("sort_order", { ascending: true }),
      ]);

    if (clubErr) return { error: clubErr.message };

    const settings = (club?.settings || {}) as Record<string, any>;
    const colors = settings.colors || {
      primary: "#0284c7",
      secondary: "#0f172a",
      accent: "#38bdf8",
    };

    const rawEncryptedToken = settings.telegram?.encrypted_token || "";
    const rawEncryptedChatId = settings.telegram?.encrypted_chat_id || "";
    const decryptedToken = decryptServerSecret(rawEncryptedToken);
    const decryptedChatId = decryptServerSecret(rawEncryptedChatId);

    const teams = (teamsData || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      category: (t.category as "youth" | "academy") || "academy",
      sort_order: t.sort_order ?? 0,
      playerCount: Array.isArray(t.players) ? t.players.length : 0,
    }));

    return {
      settings: {
        clubId: club?.id || targetClubId,
        name: club?.name || "Академія футболу",
        logoUrl: club?.logo_url || "/logo-chr.png",
        colors: {
          primary: colors.primary || "#0284c7",
          secondary: colors.secondary || "#0f172a",
          accent: colors.accent || "#38bdf8",
        },
        seasonStart: settings.season_start || "2026-07-01",
        protocol: {
          title: settings.matchday_protocol?.title || DEFAULT_PROTOCOL_SETTINGS.title,
          is_official: Boolean(settings.matchday_protocol?.is_official),
          default_doctor_name:
            settings.matchday_protocol?.default_doctor_name || DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
          default_coach_name:
            settings.matchday_protocol?.default_coach_name || DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
        },
        telegram: {
          isConfigured: Boolean(decryptedToken && decryptedChatId),
          maskedBotToken: decryptedToken ? maskSecretValue(decryptedToken) : "",
          maskedChatId: decryptedChatId ? maskSecretValue(decryptedChatId) : "",
          botUsername: settings.telegram?.bot_username || "",
        },
        teams,
      },
    };
  } catch (err: any) {
    return { error: err.message || "Помилка отримання налаштувань клубу." };
  }
}

/**
 * Зберігає оновлені комплексні налаштування клубу (White-Label)
 */
export async function saveComprehensiveClubSettingsAction(input: {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  seasonStart?: string;
  doctorName?: string;
  coachName?: string;
  protocolTitle?: string;
  newTelegramToken?: string;
  newTelegramChatId?: string;
  telegramBotUsername?: string;
}): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const { data: club } = await admin
      .from("clubs")
      .select("settings, name, logo_url")
      .eq("id", targetClubId)
      .maybeSingle();

    const currentSettings = ((club as any)?.settings || {}) as Record<string, any>;
    const currentTelegram = (currentSettings.telegram || {}) as Record<string, any>;

    // Шифруємо токен та чат, якщо надані нові значення
    let encryptedToken = currentTelegram.encrypted_token || "";
    if (input.newTelegramToken && input.newTelegramToken.trim().length > 0) {
      encryptedToken = encryptServerSecret(input.newTelegramToken.trim());
    }

    let encryptedChatId = currentTelegram.encrypted_chat_id || "";
    if (input.newTelegramChatId && input.newTelegramChatId.trim().length > 0) {
      encryptedChatId = encryptServerSecret(input.newTelegramChatId.trim());
    }

    const updatedSettings = {
      ...currentSettings,
      colors: {
        primary: input.primaryColor || currentSettings.colors?.primary || "#0284c7",
        secondary: input.secondaryColor || currentSettings.colors?.secondary || "#0f172a",
        accent: input.accentColor || currentSettings.colors?.accent || "#38bdf8",
      },
      season_start: input.seasonStart || currentSettings.season_start || "2026-07-01",
      matchday_protocol: {
        title: input.protocolTitle?.trim() || currentSettings.matchday_protocol?.title || DEFAULT_PROTOCOL_SETTINGS.title,
        is_official: currentSettings.matchday_protocol?.is_official ?? true,
        default_doctor_name:
          input.doctorName?.trim() ||
          currentSettings.matchday_protocol?.default_doctor_name ||
          DEFAULT_PROTOCOL_SETTINGS.default_doctor_name,
        default_coach_name:
          input.coachName?.trim() ||
          currentSettings.matchday_protocol?.default_coach_name ||
          DEFAULT_PROTOCOL_SETTINGS.default_coach_name,
      },
      telegram: {
        ...currentTelegram,
        encrypted_token: encryptedToken,
        encrypted_chat_id: encryptedChatId,
        bot_username: input.telegramBotUsername?.trim() || currentTelegram.bot_username || "",
      },
    };

    const { error: updateErr } = await admin
      .from("clubs")
      .update({
        name: input.name.trim() || club?.name || "Академія футболу",
        logo_url: input.logoUrl?.trim() || club?.logo_url || "/logo-chr.png",
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetClubId);

    if (updateErr) return { error: updateErr.message };

    revalidatePath("/admin/club-settings");
    revalidatePath("/");
    revalidatePath("/reports/matchday");

    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Помилка збереження налаштувань клубу." };
  }
}

/**
 * Створення нової команди в клубі
 */
export async function createClubTeamAction(input: {
  name: string;
  category: "youth" | "academy";
}): Promise<{ success?: boolean; teamId?: string; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const { data: newTeam, error } = await admin
      .from("teams")
      .insert({
        club_id: targetClubId,
        name: input.name.trim(),
        category: input.category,
        sort_order: 10,
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    revalidatePath("/admin/club-settings");
    revalidatePath("/availability");
    return { success: true, teamId: newTeam.id };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Видалення команди клубу
 */
export async function deleteClubTeamAction(
  teamId: string
): Promise<{ success?: boolean; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();

  try {
    // Перевірка прив'язаних гравців
    const { count } = await admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (count && count > 0) {
      return {
        error: `Неможливо видалити команду: в ній зареєстровано ${count} гравців. Спочатку переведіть їх до іншої команди.`,
      };
    }

    const { error } = await admin.from("teams").delete().eq("id", teamId);
    if (error) return { error: error.message };

    revalidatePath("/admin/club-settings");
    revalidatePath("/availability");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * Запрошення користувача в клуб за email з роллю
 */
export async function inviteClubUserAction(input: {
  email: string;
  role: "doctor" | "coach" | "admin";
  fullName?: string;
}): Promise<{ success?: boolean; message?: string; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  try {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return { error: "Некоректний email користувача." };
    }

    // Перевіряємо чи є вже такий користувач у Supabase Auth
    const { data: userRes, error: userErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName || email.split("@")[0],
        club_id: targetClubId,
        role: input.role,
      },
    });

    if (userErr && !userErr.message.includes("already registered")) {
      return { error: `Помилка створення запрошення: ${userErr.message}` };
    }

    const userId = userRes?.user?.id;
    if (userId) {
      await admin.from("club_members").upsert({
        user_id: userId,
        club_id: targetClubId,
        role: input.role,
      });
    }

    return {
      success: true,
      message: `Користувача ${email} успішно запрошено з роллю «${input.role}».`,
    };
  } catch (err: any) {
    return { error: err.message || "Помилка запрошення користувача." };
  }
}

export interface CsvImportRowError {
  row: number;
  name: string;
  error: string;
}

export interface CsvImportResult {
  success: boolean;
  totalRows: number;
  importedCount: number;
  errors: CsvImportRowError[];
}

/**
 * Імпорт гравців із CSV файлу (з детальною валідацією та звітом про помилки)
 */
export async function importPlayersFromCsvAction(
  csvContent: string,
  defaultTeamId?: string
): Promise<CsvImportResult> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return {
      success: false,
      totalRows: 0,
      importedCount: 0,
      errors: [{ row: 0, name: "Auth", error: auth.error || "Немає прав доступу" }],
    };
  }

  const targetClubId = auth.user.clubId || DEFAULT_CLUB_ID;
  const admin = createAdminClient();

  // Отримуємо існуючі команди для матчингу за назвою
  const { data: clubTeams } = await admin
    .from("teams")
    .select("id, name")
    .eq("club_id", targetClubId);

  const teamNameToId = new Map<string, string>();
  for (const t of clubTeams || []) {
    teamNameToId.set(t.name.trim().toLowerCase(), t.id);
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    return {
      success: false,
      totalRows: 0,
      importedCount: 0,
      errors: [{ row: 1, name: "Файл", error: "CSV файл порожній або містить лише заголовок" }],
    };
  }

  // Визначаємо роздільник: кома або крапка з комою
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const validPositions = new Set([
    "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
    "ВР", "ЦЗ", "ЛЗ", "ПЗ", "ОП", "ЦП", "АП", "ЛВ", "ПВ", "НП"
  ]);

  const posMapUaToEn: Record<string, string> = {
    ВР: "GK",
    ЦЗ: "CB",
    ЛЗ: "LB",
    ПЗ: "RB",
    ОП: "CDM",
    ЦП: "CM",
    АП: "CAM",
    ЛВ: "LW",
    ПВ: "RW",
    НП: "ST",
  };

  const rowsToInsert: any[] = [];
  const errors: CsvImportRowError[] = [];

  for (let idx = 1; idx < lines.length; idx++) {
    const rowNum = idx + 1;
    const line = lines[idx];

    // Парсимо колонки з урахуванням лапок
    const cols = line
      .split(delimiter)
      .map((c) => c.replace(/^["']|["']$/g, "").trim());

    if (cols.length < 3) {
      errors.push({
        row: rowNum,
        name: cols[0] || "—",
        error: "Недостатньо колонок. Очікується: Прізвище Ім'я, Дата народження, Позиція, Команда (опц.)",
      });
      continue;
    }

    const fullName = cols[0];
    const rawDob = cols[1];
    const rawPos = cols[2].toUpperCase();
    const rawTeam = cols[3] || "";
    const rawDominantSide = cols[4]?.toLowerCase() || "right";

    // 1. Валідація імені
    const nameParts = fullName.split(/\s+/);
    if (nameParts.length < 2) {
      errors.push({
        row: rowNum,
        name: fullName,
        error: "ПІБ має містити як мінімум прізвище та ім'я (наприклад: Шевченко Андрій)",
      });
      continue;
    }
    const lastName = nameParts[0];
    const firstName = nameParts.slice(1).join(" ");

    // 2. Валідація дати народження
    let normalizedDob = rawDob;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(rawDob)) {
      const [d, m, y] = rawDob.split(".");
      normalizedDob = `${y}-${m}-${d}`;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDob) || isNaN(new Date(normalizedDob).getTime())) {
      errors.push({
        row: rowNum,
        name: fullName,
        error: `Невірний формат дати народження '${rawDob}'. Очікується РРРР-ММ-ДД або ДД.ММ.РРРР`,
      });
      continue;
    }

    // 3. Валідація позиції
    if (!validPositions.has(rawPos)) {
      errors.push({
        row: rowNum,
        name: fullName,
        error: `Невідома позиція '${rawPos}'. Дозволені: GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST (або ВР, ЦЗ тощо)`,
      });
      continue;
    }
    const standardPos = posMapUaToEn[rawPos] || rawPos;

    // 4. Валідація команди
    let teamId = defaultTeamId;
    if (rawTeam && teamNameToId.has(rawTeam.toLowerCase())) {
      teamId = teamNameToId.get(rawTeam.toLowerCase());
    }

    if (!teamId && clubTeams && clubTeams.length > 0) {
      teamId = clubTeams[0].id;
    }

    if (!teamId) {
      errors.push({
        row: rowNum,
        name: fullName,
        error: "Не знайдено жодної команди для прив'язки гравця",
      });
      continue;
    }

    rowsToInsert.push({
      club_id: targetClubId,
      team_id: teamId,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: normalizedDob,
      position: standardPos,
      dominant_side: rawDominantSide === "left" || rawDominantSide === "both" ? rawDominantSide : "right",
      archived_at: null,
    });
  }

  // Вставка валідних рядків
  if (rowsToInsert.length > 0) {
    const { error: insertErr } = await admin.from("players").insert(rowsToInsert);
    if (insertErr) {
      return {
        success: false,
        totalRows: lines.length - 1,
        importedCount: 0,
        errors: [{ row: 0, name: "Database", error: insertErr.message }],
      };
    }
  }

  revalidatePath("/players");
  revalidatePath("/availability");
  revalidatePath("/admin/club-settings");

  return {
    success: rowsToInsert.length > 0,
    totalRows: lines.length - 1,
    importedCount: rowsToInsert.length,
    errors,
  };
}
