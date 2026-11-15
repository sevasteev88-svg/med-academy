-- ==============================================================================
-- Migration: 20261114172000_lsi_assessments.sql
-- Description: Wave 3 (Step 3) — Винесення [LSI_ASSESSMENT] з injury_logs у
--              таблицю public.lsi_assessments з гранулярним RLS та ідемпотентним
--              backfill існуючих даних.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.lsi_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  date date NOT NULL,
  injury_type text,
  tested_limb text,
  evaluator_name text,
  doctor_signature text,
  protocol_source text,
  phase_clearance text,
  overall_lsi_percent numeric,
  criteria_met boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'conditional',
  doctor_verdict text,
  notes text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lsi_assessments_club_player_date
  ON public.lsi_assessments(club_id, player_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_lsi_assessments_injury_id
  ON public.lsi_assessments(injury_id)
  WHERE injury_id IS NOT NULL;

COMMENT ON TABLE public.lsi_assessments IS 'Функціональні тести симетрії кінцівок (LSI) та динамометрія гравців';

-- RLS
ALTER TABLE public.lsi_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lsi_assessments_select_staff" ON public.lsi_assessments;
CREATE POLICY "lsi_assessments_select_staff" ON public.lsi_assessments
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = lsi_assessments.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );

DROP POLICY IF EXISTS "lsi_assessments_mutation_doctor_admin" ON public.lsi_assessments;
CREATE POLICY "lsi_assessments_mutation_doctor_admin" ON public.lsi_assessments
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- Ідемпотентний backfill існуючих [LSI_ASSESSMENT] записів із injury_logs
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_json jsonb;
  v_player_id uuid;
  v_injury_id uuid;
  v_date date;
  v_overall_lsi numeric;
BEGIN
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[LSI_ASSESSMENT] %'
       OR note LIKE '[LSI_ASSESSMENT]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[LSI_ASSESSMENT\]\s*', ''));
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

      v_date := COALESCE(
        NULLIF(v_json->>'date', '')::date,
        NULLIF(v_json->>'assessment_date', '')::date,
        rec.date
      );
      v_overall_lsi := COALESCE(
        NULLIF(v_json->>'overall_lsi_percent', '')::numeric,
        NULLIF(v_json->>'lsi_percentage', '')::numeric
      );

      INSERT INTO public.lsi_assessments (
        club_id,
        player_id,
        injury_id,
        date,
        injury_type,
        tested_limb,
        evaluator_name,
        doctor_signature,
        protocol_source,
        phase_clearance,
        overall_lsi_percent,
        criteria_met,
        status,
        doctor_verdict,
        notes,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_injury_id,
        v_date,
        NULLIF(v_json->>'injury_type', ''),
        NULLIF(v_json->>'tested_limb', ''),
        NULLIF(v_json->>'evaluator_name', ''),
        NULLIF(v_json->>'doctor_signature', ''),
        NULLIF(v_json->>'protocol_source', ''),
        NULLIF(v_json->>'phase_clearance', ''),
        v_overall_lsi,
        COALESCE((v_json->>'criteria_met')::boolean, false),
        COALESCE(NULLIF(v_json->>'status', ''), NULLIF(v_json->>'symmetry_status', ''), 'conditional'),
        COALESCE(NULLIF(v_json->>'doctor_verdict', ''), NULLIF(v_json->>'clinical_decision', '')),
        NULLIF(v_json->>'notes', ''),
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
