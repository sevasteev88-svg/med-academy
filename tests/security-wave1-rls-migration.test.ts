import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20261119140000_wave1_rls_storage_rpc_hardening.sql"
);

test("Волна 1 (1.4) — Міграція RLS, Storage та SECURITY DEFINER RPC", async (t) => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  await t.test("містить базову функцію user_belongs_to_club та перевірку членства в клубі для тренера", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.user_belongs_to_club\(check_club_id uuid\)/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.coach_has_team_access\(check_team_id uuid\)/);
    assert.match(sql, /JOIN public\.club_members cm ON cm\.user_id = auth\.uid\(\) AND cm\.club_id = t\.club_id/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_access_player\(check_club_id uuid, check_player_id uuid\)/);
  });

  await t.test("автоматично видаляє політики з USING (true), WITH CHECK (true) та anon", () => {
    assert.match(sql, /FROM pg_policies/);
    assert.match(sql, /btrim\(COALESCE\(qual, ''\)\) IN \('true', '\(true\)'\)/);
    assert.match(sql, /DROP POLICY IF EXISTS "clubs_insert_auth" ON public\.clubs/);
    assert.match(sql, /DROP POLICY IF EXISTS "ip_attempts_staff_view" ON public\.player_auth_ip_attempts/);
  });

  await t.test("захищає club_members та profiles від самопризначення ролей", () => {
    assert.match(sql, /CREATE POLICY "club_members_insert_admin" ON public\.club_members[\s\S]*?WITH CHECK \(public\.is_club_admin\(club_id\)\)/);
    assert.match(sql, /CREATE POLICY "club_members_update_admin" ON public\.club_members[\s\S]*?USING \(public\.is_club_admin\(club_id\)\)/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.prevent_profile_role_escalation\(\)/);
    assert.match(sql, /CREATE TRIGGER trg_prevent_profile_role_escalation/);
  });

  await t.test("прибирає тавтологічні політики на wellness_entries та wearable_entries і закриває parent_messages", () => {
    assert.match(sql, /DROP POLICY IF EXISTS "wellness_entries_player_select" ON public\.wellness_entries/);
    assert.match(sql, /DROP POLICY IF EXISTS "wearable_entries_player_select" ON public\.wearable_entries/);
    assert.match(sql, /CREATE POLICY "parent_messages_doctor_admin"[\s\S]*?public\.has_club_role\(club_id, ARRAY\['doctor', 'admin'\]\)/);
    assert.match(sql, /CREATE POLICY "audit_log_select_admin"[\s\S]*?public\.is_club_admin\(club_id\)/);
  });

  await t.test("ізолює Storage-бакети consent_scans та injury-documents за club_id", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.storage_object_club_id\(object_name text\)/);
    assert.match(sql, /CREATE POLICY "consent_scans_select_doctor_admin"[\s\S]*?public\.storage_object_club_id\(name\)/);
    assert.match(sql, /CREATE POLICY "injury_documents_select_doctor_admin"[\s\S]*?public\.storage_object_club_id\(name\)/);
  });

  await t.test("відкликає публічний доступ (PUBLIC, anon, authenticated) до чутливих SECURITY DEFINER RPC", () => {
    assert.match(
      sql,
      /REVOKE EXECUTE ON FUNCTION public\.get_player_by_portal_token\(text\) FROM PUBLIC, anon, authenticated/
    );
    assert.match(
      sql,
      /REVOKE EXECUTE ON FUNCTION public\.get_player_subscription_status\(uuid\) FROM PUBLIC, anon, authenticated/
    );
  });
});
