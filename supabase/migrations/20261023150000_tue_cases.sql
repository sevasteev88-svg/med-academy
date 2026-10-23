-- ==============================================================================
-- Migration: 20261023150000_tue_cases.sql
-- Description: Облік терапевтичних виключень (TUE / НАДЦ / WADA)
--              Таблиця tue_cases зі статусами, датами та RLS (doctor/admin).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tue_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  substance text NOT NULL,
  wada_class text NOT NULL DEFAULT 'S-препарат',
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('підготовка', 'подано', 'схвалено', 'відхилено', 'закінчився')),
  submitted_at date,
  valid_until date,
  document_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tue_cases IS 'Облік терапевтичних виключень гравців (Therapeutic Use Exemption — TUE)';
COMMENT ON COLUMN public.tue_cases.status IS 'Статус кейсу: підготовка, подано, схвалено, відхилено, закінчився';
COMMENT ON COLUMN public.tue_cases.valid_until IS 'Дата закінчення дії TUE (з автоматичним алеротом за 30 днів)';

-- Індекси для пошуку та нагадувань
CREATE INDEX IF NOT EXISTS idx_tue_cases_club_id ON public.tue_cases(club_id);
CREATE INDEX IF NOT EXISTS idx_tue_cases_player_id ON public.tue_cases(player_id);
CREATE INDEX IF NOT EXISTS idx_tue_cases_status ON public.tue_cases(status);
CREATE INDEX IF NOT EXISTS idx_tue_cases_valid_until ON public.tue_cases(valid_until);

-- RLS: доступ лише для лікаря клубу та адміністратора
ALTER TABLE public.tue_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tue_cases_select_doctor_admin"
  ON public.tue_cases
  FOR SELECT
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "tue_cases_insert_doctor_admin"
  ON public.tue_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "tue_cases_update_doctor_admin"
  ON public.tue_cases
  FOR UPDATE
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  )
  WITH CHECK (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

CREATE POLICY "tue_cases_delete_doctor_admin"
  ON public.tue_cases
  FOR DELETE
  TO authenticated
  USING (
    club_id IN (SELECT public.get_user_club_ids())
    AND public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );
