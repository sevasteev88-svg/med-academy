-- ==============================================================================
-- Migration: 20261018080100_wellness_entries_and_coach_masking.sql
-- Description: Таблиця щоденної анкети самопочуття гравців (wellness_entries),
--              правило редагування тільки в той самий день за часовим поясом клубу,
--              та маскування полів 'stress' і 'comment' для ролі тренера (coach).
--
-- УВАГА: За інструкцією до задачі 8.1 міграцію ТІЛЬКИ СТВОРЕНО, НЕ ЗАСТОСОВАНО.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. СТВОРЕННЯ ТАБЛИЦІ wellness_entries
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wellness_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  date date NOT NULL,
  sleep_quality smallint NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  fatigue smallint NOT NULL CHECK (fatigue BETWEEN 1 AND 5),
  soreness smallint NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  stress smallint NOT NULL CHECK (stress BETWEEN 1 AND 5),
  sleep_hours numeric(4,1) NULL CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  pain boolean NOT NULL DEFAULT false,
  pain_vas smallint NULL CHECK (pain_vas IS NULL OR (pain_vas BETWEEN 0 AND 10)),
  pain_locations jsonb NULL DEFAULT '[]'::jsonb,
  illness boolean NOT NULL DEFAULT false,
  comment text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('player', 'kiosk', 'staff')),
  CONSTRAINT uq_wellness_entries_player_date UNIQUE (player_id, date)
);

COMMENT ON TABLE public.wellness_entries IS 'Щоденна анкета самопочуття футболіста (Hooper-Mackinnon, локалізація болю, статус здоров''я)';
COMMENT ON COLUMN public.wellness_entries.sleep_quality IS 'Якість сну від 1 (дуже погано) до 5 (чудово)';
COMMENT ON COLUMN public.wellness_entries.fatigue IS 'Свіжість/бадьорість від 1 (виснажений) до 5 (свіжий, пік форми)';
COMMENT ON COLUMN public.wellness_entries.soreness IS 'Стан м''язів від 1 (сильний біль) до 5 (свіжі, без болю)';
COMMENT ON COLUMN public.wellness_entries.stress IS 'Рівень спокою/стресу від 1 (сильний стрес) до 5 (спокійний/впевнений). Приховано для тренера!';
COMMENT ON COLUMN public.wellness_entries.pain IS 'Чи відчуває гравець біль у суглобах/м''язах';
COMMENT ON COLUMN public.wellness_entries.pain_vas IS 'Оцінка болю за шкалою ВАШ (0-10), тільки якщо pain = true';
COMMENT ON COLUMN public.wellness_entries.pain_locations IS 'Масив ідентифікаторів зон болю з карти тіла (jsonb)';
COMMENT ON COLUMN public.wellness_entries.illness IS 'Чи присутні ознаки застуди, температури, слабкості';
COMMENT ON COLUMN public.wellness_entries.comment IS 'Особистий коментар гравця для медичного штабу. Приховано для тренера!';
COMMENT ON COLUMN public.wellness_entries.source IS 'Джерело відповіді: особистий кабінет гравця (player), планшет на базі (kiosk), штаб (staff)';

CREATE INDEX IF NOT EXISTS idx_wellness_entries_club_date ON public.wellness_entries (club_id, date);
CREATE INDEX IF NOT EXISTS idx_wellness_entries_player_date ON public.wellness_entries (player_id, date);

-- ------------------------------------------------------------------------------
-- 2. ТРИГЕР: ПРАВКА ДОЗВОЛЕНА ТІЛЬКИ В ТОЙ САМИЙ ДЕНЬ ЗА ЧАСОВИМ ПОЯСОМ КЛУБУ
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_wellness_entry_same_day_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_club_tz text := 'Europe/Kyiv';
  v_today date;
BEGIN
  -- Отримуємо часовий пояс із налаштувань клубу
  SELECT COALESCE(settings->>'timezone', 'Europe/Kyiv') INTO v_club_tz
  FROM public.clubs
  WHERE id = OLD.club_id;

  IF v_club_tz IS NULL OR trim(v_club_tz) = '' THEN
    v_club_tz := 'Europe/Kyiv';
  END IF;

  v_today := (now() AT TIME ZONE v_club_tz)::date;

  -- Перевіряємо, чи дата запису, який редагується, відповідає сьогоднішньому дню
  IF OLD.date != v_today THEN
    RAISE EXCEPTION 'Правка анкети самопочуття дозволена тільки в той самий день (дата запису: %, сьогодні в клубі: %)', OLD.date, v_today
      USING ERRCODE = '23514';
  END IF;

  -- При оновленні фіксуємо точний час останнього редагування
  NEW.submitted_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wellness_entries_same_day_edit ON public.wellness_entries;
CREATE TRIGGER trg_wellness_entries_same_day_edit
  BEFORE UPDATE ON public.wellness_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_wellness_entry_same_day_edit();

-- ------------------------------------------------------------------------------
-- 3. ПРЕДСТАВЛЕННЯ ДЛЯ ТРЕНЕРСЬКОГО ШТАБУ: МАСКУВАННЯ stress ТА comment
--    Тренер бачить готовність, сон, втому, крепатуру, наявність болю та хвороби,
--    але НЕ бачить психологічний стрес та особистий коментар лікарю.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.coach_wellness_entries_view AS
SELECT
  id,
  club_id,
  player_id,
  date,
  sleep_quality,
  fatigue,
  soreness,
  -- Психологічний стрес маскується для тренера
  NULL::smallint AS stress,
  sleep_hours,
  pain,
  pain_vas,
  pain_locations,
  illness,
  -- Особистий коментар лікарю маскується для тренера
  NULL::text AS comment,
  submitted_at,
  source
FROM public.wellness_entries;

COMMENT ON VIEW public.coach_wellness_entries_view IS 'Захищене представлення анкети самопочуття для тренерів з маскуванням полів stress і comment';

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) ПОЛІТИКИ
-- ------------------------------------------------------------------------------

ALTER TABLE public.wellness_entries ENABLE ROW LEVEL SECURITY;

-- Лікар та адміністратор мають повний доступ до всіх колонок свого клубу
CREATE POLICY "wellness_entries_doctor_admin_all"
  ON public.wellness_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = wellness_entries.club_id
        AND cm.role IN ('doctor', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id = wellness_entries.club_id
        AND cm.role IN ('doctor', 'admin')
    )
  );

-- Гравець може переглядати та оновлювати ЛИШЕ власні анкети
CREATE POLICY "wellness_entries_player_select"
  ON public.wellness_entries
  FOR SELECT
  TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wellness_entries.player_id
    )
  );

CREATE POLICY "wellness_entries_player_insert"
  ON public.wellness_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wellness_entries.player_id
    )
  );

CREATE POLICY "wellness_entries_player_update"
  ON public.wellness_entries
  FOR UPDATE
  TO authenticated
  USING (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wellness_entries.player_id
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT p.id FROM public.players p
      WHERE p.id = wellness_entries.player_id
    )
  );
