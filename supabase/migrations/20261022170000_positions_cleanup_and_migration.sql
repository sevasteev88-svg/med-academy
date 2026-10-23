-- ==============================================================================
-- Migration: 20261022170000_positions_cleanup_and_migration.sql
-- Description: Нормалізація футбольних позицій у таблиці players:
--              Перехід від суміші англійських (GK, CB, LB, RB, CDM...) 
--              до єдиного українського стандарту (ВР, ЦЗ, ЛЗ, ПЗ, ОП, ЦП, ЦАП, ЛВ, ПВ, НП).
-- ==============================================================================

BEGIN;

-- 1. Якщо колонка має обмеження типу enum або check constraint, 
-- перетворюємо або додаємо підтримку українських літер.
DO $$
BEGIN
  -- Перевіряємо тип колонки position у таблиці players
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'players' 
      AND column_name = 'position' 
      AND udt_name = 'player_position'
  ) THEN
    -- Якщо використовувався enum player_position, перетворюємо колонку на text
    ALTER TABLE public.players ALTER COLUMN position TYPE text;
  END IF;
END $$;

-- 2. Нормалізація значень у таблиці public.players
UPDATE public.players
SET position = CASE UPPER(TRIM(position))
  WHEN 'GK' THEN 'ВР'
  WHEN 'CB' THEN 'ЦЗ'
  WHEN 'LB' THEN 'ЛЗ'
  WHEN 'RB' THEN 'ПЗ'
  WHEN 'CDM' THEN 'ОП'
  WHEN 'DM' THEN 'ОП'
  WHEN 'ЦОП' THEN 'ОП'
  WHEN 'ЦПЗ' THEN 'ОП'
  WHEN 'CM' THEN 'ЦП'
  WHEN 'CAM' THEN 'ЦАП'
  WHEN 'AM' THEN 'ЦАП'
  WHEN 'АПЗ' THEN 'ЦАП'
  WHEN 'LW' THEN 'ЛВ'
  WHEN 'RW' THEN 'ПВ'
  WHEN 'ST' THEN 'НП'
  WHEN 'CF' THEN 'НП'
  WHEN 'ЦН' THEN 'НП'
  WHEN 'ЗХ' THEN 'ЦЗ'
  ELSE UPPER(TRIM(position))
END
WHERE position IS NOT NULL;

-- 3. Додаємо перевірочне обмеження (CHECK constraint) на допустимі позиції
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS chk_player_canonical_position;

ALTER TABLE public.players 
ADD CONSTRAINT chk_player_canonical_position 
CHECK (position IN ('ВР', 'ЦЗ', 'ЛЗ', 'ПЗ', 'ОП', 'ЦП', 'ЦАП', 'ЛВ', 'ПВ', 'НП'));

COMMENT ON COLUMN public.players.position IS 'Єдиний український довідник позицій: ВР, ЦЗ, ЛЗ, ПЗ, ОП, ЦП, ЦАП, ЛВ, ПВ, НП';

COMMIT;
