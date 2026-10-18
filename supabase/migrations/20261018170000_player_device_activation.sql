-- ==============================================================================
-- Migration: 20261018170000_player_device_activation.sql
-- Description: 8.2 Активація пристрою гравця по одноразовому QR-коду
--              - player_activation_tokens: одноразові токени активації (SHA-256)
--              - player_devices: реєстр активних пристроїв гравця (макс 2)
--              - RLS та аудит-політики
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Таблиця одноразових токенів активації (player_activation_tokens)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_activation_tokens IS 'Одноразові токени активації пристроїв гравців по QR-коду (128 біт ентропії, у БД лише SHA-256 хэш, строк 14 днів).';
COMMENT ON COLUMN public.player_activation_tokens.token_hash IS 'SHA-256 хэш одноразового токена активації';
COMMENT ON COLUMN public.player_activation_tokens.used_at IS 'Час успішного використання токена для активації сесії пристрою';

CREATE INDEX IF NOT EXISTS idx_player_activation_tokens_hash ON public.player_activation_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_player_activation_tokens_player ON public.player_activation_tokens(player_id);
CREATE INDEX IF NOT EXISTS idx_player_activation_tokens_expires ON public.player_activation_tokens(expires_at) WHERE used_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Таблиця пристроїв гравця (player_devices)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  device_token_hash text NOT NULL UNIQUE,
  device_name text NOT NULL,
  user_agent text,
  ip_address text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_devices IS 'Активні авторизовані пристрої гравців (максимум 2 на гравця, строк сесії 90 днів).';
COMMENT ON COLUMN public.player_devices.device_token_hash IS 'SHA-256 хэш довготривалого токена сесії пристрою';
COMMENT ON COLUMN public.player_devices.device_name IS 'Зрозуміла назва пристрою (напр. iPhone, Safari / Android, Chrome)';
COMMENT ON COLUMN public.player_devices.revoked_at IS 'Мітка часу відкликання доступу лікарем/адміністратором';

CREATE INDEX IF NOT EXISTS idx_player_devices_token_hash ON public.player_devices(device_token_hash);
CREATE INDEX IF NOT EXISTS idx_player_devices_player ON public.player_devices(player_id);
CREATE INDEX IF NOT EXISTS idx_player_devices_active ON public.player_devices(player_id, revoked_at) WHERE revoked_at IS NULL;

-- ------------------------------------------------------------------------------
-- 3. RLS-політики
-- ------------------------------------------------------------------------------
ALTER TABLE public.player_activation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_devices ENABLE ROW LEVEL SECURITY;

-- Медичний персонал та адміністратори можуть створювати та переглядати токени активації свого клубу
DROP POLICY IF EXISTS "staff_manage_activation_tokens" ON public.player_activation_tokens;
CREATE POLICY "staff_manage_activation_tokens"
  ON public.player_activation_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_activation_tokens.player_id
      AND p.club_id IN (
        SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
        UNION
        SELECT club_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_activation_tokens.player_id
      AND p.club_id IN (
        SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
        UNION
        SELECT club_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Медичний персонал та адміністратори можуть переглядати та відкликати пристрої гравців свого клубу
DROP POLICY IF EXISTS "staff_manage_player_devices" ON public.player_devices;
CREATE POLICY "staff_manage_player_devices"
  ON public.player_devices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_devices.player_id
      AND p.club_id IN (
        SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
        UNION
        SELECT club_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_devices.player_id
      AND p.club_id IN (
        SELECT club_id FROM public.club_members WHERE user_id = auth.uid()
        UNION
        SELECT club_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );
