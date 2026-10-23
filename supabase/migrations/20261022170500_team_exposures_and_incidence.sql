-- ==============================================================================
-- Migration: 20261022170500_team_exposures_and_incidence.sql
-- Description: Задача 4.2: Командна експозиція (exposures) та розрахунок
--              захворюваності / травматизму на 1000 годин (training & match).
-- ==============================================================================

-- 1. Оновлення або створення таблиці public.exposures
CREATE TABLE IF NOT EXISTS public.exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL DEFAULT 'training' CHECK (type IN ('training', 'match')),
  minutes integer NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  players_count integer NOT NULL DEFAULT 1 CHECK (players_count > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Підтримка переходу від старого формату (якщо таблиця вже існувала з player_id):
DO $$
BEGIN
  -- Робимо player_id необов'язковим, якщо він був
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exposures' AND column_name = 'player_id'
  ) THEN
    ALTER TABLE public.exposures ALTER COLUMN player_id DROP NOT NULL;
  END IF;

  -- Додаємо team_id, якщо немає
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exposures' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.exposures ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;
  END IF;

  -- Додаємо type, якщо немає
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exposures' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.exposures ADD COLUMN type text DEFAULT 'training' CHECK (type IN ('training', 'match'));
  END IF;

  -- Якщо була колонка exposure_type, синхронізуємо дані
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exposures' AND column_name = 'exposure_type'
  ) THEN
    UPDATE public.exposures 
    SET type = CASE WHEN exposure_type = 'match' THEN 'match' ELSE 'training' END
    WHERE type IS NULL;
  END IF;

  -- Додаємо players_count, якщо немає
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'exposures' AND column_name = 'players_count'
  ) THEN
    ALTER TABLE public.exposures ADD COLUMN players_count integer NOT NULL DEFAULT 1 CHECK (players_count > 0);
  END IF;
END $$;

-- 2. Індекси для швидких вибірок по команді, даті та типу
CREATE INDEX IF NOT EXISTS idx_exposures_club_team_date ON public.exposures(club_id, team_id, date);
CREATE INDEX IF NOT EXISTS idx_exposures_date_type ON public.exposures(date, type);

-- 3. RLS-політики
ALTER TABLE public.exposures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exposures_select_member" ON public.exposures;
CREATE POLICY "exposures_select_member" ON public.exposures
  FOR SELECT
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "exposures_mutation_staff" ON public.exposures;
CREATE POLICY "exposures_mutation_staff" ON public.exposures
  FOR ALL
  USING (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT club_id FROM public.club_members
      WHERE user_id = auth.uid()
        AND role IN ('doctor', 'coach', 'admin')
    )
  );

-- Автоматичне виставлення club_id для exposures через тригер
DROP TRIGGER IF EXISTS trg_exposures_club_id ON public.exposures;
CREATE TRIGGER trg_exposures_club_id
  BEFORE INSERT ON public.exposures
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_club_id();

-- 4. Додавання activity_type до таблиці injuries (тренування або матч)
ALTER TABLE public.injuries 
ADD COLUMN IF NOT EXISTS activity_type text DEFAULT 'training' CHECK (activity_type IN ('training', 'match', 'other'));

CREATE INDEX IF NOT EXISTS idx_injuries_activity_type ON public.injuries(activity_type);
