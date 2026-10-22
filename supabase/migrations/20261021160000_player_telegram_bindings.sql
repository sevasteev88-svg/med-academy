-- ==============================================================================
-- Migration: 20261021160000_player_telegram_bindings.sql
-- Description: 8.7 Telegram-напоминания и недельный отчёт
--              - player_telegram_tokens: одноразові токени прив'язки (SHA-256)
--              - player_telegram_bindings: реєстр активних прив'язок гравців до Telegram-бота
--              - RLS та аудит-політики
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Таблиця одноразових токенів прив'язки (player_telegram_tokens)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_telegram_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_telegram_tokens IS 'Одноразові токени для прив''язки гравця до Telegram-бота (128 біт ентропії, у БД лише SHA-256 хэш, deep-link).';
COMMENT ON COLUMN public.player_telegram_tokens.token_hash IS 'SHA-256 хэш одноразового токена прив''язки';
COMMENT ON COLUMN public.player_telegram_tokens.used_at IS 'Час успішної активації прив''язки через команду /start';

CREATE INDEX IF NOT EXISTS idx_player_telegram_tokens_hash ON public.player_telegram_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_player_telegram_tokens_player ON public.player_telegram_tokens(player_id);
CREATE INDEX IF NOT EXISTS idx_player_telegram_tokens_expires ON public.player_telegram_tokens(expires_at) WHERE used_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Таблиця активних прив'язок Telegram (player_telegram_bindings)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_telegram_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unlinked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  CONSTRAINT uq_player_telegram_chat UNIQUE (player_id, telegram_chat_id)
);

COMMENT ON TABLE public.player_telegram_bindings IS 'Реєстр прив''язок гравців до Telegram-бота для ранкових нагадувань та PWA-сповіщень.';
COMMENT ON COLUMN public.player_telegram_bindings.telegram_chat_id IS 'Ідентифікатор приватного чату Telegram (chat_id)';
COMMENT ON COLUMN public.player_telegram_bindings.status IS 'Статус прив''язки: active або unlinked';

CREATE INDEX IF NOT EXISTS idx_player_telegram_bindings_player ON public.player_telegram_bindings(player_id);
CREATE INDEX IF NOT EXISTS idx_player_telegram_bindings_chat ON public.player_telegram_bindings(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_player_telegram_bindings_active ON public.player_telegram_bindings(player_id, status) WHERE status = 'active';

-- ------------------------------------------------------------------------------
-- 3. RLS-політики
-- ------------------------------------------------------------------------------
ALTER TABLE public.player_telegram_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_telegram_bindings ENABLE ROW LEVEL SECURITY;

-- Медичний персонал, адміністратори та тренери можуть керувати токенами прив'язки
DROP POLICY IF EXISTS "staff_manage_telegram_tokens" ON public.player_telegram_tokens;
CREATE POLICY "staff_manage_telegram_tokens"
  ON public.player_telegram_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_telegram_tokens.player_id
    )
  );

-- Персонал може переглядати та керувати прив'язками
DROP POLICY IF EXISTS "staff_manage_telegram_bindings" ON public.player_telegram_bindings;
CREATE POLICY "staff_manage_telegram_bindings"
  ON public.player_telegram_bindings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_telegram_bindings.player_id
    )
  );
