-- ==============================================================================
-- Migration: 20261031120000_b2b2c_player_subscriptions.sql
-- Description: B2B2C Монетизація MedAcademy — Підписки батьків (150 грн/міс або 1500 грн/рік),
--              транзакції еквайрингу (WayForPay / Monobank), вебхуки та квоти стипендіатів ('comped').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENUM ТИПИ ДЛЯ БІЛІНГУ
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM (
      'trialing',     -- Безкоштовний тестовий період (наприклад, 14 днів при підключенні)
      'active',       -- Активна сплачена підписка
      'past_due',     -- Прострочений платіж (пільговий період 3 дні перед блокуванням)
      'canceled',     -- Скасовано батьками (діє до закінчення поточного сплаченого періоду)
      'unpaid',       -- Заблоковано за несплату (soft-lock в порталі гравця)
      'comped'        -- Безкоштовна квота / стипендіат від клубу за запитом директора/тренера
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_plan_code') THEN
    CREATE TYPE public.billing_plan_code AS ENUM (
      'monthly_150_uah',  -- 150 грн / місяць
      'annual_1500_uah'   -- 1 500 грн / рік (10 місяців, 2 місяці в подарунок)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider') THEN
    CREATE TYPE public.payment_provider AS ENUM (
      'wayforpay',
      'monobank',
      'manual'            -- Ручне нарахування або квота директора клубу
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM (
      'pending',
      'success',
      'failed',
      'refunded'
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ТАБЛИЦЯ ПІДПИСОК ГРАВЦІВ (player_subscriptions)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.player_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  
  -- Статус та тарифний план
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  plan_code public.billing_plan_code NOT NULL DEFAULT 'monthly_150_uah',
  amount_uah numeric(10, 2) NOT NULL DEFAULT 150.00,
  currency text NOT NULL DEFAULT 'UAH',
  billing_interval text NOT NULL DEFAULT 'month', -- 'month' або 'year'
  
  -- Терміни дії
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  canceled_at timestamptz,
  grace_period_ends_at timestamptz, -- До якої дати діє пільговий доступ при помилці списання
  
  -- Контактні дані платника (батьків)
  payer_name text,
  payer_phone text,
  payer_email text,
  
  -- Платіжні дані еквайрингу
  provider public.payment_provider NOT NULL DEFAULT 'wayforpay',
  provider_subscription_id text, -- ID регулярного платежу у WayForPay / Mono
  provider_customer_id text,     -- Рекурентний токен картки для наступних списань
  card_last4 text,               -- Останні 4 цифри картки для відображення батькам
  card_type text,                -- Visa / Mastercard
  
  -- Безкоштовні стипендіальні профілі від клубу (comped)
  comped_reason text,            -- Причина квоти (наприклад: "Стипендіат академії", "Дитина військового")
  comped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Хто з керівництва затвердив
  
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_player_subscription UNIQUE (player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_subscriptions_club_id ON public.player_subscriptions(club_id);
CREATE INDEX IF NOT EXISTS idx_player_subscriptions_status ON public.player_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_player_subscriptions_period_end ON public.player_subscriptions(current_period_end);

COMMENT ON TABLE public.player_subscriptions IS 'B2B2C підписки батьків на кабінет гравця (150 грн/міс або 1500 грн/рік)';

-- ------------------------------------------------------------------------------
-- 3. ТАБЛИЦЯ ТРАНЗАКЦІЙ ТА ЧЕКІВ (payment_transactions)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.player_subscriptions(id) ON DELETE SET NULL,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  
  order_reference text NOT NULL UNIQUE, -- Унікальний номер замовлення (MED-SUB-...)
  provider public.payment_provider NOT NULL,
  provider_transaction_id text,         -- Транзакція у банку (auth_code / payment_id)
  
  amount_uah numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'UAH',
  status public.payment_status NOT NULL DEFAULT 'pending',
  failure_reason text,
  
  payer_phone text,
  payer_email text,
  payment_method text,                  -- 'card', 'apple_pay', 'google_pay', 'monobank'
  
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_player ON public.payment_transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_club ON public.payment_transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

COMMENT ON TABLE public.payment_transactions IS 'Журнал оплат та спроб транзакцій батьків через еквайринг';

-- ------------------------------------------------------------------------------
-- 4. ТАБЛИЦЯ ВЕБХУКІВ ДЛЯ ІДЕМПОТЕНТНОСТІ (payment_webhooks)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.payment_provider NOT NULL,
  event_type text NOT NULL,
  order_reference text,
  signature text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  is_success boolean NOT NULL DEFAULT true,
  error_message text,
  
  CONSTRAINT uq_webhook_provider_order UNIQUE (provider, order_reference, signature)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_order ON public.payment_webhooks(order_reference);

COMMENT ON TABLE public.payment_webhooks IS 'Ідемпотентний журнал вебхуків еквайрингу для захисту від Replay-атак';

-- ------------------------------------------------------------------------------
-- 5. БЕЗПЕЧНИЙ BACKFILL ДЛЯ ДІЮЧИХ ГРАВЦІВ (ПІЛОТ U-19)
-- ------------------------------------------------------------------------------
-- Усі діючі гравці (18 хлопців U-19 та інші існуючі гравці) отримують
-- статус 'comped' (стипендіальний безкоштовний доступ) на 90 днів,
-- щоб поточний щоденний процес заповнення анкет НЕ ПЕРЕРИВАВСЯ ні на секунду!

DO $$
BEGIN
  INSERT INTO public.player_subscriptions (
    club_id,
    player_id,
    status,
    plan_code,
    amount_uah,
    current_period_start,
    current_period_end,
    trial_ends_at,
    comped_reason,
    provider
  )
  SELECT
    p.club_id,
    p.id,
    'comped'::public.subscription_status,
    'monthly_150_uah'::public.billing_plan_code,
    150.00,
    now(),
    now() + interval '90 days',
    now() + interval '90 days',
    'Пілотний сезон U-19 (безкоштовний доступ)',
    'manual'::public.payment_provider
  FROM public.players p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.player_subscriptions ps WHERE ps.player_id = p.id
  );
END $$;

-- ------------------------------------------------------------------------------
-- 6. RLS ПОЛІТИКИ ТА ХЕЛПЕР-ФУНКЦІЇ ДЛЯ БЕЗПЕКИ
-- ------------------------------------------------------------------------------

ALTER TABLE public.player_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;

-- 6.1 Персонал клубу: лікарі та адміни бачать підписки гравців свого клубу
DROP POLICY IF EXISTS "subs_staff_select" ON public.player_subscriptions;
CREATE POLICY "subs_staff_select" ON public.player_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.has_club_role(club_id, ARRAY['admin', 'doctor'])
  );

-- Адміністратори клубу можуть змінювати квоти (надавати comped)
DROP POLICY IF EXISTS "subs_admin_manage" ON public.player_subscriptions;
CREATE POLICY "subs_admin_manage" ON public.player_subscriptions
  FOR ALL TO authenticated
  USING (public.is_club_admin(club_id))
  WITH CHECK (public.is_club_admin(club_id));

-- 6.2 Тренери: бачать лише статус готовності підписки без фінансових подробиць через view
CREATE OR REPLACE VIEW public.coach_subscription_status_view AS
  SELECT
    ps.player_id,
    ps.club_id,
    ps.status,
    (ps.status IN ('active', 'trialing', 'comped') AND ps.current_period_end >= now()) AS is_accessible,
    ps.current_period_end
  FROM public.player_subscriptions ps;

-- 6.3 Транзакції: перегляд тільки адмінами клубу
DROP POLICY IF EXISTS "transactions_admin_select" ON public.payment_transactions;
CREATE POLICY "transactions_admin_select" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (public.is_club_admin(club_id));

-- 6.4 Функція отримання статусу підписки для анонімного порталу гравця/батьків
CREATE OR REPLACE FUNCTION public.get_player_subscription_status(p_player_id uuid)
RETURNS TABLE (
  status public.subscription_status,
  is_active boolean,
  plan_code public.billing_plan_code,
  amount_uah numeric,
  billing_interval text,
  current_period_end timestamptz,
  card_last4 text,
  comped_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ps.status,
    (
      (ps.status IN ('active', 'trialing', 'comped') AND ps.current_period_end >= now())
      OR (ps.status = 'past_due' AND ps.grace_period_ends_at IS NOT NULL AND ps.grace_period_ends_at >= now())
    ) AS is_active,
    ps.plan_code,
    ps.amount_uah,
    ps.billing_interval,
    ps.current_period_end,
    ps.card_last4,
    ps.comped_reason
  FROM public.player_subscriptions ps
  WHERE ps.player_id = p_player_id
  LIMIT 1;
$$;
