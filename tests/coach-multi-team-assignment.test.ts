import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canUserAccessTeam, type TeamAccessUser } from "../src/lib/team-access.ts";

describe("Багатокомандний доступ тренерів та розмежування за віковими групами", () => {
  const doctorUser: TeamAccessUser = {
    id: "user-doctor-1",
    role: "doctor",
    teamId: null,
    teamIds: [],
  };

  const adminUser: TeamAccessUser = {
    id: "user-admin-1",
    role: "admin",
    teamId: null,
    teamIds: [],
  };

  const coachWithoutTeams: TeamAccessUser = {
    id: "user-coach-new",
    role: "coach",
    teamId: null,
    teamIds: [],
  };

  const coachWithTeams: TeamAccessUser = {
    id: "user-coach-assigned",
    role: "coach",
    teamId: "team-u14",
    teamIds: ["team-u14", "team-u15"],
  };

  describe("1. Допоміжна функція canUserAccessTeam", () => {
    it("лікар та адміністратор мають доступ до будь-якої команди", () => {
      assert.equal(canUserAccessTeam(doctorUser, "team-u14"), true);
      assert.equal(canUserAccessTeam(doctorUser, "team-u19"), true);
      assert.equal(canUserAccessTeam(adminUser, "team-u14"), true);
      assert.equal(canUserAccessTeam(adminUser, "team-u19"), true);
    });

    it("новий тренер без призначених команд не має доступу до жодної команди", () => {
      assert.equal(canUserAccessTeam(coachWithoutTeams, "team-u14"), false);
      assert.equal(canUserAccessTeam(coachWithoutTeams, "team-u15"), false);
      assert.equal(canUserAccessTeam(coachWithoutTeams, "team-u19"), false);
      assert.equal(canUserAccessTeam(coachWithoutTeams, null), false);
    });

    it("тренер із кількома закріпленими командами має доступ лише до них", () => {
      assert.equal(canUserAccessTeam(coachWithTeams, "team-u14"), true);
      assert.equal(canUserAccessTeam(coachWithTeams, "team-u15"), true);
      assert.equal(canUserAccessTeam(coachWithTeams, "team-u16"), false);
      assert.equal(canUserAccessTeam(coachWithTeams, "team-u19"), false);
    });

    it("безпечно обробляє порожнього користувача або null", () => {
      assert.equal(canUserAccessTeam(null, "team-u14"), false);
      assert.equal(canUserAccessTeam(null, null), false);
    });
  });

  describe("2. Перевірка наявності та структури SQL-міграції", () => {
    it("файл міграції coach_multi_team_access_and_rls існує та містить усі необхідні сутності", () => {
      const migrationFile = path.resolve(
        process.cwd(),
        "supabase/migrations/20261031190000_coach_multi_team_access_and_rls.sql"
      );
      assert.ok(fs.existsSync(migrationFile), "Файл міграції повинен існувати");

      const sqlContent = fs.readFileSync(migrationFile, "utf-8");

      // Таблиця та індекси
      assert.ok(sqlContent.includes("CREATE TABLE IF NOT EXISTS public.coach_team_assignments"));
      assert.ok(sqlContent.includes("uq_coach_team_assignment UNIQUE (coach_user_id, team_id)"));

      // Функції
      assert.ok(sqlContent.includes("CREATE OR REPLACE FUNCTION public.coach_has_team_access"));
      assert.ok(sqlContent.includes("CREATE OR REPLACE FUNCTION public.can_access_team"));

      // RLS політики
      assert.ok(sqlContent.includes("DROP POLICY IF EXISTS \"teams_select_member\" ON public.teams;"));
      assert.ok(sqlContent.includes("DROP POLICY IF EXISTS \"players_select_member\" ON public.players;"));
      assert.ok(sqlContent.includes("DROP POLICY IF EXISTS \"coach_team_assignments_mutation_admin\""));
    });
  });
});
