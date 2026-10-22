-- ==============================================================================
-- Migration: 20261021163000_wearable_entries.sql
-- Description: Таблиця ручного введення біометрії з носимих пристроїв (8.8)
--              (WHOOP, Apple Watch, Garmin, Other). Дані доступні тільки лікарю
--              та адміністратору, а також гравцю для власного введення.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.wearable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  device_type text NOT NULL CHECK (device_type IN ('whoop', 'apple_watch', 'garmin', 'other')),
  resting_hr_bpm integer NULL CHECK (resting_hr_bpm IS NULL OR (resting_hr_bpm >= 20 AND resting_hr_bpm <= 250)),
  hrv_ms numeric(6, 2) NULL CHECK (hrv_ms IS NULL OR (hrv_ms >= 0 AND hrv_ms <= 500)),
  hrv_metric text NOT NULL DEFAULT 'unknown' CHECK (hrv_metric IN ('rmssd', 'sdnn', 'unknown')),
  sleep_duration_min integer NULL CHECK (sleep_duration_min IS NULL OR (sleep_duration_min >= 0 AND sleep_duration_min <= 1440)),
  device_score numeric(6, 2) NULL,
  device_score_name text NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'screenshot')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_wearable_entries_player_date UNIQUE (player_id, date)
);

COMMENT ON TABLE public.wearable_entries IS 'Ручні біометричні дані з носимих пристроїв (годинники, браслети WHOOP, Garmin, Apple Watch)';
COMMENT ON COLUMN public.wearable_entries.device_type IS 'Виробник/тип пристрою: whoop, apple_watch, garmin, other';
COMMENT ON COLUMN public.wearable_entries.resting_hr_bpm IS 'Пульс спокою в ударах на хвилину (BPM)';
COMMENT ON COLUMN public.wearable_entries.hrv_ms IS 'Варіабельність серцевого ритму (HRV) у мілісекундах';
COMMENT ON COLUMN public.wearable_entries.hrv_metric IS 'Методика підрахунку HRV (rmssd для WHOOP/Garmin ніч, sdnn для Apple Watch, unknown)';
COMMENT ON COLUMN public.wearable_entries.sleep_duration_min IS 'Тривалість сну за даними трекера у хвилинах';
COMMENT ON COLUMN public.wearable_entries.device_score IS 'Власний розрахунковий індекс пристрою (наприклад Recovery % або Body Battery)';
COMMENT ON COLUMN public.wearable_entries.device_score_name IS 'Назва індексу пристрою (наприклад Recovery, Body Battery, Readiness)';
COMMENT ON COLUMN public.wearable_entries.source IS 'Спосіб введення: ручний (manual) або через ШІ-розпізнавання скріншота (screenshot)';

CREATE INDEX IF NOT EXISTS idx_wearable_entries_club_date ON public.wearable_entries (club_id, date);
CREATE INDEX IF NOT EXISTS idx_wearable_entries_player_baseline ON public.wearable_entries (player_id, device_type, hrv_metric, date);

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) ПОЛІТИКИ: ДОСТУП ТІЛЬКИ ЛІКАРЮ, АДМІНУ ТА ВЛАСНИКУ
-- Тренер доступу до цієї таблиці НЕ має.
-- ------------------------------------------------------------------------------

ALTER TABLE public.wearable_entries ENABLE ROW LEVEL SECURITY;

-- Лікар та адміністратор бачать і можуть керувати всіма записами свого клубу
CREATE POLICY "wearable_entries_doctor_admin_all"
  ON public.wearable_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = wearable_entries.club_id
        AND cm.role IN ('doctor', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = wearable_entries.club_id
        AND cm.role IN ('doctor', 'admin')
    )
  );

-- Гравець може бачити свої власні записи
CREATE POLICY "wearable_entries_player_select"
  ON public.wearable_entries
  FOR SELECT
  TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wearable_entries.player_id
    )
  );

-- Гравець може додавати свій запис
CREATE POLICY "wearable_entries_player_insert"
  ON public.wearable_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wearable_entries.player_id
    )
  );

-- Гравець може редагувати свій запис
CREATE POLICY "wearable_entries_player_update"
  ON public.wearable_entries
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wearable_entries.player_id
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wearable_entries.player_id
    )
  );
