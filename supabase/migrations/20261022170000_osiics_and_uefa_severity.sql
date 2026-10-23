-- Migration: 20261022170000_osiics_and_uefa_severity.sql
-- Description: Підготовка до стандартів OSIICS та обліку тяжкості травм за консенсусом UEFA

-- 1. Створення таблиці довідника OSIICS (Orchard Sports Injury and Illness Classification System)
CREATE TABLE IF NOT EXISTS public.osiics_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  category text,
  anatomical_site text,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osiics_codes_club_id ON public.osiics_codes(club_id);
CREATE INDEX IF NOT EXISTS idx_osiics_codes_code ON public.osiics_codes(code);
CREATE INDEX IF NOT EXISTS idx_osiics_codes_title ON public.osiics_codes(title);

-- RLS для osiics_codes
ALTER TABLE public.osiics_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "osiics_codes_select" ON public.osiics_codes
  FOR SELECT
  TO authenticated
  USING (
    club_id IS NULL OR club_id IN (
      SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "osiics_codes_insert" ON public.osiics_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "osiics_codes_delete" ON public.osiics_codes
  FOR DELETE
  TO authenticated
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
    )
  );

-- 2. Додавання нових колонок у таблицю injuries
ALTER TABLE public.injuries
  ADD COLUMN IF NOT EXISTS osiics_code text,
  ADD COLUMN IF NOT EXISTS onset text CHECK (onset IN ('acute', 'gradual', 'unknown')) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS occurrence text CHECK (occurrence IN ('new', 'recurrence', 'exacerbation', 'unknown')) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS previous_injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_loss_days integer;

CREATE INDEX IF NOT EXISTS idx_injuries_previous_injury_id ON public.injuries(previous_injury_id);
CREATE INDEX IF NOT EXISTS idx_injuries_osiics_code ON public.injuries(osiics_code);

-- 3. Міграція існуючих даних:
-- Безпечне заповнення default значень
UPDATE public.injuries
SET onset = 'unknown'
WHERE onset IS NULL;

UPDATE public.injuries
SET occurrence = 'unknown'
WHERE occurrence IS NULL;

-- Розрахунок time_loss_days для закритих травм:
-- Якщо є actual_return_date, рахуємо фактичну кількість днів втрати працездатності
UPDATE public.injuries
SET time_loss_days = GREATEST(0, (actual_return_date::date - date_of_injury::date))
WHERE actual_return_date IS NOT NULL AND time_loss_days IS NULL;

-- 4. Тригерна функція для автоматичного оновлення time_loss_days при закритті або зміні дат
CREATE OR REPLACE FUNCTION public.fn_sync_injury_time_loss_days()
RETURNS trigger AS $$
BEGIN
  IF NEW.actual_return_date IS NOT NULL AND NEW.date_of_injury IS NOT NULL THEN
    NEW.time_loss_days := GREATEST(0, (NEW.actual_return_date::date - NEW.date_of_injury::date));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_injury_time_loss_days ON public.injuries;
CREATE TRIGGER trg_injury_time_loss_days
  BEFORE INSERT OR UPDATE OF actual_return_date, date_of_injury
  ON public.injuries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_injury_time_loss_days();
