-- ==============================================================================
-- Migration: 20261114171000_medical_treatments.sql
-- Description: Wave 3 (Step 2) — Винесення [TREATMENT] з injury_logs у
--              таблицю public.medical_treatments зі строгим RLS (лише doctor/admin)
--              та ідемпотентним backfill існуючих даних.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.medical_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  injury_id uuid REFERENCES public.injuries(id) ON DELETE SET NULL,
  date date NOT NULL,
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
  legacy_log_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medical_treatments_club_player_date
  ON public.medical_treatments(club_id, player_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_medical_treatments_injury_id
  ON public.medical_treatments(injury_id)
  WHERE injury_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medical_treatments_legacy_entry_id
  ON public.medical_treatments(legacy_entry_id)
  WHERE legacy_entry_id IS NOT NULL;

COMMENT ON TABLE public.medical_treatments IS 'Медикаментозні призначення та лікувальні процедури гравців (доступно лише лікарю/адміну)';

-- Строгий RLS: тренер НЕ має доступу до медикаментозних призначень
ALTER TABLE public.medical_treatments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_treatments_select_doctor_admin" ON public.medical_treatments;
CREATE POLICY "medical_treatments_select_doctor_admin" ON public.medical_treatments
  FOR SELECT TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

DROP POLICY IF EXISTS "medical_treatments_mutation_doctor_admin" ON public.medical_treatments;
CREATE POLICY "medical_treatments_mutation_doctor_admin" ON public.medical_treatments
  FOR ALL TO authenticated
  USING (public.has_club_role(club_id, ARRAY['doctor', 'admin']))
  WITH CHECK (public.has_club_role(club_id, ARRAY['doctor', 'admin']));

-- Ідемпотентний backfill існуючих [TREATMENT] записів із injury_logs
DO $$
DECLARE
  rec RECORD;
  v_raw text;
  v_json jsonb;
  v_player_id uuid;
  v_injury_id uuid;
  v_date date;
  v_duration_days integer;
  v_units numeric;
BEGIN
  FOR rec IN
    SELECT id, club_id, date, created_at, note
    FROM public.injury_logs
    WHERE note LIKE '[TREATMENT] %'
       OR note LIKE '[TREATMENT]{%'
  LOOP
    BEGIN
      v_raw := trim(regexp_replace(rec.note, '^\[TREATMENT\]\s*', ''));
      v_json := v_raw::jsonb;

      v_player_id := NULLIF(v_json->>'player_id', '')::uuid;
      IF v_player_id IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = v_player_id) THEN
        CONTINUE;
      END IF;

      v_injury_id := NULL;
      IF NULLIF(v_json->>'injury_id', '') IS NOT NULL THEN
        BEGIN
          v_injury_id := (v_json->>'injury_id')::uuid;
          IF NOT EXISTS (SELECT 1 FROM public.injuries WHERE id = v_injury_id) THEN
            v_injury_id := NULL;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_injury_id := NULL;
        END;
      END IF;

      v_date := COALESCE(NULLIF(v_json->>'date', '')::date, rec.date);
      v_duration_days := NULLIF(v_json->>'duration_days', '')::integer;
      v_units := NULLIF(v_json->>'units_deducted', '')::numeric;

      INSERT INTO public.medical_treatments (
        club_id,
        player_id,
        injury_id,
        date,
        category,
        title,
        dosage_or_params,
        duration_days,
        duration_note,
        reason,
        doctor_name,
        wada_status,
        doctor_wada_confirmed,
        doctor_confirmation_note,
        notes,
        pharmacy_item_id,
        units_deducted,
        legacy_entry_id,
        data,
        legacy_log_id,
        created_at
      ) VALUES (
        rec.club_id,
        v_player_id,
        v_injury_id,
        v_date,
        COALESCE(NULLIF(v_json->>'category', ''), 'medication'),
        COALESCE(NULLIF(v_json->>'title', ''), NULLIF(v_json->>'medication_name', ''), 'Призначення'),
        COALESCE(NULLIF(v_json->>'dosage_or_params', ''), NULLIF(v_json->>'dosage', '')),
        v_duration_days,
        NULLIF(v_json->>'duration_note', ''),
        NULLIF(v_json->>'reason', ''),
        COALESCE(NULLIF(v_json->>'doctor_name', ''), NULLIF(v_json->>'prescribed_by', '')),
        COALESCE(NULLIF(v_json->>'wada_status', ''), 'allowed'),
        COALESCE((v_json->>'doctor_wada_confirmed')::boolean, false),
        NULLIF(v_json->>'doctor_confirmation_note', ''),
        NULLIF(v_json->>'notes', ''),
        NULLIF(v_json->>'pharmacy_item_id', ''),
        v_units,
        NULLIF(v_json->>'id', ''),
        v_json,
        rec.id,
        COALESCE(rec.created_at, now())
      )
      ON CONFLICT (legacy_log_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END $$;
