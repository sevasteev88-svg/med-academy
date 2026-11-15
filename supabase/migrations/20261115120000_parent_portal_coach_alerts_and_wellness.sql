-- ==============================================================================
-- Migration: 20261115120000_parent_portal_coach_alerts_and_wellness.sql
-- Description: Окрема позначка прочитання повідомлень батьків тренером
--              (is_read_by_coach) та поле джерела заповнення (filled_by)
--              для ранкового чекіну батьками дітей < 14 років у wellness_surveys.
-- ==============================================================================

-- 1. Окремий статус прочитання тренером для parent_messages
ALTER TABLE public.parent_messages
  ADD COLUMN IF NOT EXISTS is_read_by_coach boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_parent_messages_coach_unread
  ON public.parent_messages(club_id, is_read_by_coach, created_at DESC);

-- 2. Позначка джерела заповнення анкети самопочуття (наприклад, 'parent')
ALTER TABLE public.wellness_surveys
  ADD COLUMN IF NOT EXISTS filled_by text;
