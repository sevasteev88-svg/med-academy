-- ==============================================================================
-- Migration: 20261023170000_mfa_settings.sql
-- Description: Двофакторна автентифікація (Supabase MFA / TOTP):
--              - Таблиця одноразових резервних кодів (mfa_recovery_codes)
--              - Налаштування клубу enforce_doctor_mfa для ролі doctor
--              - Політики RLS (кожен користувач бачить лише власні коди)
-- ==============================================================================

-- 1. Додавання прапорця обов'язковості 2FA для лікарів до таблиці clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS enforce_doctor_mfa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clubs.enforce_doctor_mfa IS 'Чи вимагається обов''язкова 2FA (TOTP) для медичного штабу клубу';

-- 2. Таблиця одноразових резервних кодів відновлення (Recovery Backup Codes)
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mfa_recovery_codes IS 'Хешовані одноразові коди відновлення для 2FA (SHA-256)';
COMMENT ON COLUMN public.mfa_recovery_codes.code_hash IS 'SHA-256 хеш нормалізованого резервного коду';
COMMENT ON COLUMN public.mfa_recovery_codes.used_at IS 'Час використання коду (null, якщо код ще не використано)';

CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id ON public.mfa_recovery_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_hash ON public.mfa_recovery_codes(code_hash);

-- 3. RLS: доступ лише для власника запису
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mfa_recovery_codes_select_own"
  ON public.mfa_recovery_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "mfa_recovery_codes_insert_own"
  ON public.mfa_recovery_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mfa_recovery_codes_update_own"
  ON public.mfa_recovery_codes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mfa_recovery_codes_delete_own"
  ON public.mfa_recovery_codes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
