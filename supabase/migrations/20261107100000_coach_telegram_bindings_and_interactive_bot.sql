-- ==============================================================================
-- Migration: 20261107100000_coach_telegram_bindings_and_interactive_bot.sql
-- Description: Підтримка Telegram-бота для тренерів старого гарту:
--              - coach_telegram_tokens: одноразові токени для прив'язки тренера до бота
--              - coach_telegram_bindings: активні прив'язки тренерів до Telegram-чату
--              - coach_telegram_sessions: стан покрокового діалогу реєстрації тренування
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Таблиця одноразових токенів прив'язки тренера
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_telegram_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coach_telegram_tokens IS 'Одноразові токени для прив''язки тренера до Telegram-бота (deep-link /start coach_<token>).';

CREATE INDEX IF NOT EXISTS idx_coach_tg_tokens_hash ON public.coach_telegram_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_coach_tg_tokens_coach ON public.coach_telegram_tokens(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_tg_tokens_expires ON public.coach_telegram_tokens(expires_at) WHERE used_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Таблиця активних прив'язок тренерів до Telegram
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_telegram_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL,
  telegram_username text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unlinked')),
  morning_report_time text NOT NULL DEFAULT '09:00',
  receive_morning_report boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  CONSTRAINT uq_coach_telegram_chat UNIQUE (coach_user_id, telegram_chat_id)
);

COMMENT ON TABLE public.coach_telegram_bindings IS 'Реєстр активних зв''язків тренерів з Telegram-ботом для ранкових зведень та інтерактивного запису тренувань.';

CREATE INDEX IF NOT EXISTS idx_coach_tg_bindings_coach ON public.coach_telegram_bindings(coach_user_id);
CREATE INDEX IF NOT EXISTS idx_coach_tg_bindings_chat ON public.coach_telegram_bindings(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_coach_tg_bindings_active ON public.coach_telegram_bindings(coach_user_id, status) WHERE status = 'active';

-- ------------------------------------------------------------------------------
-- 3. Таблиця стану покрокових сесій бота (FSM для запису тренування без комп'ютера)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_telegram_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id text NOT NULL UNIQUE,
  current_step text NOT NULL DEFAULT 'idle',
  session_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coach_telegram_sessions IS 'Поточний крок та чернетка тренування тренера у покроковому інтерактивному боті.';

-- ------------------------------------------------------------------------------
-- 4. RLS-політики
-- ------------------------------------------------------------------------------
ALTER TABLE public.coach_telegram_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_telegram_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_telegram_sessions ENABLE ROW LEVEL SECURITY;

-- Керівництво та лікарі клубу мають повний доступ
DROP POLICY IF EXISTS "staff_manage_coach_tg_tokens" ON public.coach_telegram_tokens;
CREATE POLICY "staff_manage_coach_tg_tokens"
  ON public.coach_telegram_tokens
  FOR ALL
  TO authenticated
  USING (
    coach_user_id = auth.uid() OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

DROP POLICY IF EXISTS "staff_manage_coach_tg_bindings" ON public.coach_telegram_bindings;
CREATE POLICY "staff_manage_coach_tg_bindings"
  ON public.coach_telegram_bindings
  FOR ALL
  TO authenticated
  USING (
    coach_user_id = auth.uid() OR public.has_club_role(club_id, ARRAY['doctor', 'admin'])
  );

DROP POLICY IF EXISTS "staff_manage_coach_tg_sessions" ON public.coach_telegram_sessions;
CREATE POLICY "staff_manage_coach_tg_sessions"
  ON public.coach_telegram_sessions
  FOR ALL
  TO authenticated
  USING (
    coach_user_id = auth.uid()
  );
