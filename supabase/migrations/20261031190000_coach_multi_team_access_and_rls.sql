-- ==============================================================================
-- Migration: 20261031190000_coach_multi_team_access_and_rls.sql
-- Description: Багатокомандний доступ для тренерів (multi-team assignment),
--              ручне призначення команд адміністратором/лікарем клубу,
--              та розмежування RLS для таблиць teams, players, coach_team_assignments.
-- ==============================================================================

-- 0. ГАРАНТУЄМО НАЯВНІСТЬ КОЛОНКИ team_id У club_members ТА profiles (якщо ще не додано)
ALTER TABLE public.club_members 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_members_team_id ON public.club_members(team_id);

-- 1. ТАБЛИЦЯ ПРИЗНАЧЕННЯ КОМАНД ТРЕНЕРАМ (coach_team_assignments)
CREATE TABLE IF NOT EXISTS public.coach_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_coach_team_assignment UNIQUE (coach_user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_coach ON public.coach_team_assignments(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_team ON public.coach_team_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_coach_team_assignments_club ON public.coach_team_assignments(club_id);

COMMENT ON TABLE public.coach_team_assignments IS 'Зв''язок тренера із закріпленими за ним віковими групами/командами клубу';

-- 2. МІГРАЦІЯ ІСНУЮЧИХ ДАНИХ З club_members.team_id (ЯКЩО БУЛИ)
INSERT INTO public.coach_team_assignments (club_id, coach_user_id, team_id)
SELECT cm.club_id, cm.user_id, cm.team_id
FROM public.club_members cm
WHERE cm.role = 'coach' 
  AND cm.team_id IS NOT NULL
ON CONFLICT (coach_user_id, team_id) DO NOTHING;

-- 3. ДОПОМІЖНІ ФУНКЦІЇ ДОСТУПУ (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.coach_has_team_access(check_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_team_assignments cta
    WHERE cta.coach_user_id = auth.uid()
      AND cta.team_id = check_team_id
  )
  OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.team_id = check_team_id
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
    AND public.coach_has_team_access(check_team_id)
  );
$$;

-- 4. RLS ДЛЯ coach_team_assignments
ALTER TABLE public.coach_team_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_team_assignments_select" ON public.coach_team_assignments;
CREATE POLICY "coach_team_assignments_select" ON public.coach_team_assignments
  FOR SELECT TO authenticated
  USING (public.is_club_member(club_id));

DROP POLICY IF EXISTS "coach_team_assignments_mutation_admin" ON public.coach_team_assignments;
CREATE POLICY "coach_team_assignments_mutation_admin" ON public.coach_team_assignments
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- 5. ОНОВЛЕННЯ RLS ДЛЯ teams
-- Лікарі та адміни бачать всі команди. Тренер бачить ТІЛЬКИ призначені йому команди.
DROP POLICY IF EXISTS "teams_select_member" ON public.teams;
CREATE POLICY "teams_select_member" ON public.teams
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND public.coach_has_team_access(id)
    )
  );

-- 6. ОНОВЛЕННЯ RLS ДЛЯ players
-- Тренер бачить тільки гравців своєї призначеної вікової групи (команди).
DROP POLICY IF EXISTS "players_select_member" ON public.players;
CREATE POLICY "players_select_member" ON public.players
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND team_id IS NOT NULL
      AND public.coach_has_team_access(team_id)
    )
  );
