-- ==============================================================================
-- Migration: 20261105150000_coach_injury_logging_and_rtp.sql
-- Description: Дозвіл тренерам фіксувати травми (експрес-звіт з виїзду/тренування) 
--              та вносити дату повернення футболіста до тренувань (RTP)
-- ==============================================================================

-- 1. Оновлення політики вибірки для таблиці injuries
-- Лікарі та адміни мають доступ до всіх травм клубу.
-- Тренер має доступ до травм гравців призначених йому команд.
DROP POLICY IF EXISTS "injuries_select_doctor_admin" ON public.injuries;
DROP POLICY IF EXISTS "injuries_select_staff" ON public.injuries;

CREATE POLICY "injuries_select_staff" ON public.injuries
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = injuries.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );

-- 2. Оновлення політики мутацій для таблиці injuries
-- Дозволяє тренерам вносити первинний запис про травму та оновлювати статус/дату повернення до тренувань.
DROP POLICY IF EXISTS "injuries_mutation_doctor_admin" ON public.injuries;
DROP POLICY IF EXISTS "injuries_mutation_staff" ON public.injuries;

CREATE POLICY "injuries_mutation_staff" ON public.injuries
  FOR ALL TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = injuries.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  )
  WITH CHECK (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND EXISTS (
        SELECT 1 FROM public.players p
        WHERE p.id = injuries.player_id
          AND p.team_id IS NOT NULL
          AND public.coach_has_team_access(p.team_id)
      )
    )
  );
