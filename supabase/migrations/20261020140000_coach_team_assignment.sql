-- ==============================================================================
-- Migration: 20261020140000_coach_team_assignment.sql
-- Description: Прив'язка тренера до конкретної команди в club_members та profiles
-- ==============================================================================

ALTER TABLE public.club_members 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_members_team_id ON public.club_members(team_id);
