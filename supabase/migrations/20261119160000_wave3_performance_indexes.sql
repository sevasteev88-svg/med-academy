-- ==============================================================================
-- Migration: 20261119160000_wave3_performance_indexes.sql
-- Description: Волна 3 (Задача 3.3) — Індекси продуктивності для прискорення
--              запитів журналу травм, велнесу, навантажень, скринінгів та згод.
--              Ідемпотентна: кожен індекс створюється лише за наявності таблиці
--              та відповідних колонок у БД.
-- ==============================================================================

DO $$
DECLARE
  v_item RECORD;
  v_col text;
  v_all_cols_exist boolean;
BEGIN
  FOR v_item IN
    SELECT * FROM (VALUES
      (
        'idx_players_club_active_team_name',
        'players',
        ARRAY['club_id', 'team_id', 'last_name', 'archived_at'],
        'CREATE INDEX IF NOT EXISTS idx_players_club_active_team_name ON public.players (club_id, team_id, last_name) WHERE archived_at IS NULL'
      ),
      (
        'idx_injuries_club_status_date',
        'injuries',
        ARRAY['club_id', 'status', 'date_of_injury'],
        'CREATE INDEX IF NOT EXISTS idx_injuries_club_status_date ON public.injuries (club_id, status, date_of_injury DESC)'
      ),
      (
        'idx_injuries_player_status_date',
        'injuries',
        ARRAY['player_id', 'status', 'date_of_injury'],
        'CREATE INDEX IF NOT EXISTS idx_injuries_player_status_date ON public.injuries (player_id, status, date_of_injury DESC)'
      ),
      (
        'idx_injuries_club_next_exam',
        'injuries',
        ARRAY['club_id', 'next_exam_date'],
        'CREATE INDEX IF NOT EXISTS idx_injuries_club_next_exam ON public.injuries (club_id, next_exam_date) WHERE next_exam_date IS NOT NULL'
      ),
      (
        'idx_injury_logs_club_created',
        'injury_logs',
        ARRAY['club_id', 'created_at'],
        'CREATE INDEX IF NOT EXISTS idx_injury_logs_club_created ON public.injury_logs (club_id, created_at DESC)'
      ),
      (
        'idx_injury_logs_injury_created',
        'injury_logs',
        ARRAY['injury_id', 'created_at'],
        'CREATE INDEX IF NOT EXISTS idx_injury_logs_injury_created ON public.injury_logs (injury_id, created_at DESC)'
      ),
      (
        'idx_wellness_entries_club_player_date',
        'wellness_entries',
        ARRAY['club_id', 'player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_wellness_entries_club_player_date ON public.wellness_entries (club_id, player_id, date DESC)'
      ),
      (
        'idx_wellness_surveys_player_date',
        'wellness_surveys',
        ARRAY['player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_wellness_surveys_player_date ON public.wellness_surveys (player_id, date DESC)'
      ),
      (
        'idx_wearable_entries_player_date',
        'wearable_entries',
        ARRAY['player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_wearable_entries_player_date ON public.wearable_entries (player_id, date DESC)'
      ),
      (
        'idx_workload_sessions_player_date',
        'workload_sessions',
        ARRAY['player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_workload_sessions_player_date ON public.workload_sessions (player_id, date DESC)'
      ),
      (
        'idx_player_screenings_club_player_date',
        'player_screenings',
        ARRAY['club_id', 'player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_player_screenings_club_player_date ON public.player_screenings (club_id, player_id, date DESC)'
      ),
      (
        'idx_consents_player_scope_granted',
        'consents',
        ARRAY['player_id', 'scope', 'granted_at'],
        'CREATE INDEX IF NOT EXISTS idx_consents_player_scope_granted ON public.consents (player_id, scope, granted_at DESC)'
      ),
      (
        'idx_player_subscriptions_club_player',
        'player_subscriptions',
        ARRAY['club_id', 'player_id'],
        'CREATE INDEX IF NOT EXISTS idx_player_subscriptions_club_player ON public.player_subscriptions (club_id, player_id)'
      ),
      (
        'idx_maturation_assessments_club_player_created',
        'maturation_assessments',
        ARRAY['club_id', 'player_id', 'created_at'],
        'CREATE INDEX IF NOT EXISTS idx_maturation_assessments_club_player_created ON public.maturation_assessments (club_id, player_id, created_at DESC)'
      ),
      (
        'idx_exposures_club_team_date',
        'exposures',
        ARRAY['club_id', 'team_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_exposures_club_team_date ON public.exposures (club_id, team_id, date DESC)'
      ),
      (
        'idx_medical_treatments_player_date',
        'medical_treatments',
        ARRAY['player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_medical_treatments_player_date ON public.medical_treatments (player_id, date DESC)'
      ),
      (
        'idx_rehab_checkins_player_date',
        'rehab_checkins',
        ARRAY['player_id', 'date'],
        'CREATE INDEX IF NOT EXISTS idx_rehab_checkins_player_date ON public.rehab_checkins (player_id, date DESC)'
      )
    ) AS t(idx_name, tbl_name, req_cols, ddl_sql)
  LOOP
    IF to_regclass('public.' || v_item.tbl_name) IS NULL THEN
      CONTINUE;
    END IF;

    v_all_cols_exist := true;
    FOREACH v_col IN ARRAY v_item.req_cols LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_item.tbl_name
          AND column_name = v_col
      ) THEN
        v_all_cols_exist := false;
        EXIT;
      END IF;
    END LOOP;

    IF v_all_cols_exist THEN
      EXECUTE v_item.ddl_sql;
    END IF;
  END LOOP;
END $$;
