-- ==============================================================================
-- Migration: 20261105150000_coach_injury_logging_and_rtp.sql
-- Description: Дозвіл тренерам фіксувати травми (експрес-звіт з виїзду/тренування),
--              вносити дату повернення футболіста до тренувань (RTP)
--              та оновлювати етапи відновлення в RTP Pipeline (injury_logs)
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

-- 3. Оновлення політики вибірки для таблиці injury_logs
-- Дозволяє тренерам бачити логи RTP та процедури відновлення своїх гравців
DROP POLICY IF EXISTS "logs_select_doctor_admin" ON public.injury_logs;
DROP POLICY IF EXISTS "logs_select_staff" ON public.injury_logs;

CREATE POLICY "logs_select_staff" ON public.injury_logs
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND (
        injury_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.injuries i
          JOIN public.players p ON p.id = i.player_id
          WHERE i.id = injury_logs.injury_id
            AND p.team_id IS NOT NULL
            AND public.coach_has_team_access(p.team_id)
        )
      )
    )
  );

-- 4. Оновлення політики мутацій для таблиці injury_logs
-- Дозволяє тренерам та медперсоналу записувати RTP етапи та нотатки
DROP POLICY IF EXISTS "logs_mutation_doctor_admin" ON public.injury_logs;
DROP POLICY IF EXISTS "logs_mutation_staff" ON public.injury_logs;

CREATE POLICY "logs_mutation_staff" ON public.injury_logs
  FOR ALL TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND (
        injury_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.injuries i
          JOIN public.players p ON p.id = i.player_id
          WHERE i.id = injury_logs.injury_id
            AND p.team_id IS NOT NULL
            AND public.coach_has_team_access(p.team_id)
        )
      )
    )
  )
  WITH CHECK (
    public.has_club_role(club_id, ARRAY['doctor', 'admin'])
    OR (
      public.has_club_role(club_id, ARRAY['coach'])
      AND (
        injury_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.injuries i
          JOIN public.players p ON p.id = i.player_id
          WHERE i.id = injury_logs.injury_id
            AND p.team_id IS NOT NULL
            AND public.coach_has_team_access(p.team_id)
        )
      )
    )
  );
