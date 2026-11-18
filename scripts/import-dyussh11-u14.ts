/**
 * Скрипт масового додавання 25 футболістів U-14 у клуб ДЮСШ-11.
 *
 * Запуск (перевірка без запису):
 *   npx tsx scripts/import-dyussh11-u14.ts --dry-run
 *
 * Запуск (створення анкет у БД):
 *   npx tsx scripts/import-dyussh11-u14.ts
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { normalizePosition, toDbPositionEn } from "../src/lib/dictionaries";
import type { PlayerMedicalAnamnesis } from "../src/types/player-anamnesis";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Відсутні NEXT_PUBLIC_SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY у .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type RosterPlayer = {
  lastName: string;
  firstName: string;
  dateOfBirth: string; // YYYY-MM-DD
  position: "ВР" | "ЦЗ" | "ЦП" | "НП";
  height: number;
  weight: number;
  phone: string;
};

const U14_ROSTER: RosterPlayer[] = [
  { lastName: "Береза",       firstName: "Ярослав",   dateOfBirth: "2013-12-24", position: "ЦЗ", height: 159, weight: 47, phone: "+380752179366" },
  { lastName: "Борисов",      firstName: "Гліб",      dateOfBirth: "2013-08-28", position: "ЦЗ", height: 168, weight: 55, phone: "+380754454632" },
  { lastName: "Войченко",     firstName: "Данило",    dateOfBirth: "2013-05-07", position: "НП", height: 162, weight: 46, phone: "+380986794347" },
  { lastName: "Галушкевич",   firstName: "Тимофій",   dateOfBirth: "2013-08-22", position: "ЦП", height: 164, weight: 63, phone: "+380968019755" },
  { lastName: "Давидов",      firstName: "Владислав", dateOfBirth: "2013-02-13", position: "ЦП", height: 169, weight: 53, phone: "+380979789470" },
  { lastName: "Дерюгін",      firstName: "Артем",     dateOfBirth: "2013-03-22", position: "ЦП", height: 160, weight: 41, phone: "+380961932351" },
  { lastName: "Дончев",       firstName: "Владислав", dateOfBirth: "2013-01-31", position: "ЦП", height: 154, weight: 36, phone: "+380968795592" },
  { lastName: "Драчук",       firstName: "Максим",    dateOfBirth: "2013-08-30", position: "ВР", height: 167, weight: 49, phone: "+380731239500" },
  { lastName: "Заковиря",     firstName: "Станіслав", dateOfBirth: "2013-02-27", position: "ЦЗ", height: 159, weight: 42, phone: "+380685251059" },
  { lastName: "Кадира",       firstName: "Ілля",      dateOfBirth: "2013-08-02", position: "ЦП", height: 158, weight: 40, phone: "+380966458849" },
  { lastName: "Карпенко",     firstName: "Назар",     dateOfBirth: "2013-11-09", position: "ЦЗ", height: 159, weight: 41, phone: "+380933539467" },
  { lastName: "Коболєв",      firstName: "Володимир", dateOfBirth: "2013-10-16", position: "ВР", height: 166, weight: 58, phone: "+380771161013" },
  { lastName: "Крутій",       firstName: "Станіслав", dateOfBirth: "2013-08-23", position: "ЦП", height: 159, weight: 41, phone: "+380683767126" },
  { lastName: "Лейко",        firstName: "Назар",     dateOfBirth: "2013-02-02", position: "ЦЗ", height: 180, weight: 53, phone: "+380664290067" },
  { lastName: "Мельник",      firstName: "Микита",    dateOfBirth: "2013-06-02", position: "ЦП", height: 177, weight: 58, phone: "+380662334044" },
  { lastName: "Міхайленко",   firstName: "Андрій",    dateOfBirth: "2013-12-03", position: "ЦЗ", height: 155, weight: 40, phone: "+380682913530" },
  { lastName: "Рандімб'ярсу", firstName: "Олександр", dateOfBirth: "2013-07-01", position: "ЦЗ", height: 165, weight: 51, phone: "+380500746603" },
  { lastName: "Робул",        firstName: "Ілля",      dateOfBirth: "2013-09-30", position: "ЦЗ", height: 150, weight: 38, phone: "+380633714994" },
  { lastName: "Свенцицький",  firstName: "Гліб",      dateOfBirth: "2013-09-11", position: "ЦП", height: 162, weight: 40, phone: "+380678373132" },
  { lastName: "Соколов",      firstName: "Олександр", dateOfBirth: "2013-11-01", position: "НП", height: 152, weight: 34, phone: "+380633342218" },
  { lastName: "Топов",        firstName: "Кирило",    dateOfBirth: "2013-05-16", position: "ЦЗ", height: 163, weight: 42, phone: "+380935622309" },
  { lastName: "Топунов",      firstName: "Денис",     dateOfBirth: "2013-03-11", position: "ЦЗ", height: 165, weight: 42, phone: "+380731277236" },
  { lastName: "Шевченко",     firstName: "Артем",     dateOfBirth: "2013-04-23", position: "ЦЗ", height: 181, weight: 58, phone: "+380969917943" },
  { lastName: "Федоров",      firstName: "Артем",     dateOfBirth: "2013-01-24", position: "ЦЗ", height: 165, weight: 59, phone: "+380503334732" },
  { lastName: "Юров",         firstName: "Дмитро",    dateOfBirth: "2013-02-08", position: "ЦЗ", height: 168, weight: 63, phone: "+380660188299" },
];

function generateRandom6DigitPin(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generatePortalToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

async function findTargetClubAndTeam() {
  const { data: clubs, error: clubErr } = await admin
    .from("clubs")
    .select("id, name");

  if (clubErr || !clubs?.length) {
    throw new Error(`Не вдалося отримати список клубів: ${clubErr?.message ?? "порожньо"}`);
  }

  // Шукаємо клуб ДЮСШ-11 / ДЮСШ 11 / ДЮСШ
  const club =
    clubs.find((c) => /дюсш[\s-]*11/i.test(c.name)) ??
    clubs.find((c) => /дюсш/i.test(c.name));

  if (!club) {
    const names = clubs.map((c) => `${c.name} (${c.id})`).join(", ");
    throw new Error(`Клуб ДЮСШ-11 не знайдено. Доступні клуби: ${names}`);
  }

  const { data: teams, error: teamErr } = await admin
    .from("teams")
    .select("id, name, category")
    .eq("club_id", club.id);

  if (teamErr || !teams?.length) {
    throw new Error(`У клубі «${club.name}» не знайдено команд: ${teamErr?.message ?? "порожньо"}`);
  }

  const u14Teams = teams.filter((t) =>
    /\bU[-\s]?14\b/i.test(t.name)
  );

  if (!u14Teams.length) {
    const names = teams.map((t) => t.name).join(", ");
    throw new Error(`У клубі «${club.name}» не знайдено команду U14. Доступні: ${names}`);
  }

  // Якщо команд U14 декілька, обираємо ту, до якої прив'язані тренери
  let selectedTeam = u14Teams[0];
  let coachCount = 0;

  for (const team of u14Teams) {
    const { count } = await admin
      .from("club_members")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("team_id", team.id);

    if ((count ?? 0) > coachCount) {
      coachCount = count ?? 0;
      selectedTeam = team;
    }
  }

  return { club, team: selectedTeam, coachCount };
}

async function insertPlayerWithPositionFallback(payload: Record<string, unknown>, position: string) {
  const first = await admin
    .from("players")
    .insert({ ...payload, position: toDbPositionEn(position) })
    .select("id")
    .single();

  if (first.error?.message?.includes("chk_player_canonical_position")) {
    return admin
      .from("players")
      .insert({ ...payload, position: normalizePosition(position) })
      .select("id")
      .single();
  }

  return first;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const { club, team, coachCount } = await findTargetClubAndTeam();

  console.log(`🏟️  Клуб: ${club.name} (${club.id})`);
  console.log(`⚽ Команда: ${team.name} (${team.id}) | Прив'язаних учасників/тренерів: ${coachCount}`);
  console.log(`📋 Гравців у списку: ${U14_ROSTER.length}`);
  if (isDryRun) {
    console.log("🔍 Режим --dry-run: зміни в БД не вносяться.\n");
  }

  const { data: existingPlayers, error: existErr } = await admin
    .from("players")
    .select("id, last_name, first_name, date_of_birth")
    .eq("club_id", club.id)
    .eq("team_id", team.id);

  if (existErr) {
    throw new Error(`Помилка перевірки існуючих гравців: ${existErr.message}`);
  }

  const today = new Date().toISOString().split("T")[0];
  let created = 0;
  let skipped = 0;
  const credentials: Array<{ name: string; dob: string; pos: string; pin: string; token: string }> = [];

  for (const p of U14_ROSTER) {
    const alreadyExists = (existingPlayers ?? []).some(
      (ep) =>
        ep.last_name?.trim().toLowerCase() === p.lastName.toLowerCase() &&
        ep.first_name?.trim().toLowerCase() === p.firstName.toLowerCase() &&
        ep.date_of_birth === p.dateOfBirth
    );

    if (alreadyExists) {
      console.log(`⏭️  Пропущено (вже існує): ${p.lastName} ${p.firstName} (${p.dateOfBirth})`);
      skipped++;
      continue;
    }

    if (isDryRun) {
      console.log(`✅ [DRY-RUN] Буде створено: ${p.lastName} ${p.firstName} | ${p.dateOfBirth} | ${p.position} | ${p.height} см / ${p.weight} кг | ${p.phone}`);
      created++;
      continue;
    }

    const initialPin = generateRandom6DigitPin();
    const pinHash = await hashPin(initialPin);
    const portalToken = generatePortalToken();

    const basePayload = {
      club_id: club.id,
      team_id: team.id,
      first_name: p.firstName,
      last_name: p.lastName,
      date_of_birth: p.dateOfBirth,
      sex: "male",
      dominant_leg: "right",
      dominant_arm: "right",
    };

    let { data: newPlayer, error } = await insertPlayerWithPositionFallback(
      {
        ...basePayload,
        portal_token: portalToken,
        pin_hash: pinHash,
        must_change_pin: true,
        failed_attempts: 0,
      },
      p.position
    );

    if (error) {
      const fallback = await insertPlayerWithPositionFallback(basePayload, p.position);
      newPlayer = fallback.data;
      error = fallback.error;
    }

    if (error || !newPlayer) {
      console.error(`❌ Помилка створення ${p.lastName} ${p.firstName}:`, error?.message);
      continue;
    }

    const playerId = newPlayer.id;

    // 1. Первинна антропометрія
    await admin.from("anthropometry_logs").insert({
      club_id: club.id,
      player_id: playerId,
      date: today,
      height: p.height,
      weight: p.weight,
      body_fat_pct: null,
    });

    // 2. Первинний анамнез (телефон, початкові зріст/вага)
    const anamnesisPayload: PlayerMedicalAnamnesis = {
      player_id: playerId,
      jersey_number: null,
      phone: p.phone,
      blood_type: null,
      allergies: null,
      past_injuries: null,
      initial_height: p.height,
      initial_weight: p.weight,
      created_at: new Date().toISOString(),
    };

    await admin.from("player_anamnesis").insert({
      club_id: club.id,
      player_id: playerId,
      date: today,
      jersey_number: null,
      phone: p.phone,
      blood_type: null,
      allergies: null,
      past_injuries: null,
      initial_height: p.height,
      initial_weight: p.weight,
      data: anamnesisPayload,
    });

    // 3. Резервне логування токена та PIN-хешу
    await admin.from("injury_logs").insert([
      {
        club_id: club.id,
        category: "note",
        date: today,
        note: `[PLAYER_PORTAL_TOKEN] ${JSON.stringify({ player_id: playerId, token: portalToken, created_at: new Date().toISOString() })}`,
      },
      {
        club_id: club.id,
        category: "note",
        date: today,
        note: `[PLAYER_PIN_HASH] ${JSON.stringify({ player_id: playerId, pin_hash: pinHash, must_change_pin: true, updated_at: new Date().toISOString() })}`,
      },
    ]);

    created++;
    credentials.push({
      name: `${p.lastName} ${p.firstName}`,
      dob: p.dateOfBirth,
      pos: p.position,
      pin: initialPin,
      token: portalToken,
    });
  }

  console.log(`\n🎉 Готово! Створено: ${created}, пропущено: ${skipped}.`);

  if (credentials.length > 0) {
    console.log("\n🔐 Згенеровані одноразові PIN-коди для входу в портал:");
    console.table(credentials);
  }
}

main().catch((err) => {
  console.error("❌ Критична помилка:", err.message || err);
  process.exit(1);
});
