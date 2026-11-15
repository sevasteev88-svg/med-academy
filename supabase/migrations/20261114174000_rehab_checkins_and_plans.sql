-- ==============================================================================
-- Migration: 20261114174000_rehab_checkins_and_plans.sql
-- Description: Wave 3 (Step 5) — Винесення [REHAB_CHECKIN] та [CUSTOM_REHAB_PLAN]
--              з injury_logs у таблиці public.rehab_checkins та public.rehab_plans
--              з гранулярним RLS та ідемпотентним backfill існуючих даних.
-- ==============================================================================

-- 1. Таблиця щоденних чек-інів реабілітації
CREATE TABLE IF NOT EXISTS public.rehab_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  date date NOT NULL,
  vas_score integer,
  sleep_quality integer,
  freshness_level integer,
  muscle_soreness integer,
  stress_level integer,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rehab_checkins_club_player_date
  ON public.rehab_checkins(club_id, player_id, date DESC);

COMMENT ON TABLE public.rehab_checkins IS 'Щоденні чек-іни самопочуття та реабілітації гравців (VAS, сон, свіжість, крепатура)';

ALTER TABLE public.rehab_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rehab_checkins_select_staff" ON public.rehab_checkins;
CREATE POLICY "rehab_checkins_select_staff" ON public.rehab_checkins
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = rehab_checkins.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );

DROP POLICY IF EXISTS "rehab_checkins_mutation_doctor_admin" ON public.rehab_checkins;
CREATE POLICY "rehab_checkins_mutation_doctor_admin" ON public.rehab_checkins
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 2. Таблиця індивідуальних планів ЛФК / реабілітації
CREATE TABLE IF NOT EXISTS public.rehab_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  target_injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'approved',
  doctor_name text,
  approved_by text,
  approved_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rehab_plans_club_player_date
  ON public.rehab_plans(club_id, player_id, created_at DESC);

COMMENT ON TABLE public.rehab_plans IS 'Індивідуальні плани ЛФК та реабілітації гравців (конструктор вправ)';

ALTER TABLE public.rehab_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rehab_plans_select_staff" ON public.rehab_plans;
CREATE POLICY "rehab_plans_select_staff" ON public.rehab_plans
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = rehab_plans.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );

DROP POLICY IF EXISTS "rehab_plans_mutation_doctor_admin" ON public.rehab_plans;
CREATE POLICY "rehab_plans_mutation_doctor_admin" ON public.rehab_plans
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 3. Ідемпотентний backfill [REHAB_CHECKIN] та [CUSTOM_REHAB_PLAN] із injury_logs
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_json jsonb;
  v_player_id uuid;
  v_injury_id uuid;
  v_date date;
  v_freshness integer;
BEGIN
  -- 3.1 Backfill [REHAB_CHECKIN]
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[REHAB_CHECKIN] %'
       OR note LIKE '[REHAB_CHECKIN]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[REHAB_CHECKIN\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      v_injury_id := NULL;
      IF NULLIF(v_json->>'injury_id', '') IS NOT NULL THEN
        BEGIN
          v_injury_id := (v_json->>'injury_id')::uuid;
          IF NOT EXISTS (SELECT 1 FROM public.injuries WHERE id = v_injury_id) THEN
            v_injury_id := NULL;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_injury_id := NULL;
        END;
      END IF;

      v_date := COALESCE(NULLIF(v_json->>'date', '')::date, rec.date);
      v_freshness := NULLIF(v_json->>'freshness_level', '')::integer;
      IF v_freshness IS NULL AND NULLIF(v_json->>'fatigue_level', '') IS NOT NULL THEN
        v_freshness := 6 - (v_json->>'fatigue_level')::integer;
      END IF;

      INSERT INTO public.rehab_checkins (
        club_id,
        player_id,
        injury_id,
        date,
        vas_score,
        sleep_quality,
        freshness_level,
        muscle_soreness,
        stress_level,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_injury_id,
        v_date,
        NULLIF(v_json->>'vas_score', '')::integer,
        NULLIF(v_json->>'sleep_quality', '')::integer,
        v_freshness,
        NULLIF(v_json->>'muscle_soreness', '')::integer,
        NULLIF(v_json->>'stress_level', '')::integer,
        v_json,
        rec.id,
        COALESCE(rec.created_at, now())
      )
      ON CONFLICT (legacy_log_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  -- 3.2 Backfill [CUSTOM_REHAB_PLAN]
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[CUSTOM_REHAB_PLAN] %'
       OR note LIKE '[CUSTOM_REHAB_PLAN]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[CUSTOM_REHAB_PLAN\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      v_injury_id := NULL;
      IF NULLIF(v_json->>'target_injury_id', '') IS NOT NULL THEN
        BEGIN
          v_injury_id := (v_json->>'target_injury_id')::uuid;
          IF NOT EXISTS (SELECT 1 FROM public.injuries WHERE id = v_injury_id) THEN
            v_injury_id := NULL;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_injury_id := NULL;
        END;
      END IF;

      INSERT INTO public.rehab_plans (
        club_id,
        player_id,
        target_injury_id,
        date,
        status,
        doctor_name,
        approved_by,
        approved_at,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_injury_id,
        COALESCE(rec.date, CURRENT_DATE),
        COALESCE(NULLIF(v_json->>'status', ''), 'approved'),
        NULLIF(v_json->>'doctor_name', ''),
        NULLIF(v_json->>'approved_by', ''),
        NULLIF(v_json->>'approved_at', '')::timestamptz,
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
