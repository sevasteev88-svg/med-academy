-- ==============================================================================
-- Migration: 20261023160000_concussion_module.sql
-- Description: Модуль струсу мозку (SCAT6 / CISG Concussion in Sport Protocol)
--              Таблиці concussion_baselines та concussion_cases,
--              з 6 ступенями повернення (GRTP) та RLS для лікарів клубу.
-- ==============================================================================

-- 1. Таблиця передсезонних базових ліній (Baseline)
CREATE TABLE IF NOT EXISTS public.concussion_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  season text NOT NULL, -- e.g. '2026/2027'
  date date NOT NULL,
  examiner_doctor text NOT NULL,
  baseline_symptoms_count integer NOT NULL DEFAULT 0,
  baseline_severity_score integer NOT NULL DEFAULT 0,
  baseline_sac_score integer NOT NULL DEFAULT 30,
  baseline_bess_errors integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.concussion_baselines IS 'Передсезонне базове тестування гравців на випадок струсу мозку (SCAT6 Baseline)';

CREATE INDEX IF NOT EXISTS idx_concussion_baselines_player ON public.concussion_baselines(player_id);
CREATE INDEX IF NOT EXISTS idx_concussion_baselines_season ON public.concussion_baselines(season);

ALTER TABLE public.concussion_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concussion_baselines_select_doctor_admin"
  ON public.concussion_baselines
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "concussion_baselines_insert_doctor_admin"
  ON public.concussion_baselines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- 2. Таблиця випадків струсу мозку (Concussion Cases)
CREATE TABLE IF NOT EXISTS public.concussion_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  baseline_id uuid REFERENCES public.concussion_baselines(id) ON DELETE SET NULL,
  incident_date date NOT NULL,
  incident_time text,
  mechanism text NOT NULL,
  mechanism_description text,
  has_red_flags boolean NOT NULL DEFAULT false,
  red_flags text[] NOT NULL DEFAULT '{}',
  symptom_count integer NOT NULL DEFAULT 0,
  symptom_severity integer NOT NULL DEFAULT 0,
  sac_score integer,
  bess_errors integer,
  current_stage integer NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 6),
  stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'recovering', 'closed')),
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.concussion_cases IS 'Клінічні випадки струсу мозку, оцінки SCAT6 та протокол 6-ступеневого повернення (GRTP)';
COMMENT ON COLUMN public.concussion_cases.current_stage IS 'Поточний ступінь поступового повернення до гри (1-6)';
COMMENT ON COLUMN public.concussion_cases.stage_history IS 'Журнал проходження ступенів з підписами лікаря та симптомами-тригерами';

CREATE INDEX IF NOT EXISTS idx_concussion_cases_club ON public.concussion_cases(club_id);
CREATE INDEX IF NOT EXISTS idx_concussion_cases_player ON public.concussion_cases(player_id);
CREATE INDEX IF NOT EXISTS idx_concussion_cases_status ON public.concussion_cases(status);

ALTER TABLE public.concussion_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concussion_cases_select_doctor_admin"
  ON public.concussion_cases
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "concussion_cases_insert_doctor_admin"
  ON public.concussion_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "concussion_cases_update_doctor_admin"
  ON public.concussion_cases
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "concussion_cases_delete_doctor_admin"
  ON public.concussion_cases
  FOR DELETE
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );
