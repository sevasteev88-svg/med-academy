-- ==============================================================================
-- Migration: 20261119140000_wave1_rls_storage_rpc_hardening.sql
-- Description: Волна 1 (Задача 1.4) — Жорстка ізоляція RLS між клубами та ролями,
--              заміна будь-яких USING (true) / тавтологічних політик на
--              user_belongs_to_club(club_id) та can_access_team / can_access_player,
--              захист club_members і profiles від самопризначення ролей,
--              ізоляція Storage-бакетів за club_id та закриття SECURITY DEFINER RPC.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. ІДЕМПОТЕНТНЕ СТВОРЕННЯ БАЗОВИХ ТАБЛИЦЬ ТА КОЛОНОК (ЯКЩО ЇХ ЩЕ НЕМАЄ В БД)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'FC Academy',
  slug text,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS name text DEFAULT 'FC Academy',
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'FC Chornomorets Academy')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.club_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'coach',
  team_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, user_id)
);

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS portal_token text,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS must_change_pin boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS failed_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

ALTER TABLE public.injuries
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS expected_return_date date,
  ADD COLUMN IF NOT EXISTS actual_return_date date;

ALTER TABLE public.injury_logs
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.coach_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_user_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.player_auth_ip_attempts (
  ip_address text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wellness_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  sleep_quality smallint NOT NULL DEFAULT 3,
  fatigue smallint NOT NULL DEFAULT 3,
  soreness smallint NOT NULL DEFAULT 3,
  stress smallint,
  sleep_hours numeric(4,1),
  pain boolean NOT NULL DEFAULT false,
  pain_vas smallint,
  pain_locations text[] DEFAULT '{}'::text[],
  illness boolean NOT NULL DEFAULT false,
  comment text,
  has_injury_alert boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  doctor_recommendation jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'player',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, date)
);

CREATE TABLE IF NOT EXISTS public.wellness_surveys (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  sleep_quality smallint NOT NULL DEFAULT 3,
  fatigue_level smallint NOT NULL DEFAULT 3,
  muscle_soreness smallint NOT NULL DEFAULT 3,
  stress_level smallint NOT NULL DEFAULT 3,
  soreness_location text,
  total_score smallint,
  readiness_status text DEFAULT 'optimal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, date)
);

CREATE TABLE IF NOT EXISTS public.wearable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  device_type text NOT NULL DEFAULT 'other',
  resting_hr_bpm numeric(5,1),
  hrv_ms numeric(6,1),
  hrv_metric text NOT NULL DEFAULT 'rmssd',
  sleep_duration_min integer,
  device_score numeric(5,1),
  device_score_name text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, date)
);

CREATE TABLE IF NOT EXISTS public.parent_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  guardian_id uuid,
  token_hash text NOT NULL UNIQUE,
  raw_token_preview text,
  guardian_name text,
  guardian_phone text,
  guardian_relation text DEFAULT 'parent',
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  guardian_name text,
  sender_role text NOT NULL DEFAULT 'parent',
  sender_user_id uuid,
  target_recipient text NOT NULL DEFAULT 'doctor',
  category text NOT NULL DEFAULT 'question',
  message_text text NOT NULL,
  is_urgent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'unread',
  read_at timestamptz,
  replied_at timestamptz,
  reply_text text,
  replied_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_telegram_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_telegram_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  UNIQUE (player_id, telegram_chat_id)
);

CREATE TABLE IF NOT EXISTS public.player_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  device_token_hash text NOT NULL UNIQUE,
  device_name text,
  user_agent text,
  last_ip text,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_telegram_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_telegram_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL,
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  status text NOT NULL DEFAULT 'active',
  morning_report_time text NOT NULL DEFAULT '09:00',
  receive_morning_report boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  UNIQUE (coach_user_id, telegram_chat_id)
);

CREATE TABLE IF NOT EXISTS public.coach_telegram_sessions (
  telegram_chat_id text PRIMARY KEY,
  coach_user_id uuid NOT NULL,
  current_step text NOT NULL DEFAULT 'idle',
  session_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL DEFAULT 'training',
  exposure_type text DEFAULT 'training',
  minutes integer NOT NULL DEFAULT 0,
  players_count integer NOT NULL DEFAULT 1,
  workload_session_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name text NOT NULL,
  match_date date NOT NULL,
  opponent text NOT NULL,
  location text,
  formation text DEFAULT '4-3-3',
  starters jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitutes jsonb NOT NULL DEFAULT '[]'::jsonb,
  tactical_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  player_id uuid,
  ip_address text,
  user_agent text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE UNIQUE,
  status text NOT NULL DEFAULT 'trialing',
  plan_code text NOT NULL DEFAULT 'monthly_200_uah',
  amount_uah numeric(10,2) NOT NULL DEFAULT 200,
  currency text NOT NULL DEFAULT 'UAH',
  billing_interval text NOT NULL DEFAULT 'month',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  grace_period_ends_at timestamptz,
  payer_name text,
  payer_phone text,
  payer_email text,
  provider text NOT NULL DEFAULT 'wayforpay',
  provider_subscription_id text,
  provider_customer_id text,
  card_last4 text,
  card_type text,
  comped_reason text,
  comped_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Гарантуємо наявність обов'язкових колонок, якщо таблиці вже існували зі старішою схемою
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'coach',
  ADD COLUMN IF NOT EXISTS team_id uuid;

ALTER TABLE public.coach_team_assignments
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS coach_user_id uuid,
  ADD COLUMN IF NOT EXISTS team_id uuid;

ALTER TABLE public.wellness_entries
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid,
  ADD COLUMN IF NOT EXISTS date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS sleep_quality smallint DEFAULT 3,
  ADD COLUMN IF NOT EXISTS fatigue smallint DEFAULT 3,
  ADD COLUMN IF NOT EXISTS soreness smallint DEFAULT 3,
  ADD COLUMN IF NOT EXISTS stress smallint,
  ADD COLUMN IF NOT EXISTS sleep_hours numeric(4,1),
  ADD COLUMN IF NOT EXISTS pain boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pain_vas smallint,
  ADD COLUMN IF NOT EXISTS pain_locations text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS illness boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'player';

ALTER TABLE public.wellness_surveys
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid,
  ADD COLUMN IF NOT EXISTS date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS readiness_status text DEFAULT 'optimal';

ALTER TABLE public.wearable_entries
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.parent_portal_tokens
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.parent_messages
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.player_telegram_tokens
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.player_telegram_bindings
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.player_activation_tokens
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.player_devices
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.coach_telegram_tokens
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS coach_user_id uuid;

ALTER TABLE public.coach_telegram_bindings
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS coach_user_id uuid;

ALTER TABLE public.coach_telegram_sessions
  ADD COLUMN IF NOT EXISTS coach_user_id uuid;

ALTER TABLE public.exposures
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS player_id uuid;

ALTER TABLE public.match_rosters
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS team_id uuid;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.player_subscriptions
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS player_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS plan_code text DEFAULT 'monthly_200_uah',
  ADD COLUMN IF NOT EXISTS amount_uah numeric(10,2) DEFAULT 200,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz DEFAULT (now() + interval '14 days');

-- ------------------------------------------------------------------------------
-- 1. БАЗОВІ ФУНКЦІЇ БЕЗПЕКИ ДЛЯ RLS (SECURITY DEFINER, SET search_path = public)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.club_id
  FROM public.club_members cm
  WHERE cm.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_club(check_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = check_club_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_club_member(lookup_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_belongs_to_club(lookup_club_id);
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin(lookup_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = lookup_club_id
      AND cm.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_club_role(lookup_club_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = lookup_club_id
      AND cm.role = ANY(allowed_roles)
  );
$$;

-- Перевірка доступу тренера до команди з обов'язковою звіркою членства в клубі цієї команди
CREATE OR REPLACE FUNCTION public.coach_has_team_access(check_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_team_assignments cta
    JOIN public.teams t ON t.id = cta.team_id
    JOIN public.club_members cm ON cm.user_id = auth.uid() AND cm.club_id = t.club_id
    WHERE cta.coach_user_id = auth.uid()
      AND cta.team_id = check_team_id
      AND cta.club_id = t.club_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    JOIN public.teams t ON t.id = cm.team_id
    WHERE cm.user_id = auth.uid()
      AND cm.team_id = check_team_id
      AND cm.club_id = t.club_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_team(check_club_id uuid, check_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_club_role(check_club_id, ARRAY['doctor', 'admin'])
  OR (
    public.has_club_role(check_club_id, ARRAY['coach'])
    AND check_team_id IS NOT NULL
    AND public.coach_has_team_access(check_team_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_player(check_club_id uuid, check_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_club_role(check_club_id, ARRAY['doctor', 'admin'])
  OR (
    public.has_club_role(check_club_id, ARRAY['coach'])
    AND EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = check_player_id
        AND p.club_id = check_club_id
        AND p.team_id IS NOT NULL
        AND public.coach_has_team_access(p.team_id)
    )
  );
$$;

-- Безпечне вилучення club_id з першого сегмента шляху в Supabase Storage
-- Підтримує як "<club_uuid>/...", так і "club_<club_uuid>/..." без помилки приведення типів
CREATE OR REPLACE FUNCTION public.storage_object_club_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_segment text;
  v_match text[];
BEGIN
  IF object_name IS NULL OR btrim(object_name) = '' THEN
    RETURN NULL;
  END IF;

  v_first_segment := split_part(ltrim(object_name, '/'), '/', 1);
  v_match := regexp_match(
    v_first_segment,
    '^(?:club_)?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$'
  );

  IF v_match IS NULL OR v_match[1] IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_match[1]::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. АВТОМАТИЧНЕ ВИДАЛЕННЯ БУДЬ-ЯКИХ НАДМІРНО ВІДКРИТИХ ПОЛІТИК (USING (true) / anon)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        btrim(COALESCE(qual, '')) IN ('true', '(true)')
        OR btrim(COALESCE(with_check, '')) IN ('true', '(true)')
        OR 'anon' = ANY(roles)
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Забороняємо неконтрольоване створення клубів та перегляд таблиці IP-спроб
DROP POLICY IF EXISTS "clubs_insert_auth" ON public.clubs;
DROP POLICY IF EXISTS "ip_attempts_staff_view" ON public.player_auth_ip_attempts;

-- ------------------------------------------------------------------------------
-- 3. ЗАХИСТ club_members ТА profiles ВІД САМОПРИЗНАЧЕННЯ РОЛЕЙ (PRIVILEGE ESCALATION)
-- ------------------------------------------------------------------------------

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clubs_select_member" ON public.clubs;
CREATE POLICY "clubs_select_member" ON public.clubs
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_club(id));

DROP POLICY IF EXISTS "clubs_update_admin" ON public.clubs;
CREATE POLICY "clubs_update_admin" ON public.clubs
  FOR UPDATE TO authenticated
  USING (public.is_club_admin(id))
  WITH CHECK (public.is_club_admin(id));

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "club_members_select_member" ON public.club_members;
CREATE POLICY "club_members_select_member" ON public.club_members
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_club(club_id));

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

-- Тригер та RLS для public.profiles (якщо таблиця існує у схемі)
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Якщо виклик виконується від звичайного сесійного користувача (не service_role)
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.club_members cm
        WHERE cm.user_id = auth.uid()
          AND cm.role = 'admin'
      ) THEN
        RAISE EXCEPTION 'Зміна глобальної ролі або команди профілю дозволена лише адміністратору клубу'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_same_club_or_own" ON public.profiles';
    EXECUTE 'DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles';

    EXECUTE $sql$
      CREATE POLICY "profiles_select_same_club_or_own" ON public.profiles
        FOR SELECT TO authenticated
        USING (
          id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.club_members cm_self
            JOIN public.club_members cm_other ON cm_self.club_id = cm_other.club_id
            WHERE cm_self.user_id = auth.uid()
              AND cm_other.user_id = profiles.id
          )
        )
    $sql$;

    EXECUTE $sql$
      CREATE POLICY "profiles_update_own_safe" ON public.profiles
        FOR UPDATE TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())
    $sql$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles';
    EXECUTE $sql$
      CREATE TRIGGER trg_prevent_profile_role_escalation
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW
        EXECUTE FUNCTION public.prevent_profile_role_escalation()
    $sql$;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. ВИПРАВЛЕННЯ RLS НА ТАБЛИЦЯХ МЕДИЧНИХ ДАНИХ, ПРИСТРОЇВ, ТОКЕНІВ ТА АУДИТУ
-- ------------------------------------------------------------------------------

-- 4.1 wellness_entries: прибираємо тавтологічні політики, що відкривали тренерам доступ до stress і comment
ALTER TABLE public.wellness_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wellness_entries_player_select" ON public.wellness_entries;
DROP POLICY IF EXISTS "wellness_entries_player_insert" ON public.wellness_entries;
DROP POLICY IF EXISTS "wellness_entries_player_update" ON public.wellness_entries;
DROP POLICY IF EXISTS "wellness_entries_doctor_admin_all" ON public.wellness_entries;

CREATE POLICY "wellness_entries_doctor_admin_all"
  ON public.wellness_entries
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- 4.2 wearable_entries: прибираємо тавтологічні політики, доступ до сирих біометричних даних — тільки doctor та admin
ALTER TABLE public.wearable_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wearable_entries_player_select" ON public.wearable_entries;
DROP POLICY IF EXISTS "wearable_entries_player_insert" ON public.wearable_entries;
DROP POLICY IF EXISTS "wearable_entries_player_update" ON public.wearable_entries;
DROP POLICY IF EXISTS "wearable_entries_doctor_admin_all" ON public.wearable_entries;

CREATE POLICY "wearable_entries_doctor_admin_all"
  ON public.wearable_entries
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- 4.3 parent_portal_tokens та parent_messages (прямий доступ до сирих повідомлень батьків — лише doctor/admin)
ALTER TABLE public.parent_portal_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parent_portal_tokens_club_staff" ON public.parent_portal_tokens;
CREATE POLICY "parent_portal_tokens_club_staff"
  ON public.parent_portal_tokens
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  );

ALTER TABLE public.parent_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parent_messages_club_staff" ON public.parent_messages;
DROP POLICY IF EXISTS "parent_messages_doctor_admin" ON public.parent_messages;
CREATE POLICY "parent_messages_doctor_admin"
  ON public.parent_messages
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- 4.4 player_telegram_tokens та player_telegram_bindings
ALTER TABLE public.player_telegram_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_telegram_tokens" ON public.player_telegram_tokens;
CREATE POLICY "staff_manage_telegram_tokens"
  ON public.player_telegram_tokens
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  );

ALTER TABLE public.player_telegram_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_telegram_bindings" ON public.player_telegram_bindings;
CREATE POLICY "staff_manage_telegram_bindings"
  ON public.player_telegram_bindings
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.can_access_player(club_id, player_id)
  );

-- 4.5 player_activation_tokens та player_devices (без застарілого UNION profiles)
ALTER TABLE public.player_activation_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_activation_tokens" ON public.player_activation_tokens;
CREATE POLICY "staff_manage_activation_tokens"
  ON public.player_activation_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = player_activation_tokens.player_id
        AND public.user_belongs_to_club(p.club_id)
        AND public.can_access_team(p.club_id, p.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = player_activation_tokens.player_id
        AND public.user_belongs_to_club(p.club_id)
        AND public.can_access_team(p.club_id, p.team_id)
    )
  );

ALTER TABLE public.player_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_player_devices" ON public.player_devices;
CREATE POLICY "staff_manage_player_devices"
  ON public.player_devices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = player_devices.player_id
        AND public.user_belongs_to_club(p.club_id)
        AND public.can_access_team(p.club_id, p.team_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = player_devices.player_id
        AND public.user_belongs_to_club(p.club_id)
        AND public.can_access_team(p.club_id, p.team_id)
    )
  );

-- 4.6 coach_telegram_tokens, coach_telegram_bindings, coach_telegram_sessions
ALTER TABLE public.coach_telegram_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_coach_tg_tokens" ON public.coach_telegram_tokens;
CREATE POLICY "staff_manage_coach_tg_tokens"
  ON public.coach_telegram_tokens
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      coach_user_id = auth.uid()
      OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    )
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND (
      coach_user_id = auth.uid()
      OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    )
  );

ALTER TABLE public.coach_telegram_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_coach_tg_bindings" ON public.coach_telegram_bindings;
CREATE POLICY "staff_manage_coach_tg_bindings"
  ON public.coach_telegram_bindings
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      coach_user_id = auth.uid()
      OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    )
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND (
      coach_user_id = auth.uid()
      OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    )
  );

ALTER TABLE public.coach_telegram_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_manage_coach_tg_sessions" ON public.coach_telegram_sessions;
CREATE POLICY "staff_manage_coach_tg_sessions"
  ON public.coach_telegram_sessions
  FOR ALL TO authenticated
  USING (coach_user_id = auth.uid())
  WITH CHECK (coach_user_id = auth.uid());

-- 4.7 exposures, match_rosters, workload_sessions, wellness_surveys
ALTER TABLE public.exposures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exposures_select_member" ON public.exposures;
CREATE POLICY "exposures_select_member"
  ON public.exposures
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  );

DROP POLICY IF EXISTS "exposures_mutation_staff" ON public.exposures;
CREATE POLICY "exposures_mutation_staff"
  ON public.exposures
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  );

ALTER TABLE public.match_rosters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "match_rosters_select_member" ON public.match_rosters;
CREATE POLICY "match_rosters_select_member"
  ON public.match_rosters
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  );

DROP POLICY IF EXISTS "match_rosters_write_staff" ON public.match_rosters;
CREATE POLICY "match_rosters_write_staff"
  ON public.match_rosters
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND (
      public.has_club_role(club_id, ARRAY['doctor', 'admin'])
      OR (team_id IS NOT NULL AND public.can_access_team(club_id, team_id))
    )
  );

-- 4.8 audit_log: сувора прив'язка перегляду та вставки до клубу адміністратора/співробітника
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert"
  ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_belongs_to_club(club_id)
  );

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin"
  ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.is_club_admin(club_id)
  );

-- ------------------------------------------------------------------------------
-- 5. БЕЗПЕЧНІ VIEW ТА ТРИГЕР auto_set_club_id (БЕЗ ФОЛБЕКУ НА ДЕФОЛТНИЙ КЛУБ)
-- ------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.coach_player_availability_view;
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
  WHERE inj.player_id = p.id
    AND inj.status = 'active'
  ORDER BY inj.date_of_injury DESC
  LIMIT 1
) active_inj ON true
LEFT JOIN LATERAL (
  SELECT
    inj.id,
    inj.expected_return_date,
    (CURRENT_DATE - inj.date_of_injury::date) AS days_missed
  FROM public.injuries inj
  WHERE inj.player_id = p.id
    AND inj.status = 'rehabilitation'
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
WHERE p.archived_at IS NULL
  AND public.user_belongs_to_club(p.club_id)
  AND public.can_access_team(p.club_id, p.team_id);

REVOKE ALL ON public.coach_player_availability_view FROM PUBLIC, anon;
GRANT SELECT ON public.coach_player_availability_view TO authenticated, service_role;

DROP VIEW IF EXISTS public.coach_wellness_entries_view;
CREATE OR REPLACE VIEW public.coach_wellness_entries_view
WITH (security_barrier = true) AS
SELECT
  we.id,
  we.club_id,
  we.player_id,
  we.date,
  we.sleep_quality,
  we.fatigue,
  we.soreness,
  NULL::smallint AS stress,
  we.sleep_hours,
  we.pain,
  we.pain_vas,
  we.pain_locations,
  we.illness,
  NULL::text AS comment,
  we.submitted_at,
  we.source
FROM public.wellness_entries we
WHERE public.user_belongs_to_club(we.club_id)
  AND public.can_access_player(we.club_id, we.player_id);

REVOKE ALL ON public.coach_wellness_entries_view FROM PUBLIC, anon;
GRANT SELECT ON public.coach_wellness_entries_view TO authenticated, service_role;

DROP VIEW IF EXISTS public.coach_subscription_status_view;
CREATE OR REPLACE VIEW public.coach_subscription_status_view
WITH (security_barrier = true) AS
SELECT
  ps.player_id,
  ps.club_id,
  ps.status,
  (ps.status::text IN ('active', 'trialing', 'comped') AND ps.current_period_end >= now()) AS is_accessible,
  ps.current_period_end
FROM public.player_subscriptions ps
WHERE public.user_belongs_to_club(ps.club_id)
  AND public.can_access_player(ps.club_id, ps.player_id);

REVOKE ALL ON public.coach_subscription_status_view FROM PUBLIC, anon;
GRANT SELECT ON public.coach_subscription_status_view TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_set_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ПРИВАТНІ БАКЕТИ STORAGE ТА КЛУБНА ІЗОЛЯЦІЯ ФАЙЛІВ (consent_scans, injury-documents)
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'consent_scans',
    'consent_scans',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'injury-documents',
    'injury-documents',
    false,
    20971520,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
  )
ON CONFLICT (id) DO UPDATE
SET public = false;

-- Прибираємо старі політики Storage без перевірки club_id або з небезпечним ::uuid кастом
DROP POLICY IF EXISTS "consent_scans_select_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "consent_scans_insert_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "consent_scans_update_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "consent_scans_delete_doctor_admin" ON storage.objects;

DROP POLICY IF EXISTS "injury_documents_select_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "injury_documents_insert_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "injury_documents_update_doctor_admin" ON storage.objects;
DROP POLICY IF EXISTS "injury_documents_delete_doctor_admin" ON storage.objects;

CREATE POLICY "consent_scans_select_doctor_admin"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'consent_scans'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "consent_scans_insert_doctor_admin"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'consent_scans'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "consent_scans_update_doctor_admin"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'consent_scans'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    bucket_id = 'consent_scans'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "consent_scans_delete_doctor_admin"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'consent_scans'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_documents_select_doctor_admin"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'injury-documents'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_documents_insert_doctor_admin"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'injury-documents'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_documents_update_doctor_admin"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'injury-documents'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    bucket_id = 'injury-documents'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

CREATE POLICY "injury_documents_delete_doctor_admin"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'injury-documents'
    AND public.storage_object_club_id(name) IS NOT NULL
    AND public.user_belongs_to_club(public.storage_object_club_id(name))
    AND public.has_club_role(public.storage_object_club_id(name), ARRAY['doctor', 'admin'])
  );

-- ------------------------------------------------------------------------------
-- 7. ОБМЕЖЕННЯ ВИКОНАННЯ SECURITY DEFINER RPC ФУНКЦІЙ
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_player_by_portal_token(text);
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
DECLARE
  v_clean text;
BEGIN
  v_clean := btrim(COALESCE(p_token, ''));
  IF v_clean !~ '^[A-Za-z0-9_-]{8,128}$' THEN
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
  WHERE p.portal_token = v_clean
    AND p.archived_at IS NULL
  LIMIT 1;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.get_player_subscription_status(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_player_subscription_status(p_player_id uuid)
      RETURNS TABLE (
        player_id uuid,
        club_id uuid,
        status text,
        plan_code text,
        amount_uah numeric,
        current_period_end timestamptz,
        is_accessible boolean
      )
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT
          ps.player_id,
          ps.club_id,
          ps.status::text,
          ps.plan_code::text,
          ps.amount_uah,
          ps.current_period_end,
          (ps.status::text IN ('active', 'trialing', 'comped') AND ps.current_period_end >= now()) AS is_accessible
        FROM public.player_subscriptions ps
        WHERE ps.player_id = p_player_id
        LIMIT 1;
      $body$;
    $fn$;
  END IF;
END $$;

-- Публічні клієнти (anon / authenticated) не повинні напряму викликати чутливі RPC через PostgREST
REVOKE EXECUTE ON FUNCTION public.get_player_by_portal_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_by_portal_token(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_player_subscription_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_subscription_status(uuid) TO service_role;

-- Хелпери RLS доступні лише автентифікованим сесіям та service_role
REVOKE EXECUTE ON FUNCTION public.get_user_club_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_club_ids() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.user_belongs_to_club(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_club(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_club_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_club_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_club_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_club_role(uuid, text[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.coach_has_team_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_has_team_access(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_access_team(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_team(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_access_player(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_player(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.storage_object_club_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_object_club_id(text) TO authenticated, service_role;
