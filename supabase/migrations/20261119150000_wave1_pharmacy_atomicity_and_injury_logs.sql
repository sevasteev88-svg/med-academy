-- ==============================================================================
-- Migration: 20261119150000_wave1_pharmacy_atomicity_and_injury_logs.sql
-- Description: Волна 1 (Задача 1.5) — Атомарний облік складу аптеки в таблиці
--              public.pharmacy_items без гонок станів (race conditions),
--              транзакційні функції списання/повернення препаратів при призначенні,
--              зняття застарілого NOT NULL з public.injury_logs.injury_id та
--              очищення фіктивних "системних" травм.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ЗНЯТТЯ NOT NULL З injury_logs.injury_id ТА ОЧИЩЕННЯ ФІКТИВНИХ ТРАВМ
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'injury_logs'
      AND column_name = 'injury_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.injury_logs ALTER COLUMN injury_id DROP NOT NULL;
  END IF;
END $$;

-- Відв'язуємо технічні логи від фіктивних системних травм і видаляємо лише штучні травми
DO $$
DECLARE
  v_fake_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_fake_ids
  FROM public.injuries
  WHERE injury_type::text = 'Планова фармакотерапія / Медсклад'
     OR description IN (
       'Службовий запис аптечного обліку клубу',
       'Системний облік згод та представників',
       'Системний профіль гравця',
       'Фото профілю гравця',
       'Гідратаційний моніторинг / Сесія',
       'Базовий медичний моніторинг / Біометрія'
     );

  IF v_fake_ids IS NOT NULL AND array_length(v_fake_ids, 1) > 0 THEN
    UPDATE public.injury_logs
    SET injury_id = NULL
    WHERE injury_id = ANY(v_fake_ids);

    DELETE FROM public.injuries
    WHERE id = ANY(v_fake_ids);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. РОЗШИРЕННЯ ТАБЛИЦІ public.pharmacy_items ДЛЯ ПОВНОЦІННОГО ОБЛІКУ СКЛАДУ
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pharmacy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name text NOT NULL,
  active_substance text,
  category text NOT NULL DEFAULT 'medication',
  stock_count numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'шт',
  min_alert_threshold numeric NOT NULL DEFAULT 5,
  expiry_date date,
  wada_status text NOT NULL DEFAULT 'allowed',
  storage_location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medical_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'medication',
  title text NOT NULL,
  dosage_or_params text,
  duration_days integer,
  duration_note text,
  reason text,
  doctor_name text,
  wada_status text NOT NULL DEFAULT 'allowed',
  doctor_wada_confirmed boolean NOT NULL DEFAULT false,
  doctor_confirmation_note text,
  notes text,
  pharmacy_item_id text,
  units_deducted numeric,
  legacy_entry_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.injury_logs
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.pharmacy_items
  ADD COLUMN IF NOT EXISTS club_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS name text DEFAULT 'Препарат',
  ADD COLUMN IF NOT EXISTS active_substance text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'medication',
  ADD COLUMN IF NOT EXISTS stock_count numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'шт',
  ADD COLUMN IF NOT EXISTS min_alert_threshold numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS wada_status text DEFAULT 'allowed',
  ADD COLUMN IF NOT EXISTS storage_location text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS item_key text,
  ADD COLUMN IF NOT EXISTS min_age integer,
  ADD COLUMN IF NOT EXISTS age_note text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wada_source_note text,
  ADD COLUMN IF NOT EXISTS washout_note text,
  ADD COLUMN IF NOT EXISTS indications text,
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.pharmacy_items
SET item_key = COALESCE(item_key, id::text)
WHERE item_key IS NULL;

ALTER TABLE public.pharmacy_items
  ALTER COLUMN item_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_pharmacy_items_club_item_key'
  ) THEN
    ALTER TABLE public.pharmacy_items
      ADD CONSTRAINT uq_pharmacy_items_club_item_key UNIQUE (club_id, item_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_pharmacy_items_stock_non_negative'
  ) THEN
    UPDATE public.pharmacy_items SET stock_count = 0 WHERE stock_count < 0;
    ALTER TABLE public.pharmacy_items
      ADD CONSTRAINT chk_pharmacy_items_stock_non_negative CHECK (stock_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pharmacy_items_club_key
  ON public.pharmacy_items(club_id, item_key);

-- Ідемпотентний backfill актуального складу аптеки з останнього [PHARMACY_STOCK_UPDATE] кожного клубу
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_arr jsonb;
  v_elem jsonb;
  v_key text;
  v_expiry date;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (club_id) club_id, note
    FROM public.injury_logs
    WHERE note LIKE '[PHARMACY_STOCK_UPDATE] %'
      AND club_id IS NOT NULL
    ORDER BY club_id, created_at DESC
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[PHARMACY_STOCK_UPDATE\]\s*', ''));
      v_arr := v_raw::jsonb;
      IF jsonb_typeof(v_arr) <> 'array' THEN
        CONTINUE;
      END IF;

      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_arr)
      LOOP
        v_key := COALESCE(NULLIF(v_elem->>'id', ''), gen_random_uuid()::text);
        BEGIN
          v_expiry := NULLIF(v_elem->>'expiry_date', '')::date;
        EXCEPTION WHEN OTHERS THEN
          v_expiry := NULL;
        END;

        INSERT INTO public.pharmacy_items (
          club_id,
          item_key,
          name,
          active_substance,
          category,
          stock_count,
          unit,
          min_alert_threshold,
          expiry_date,
          wada_status,
          storage_location,
          notes,
          min_age,
          age_note,
          requires_review,
          wada_source_note,
          washout_note,
          indications,
          data,
          updated_at
        ) VALUES (
          rec.club_id,
          v_key,
          COALESCE(NULLIF(v_elem->>'name', ''), 'Препарат'),
          NULLIF(v_elem->>'active_substance', ''),
          COALESCE(NULLIF(v_elem->>'category', ''), 'medication'),
          GREATEST(0, COALESCE((v_elem->>'stock_count')::numeric, 0)),
          COALESCE(NULLIF(v_elem->>'unit', ''), 'шт'),
          GREATEST(1, COALESCE((v_elem->>'min_alert_threshold')::numeric, 5)),
          v_expiry,
          COALESCE(NULLIF(v_elem->>'wada_status', ''), 'allowed'),
          NULLIF(v_elem->>'storage_location', ''),
          NULLIF(v_elem->>'notes', ''),
          NULLIF(v_elem->>'min_age', '')::integer,
          NULLIF(v_elem->>'age_note', ''),
          COALESCE((v_elem->>'requires_review')::boolean, false),
          NULLIF(v_elem->>'wada_source_note', ''),
          NULLIF(v_elem->>'washout_note', ''),
          NULLIF(v_elem->>'indications', ''),
          v_elem,
          now()
        )
        ON CONFLICT (club_id, item_key) DO NOTHING;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END $$;

ALTER TABLE public.pharmacy_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pharmacy_items_doctor_admin_all" ON public.pharmacy_items;
CREATE POLICY "pharmacy_items_doctor_admin_all"
  ON public.pharmacy_items
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

ALTER TABLE public.medical_treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "medical_treatments_doctor_admin_all" ON public.medical_treatments;
CREATE POLICY "medical_treatments_doctor_admin_all"
  ON public.medical_treatments
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    public.user_belongs_to_club(club_id)
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

-- ------------------------------------------------------------------------------
-- 3. АТОМАРНА ФУНКЦІЯ КОРИГУВАННЯ ЗАЛИШКУ СКЛАДУ (БЕЗ ГОНОК СТАНІВ)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.adjust_pharmacy_stock_atomic(uuid, text, numeric);
CREATE OR REPLACE FUNCTION public.adjust_pharmacy_stock_atomic(
  p_club_id uuid,
  p_item_key text,
  p_delta numeric
)
RETURNS public.pharmacy_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pharmacy_items;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Некоректна зміна кількості препарату'
      USING ERRCODE = '22023';
  END IF;

  -- Якщо виклик від сесійного користувача — перевіряємо роль doctor/admin у клубі
  IF auth.uid() IS NOT NULL AND NOT public.has_club_role(p_club_id, ARRAY['doctor', 'admin']) THEN
    RAISE EXCEPTION 'Недостатньо прав для зміни аптечного складу клубу'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.pharmacy_items
  SET
    stock_count = stock_count + p_delta,
    data = jsonb_set(COALESCE(data, '{}'::jsonb), '{stock_count}', to_jsonb(stock_count + p_delta), true),
    updated_at = now()
  WHERE club_id = p_club_id
    AND (item_key = p_item_key OR id::text = p_item_key)
    AND (stock_count + p_delta) >= 0
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.pharmacy_items
      WHERE club_id = p_club_id
        AND (item_key = p_item_key OR id::text = p_item_key)
    ) THEN
      RAISE EXCEPTION 'Недостатньо препарату на складі для списання'
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'Препарат не знайдено на складі клубу'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_pharmacy_stock_atomic(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_pharmacy_stock_atomic(uuid, text, numeric) TO authenticated, service_role;
