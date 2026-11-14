-- ==============================================================================
-- Migration: 20261114120000_workload_fifa11_status.sql
-- Description: Додавання обліку виконання розминки FIFA 11+ / 11+ Kids
--              у таблицю workload_sessions ('none' | 'partial' | 'full').
-- ==============================================================================

ALTER TABLE public.workload_sessions
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.workload_sessions
  ADD COLUMN IF NOT EXISTS team_session_id text;

ALTER TABLE public.workload_sessions
  ADD COLUMN IF NOT EXISTS fifa11_status text NOT NULL DEFAULT 'none'
  CHECK (fifa11_status IN ('none', 'partial', 'full'));

CREATE INDEX IF NOT EXISTS idx_workload_fifa11_status
  ON public.workload_sessions(team_id, date, fifa11_status);
