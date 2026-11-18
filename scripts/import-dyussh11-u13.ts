/**
 * Скрипт створення команди ДЮСШ-11 U13, двох тренерів (Зенков С.М., Єременко Є.С.)
 * та масового додавання 37 футболістів (з двох заявочних листів).
 *
 * Запуск:
 *   npx tsx scripts/import-dyussh11-u13.ts
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { normalizePosition, toDbPositionEn } from "../src/lib/dictionaries";

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
  dateOfBirth: string;
  position: "ВР" | "ЦЗ" | "ЦП" | "НП";
};

const U13_ROSTER: RosterPlayer[] = [
  // Лист 1 (19 гравців)
  { lastName: "Будькевич",      firstName: "Даніїл",    dateOfBirth: "2014-10-17", position: "ВР" },
  { lastName: "Гамарець",       firstName: "Артем",     dateOfBirth: "2014-06-06", position: "ВР" },
  { lastName: "Олійнічук",      firstName: "Леонід",    dateOfBirth: "2014-10-29", position: "ЦП" },
  { lastName: "Бабілов",        firstName: "Артур",     dateOfBirth: "2014-11-02", position: "ЦП" },
  { lastName: "Даскалеску",     firstName: "Захар",     dateOfBirth: "2014-10-10", position: "ЦЗ" },
  { lastName: "Чечельницький",  firstName: "Тимофій",   dateOfBirth: "2014-05-28", position: "ЦП" },
  { lastName: "Дроняк",         firstName: "Артур",     dateOfBirth: "2014-08-04", position: "ЦЗ" },
  { lastName: "Колесніченко",   firstName: "Платон",    dateOfBirth: "2014-03-17", position: "ЦП" },
  { lastName: "Бородюк",        firstName: "Роман",     dateOfBirth: "2014-06-15", position: "ЦП" },
  { lastName: "Шевцов",         firstName: "Тимур",     dateOfBirth: "2014-07-01", position: "ЦП" },
  { lastName: "Єременко",       firstName: "Родіон",    dateOfBirth: "2014-01-21", position: "ЦП" },
  { lastName: "Губогло",        firstName: "Тимур",     dateOfBirth: "2014-08-20", position: "ЦП" },
  { lastName: "Стрельцов",      firstName: "Савелій",   dateOfBirth: "2014-11-18", position: "ЦП" },
  { lastName: "Іванов",         firstName: "Данило",    dateOfBirth: "2014-06-13", position: "НП" },
  { lastName: "Голованчук",     firstName: "Максим",    dateOfBirth: "2014-10-17", position: "ЦЗ" },
  { lastName: "Вовкович",       firstName: "Нікіта",    dateOfBirth: "2014-04-16", position: "ЦЗ" },
  { lastName: "Барбул",         firstName: "Ілля",      dateOfBirth: "2014-05-02", position: "ЦП" },
  { lastName: "Бобашинській",   firstName: "Тімур",     dateOfBirth: "2014-07-08", position: "ЦП" },
  { lastName: "Жуковський",     firstName: "Даніїл",    dateOfBirth: "2014-06-25", position: "НП" },

  // Лист 2 (18 гравців)
  { lastName: "Бусіока",        firstName: "Максим",    dateOfBirth: "2014-11-24", position: "ВР" },
  { lastName: "Ванін",          firstName: "Тихон",     dateOfBirth: "2014-05-16", position: "ВР" },
  { lastName: "Семенко",        firstName: "Дмитро",    dateOfBirth: "2014-07-21", position: "ЦЗ" },
  { lastName: "Березан",        firstName: "Кирило",    dateOfBirth: "2014-06-17", position: "ЦЗ" },
  { lastName: "Кузьмічов",      firstName: "Давід",     dateOfBirth: "2014-01-13", position: "ЦЗ" },
  { lastName: "Давиденко",      firstName: "Єгор",      dateOfBirth: "2014-11-24", position: "ЦЗ" },
  { lastName: "Тарасов",        firstName: "Данило",    dateOfBirth: "2014-09-27", position: "ЦП" },
  { lastName: "Король",         firstName: "Ярослав",   dateOfBirth: "2014-09-29", position: "ЦП" },
  { lastName: "Шкригалов",      firstName: "Юрій",      dateOfBirth: "2014-05-02", position: "ЦП" },
  { lastName: "Дудко",          firstName: "Владислав", dateOfBirth: "2014-09-17", position: "ЦП" },
  { lastName: "Пила",           firstName: "Єгор",      dateOfBirth: "2014-06-04", position: "ЦЗ" },
  { lastName: "Бевз",           firstName: "Макар",     dateOfBirth: "2014-11-24", position: "ЦЗ" },
  { lastName: "Бичинюк",        firstName: "Артем",     dateOfBirth: "2014-06-11", position: "НП" },
  { lastName: "Чечельницький",  firstName: "Олександр", dateOfBirth: "2014-10-10", position: "ЦП" },
  { lastName: "Єлькін",         firstName: "Єгор",      dateOfBirth: "2015-08-15", position: "НП" },
  { lastName: "Терзіогло",      firstName: "Олександр", dateOfBirth: "2015-04-06", position: "ЦП" },
  { lastName: "Друзенко",       firstName: "Глєб",      dateOfBirth: "2015-03-04", position: "ЦП" },
  { lastName: "Кваша",          firstName: "Давид",     dateOfBirth: "2014-08-22", position: "ЦП" },
];

type CoachSpec = {
  fullName: string;
  email: string;
};

const COACHES: CoachSpec[] = [
  { fullName: "Зенков Сергій Михайлович",   email: "zenkov.u13@dyussh11.app" },
  { fullName: "Єременко Євген Сергійович", email: "eremenko.u13@dyussh11.app" },
];

function generateRandom6DigitPin(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateTempPassword(): string {
  return `U13-${crypto.randomBytes(4).toString("hex")}`;
}

function generatePortalToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function hashPin(pin: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

async function findClub() {
  const { data: clubs, error } = await admin.from("clubs").select("id, name");
  if (error || !clubs?.length) {
    throw new Error(`Не вдалося отримати клуби: ${error?.message ?? "порожньо"}`);
  }
  const club =
    clubs.find((c) => /дюсш[\s-]*11/i.test(c.name)) ??
    clubs.find((c) => /дюсш/i.test(c.name));
  if (!club) throw new Error("Клуб ДЮСШ-11 не знайдено");
  return club;
}

async function findOrCreateU13Team(clubId: string) {
  const { data: teams } = await admin
    .from("teams")
    .select("id, name, category")
    .eq("club_id", clubId);

  const existing = (teams ?? []).find((t) => /\bU[-\s]?13\b/i.test(t.name));
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("teams")
    .insert({
      club_id: clubId,
      name: "ДЮСШ-11 U13",
      category: "academy",
      sort_order: 2,
    })
    .select("id, name, category")
    .single();

  if (error || !created) {
    throw new Error(`Не вдалося створити команду ДЮСШ-11 U13: ${error?.message}`);
  }
  return created;
}

async function ensureCoach(clubId: string, teamId: string, assignedBy: string | null, spec: CoachSpec) {
  const { data: usersList } = await admin.auth.admin.listUsers();
  let user = usersList?.users?.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());
  let tempPassword: string | null = null;

  if (!user) {
    tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: spec.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: spec.fullName,
        club_id: clubId,
        role: "coach",
        must_change_password: true,
      },
    });
    if (createErr || !created.user) {
      throw new Error(`Помилка створення тренера ${spec.fullName}: ${createErr?.message}`);
    }
    user = created.user;
  }

  await admin.from("profiles").upsert({
    id: user.id,
    full_name: spec.fullName,
    role: "coach",
    team_id: teamId,
  });

  const { data: existingMember } = await admin
    .from("club_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("club_id", clubId)
    .maybeSingle();

  if (existingMember) {
    await admin
      .from("club_members")
      .update({ role: "coach", team_id: teamId })
      .eq("id", existingMember.id);
  } else {
    await admin.from("club_members").insert({
      user_id: user.id,
      club_id: clubId,
      role: "coach",
      team_id: teamId,
    });
  }

  const { data: existingAssign } = await admin
    .from("coach_team_assignments")
    .select("id")
    .eq("club_id", clubId)
    .eq("coach_user_id", user.id)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!existingAssign) {
    await admin.from("coach_team_assignments").insert({
      club_id: clubId,
      coach_user_id: user.id,
      team_id: teamId,
      assigned_by: assignedBy,
    });
  }

  return {
    fullName: spec.fullName,
    email: spec.email,
    tempPassword: tempPassword ?? "(існуючий пароль)",
    userId: user.id,
  };
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
  const club = await findClub();
  const team = await findOrCreateU13Team(club.id);

  const { data: adminMember } = await admin
    .from("club_members")
    .select("user_id")
    .eq("club_id", club.id)
    .in("role", ["admin", "doctor"])
    .limit(1)
    .maybeSingle();

  console.log(`🏟️  Клуб: ${club.name} (${club.id})`);
  console.log(`⚽ Команда: ${team.name} (${team.id})`);

  const coachResults = [];
  for (const c of COACHES) {
    coachResults.push(await ensureCoach(club.id, team.id, adminMember?.user_id ?? null, c));
  }
  console.log("\n👨‍🏫 Тренери команди ДЮСШ-11 U13:");
  console.table(coachResults);

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
  const credentials: Array<{ name: string; dob: string; pos: string; pin: string }> = [];

  for (const p of U13_ROSTER) {
    const alreadyExists = (existingPlayers ?? []).some(
      (ep) =>
        ep.last_name?.trim().toLowerCase() === p.lastName.toLowerCase() &&
        ep.first_name?.trim().toLowerCase() === p.firstName.toLowerCase() &&
        ep.date_of_birth === p.dateOfBirth
    );

    if (alreadyExists) {
      skipped++;
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

    await admin.from("injury_logs").insert([
      {
        club_id: club.id,
        category: "note",
        date: today,
        note: `[PLAYER_PORTAL_TOKEN] ${JSON.stringify({ player_id: newPlayer.id, token: portalToken, created_at: new Date().toISOString() })}`,
      },
      {
        club_id: club.id,
        category: "note",
        date: today,
        note: `[PLAYER_PIN_HASH] ${JSON.stringify({ player_id: newPlayer.id, pin_hash: pinHash, must_change_pin: true, updated_at: new Date().toISOString() })}`,
      },
    ]);

    created++;
    credentials.push({
      name: `${p.lastName} ${p.firstName}`,
      dob: p.dateOfBirth,
      pos: p.position,
      pin: initialPin,
    });
  }

  console.log(`\n🎉 Гравці U13 — створено: ${created}, пропущено: ${skipped}.`);
  if (credentials.length > 0) {
    console.table(credentials);
  }
}

main().catch((err) => {
  console.error("❌ Критична помилка:", err.message || err);
  process.exit(1);
});
