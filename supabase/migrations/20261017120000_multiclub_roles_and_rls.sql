-- ==============================================================================
-- Migration: 20261017120000_multiclub_roles_and_rls.sql
-- Description: Мультиклубність, ролі ('doctor', 'coach', 'admin'), RLS-політики
--              та представлення для тренерського штабу (coach view).
--
-- УВАГА: Міграцію ТІЛЬКИ СТВОРЕНО, НЕ ЗАСТОСОВАНО автоматично.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ТАБЛИЦІ: clubs ТА club_members
-- ------------------------------------------------------------------------------

-- Створюємо таблицю клубів
CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clubs IS 'Футбольні клуби / організації в системі MedAcademy';
COMMENT ON COLUMN public.clubs.settings IS 'Налаштування клубу (локаль, кольори, інтеграції, сповіщення)';

-- Створюємо таблицю членства користувачів у клубах з ролями
CREATE TABLE IF NOT EXISTS public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('doctor', 'coach', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_club_members_user_club UNIQUE (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_user_id ON public.club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_members_club_id ON public.club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_lookup ON public.club_members(user_id, club_id, role);

COMMENT ON TABLE public.club_members IS 'Зв''язок користувачів із клубами та їхні ролі: doctor, coach, admin';

-- ------------------------------------------------------------------------------
-- 2. СТВОРЕННЯ ДОПОМІЖНИХ ТАБЛИЦЬ ДАНИХ (ЯКЩО ЩЕ НЕ ІСНУЮТЬ)
--    wellness_surveys, workload_sessions, pharmacy_items
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wellness_surveys (
  id text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  sleep_quality smallint NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  fatigue_level smallint NOT NULL CHECK (fatigue_level BETWEEN 1 AND 5),
  muscle_soreness smallint NOT NULL CHECK (muscle_soreness BETWEEN 1 AND 5),
  stress_level smallint NOT NULL CHECK (stress_level BETWEEN 1 AND 5),
  soreness_location text,
  total_score smallint NOT NULL,
  readiness_status text NOT NULL CHECK (readiness_status IN ('optimal', 'warning', 'risk')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wellness_player_date UNIQUE (player_id, date)
);

CREATE TABLE IF NOT EXISTS public.workload_sessions (
  id text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  session_type text NOT NULL,
  duration_minutes integer NOT NULL,
  rpe_score smallint NOT NULL CHECK (rpe_score BETWEEN 1 AND 10),
  workload_au integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active_substance text,
  category text NOT NULL,
  stock_count numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'шт',
  min_alert_threshold numeric NOT NULL DEFAULT 5,
  expiry_date date,
  wada_status text NOT NULL DEFAULT 'allowed',
  storage_location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. ДОДАВАННЯ club_id У ВСІ ТАБЛИЦІ З ДАНИМИ
-- ------------------------------------------------------------------------------

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.injuries ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.injury_examinations ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.injury_logs ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.rehab_phases ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.anthropometry_logs ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.maturation_assessments ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.wellness_surveys ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.workload_sessions ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;
ALTER TABLE public.pharmacy_items ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------------------
-- 4. ЗАПОВНЕННЯ ТЕКУЧИМ КЛУБОМ (SEEDING DEFAULT CLUB & BACKFILL)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  v_default_club_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- 1. Створюємо базовий клуб ФК «Чорноморець» (id фіксований або існуючий перший клуб)
  INSERT INTO public.clubs (id, name, logo_url, settings)
  VALUES (
    v_default_club_id,
    'ФК Чорноморець',
    '/logo-chr.png',
    '{"default_locale": "uk", "supported_locales": ["uk", "en", "ru"]}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name;

  -- 2. Прив'язуємо існуючих користувачів з profiles до базового клубу
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    INSERT INTO public.club_members (user_id, club_id, role)
    SELECT
      p.id,
      v_default_club_id,
      CASE
        WHEN p.role = 'admin' THEN 'admin'
        WHEN p.role = 'coach' THEN 'coach'
        ELSE 'doctor'
      END
    FROM public.profiles p
    WHERE p.id IN (SELECT id FROM auth.users)
    ON CONFLICT (user_id, club_id) DO NOTHING;
  END IF;

  -- 3. Заповнюємо teams
  UPDATE public.teams
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 4. Заповнюємо players (спершу від команди, потім дефолт)
  UPDATE public.players p
  SET club_id = COALESCE(t.club_id, v_default_club_id)
  FROM public.teams t
  WHERE p.team_id = t.id AND p.club_id IS NULL;

  UPDATE public.players
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 5. Заповнюємо injuries (від гравця)
  UPDATE public.injuries i
  SET club_id = COALESCE(p.club_id, v_default_club_id)
  FROM public.players p
  WHERE i.player_id = p.id AND i.club_id IS NULL;

  UPDATE public.injuries
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 6. Заповнюємо injury_examinations (від травми)
  UPDATE public.injury_examinations ie
  SET club_id = COALESCE(i.club_id, v_default_club_id)
  FROM public.injuries i
  WHERE ie.injury_id = i.id AND ie.club_id IS NULL;

  UPDATE public.injury_examinations
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 7. Заповнюємо injury_logs
  UPDATE public.injury_logs il
  SET club_id = COALESCE(i.club_id, v_default_club_id)
  FROM public.injuries i
  WHERE il.injury_id = i.id AND il.club_id IS NULL;

  UPDATE public.injury_logs
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 8. Заповнюємо rehab_phases
  UPDATE public.rehab_phases rp
  SET club_id = COALESCE(i.club_id, v_default_club_id)
  FROM public.injuries i
  WHERE rp.injury_id = i.id AND rp.club_id IS NULL;

  UPDATE public.rehab_phases
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 9. Заповнюємо anthropometry_logs & maturation_assessments
  UPDATE public.anthropometry_logs al
  SET club_id = COALESCE(p.club_id, v_default_club_id)
  FROM public.players p
  WHERE al.player_id = p.id AND al.club_id IS NULL;

  UPDATE public.anthropometry_logs
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  UPDATE public.maturation_assessments ma
  SET club_id = COALESCE(p.club_id, v_default_club_id)
  FROM public.players p
  WHERE ma.player_id = p.id AND ma.club_id IS NULL;

  UPDATE public.maturation_assessments
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 10. Заповнюємо wellness_surveys & workload_sessions
  UPDATE public.wellness_surveys ws
  SET club_id = COALESCE(p.club_id, v_default_club_id)
  FROM public.players p
  WHERE ws.player_id = p.id AND ws.club_id IS NULL;

  UPDATE public.wellness_surveys
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  UPDATE public.workload_sessions wrk
  SET club_id = COALESCE(p.club_id, v_default_club_id)
  FROM public.players p
  WHERE wrk.player_id = p.id AND wrk.club_id IS NULL;

  UPDATE public.workload_sessions
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;

  -- 11. Заповнюємо pharmacy_items
  UPDATE public.pharmacy_items
  SET club_id = v_default_club_id
  WHERE club_id IS NULL;
END $$;

-- Робимо колонку club_id обов'язковою (NOT NULL)
ALTER TABLE public.teams ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.players ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.injuries ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.injury_examinations ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.injury_logs ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.rehab_phases ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.anthropometry_logs ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.maturation_assessments ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.wellness_surveys ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.workload_sessions ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE public.pharmacy_items ALTER COLUMN club_id SET NOT NULL;

-- Створюємо індекси для фільтрації RLS
CREATE INDEX IF NOT EXISTS idx_teams_club_id ON public.teams(club_id);
CREATE INDEX IF NOT EXISTS idx_players_club_id ON public.players(club_id);
CREATE INDEX IF NOT EXISTS idx_injuries_club_id ON public.injuries(club_id);
CREATE INDEX IF NOT EXISTS idx_injury_examinations_club_id ON public.injury_examinations(club_id);
CREATE INDEX IF NOT EXISTS idx_injury_logs_club_id ON public.injury_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_rehab_phases_club_id ON public.rehab_phases(club_id);
CREATE INDEX IF NOT EXISTS idx_anthropometry_club_id ON public.anthropometry_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_maturation_club_id ON public.maturation_assessments(club_id);
CREATE INDEX IF NOT EXISTS idx_wellness_club_id ON public.wellness_surveys(club_id);
CREATE INDEX IF NOT EXISTS idx_workload_club_id ON public.workload_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_club_id ON public.pharmacy_items(club_id);

-- ------------------------------------------------------------------------------
-- 5. ФУНКЦІЇ БЕЗПЕКИ ДЛЯ RLS (SECURITY DEFINER — ЗАХИСТ ВІД РЕКУРСІЇ)
-- ------------------------------------------------------------------------------

-- Отримання списку club_id, до яких належить поточний користувач
CREATE OR REPLACE FUNCTION public.get_user_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club_id FROM public.club_members WHERE user_id = auth.uid();
$$;

-- Перевірка членства користувача в клубі
CREATE OR REPLACE FUNCTION public.is_club_member(lookup_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = auth.uid() AND club_id = lookup_club_id
  );
$$;

-- Перевірка ролі адміністратора клубу
CREATE OR REPLACE FUNCTION public.is_club_admin(lookup_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = auth.uid() AND club_id = lookup_club_id AND role = 'admin'
  );
$$;

-- Перевірка наявності дозволеної ролі в клубі
CREATE OR REPLACE FUNCTION public.has_club_role(lookup_club_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = auth.uid()
      AND club_id = lookup_club_id
      AND role = ANY(allowed_roles)
  );
$$;

-- ------------------------------------------------------------------------------
-- 6. НАЛАШТУВАННЯ ROW LEVEL SECURITY (RLS) НА ВСІХ ТАБЛИЦЯХ
-- ------------------------------------------------------------------------------

-- 6.1 clubs
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clubs_select_member" ON public.clubs;
CREATE POLICY "clubs_select_member" ON public.clubs
  FOR SELECT TO authenticated
  USING (public.is_club_member(id));

DROP POLICY IF EXISTS "clubs_update_admin" ON public.clubs;
CREATE POLICY "clubs_update_admin" ON public.clubs
  FOR UPDATE TO authenticated
  USING (public.is_club_admin(id))
  WITH CHECK (public.is_club_admin(id));

DROP POLICY IF EXISTS "clubs_insert_auth" ON public.clubs;
CREATE POLICY "clubs_insert_auth" ON public.clubs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 6.2 club_members
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "club_members_select_member" ON public.club_members;
CREATE POLICY "club_members_select_member" ON public.club_members
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "club_members_insert_admin" ON public.club_members;
CREATE POLICY "club_members_insert_admin" ON public.club_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(club_id));

DROP POLICY IF EXISTS "club_members_update_admin" ON public.club_members;
CREATE POLICY "club_members_update_admin" ON public.club_members
  FOR UPDATE TO authenticated
  USING (public.is_club_admin(club_id))
  WITH CHECK (public.is_club_admin(club_id));

DROP POLICY IF EXISTS "club_members_delete_admin" ON public.club_members;
CREATE POLICY "club_members_delete_admin" ON public.club_members
  FOR DELETE TO authenticated
  USING (public.is_club_admin(club_id));

-- 6.3 teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select_member" ON public.teams;
CREATE POLICY "teams_select_member" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "teams_mutation_doctor_admin" ON public.teams;
CREATE POLICY "teams_mutation_doctor_admin" ON public.teams
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.4 players
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Скидаємо будь-які старі/дефолтні політики, що дозволяли усім доступ
DROP POLICY IF EXISTS "players_select_member" ON public.players;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.players;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.players;
DROP POLICY IF EXISTS "Allow all users to read players" ON public.players;
DROP POLICY IF EXISTS "players_select_policy" ON public.players;
CREATE POLICY "players_select_member" ON public.players
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "players_mutation_doctor_admin" ON public.players;
CREATE POLICY "players_mutation_doctor_admin" ON public.players
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.5 injuries (ДІАГНОЗИ, КЛАСИФІКАЦІЇ: coach НЕ МАЄ ДОСТУПУ)
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "injuries_select_doctor_admin" ON public.injuries;
CREATE POLICY "injuries_select_doctor_admin" ON public.injuries
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "injuries_mutation_doctor_admin" ON public.injuries;
CREATE POLICY "injuries_mutation_doctor_admin" ON public.injuries
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.6 injury_examinations (ОСМОТРИ, ПАЛЬПАЦІЯ, ТОНУС: coach НЕ МАЄ ДОСТУПУ)
ALTER TABLE public.injury_examinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "examinations_select_doctor_admin" ON public.injury_examinations;
CREATE POLICY "examinations_select_doctor_admin" ON public.injury_examinations
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "examinations_mutation_doctor_admin" ON public.injury_examinations;
CREATE POLICY "examinations_mutation_doctor_admin" ON public.injury_examinations
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.7 injury_logs (ПРЕПАРАТИ, АНАЛІЗИ, СКРИНІНГИ: coach НЕ МАЄ ДОСТУПУ)
ALTER TABLE public.injury_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_select_doctor_admin" ON public.injury_logs;
CREATE POLICY "logs_select_doctor_admin" ON public.injury_logs
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "logs_mutation_doctor_admin" ON public.injury_logs;
CREATE POLICY "logs_mutation_doctor_admin" ON public.injury_logs
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.8 rehab_phases (ФАЗИ РЕАБІЛІТАЦІЇ)
ALTER TABLE public.rehab_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rehab_phases_select_doctor_admin" ON public.rehab_phases;
CREATE POLICY "rehab_phases_select_doctor_admin" ON public.rehab_phases
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "rehab_phases_mutation_doctor_admin" ON public.rehab_phases;
CREATE POLICY "rehab_phases_mutation_doctor_admin" ON public.rehab_phases
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.9 anthropometry_logs & maturation_assessments
ALTER TABLE public.anthropometry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maturation_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anthropometry_doctor_admin" ON public.anthropometry_logs;
CREATE POLICY "anthropometry_doctor_admin" ON public.anthropometry_logs
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "maturation_doctor_admin" ON public.maturation_assessments;
CREATE POLICY "maturation_doctor_admin" ON public.maturation_assessments
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.10 workload_sessions (НАВАНТАЖЕННЯ: доступно тренеру, лікарю та адміну)
ALTER TABLE public.workload_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workload_select_member" ON public.workload_sessions;
CREATE POLICY "workload_select_member" ON public.workload_sessions
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "workload_mutation_staff" ON public.workload_sessions;
CREATE POLICY "workload_mutation_staff" ON public.workload_sessions
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['coach', 'doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['coach', 'doctor', 'admin']));

-- 6.11 wellness_surveys (ВЕЛНЕС ТА ГОТОВНІСТЬ ДО ТРЕНУВАННЯ)
ALTER TABLE public.wellness_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wellness_select_member" ON public.wellness_surveys;
CREATE POLICY "wellness_select_member" ON public.wellness_surveys
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "wellness_mutation_staff" ON public.wellness_surveys;
CREATE POLICY "wellness_mutation_staff" ON public.wellness_surveys
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['coach', 'doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['coach', 'doctor', 'admin']));

-- 6.12 pharmacy_items (АПТЕКА, МЕДИЧНИЙ СКЛАД: лікар та адмін)
ALTER TABLE public.pharmacy_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_doctor_admin" ON public.pharmacy_items;
CREATE POLICY "pharmacy_doctor_admin" ON public.pharmacy_items
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 6.13 player_auth_ip_attempts (Внутрішній захист від перебору PIN)
ALTER TABLE public.player_auth_ip_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ip_attempts_staff_view" ON public.player_auth_ip_attempts;
CREATE POLICY "ip_attempts_staff_view" ON public.player_auth_ip_attempts
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ------------------------------------------------------------------------------
-- 7. ПРЕДСТАВЛЕННЯ ДЛЯ ТРЕНЕРА (COACH VIEW)
--    Статус доступності, обмеження, ліміт хвилин БЕЗ клінічних деталей та діагнозів.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.coach_player_availability_view
WITH (security_barrier = true) AS
SELECT
  p.club_id,
  p.team_id,
  t.name AS team_name,
  t.category AS team_category,
  t.sort_order AS team_sort_order,
  p.id AS player_id,
  p.first_name,
  p.last_name,
  p.position,
  p.date_of_birth,
  CASE
    WHEN active_inj.id IS NOT NULL THEN 'unavailable'
    WHEN rehab_inj.id IS NOT NULL THEN 'restricted'
    ELSE 'available'
  END AS availability_status,
  CASE
    WHEN active_inj.id IS NOT NULL THEN 0
    WHEN rehab_inj.id IS NOT NULL THEN 45
    ELSE 90
  END AS max_minutes,
  CASE
    WHEN active_inj.id IS NOT NULL THEN 'Повний спокій / лазарет. Не допущений до тренувань та матчів.'
    WHEN rehab_inj.id IS NOT NULL THEN 'Реабілітаційний режим: ліміт 45 хв, безконтактні вправи.'
    ELSE 'Повний допуск без обмежень'
  END AS restriction_notes,
  COALESCE(active_inj.days_missed, rehab_inj.days_missed) AS days_missed,
  COALESCE(active_inj.expected_return_date, rehab_inj.expected_return_date) AS expected_return_date,
  COALESCE(well.readiness_status, 'optimal') AS wellness_readiness
FROM public.players p
JOIN public.teams t ON p.team_id = t.id
LEFT JOIN LATERAL (
  SELECT
    inj.id,
    inj.expected_return_date,
    (CURRENT_DATE - inj.date_of_injury::date) AS days_missed
  FROM public.injuries inj
  WHERE inj.player_id = p.id AND inj.status = 'active'
  ORDER BY inj.date_of_injury DESC
  LIMIT 1
) active_inj ON true
LEFT JOIN LATERAL (
  SELECT
    inj.id,
    inj.expected_return_date,
    (CURRENT_DATE - inj.date_of_injury::date) AS days_missed
  FROM public.injuries inj
  WHERE inj.player_id = p.id AND inj.status = 'rehabilitation'
  ORDER BY inj.date_of_injury DESC
  LIMIT 1
) rehab_inj ON true
LEFT JOIN LATERAL (
  SELECT ws.readiness_status
  FROM public.wellness_surveys ws
  WHERE ws.player_id = p.id
  ORDER BY ws.date DESC
  LIMIT 1
) well ON true
WHERE p.club_id IN (
  SELECT cm.club_id FROM public.club_members cm WHERE cm.user_id = auth.uid()
);

COMMENT ON VIEW public.coach_player_availability_view IS
  'Безпечне представлення для тренера: статус, обмеження, ліміт хвилин БЕЗ діагнозів, препаратів та оглядів.';

GRANT SELECT ON public.coach_player_availability_view TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. ПОРТАЛ ГРАВЦЯ (SECURITY DEFINER ФУНКЦІЯ)
--    Прямий anon-доступ до таблиць заборонено через RLS.
--    Серверні дії (/rehab-portal) звертаються через перевірку portal_token
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_player_by_portal_token(p_token text)
RETURNS TABLE (
  player_id uuid,
  club_id uuid,
  first_name text,
  last_name text,
  "position" text,
  team_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS player_id,
    p.club_id,
    p.first_name,
    p.last_name,
    p.position::text AS "position",
    t.name AS team_name
  FROM public.players p
  LEFT JOIN public.teams t ON p.team_id = t.id
  WHERE p.portal_token = trim(p_token)
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_player_by_portal_token IS
  'Безпечне отримання публічного профілю гравця за portal_token для серверного екшену реабілітаційного порталу.';

-- ------------------------------------------------------------------------------
-- 9. ТРИГЕР АВТОМАТИЧНОГО ЗАПОВНЕННЯ club_id ПРИ ВСТАВЦІ (ЗАХИСТ ВІД NULL)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_set_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    -- 1. Беремо активний клуб поточного користувача з club_members
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
    LIMIT 1;

    -- 2. Якщо все ще NULL, підставляємо дефолтний клуб
    IF NEW.club_id IS NULL THEN
      NEW.club_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teams_club_id ON public.teams;
CREATE TRIGGER trg_teams_club_id BEFORE INSERT ON public.teams FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_players_club_id ON public.players;
CREATE TRIGGER trg_players_club_id BEFORE INSERT ON public.players FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_injuries_club_id ON public.injuries;
CREATE TRIGGER trg_injuries_club_id BEFORE INSERT ON public.injuries FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_examinations_club_id ON public.injury_examinations;
CREATE TRIGGER trg_examinations_club_id BEFORE INSERT ON public.injury_examinations FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_logs_club_id ON public.injury_logs;
CREATE TRIGGER trg_logs_club_id BEFORE INSERT ON public.injury_logs FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_rehab_phases_club_id ON public.rehab_phases;
CREATE TRIGGER trg_rehab_phases_club_id BEFORE INSERT ON public.rehab_phases FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_anthropometry_club_id ON public.anthropometry_logs;
CREATE TRIGGER trg_anthropometry_club_id BEFORE INSERT ON public.anthropometry_logs FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_maturation_club_id ON public.maturation_assessments;
CREATE TRIGGER trg_maturation_club_id BEFORE INSERT ON public.maturation_assessments FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_wellness_club_id ON public.wellness_surveys;
CREATE TRIGGER trg_wellness_club_id BEFORE INSERT ON public.wellness_surveys FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_workload_club_id ON public.workload_sessions;
CREATE TRIGGER trg_workload_club_id BEFORE INSERT ON public.workload_sessions FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

DROP TRIGGER IF EXISTS trg_pharmacy_club_id ON public.pharmacy_items;
CREATE TRIGGER trg_pharmacy_club_id BEFORE INSERT ON public.pharmacy_items FOR EACH ROW EXECUTE FUNCTION public.auto_set_club_id();

