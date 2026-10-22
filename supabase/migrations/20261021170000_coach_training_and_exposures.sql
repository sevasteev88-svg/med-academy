-- ==============================================================================
-- Migration: 20261021170000_coach_training_and_exposures.sql
-- Description: Підтримка швидкого введення тренування тренером (session-RPE за 10 с),
--              відмітки присутності/відсутності, розбіжності RPE тренера та гравця,
--              та реєстр спортивних експозицій (таблиця exposures для задачі 4.2).
-- ==============================================================================

-- 1. Оновлення та розширення таблиці workload_sessions
DO $$
BEGIN
  -- Ослаблюємо обмеження rpe_score для підтримки значення 0 (відпочинок / відсутній)
  ALTER TABLE public.workload_sessions DROP CONSTRAINT IF EXISTS workload_sessions_rpe_score_check;
  ALTER TABLE public.workload_sessions ADD CONSTRAINT workload_sessions_rpe_score_check CHECK (rpe_score BETWEEN 0 AND 10);
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS coach_rpe smallint CHECK (coach_rpe BETWEEN 0 AND 10);

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS player_rpe smallint CHECK (player_rpe BETWEEN 0 AND 10);

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'present' CHECK (attendance_status IN ('present', 'absent'));

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS absence_reason text;

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.workload_sessions 
ADD COLUMN IF NOT EXISTS team_session_id text;

CREATE INDEX IF NOT EXISTS idx_workload_team_id ON public.workload_sessions(team_id);
CREATE INDEX IF NOT EXISTS idx_workload_team_session_id ON public.workload_sessions(team_session_id);
CREATE INDEX IF NOT EXISTS idx_workload_date ON public.workload_sessions(date);

-- 2. Створення таблиці exposures (задача 4.2: реєстр тривалості навантажень гравців)
CREATE TABLE IF NOT EXISTS public.exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  exposure_type text NOT NULL CHECK (exposure_type IN ('training', 'match', 'rehab', 'other')),
  minutes integer NOT NULL DEFAULT 0,
  workload_session_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exposures_club_id ON public.exposures(club_id);
CREATE INDEX IF NOT EXISTS idx_exposures_player_date ON public.exposures(player_id, date);
CREATE INDEX IF NOT EXISTS idx_exposures_session_id ON public.exposures(workload_session_id);

-- RLS для таблиці exposures
ALTER TABLE public.exposures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exposures_select_member" ON public.exposures;
CREATE POLICY "exposures_select_member" ON public.exposures
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exposures_mutation_staff" ON public.exposures;
CREATE POLICY "exposures_mutation_staff" ON public.exposures
  FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  );

-- Автоматичне виставлення club_id для exposures через тригер
DROP TRIGGER IF EXISTS trg_exposures_club_id ON public.exposures;
CREATE TRIGGER trg_exposures_club_id
  BEFORE INSERT ON public.exposures
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_club_id();
