-- ==============================================================================
-- Migration: 20261116120100_set_monthly_subscription_200_defaults.sql
-- Description: Крок 2 — оновлення значень за замовчуванням на 200 грн/міс.
-- ==============================================================================

ALTER TABLE IF EXISTS public.player_subscriptions
  ALTER COLUMN plan_code SET DEFAULT 'monthly_200_uah',
  ALTER COLUMN amount_uah SET DEFAULT 200.00;

COMMENT ON TABLE public.player_subscriptions IS 'B2B2C підписки батьків на кабінет гравця (200 грн/міс або 1500 грн/рік)';
