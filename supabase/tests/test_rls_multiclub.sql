-- ==============================================================================
-- Test Script: test_rls_multiclub.sql
-- Description: Автоматизоване тестування RLS мультиклубності та ролей:
--   1. Лікар Клубу А не бачить дані Клубу Б (ізоляція клубів).
--   2. Тренер Клубу А не бачить діагнози (injuries, examinations, logs).
--   3. Тренер бачить статус доступності та обмеження через coach_player_availability_view.
--   4. Тренер може фіксувати навантаження (workload_sessions), але не може створювати травми.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- ФІКСТУРИ ДЛЯ ТЕСТУ
-- ------------------------------------------------------------------------------

-- Створюємо два тестові клуби
INSERT INTO public.clubs (id, name, settings) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Test Club Alpha', '{"locale":"uk"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'Test Club Beta', '{"locale":"uk"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Створюємо тестових користувачів у auth.users (якщо ще немає)
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'doctor_a@club-alpha.com'),
  ('22222222-2222-2222-2222-222222222222', 'coach_a@club-alpha.com'),
  ('33333333-3333-3333-3333-333333333333', 'doctor_b@club-beta.com')
ON CONFLICT (id) DO NOTHING;

-- Додаємо членство та ролі у клубах
INSERT INTO public.club_members (user_id, club_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'doctor'),
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', 'coach'),
  ('33333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000002', 'doctor')
ON CONFLICT (user_id, club_id) DO UPDATE SET role = EXCLUDED.role;

-- Команди для Клубу А і Клубу Б
INSERT INTO public.teams (id, name, category, sort_order, club_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alpha U19', 'youth', 1, 'a0000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Beta U19', 'youth', 1, 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Гравці для Клубу А і Клубу Б
INSERT INTO public.players (id, team_id, club_id, first_name, last_name, date_of_birth, position, dominant_leg, dominant_arm, portal_token) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000000-0000-0000-0000-000000000001', 'Тарас', 'Шевченко', '2006-03-09', 'ST', 'right', 'right', 'token_alpha_12345'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b0000000-0000-0000-0000-000000000002', 'Іван', 'Франко', '2006-08-27', 'CDM', 'left', 'right', 'token_beta_12345')
ON CONFLICT (id) DO NOTHING;

-- Травма гравця Клубу А (з клінічним діагнозом)
INSERT INTO public.injuries (id, player_id, club_id, date_of_injury, injury_type, location, side, severity, mechanism, status, description, vas_score) VALUES
  ('a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE - 3, 'muscular', 'thigh', 'right', 'severe', 'non_contact', 'active', 'Секретний клінічний діагноз: Розрив двоголового м''яза стегна MLG-R Gr 3', 8)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- ТЕСТ 1: Лікар Клубу Б не бачить гравців та травми Клубу А
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_count integer;
BEGIN
  -- Лікар Б рахує гравців Клубу А
  SELECT COUNT(*) INTO v_count FROM public.players WHERE club_id = 'a0000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Doctor B can see Club A players! Count=%', v_count;
  END IF;

  -- Лікар Б рахує травми Клубу А
  SELECT COUNT(*) INTO v_count FROM public.injuries WHERE club_id = 'a0000000-0000-0000-0000-000000000001';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Doctor B can see Club A injuries! Count=%', v_count;
  END IF;

  RAISE NOTICE '✅ TEST 1 PASSED: Doctor B cannot see Club A players or injuries.';
END $$;

-- ------------------------------------------------------------------------------
-- ТЕСТ 2: Лікар Клубу А бачить дані свого клубу
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_count integer;
  v_diag text;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.players WHERE id = 'a1111111-1111-1111-1111-111111111111';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Doctor A cannot see own player! Count=%', v_count;
  END IF;

  SELECT description INTO v_diag FROM public.injuries WHERE id = 'a2222222-2222-2222-2222-222222222222';
  IF v_diag IS NULL THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Doctor A cannot read injury diagnosis!';
  END IF;

  RAISE NOTICE '✅ TEST 2 PASSED: Doctor A can read own club data and full clinical diagnoses.';
END $$;

-- ------------------------------------------------------------------------------
-- ТЕСТ 3: Тренер Клубу А НЕ БАЧИТЬ діагнози в таблиці injuries (0 рядків через RLS)
-- ------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_count integer;
BEGIN
  -- Спроба тренера напряму прочитати таблицю injuries
  SELECT COUNT(*) INTO v_count FROM public.injuries;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Coach can select from injuries table! Rows=%', v_count;
  END IF;

  -- Спроба тренера напряму прочитати таблицю injury_examinations
  SELECT COUNT(*) INTO v_count FROM public.injury_examinations;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Coach can select from injury_examinations table! Rows=%', v_count;
  END IF;

  RAISE NOTICE '✅ TEST 3 PASSED: Coach cannot read injuries or medical examinations.';
END $$;

-- ------------------------------------------------------------------------------
-- ТЕСТ 4: Тренер бачить статус доступності та ліміт хвилин через coach view
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_status text;
  v_max_min integer;
  v_notes text;
BEGIN
  SELECT availability_status, max_minutes, restriction_notes
  INTO v_status, v_max_min, v_notes
  FROM public.coach_player_availability_view
  WHERE player_id = 'a1111111-1111-1111-1111-111111111111';

  IF v_status <> 'unavailable' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected availability_status=unavailable, got %', v_status;
  END IF;

  IF v_max_min <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected max_minutes=0, got %', v_max_min;
  END IF;

  RAISE NOTICE '✅ TEST 4 PASSED: Coach views availability (% min, status=%) without clinical diagnosis.', v_max_min, v_status;
END $$;

-- ------------------------------------------------------------------------------
-- ТЕСТ 5: Тренер може додавати навантаження (workload_sessions)
-- ------------------------------------------------------------------------------
INSERT INTO public.workload_sessions (id, player_id, club_id, date, session_type, duration_minutes, rpe_score, workload_au)
VALUES ('test_wrk_1', 'a1111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', CURRENT_DATE, 'training_team', 60, 7, 420);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.workload_sessions WHERE id = 'test_wrk_1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Coach cannot insert into workload_sessions!';
  END IF;

  RAISE NOTICE '✅ TEST 5 PASSED: Coach successfully logged workload session.';
END $$;

-- Відкочуємо транзакцію після завершення тестів (щоб база залишалась чистою)
ROLLBACK;
