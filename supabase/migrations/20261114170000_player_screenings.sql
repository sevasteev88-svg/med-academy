-- ==============================================================================
-- Migration: 20261114170000_player_screenings.sql
-- Description: Wave 3 (Step 1) — Винесення [SCREENING] з injury_logs у
--              окрему таблицю public.player_screenings з гранулярним RLS
--              та ідепотентним backfill існуючих даних.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.player_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  season text,
  examiner_doctor text,
  overall_status text NOT NULL DEFAULT 'cleared',
  valid_until date,
  cardio_clearance boolean NOT NULL DEFAULT false,
  restrictions_notes text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_screenings_club_player_date
  ON public.player_screenings(club_id, player_id, date DESC);

COMMENT ON TABLE public.player_screenings IS 'Передсезонні та планові медичні скринінги гравців (PPE / допуск)';

-- RLS
ALTER TABLE public.player_screenings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_screenings_select_staff" ON public.player_screenings;
CREATE POLICY "player_screenings_select_staff" ON public.player_screenings
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = player_screenings.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );

DROP POLICY IF EXISTS "player_screenings_mutation_doctor_admin" ON public.player_screenings;
CREATE POLICY "player_screenings_mutation_doctor_admin" ON public.player_screenings
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- Ідемпотентний backfill існуючих [SCREENING] записів із injury_logs
-- (старі записи в injury_logs не видаляються на цьому етапі для можливості відкату)
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_json jsonb;
  v_player_id uuid;
  v_date date;
  v_valid_until date;
  v_status text;
  v_season text;
  v_doctor text;
  v_cardio boolean;
  v_notes text;
BEGIN
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[SCREENING] %'
       OR note LIKE '[SCREENING]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[SCREENING\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Переконуємося, що гравець існує (захист від битого FK)
      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      v_date := COALESCE(
        NULLIF(v_json->>'date', '')::date,
        NULLIF(v_json->>'screening_date', '')::date,
        rec.date
      );
      v_valid_until := NULLIF(v_json->>'valid_until', '')::date;
      v_status := COALESCE(
        NULLIF(v_json->>'overall_status', ''),
        NULLIF(v_json->>'clearance_status', ''),
        'cleared'
      );
      IF v_status = 'approved' THEN
        v_status := 'cleared';
      END IF;

      v_season := NULLIF(v_json->>'season', '');
      v_doctor := COALESCE(NULLIF(v_json->>'examiner_doctor', ''), NULLIF(v_json->>'examiner', ''));
      v_cardio := COALESCE((v_json->>'cardio_clearance')::boolean, (v_json->>'cardiac_clearance')::boolean, false);
      v_notes := COALESCE(NULLIF(v_json->>'restrictions_notes', ''), NULLIF(v_json->>'notes', ''));

      INSERT INTO public.player_screenings (
        club_id,
        player_id,
        date,
        season,
        examiner_doctor,
        overall_status,
        valid_until,
        cardio_clearance,
        restrictions_notes,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_date,
        v_season,
        v_doctor,
        v_status,
        v_valid_until,
        v_cardio,
        v_notes,
        v_json,
        rec.id,
        COALESCE(rec.created_at, now())
      )
      ON CONFLICT (legacy_log_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Пропускаємо пошкоджений запис, не ламаючи міграцію
      CONTINUE;
    END;
  END LOOP;
END $$;
