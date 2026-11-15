-- ==============================================================================
-- Migration: 20261114173000_player_anamnesis_and_nutrition.sql
-- Description: Wave 3 (Step 4) — Винесення [INITIAL_ANAMNESIS] та [NUTRITION] з
--              injury_logs у таблиці public.player_anamnesis та
--              public.player_nutrition_profiles зі строгим RLS та
--              ідемпотентним backfill існуючих даних.
-- ==============================================================================

-- 1. Таблиця первинного медичного анамнезу
CREATE TABLE IF NOT EXISTS public.player_anamnesis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  jersey_number text,
  phone text,
  blood_type text,
  allergies text,
  past_injuries text,
  initial_height numeric,
  initial_weight numeric,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_anamnesis_club_player_date
  ON public.player_anamnesis(club_id, player_id, created_at DESC);

COMMENT ON TABLE public.player_anamnesis IS 'Первинний медичний анамнез гравця (група крові, алергії, попередні травми)';

ALTER TABLE public.player_anamnesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_anamnesis_select_doctor_admin" ON public.player_anamnesis;
CREATE POLICY "player_anamnesis_select_doctor_admin" ON public.player_anamnesis
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "player_anamnesis_mutation_doctor_admin" ON public.player_anamnesis;
CREATE POLICY "player_anamnesis_mutation_doctor_admin" ON public.player_anamnesis
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 2. Таблиця нутриціологічних профілів
CREATE TABLE IF NOT EXISTS public.player_nutrition_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_nutrition_club_player_date
  ON public.player_nutrition_profiles(club_id, player_id, date DESC);

COMMENT ON TABLE public.player_nutrition_profiles IS 'Нутриціологічні профілі та призначення спортивних добавок гравцям';

ALTER TABLE public.player_nutrition_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_nutrition_select_doctor_admin" ON public.player_nutrition_profiles;
CREATE POLICY "player_nutrition_select_doctor_admin" ON public.player_nutrition_profiles
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "player_nutrition_mutation_doctor_admin" ON public.player_nutrition_profiles;
CREATE POLICY "player_nutrition_mutation_doctor_admin" ON public.player_nutrition_profiles
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 3. Ідемпотентний backfill [INITIAL_ANAMNESIS] та [NUTRITION] із injury_logs
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_json jsonb;
  v_player_id uuid;
  v_date date;
BEGIN
  -- 3.1 Backfill [INITIAL_ANAMNESIS]
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[INITIAL_ANAMNESIS]%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[INITIAL_ANAMNESIS\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.player_anamnesis (
        club_id,
        player_id,
        date,
        jersey_number,
        phone,
        blood_type,
        allergies,
        past_injuries,
        initial_height,
        initial_weight,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        COALESCE(rec.date, CURRENT_DATE),
        NULLIF(v_json->>'jersey_number', ''),
        NULLIF(v_json->>'phone', ''),
        NULLIF(v_json->>'blood_type', ''),
        NULLIF(v_json->>'allergies', ''),
        NULLIF(v_json->>'past_injuries', ''),
        NULLIF(v_json->>'initial_height', '')::numeric,
        NULLIF(v_json->>'initial_weight', '')::numeric,
        v_json,
        rec.id,
        COALESCE(rec.created_at, now())
      )
      ON CONFLICT (legacy_log_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  -- 3.2 Backfill [NUTRITION]
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[NUTRITION] %'
       OR note LIKE '[NUTRITION]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[NUTRITION\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      v_date := COALESCE(NULLIF(v_json->>'date', '')::date, rec.date);

      INSERT INTO public.player_nutrition_profiles (
        club_id,
        player_id,
        date,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_date,
        v_json,
        rec.id,
        COALESCE(rec.created_at, now())
      )
      ON CONFLICT (legacy_log_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END $$;
